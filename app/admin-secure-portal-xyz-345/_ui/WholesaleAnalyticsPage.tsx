"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  qtyLabel, lineTotal, round3, PAYMENTS, PAYMENT_LABEL,
  type WholesaleBill, type WholesalePayment,
} from "../../lib/wholesaleStore";
import { rangeOf, inRange, type Period } from "./analytics";
import { rupee } from "./money";
import { Page, PageHead, Card, Kpi, Empty, Pills, DateRange, cx } from "./kit";

/** Your cost of the goods on a bill (0 for anything with no cost set). */
const billCost = (b: WholesaleBill) => round3(b.items.reduce((s, i) => s + lineTotal(i.unit, i.cost, i.qty), 0));
/** Goods profit: (subtotal − discount) − cost. Excludes delivery / other / VAT. */
const billProfit = (b: WholesaleBill) => round3(b.subtotal - b.discount - billCost(b));

const PERIODS: { v: Period; t: string }[] = [
  { v: "all", t: "All" }, { v: "today", t: "Today" }, { v: "week", t: "This week" },
  { v: "month", t: "This month" }, { v: "year", t: "This year" }, { v: "custom", t: "Custom" },
];

// Full, static class strings — Tailwind can't see interpolated class names.
const PAY_BOX: Record<WholesalePayment, string> = {
  cash: "border-emerald-100 bg-emerald-50/40",
  upi: "border-violet-100 bg-violet-50/40",
  card: "border-sky-100 bg-sky-50/40",
};

export default function WholesaleAnalyticsPage() {
  const bills = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const rows = useMemo(() => bills.filter((b) => inRange(b.createdAt, range)), [bills, range]);

  const stats = useMemo(() => {
    const revenue = round3(rows.reduce((s, b) => s + b.total, 0));
    const profit = round3(rows.reduce((s, b) => s + billProfit(b), 0));
    const cost = round3(rows.reduce((s, b) => s + billCost(b), 0));
    const count = rows.length;
    const avg = count ? round3(revenue / count) : 0;
    const hasCost = rows.some((b) => b.items.some((i) => i.cost > 0));

    // Payment breakdown.
    const byPay = PAYMENTS.map((p) => {
      const list = rows.filter((b) => b.payment === p);
      return { pay: p, total: round3(list.reduce((s, b) => s + b.total, 0)), count: list.length };
    });

    const byCustomer = new Map<string, { name: string; total: number; count: number }>();
    const byProduct = new Map<string, { name: string; total: number; qty: number; unit: "piece" | "gram" }>();
    for (const b of rows) {
      const key = b.customerId ?? `walk:${b.customerName || b.customerPhone || b.id}`;
      const c = byCustomer.get(key) ?? { name: b.customerName || "Walk-in", total: 0, count: 0 };
      c.total = round3(c.total + b.total); c.count += 1;
      byCustomer.set(key, c);
      for (const i of b.items) {
        const p = byProduct.get(i.productId) ?? { name: i.name, total: 0, qty: 0, unit: i.unit };
        p.total = round3(p.total + i.lineTotal); p.qty += i.qty; p.unit = i.unit;
        byProduct.set(i.productId, p);
      }
    }
    const topCustomers = [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    const topProducts = [...byProduct.values()].sort((a, b) => b.total - a.total).slice(0, 5);

    return { revenue, profit, cost, count, avg, hasCost, byPay, topCustomers, topProducts };
  }, [rows]);

  return (
    <Page>
      <PageHead bar title="Wholesale analytics" sub="A quick read on your wholesale sales." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Pills value={period} options={PERIODS} onChange={setPeriod} />
        {period === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Revenue" value={rupee(stats.revenue)} icon="rupee" tone="emerald" hint={`${stats.count} bill${stats.count === 1 ? "" : "s"}`} />
        <Kpi label="Profit" value={rupee(stats.profit)} icon="chart" tone="violet" hint={stats.hasCost ? `Cost ${rupee(stats.cost)}` : "Set cost prices for profit"} />
        <Kpi label="Average bill" value={rupee(stats.avg)} icon="billing" tone="sky" />
        <Kpi label="Bills" value={stats.count} icon="orders" tone="orange" />
      </div>

      <div className="mb-4">
        <Card title="By payment method">
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.byPay.map((p) => (
              <div key={p.pay} className={cx("rounded-2xl border p-4", PAY_BOX[p.pay])}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">{PAYMENT_LABEL[p.pay]}</span>
                  <span className="text-[11px] text-slate-400">{p.count} bill{p.count === 1 ? "" : "s"}</span>
                </div>
                <div className="adm-num mt-1 text-[20px] font-extrabold text-slate-900">{rupee(p.total)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Top customers">
          {stats.topCustomers.length === 0 ? <Empty icon="users" title="No sales yet" /> : (
            <div className="space-y-2">
              {stats.topCustomers.map((c, k) => (
                <Row key={k} rank={k + 1} name={c.name} sub={`${c.count} bill${c.count === 1 ? "" : "s"}`} value={rupee(c.total)} />
              ))}
            </div>
          )}
        </Card>

        <Card title="Top products">
          {stats.topProducts.length === 0 ? <Empty icon="box" title="No sales yet" /> : (
            <div className="space-y-2">
              {stats.topProducts.map((p, k) => (
                <Row key={k} rank={k + 1} name={p.name} sub={`${qtyLabel(p.unit, round3(p.qty))} sold`} value={rupee(p.total)} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </Page>
  );
}

function Row({ rank, name, sub, value }: { rank: number; name: string; sub: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">{rank}</span>
        <div className="min-w-0">
          <b className="block truncate text-[13.5px] text-slate-800">{name}</b>
          <span className="text-[11px] text-slate-400">{sub}</span>
        </div>
      </div>
      <b className="adm-num shrink-0 text-[14px] font-extrabold text-slate-900">{value}</b>
    </div>
  );
}
