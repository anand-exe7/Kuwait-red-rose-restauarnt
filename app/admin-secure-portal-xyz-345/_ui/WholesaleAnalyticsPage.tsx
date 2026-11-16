"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  qtyLabel, round3, PAYMENT_LABEL,
  type WholesaleBill,
} from "../../lib/wholesaleStore";
import { rangeOf, inRange, type Period } from "./analytics";
import { rupee } from "./money";
import { Page, PageHead, Card, Kpi, Empty, Pills, DateRange, Btn, cx, downloadExcel, fmtDate, fmtTime } from "./kit";

/** What each method actually took on a bill — a split bill feeds Cash and Card. */
const cashOf = (b: WholesaleBill) => (b.payment === "cash" ? b.total : b.payment === "split" ? b.cashAmount : 0);
const cardOf = (b: WholesaleBill) => (b.payment === "card" ? b.total : b.payment === "split" ? b.cardAmount : 0);
const upiOf = (b: WholesaleBill) => (b.payment === "upi" ? b.total : 0);

const PERIODS: { v: Period; t: string }[] = [
  { v: "all", t: "All" }, { v: "today", t: "Today" }, { v: "week", t: "This week" },
  { v: "month", t: "This month" }, { v: "year", t: "This year" }, { v: "custom", t: "Custom" },
];

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function WholesaleAnalyticsPage() {
  const bills = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const rows = useMemo(() => bills.filter((b) => inRange(b.createdAt, range)), [bills, range]);

  const stats = useMemo(() => {
    const sum = (f: (b: WholesaleBill) => number) => round3(rows.reduce((s, b) => s + f(b), 0));
    const revenue = sum((b) => b.total);
    const count = rows.length;
    const cash = sum(cashOf), card = sum(cardOf), upi = sum(upiOf);
    const splitN = rows.filter((b) => b.payment === "split").length;

    const byCustomer = new Map<string, { name: string; phone: string; total: number; count: number }>();
    const byProduct = new Map<string, { name: string; total: number; qty: number; unit: "piece" | "gram" }>();
    let units = 0;
    for (const b of rows) {
      const key = b.customerId ?? `walk:${b.customerName || b.customerPhone || b.id}`;
      const c = byCustomer.get(key) ?? { name: b.customerName || "Walk-in", phone: b.customerPhone, total: 0, count: 0 };
      c.total = round3(c.total + b.total); c.count += 1;
      byCustomer.set(key, c);
      for (const i of b.items) {
        const p = byProduct.get(i.productId) ?? { name: i.name, total: 0, qty: 0, unit: i.unit };
        p.total = round3(p.total + i.lineTotal); p.qty += i.qty; p.unit = i.unit;
        byProduct.set(i.productId, p);
        if (i.unit === "piece") units += i.qty;
      }
    }
    const customers = [...byCustomer.values()].sort((a, b) => b.total - a.total);
    const products = [...byProduct.values()].sort((a, b) => b.total - a.total);

    return {
      revenue, count, cash, card, upi, splitN, units, customers, products,
      avg: count ? round3(revenue / count) : 0,
      discount: sum((b) => b.discount), delivery: sum((b) => b.deliveryFee), extra: sum((b) => b.extra), vat: sum((b) => b.gstAmount),
      repeat: customers.filter((c) => c.count > 1).length,
    };
  }, [rows]);

  const periodLabel = PERIODS.find((p) => p.v === period)?.t ?? "All";

  const exportExcel = () =>
    downloadExcel(`wholesale-analytics-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Summary",
        rows: [
          ["Wholesale analytics"],
          ["Period", period === "custom" ? `${from || "start"} to ${to || "today"}` : periodLabel],
          [],
          ["Metric", "Value"],
          ["Revenue", stats.revenue],
          ["Bills", stats.count],
          ["Average bill", stats.avg],
          ["Discounts given", stats.discount],
          ["Delivery charges", stats.delivery],
          ["Extra charges", stats.extra],
          ["VAT collected", stats.vat],
          [],
          ["Payment", "Amount"],
          ["Cash", stats.cash],
          ["Card", stats.card],
          ["UPI", stats.upi],
          ["Split bills", stats.splitN],
        ],
      },
      {
        name: "Bills",
        rows: [
          ["Invoice", "Date", "Time", "Customer", "Mobile", "Items", "Subtotal", "Discount", "Delivery", "Extra", "VAT %", "VAT amount", "Total", "Payment"],
          ...rows.slice().sort((a, b) => b.createdAt - a.createdAt).map((b) => [b.id, fmtDate(b.createdAt), fmtTime(b.createdAt), b.customerName, b.customerPhone, b.items.length, b.subtotal, b.discount, b.deliveryFee, b.extra, b.gstPercent, b.gstAmount, b.total, PAYMENT_LABEL[b.payment]]),
        ],
      },
      {
        name: "Products",
        rows: [
          ["#", "Product", "Sold by", "Quantity sold", "Revenue"],
          ...stats.products.map((p, k) => [k + 1, p.name, p.unit === "gram" ? "Weight (g)" : "Piece", round3(p.qty), p.total]),
        ],
      },
      {
        name: "Customers",
        rows: [
          ["#", "Customer", "Mobile", "Bills", "Total spent"],
          ...stats.customers.map((c, k) => [k + 1, c.name, c.phone, c.count, c.total]),
        ],
      },
      {
        name: "Daily sales",
        rows: [
          ["Date", "Revenue"],
          ...[...rows.reduce((m, b) => m.set(dayKey(b.createdAt), round3((m.get(dayKey(b.createdAt)) ?? 0) + b.total)), new Map<string, number>()).entries()].sort((a, b) => a[0].localeCompare(b[0])),
        ],
      },
    ]);

  const maxProduct = Math.max(...stats.products.slice(0, 8).map((p) => p.total), 1);

  return (
    <Page>
      <PageHead
        bar
        title="Wholesale analytics"
        sub="Sales, payments and who buys what — for the period you pick."
        right={<Btn kind="ghost" icon="download" onClick={exportExcel} disabled={!stats.count}>Download Excel</Btn>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pills value={period} options={PERIODS} onChange={setPeriod} />
        {period === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Revenue" value={rupee(stats.revenue)} icon="rupee" tone="emerald" hint={`${stats.count} bill${stats.count === 1 ? "" : "s"}`} />
        <Kpi label="Average bill" value={rupee(stats.avg)} icon="billing" tone="sky" hint="Per wholesale bill" />
        <Kpi label="Bills" value={stats.count} icon="orders" tone="orange" hint={`${stats.customers.length} customer${stats.customers.length === 1 ? "" : "s"} · ${stats.repeat} repeat`} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Discounts given" value={rupee(stats.discount)} icon="coupon" tone="rose" hint="Taken off the bills" />
        <Kpi label="Delivery charges" value={rupee(stats.delivery)} icon="cart" tone="sky" hint="Collected on top of the goods" />
        <Kpi label="VAT collected" value={rupee(stats.vat)} icon="percent" tone="amber" hint="On VAT invoices" />
        <Kpi label="Pieces sold" value={round3(stats.units)} icon="box" tone="violet" hint="Counted by the piece; weight lines are listed below" />
      </div>

      <div className="mb-5">
        <Card title="By payment method" right={stats.splitN ? <span className="text-[12px] text-slate-500">{stats.splitN} split bill{stats.splitN === 1 ? "" : "s"}</span> : undefined}>
          <div className="grid gap-5 sm:grid-cols-3">
          {([
            ["Cash", stats.cash, "bg-emerald-500"],
            ["Card", stats.card, "bg-sky-500"],
            ["UPI", stats.upi, "bg-violet-500"],
          ] as const).map(([label, v, bar]) => {
            const total = stats.cash + stats.card + stats.upi;
            return (
              <div key={label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
                  <span className="text-right leading-tight">
                    <b className="adm-num block text-[15px] text-slate-900">{rupee(v)}</b>
                    <small className="text-[10.5px] text-slate-400">{total > 0 ? Math.round((v / total) * 100) : 0}%</small>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={cx("h-full rounded-full", bar)} style={{ width: `${total > 0 ? (v / total) * 100 : 0}%` }} />
                </div>
              </div>
            );
          })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top customers">
          {stats.customers.length === 0 ? <Empty icon="users" title="No sales yet" /> : (
            <div className="space-y-2">
              {stats.customers.slice(0, 8).map((c, k) => (
                <Row key={k} rank={k + 1} name={c.name} sub={`${c.count} bill${c.count === 1 ? "" : "s"}${c.phone ? ` · ${c.phone}` : ""}`} value={rupee(c.total)} share={stats.revenue > 0 ? c.total / stats.revenue : 0} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Top products">
          {stats.products.length === 0 ? <Empty icon="box" title="No sales yet" /> : (
            <div className="space-y-2">
              {stats.products.slice(0, 8).map((p, k) => (
                <Row key={k} rank={k + 1} name={p.name} sub={`${qtyLabel(p.unit, round3(p.qty))} sold`} value={rupee(p.total)} share={p.total / maxProduct} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function Row({ rank, name, sub, value, share }: { rank: number; name: string; sub: string; value: string; share: number }) {
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{rank}</span>
          <div className="min-w-0">
            <b className="block truncate text-[13.5px] text-slate-800">{name}</b>
            <span className="text-[11px] text-slate-400">{sub}</span>
          </div>
        </div>
        <b className="adm-num shrink-0 text-[14px] font-extrabold text-slate-900">{value}</b>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-red-500/80" style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }} />
      </div>
    </div>
  );
}
