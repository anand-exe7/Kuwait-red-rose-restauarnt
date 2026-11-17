"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  qtyLabel, round3, lineTotal, normPhone, PAYMENT_LABEL,
  type WholesaleBill,
} from "../../lib/wholesaleStore";
import { deliveryPartners } from "../../lib/deliveryPartners";
import { BRAND } from "../../lib/brand";
import { useAdmin } from "./Store";
import { billText, waLink } from "./receipt";
import PrintModal from "./PrintModal";
import { wholesaleToBill } from "./wholesaleAdapter";
import WholesaleBillDetail from "./WholesaleBillDetail";
import { Columns, GstSplit } from "./AnalyticsPage";
import { rangeOf, inRange, isoWeek, monthly, startOfWeek, weekly, type Period } from "./analytics";
import { rupee } from "./money";
import { Page, PageHead, Card, Kpi, Empty, Pills, Tabs, DateRange, Btn, Icon, SearchBox, WaIcon, cx, downloadExcel, fmtDate, fmtTime } from "./kit";

/* Wholesale analytics — laid out exactly like the POS Analytics page: the same
   period pills and Export button, the same tabs (Revenue · Today's sales ·
   Products · Customers), the same KPI boxes, charts and tables. On top of that
   it has what only wholesale has: a box per delivery partner, product-wise
   profit, and a customer's whole invoice history with WhatsApp / view / print. */

type Tab = "revenue" | "today" | "products" | "customers";
type ProdSort = "revenue" | "qty" | "profit" | "name";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** What each method actually took on a bill — a split bill feeds Cash and Card. */
const cashOf = (b: WholesaleBill) => (b.payment === "cash" ? b.total : b.payment === "split" ? b.cashAmount : 0);
const cardOf = (b: WholesaleBill) => (b.payment === "card" ? b.total : b.payment === "split" ? b.cardAmount : 0);
const upiOf = (b: WholesaleBill) => (b.payment === "upi" ? b.total : 0);

const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500";
const td = "px-4 py-3.5 text-[13px]";

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Everything the tabs show, worked out for one set of bills. */
function statsOf(rows: WholesaleBill[]) {
  const sum = (f: (b: WholesaleBill) => number) => round3(rows.reduce((s, b) => s + f(b), 0));
  const revenue = sum((b) => b.total);
  const count = rows.length;

  const byCustomer = new Map<string, { key: string; name: string; phone: string; total: number; count: number; last: number }>();
  const byProduct = new Map<string, { key: string; name: string; total: number; qty: number; unit: "piece" | "gram"; cost: number; bills: number; costed: boolean }>();
  const byPartner = new Map<string, { partner: string; count: number; charges: number; sales: number }>();
  const pk = (n: string) => n.trim().toLowerCase();
  for (const n of deliveryPartners()) byPartner.set(pk(n), { partner: n, count: 0, charges: 0, sales: 0 });

  let units = 0, goodsCost = 0;
  for (const b of rows) {
    const digits = normPhone(b.customerPhone);
    const key = digits ? `p:${digits}` : b.customerId ? `c:${b.customerId}` : `n:${(b.customerName || b.id).trim().toLowerCase()}`;
    const c = byCustomer.get(key) ?? { key, name: b.customerName || "Walk-in", phone: b.customerPhone, total: 0, count: 0, last: 0 };
    c.total = round3(c.total + b.total); c.count += 1; c.last = Math.max(c.last, b.createdAt);
    if (b.customerName) c.name = b.customerName;
    byCustomer.set(key, c);

    for (const i of b.items) {
      const p = byProduct.get(i.productId) ?? { key: i.productId, name: i.name, total: 0, qty: 0, unit: i.unit, cost: 0, bills: 0, costed: false };
      p.total = round3(p.total + i.lineTotal); p.qty += i.qty; p.unit = i.unit; p.bills += 1;
      if (i.cost > 0) { const c2 = lineTotal(i.unit, i.cost, i.qty); p.costed = true; p.cost = round3(p.cost + c2); goodsCost += c2; }
      byProduct.set(i.productId, p);
      if (i.unit === "piece") units += i.qty;
    }

    const name = (b.deliveryPartner || "").trim();
    if (name) {
      const cur = byPartner.get(pk(name)) ?? { partner: name, count: 0, charges: 0, sales: 0 };
      cur.count += 1; cur.charges = round3(cur.charges + b.deliveryFee); cur.sales = round3(cur.sales + b.total);
      byPartner.set(pk(name), cur);
    }
  }
  const customers = [...byCustomer.values()].sort((a, b) => b.total - a.total);
  const products = [...byProduct.values()].sort((a, b) => b.total - a.total);
  const vatBills = rows.filter((b) => b.gstPercent > 0);
  const goodsNet = sum((b) => b.subtotal - b.discount);

  return {
    revenue, count, units, customers, products,
    partners: [...byPartner.values()],
    cash: sum(cashOf), card: sum(cardOf), upi: sum(upiOf),
    splitN: rows.filter((b) => b.payment === "split").length,
    avg: count ? round3(revenue / count) : 0,
    discount: sum((b) => b.discount), delivery: sum((b) => b.deliveryFee), extra: sum((b) => b.extra), vat: sum((b) => b.gstAmount),
    repeat: customers.filter((c) => c.count > 1).length,
    cost: round3(goodsCost),
    profit: round3(goodsNet - goodsCost),
    gstN: vatBills.length,
    gstRev: round3(vatBills.reduce((a, b) => a + b.total, 0)),
    taxable: round3(vatBills.reduce((a, b) => a + b.subtotal - b.discount, 0)),
    nonGstN: count - vatBills.length,
    nonGstRev: round3(rows.filter((b) => b.gstPercent <= 0).reduce((a, b) => a + b.total, 0)),
  };
}

export default function WholesaleAnalyticsPage() {
  const { s: admin, now } = useAdmin();
  const bills = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("revenue");
  const [q, setQ] = useState("");
  const [prodSort, setProdSort] = useState<ProdSort>("revenue");
  const [custQ, setCustQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [viewBill, setViewBill] = useState<WholesaleBill | null>(null);
  const [printBill, setPrintBill] = useState<WholesaleBill | null>(null);

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const rows = useMemo(() => bills.filter((b) => inRange(b.createdAt, range)), [bills, range]);
  const todayRows = useMemo(() => bills.filter((b) => inRange(b.createdAt, rangeOf("today"))), [bills, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => statsOf(rows), [rows]);
  const tstats = useMemo(() => statsOf(todayRows), [todayRows]);

  /* the trend charts always look at the whole year / this week, as on the POS */
  const adapted = useMemo(() => bills.map(wholesaleToBill), [bills]);
  const year = new Date().getFullYear();
  const months = monthly(adapted, year);
  const yearTotal = months.reduce((a, b) => a + b, 0);
  const activeMonths = new Date().getMonth() + 1;
  const wkStart = startOfWeek();
  const week = weekly(adapted, wkStart);
  const wk = isoWeek();

  const needle = q.trim().toLowerCase();

  /* ---------- products ---------- */
  const productRows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = stats.products
      .filter((p) => !n || p.name.toLowerCase().includes(n))
      .map((p) => ({ ...p, profit: p.costed ? round3(p.total - p.cost) : (null as number | null) }));
    const by: Record<ProdSort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      revenue: (a, b) => b.total - a.total,
      qty: (a, b) => b.qty - a.qty,
      profit: (a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[prodSort]);
  }, [stats.products, q, prodSort]);
  const productTotal = stats.products.reduce((a, p) => a + p.total, 0) || 1;
  const bestSeller = stats.products[0];

  /* ---------- customer history (every bill ever, not just the period) ---------- */
  const people = useMemo(() => {
    const m = new Map<string, { key: string; name: string; phone: string; bills: WholesaleBill[]; total: number; last: number }>();
    for (const b of bills) {
      const digits = normPhone(b.customerPhone);
      const key = digits ? `p:${digits}` : b.customerId ? `c:${b.customerId}` : `n:${(b.customerName || b.id).trim().toLowerCase()}`;
      const c = m.get(key) ?? { key, name: b.customerName || "Walk-in", phone: b.customerPhone, bills: [], total: 0, last: 0 };
      if (b.createdAt >= c.last) { c.last = b.createdAt; if (b.customerName) c.name = b.customerName; if (b.customerPhone) c.phone = b.customerPhone; }
      c.bills.push(b); c.total = round3(c.total + b.total);
      m.set(key, c);
    }
    return [...m.values()].sort((a, b) => b.last - a.last);
  }, [bills]);
  const custNeedle = custQ.trim().toLowerCase();
  const custDigits = normPhone(custQ);
  const matches = useMemo(
    () => (custNeedle ? people.filter((p) => p.name.toLowerCase().includes(custNeedle) || (custDigits.length >= 2 && normPhone(p.phone).includes(custDigits))) : []),
    [people, custNeedle, custDigits],
  );
  // One match opens straight away; with several, the one tapped does.
  const person = custNeedle ? (matches.length === 1 ? matches[0] : matches.find((p) => p.key === picked) ?? null) : null;
  const history = person ? person.bills.slice().sort((a, b) => b.createdAt - a.createdAt) : [];

  const periodLabel = ({ all: "all-time", today: "today", week: "this-week", month: "this-month", year: "this-year", custom: `${from || "start"}_${to || "end"}` } as const)[period];

  const exportExcel = () =>
    downloadExcel(`${BRAND.name.toLowerCase().replace(/\s+/g, "-")}-wholesale-analytics-${periodLabel}-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Summary",
        rows: [
          [`${BRAND.fullName} · Wholesale analytics`],
          ["Period", periodLabel],
          [],
          ["Metric", "Value"],
          ["Revenue", stats.revenue],
          ["Bills", stats.count],
          ["Average bill", stats.avg],
          ["Discounts given", stats.discount],
          ["Delivery charges", stats.delivery],
          ["Extra charges", stats.extra],
          ["VAT collected", stats.vat],
          ["Pieces sold", round3(stats.units)],
          [],
          ["Delivery partner", "Deliveries", "Delivery charges", "Order value"],
          ...stats.partners.map((r) => [r.partner, r.count, r.charges, r.sales]),
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
          ["Invoice", "Date", "Time", "Customer", "Mobile", "Items", "Subtotal", "Discount", "Delivery", "Delivery partner", "Extra", "VAT %", "VAT amount", "Total", "Payment"],
          ...rows.slice().sort((a, b) => b.createdAt - a.createdAt).map((b) => [b.id, fmtDate(b.createdAt), fmtTime(b.createdAt), b.customerName, b.customerPhone, b.items.length, b.subtotal, b.discount, b.deliveryFee, b.deliveryPartner, b.extra, b.gstPercent, b.gstAmount, b.total, PAYMENT_LABEL[b.payment]]),
        ],
      },
      {
        name: "Products",
        rows: [
          ["#", "Product", "Sold by", "Quantity sold", "Bills", "Revenue"],
          ...stats.products.map((p, k) => [k + 1, p.name, p.unit === "gram" ? "Weight (g)" : "Piece", round3(p.qty), p.bills, p.total]),
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

  /* WhatsApp · view · print for one invoice — the same three buttons as Orders. */
  const actions = (b: WholesaleBill) => (
    <span className="inline-flex gap-1.5">
      {b.customerPhone && (
        <a suppressHydrationWarning href={waLink(b.customerPhone, billText(wholesaleToBill(b), admin.settings.shopName, admin.settings.publicUrl))} target="_blank" rel="noopener noreferrer" title="Send on WhatsApp" aria-label="Send on WhatsApp" className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-[#22c55e] hover:bg-emerald-100">
          <WaIcon size={18} />
        </a>
      )}
      <button type="button" title="View details" aria-label="View details" onClick={() => setViewBill(b)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
        <Icon name="eye" size={16} />
      </button>
      <button type="button" title="Print receipt" aria-label="Print receipt" onClick={() => setPrintBill(b)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
        <Icon name="print" size={16} />
      </button>
    </span>
  );

  const periodOptions: { v: Period; t: string }[] = [
    { v: "all", t: "All time" }, { v: "today", t: "Today" }, { v: "week", t: "This week" },
    { v: "month", t: "This month" }, { v: "year", t: "This year" }, { v: "custom", t: "Custom" },
  ];

  return (
    <Page>
      <PageHead title="Wholesale analytics" sub="Real-time wholesale sales & customer insights" />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pills label="Period:" value={period} onChange={setPeriod} options={periodOptions} />
        {period === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
        <Btn size="md" kind="dark" icon="download" onClick={exportExcel} disabled={!stats.count} className="ml-auto">
          Export Excel
        </Btn>
      </div>

      <Tabs
        value={tab}
        onChange={(t) => { setTab(t); setQ(""); }}
        options={[
          { v: "revenue", t: "Revenue" },
          { v: "today", t: "Today's sales" },
          { v: "products", t: "Products" },
          { v: "customers", t: "Customers" },
        ]}
      />

      {/* ============ REVENUE ============ */}
      {tab === "revenue" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total revenue" value={rupee(stats.revenue)} hint={stats.vat > 0 ? `Includes ${rupee(stats.vat)} VAT collected` : `${stats.count} bill${stats.count === 1 ? "" : "s"}`} icon="rupee" tone="emerald" />
            <Kpi label="Wholesale bills" value={stats.count} hint={`${stats.customers.length} customer${stats.customers.length === 1 ? "" : "s"} · ${stats.repeat} repeat`} icon="billing" tone="amber" />
            <Kpi label="Discounts given" value={rupee(stats.discount)} hint="Taken off the bills" icon="coupon" tone="violet" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Avg bill value" value={rupee(stats.avg)} hint="Per wholesale bill" icon="zap" tone="orange" />
            <Kpi label="Delivery charges" value={rupee(stats.delivery)} hint="Collected on top of the goods" icon="cart" tone="sky" />
            <Kpi label="VAT collected" value={rupee(stats.vat)} hint="On VAT invoices" icon="percent" tone="amber" />
            <Kpi label="Pieces sold" value={round3(stats.units)} hint="Counted by the piece; weight lines are on Products" icon="box" tone="violet" />
          </div>

          {/* One box per delivery partner: what each of them earned from us
              this period — the delivery charge on their runs, how many runs,
              and the value of the bills they carried. */}
          <div>
            <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Delivery partners</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.partners.map((r, k) => (
                <Kpi
                  key={r.partner}
                  label={r.partner}
                  value={rupee(r.charges)}
                  hint={`${r.count} deliver${r.count === 1 ? "y" : "ies"} · ${rupee(r.sales)} order value`}
                  icon="cart"
                  tone={(["rose", "sky", "violet", "amber", "emerald", "orange"] as const)[k % 6]}
                />
              ))}
            </div>
          </div>

          <div className="-mb-5 gap-5 xl:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
            <Card>
              <h2 className="text-[15px] font-bold text-slate-800">
                Revenue Trend This Year <span className="text-red-600">{year}</span>
              </h2>
              <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
                <b className="adm-num text-[22px] font-extrabold text-slate-900">{rupee(yearTotal)}</b>
                <span className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">Avg {rupee(Math.round(yearTotal / activeMonths))}/mo</span>
              </div>
              <Columns data={months.map((v, i) => ({ label: MONTHS[i], full: `${MONTHS[i]} ${year}`, value: v }))} empty="No revenue yet this year" />
            </Card>
            <Card>
              <h2 className="text-[15px] font-bold text-slate-800">
                Revenue This Week <span className="text-red-600">(Week {wk.week} of {wk.year})</span>
              </h2>
              <p className="mb-6 mt-1 text-[12px] text-slate-500">{rupee(week.reduce((a, b) => a + b, 0))} total</p>
              <Columns
                height={180}
                data={week.map((v, i) => {
                  const d = new Date(wkStart + i * 86400000 + 3600000);
                  return { label: DAYS[i], full: `${DAYS[i]} ${d.getDate()}/${d.getMonth() + 1}`, value: v };
                })}
                empty="No revenue yet this week"
              />
            </Card>
            <Card title="Payment mode" right={stats.splitN ? <span className="text-[12px] text-slate-500">{stats.splitN} split bill{stats.splitN === 1 ? "" : "s"}</span> : undefined}>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-slate-500">Cash</dt><dd className="font-bold text-slate-900">{rupee(stats.cash)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Card</dt><dd className="font-bold text-slate-900">{rupee(stats.card)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">UPI</dt><dd className="font-bold text-slate-900">{rupee(stats.upi)}</dd></div>
              </dl>
            </Card>
            <Card title="Top Products by Revenue">
              <TopProducts products={stats.products} />
            </Card>
            <Card title="Customers" right={<span className="text-[12px] text-slate-500">{stats.customers.length} known · {stats.repeat} repeat</span>}>
              {stats.customers.length ? (
                <ul className="space-y-2.5 text-[13px]">
                  {stats.customers.slice(0, 5).map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <b className="block truncate text-slate-800">{c.name || "—"}</b>
                        <span className="text-[11.5px] text-slate-400">{c.phone ? `${c.phone} · ` : ""}{c.count} bill{c.count === 1 ? "" : "s"}</span>
                      </span>
                      <b className="shrink-0 text-slate-900">{rupee(c.total)}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-slate-400">No bills in this period.</p>
              )}
            </Card>
            <Card title="With VAT vs without" right={<span className="text-[12px] text-slate-500">{stats.count} bill{stats.count === 1 ? "" : "s"} in period</span>}>
              {stats.count ? (
                <GstSplit gstN={stats.gstN} gstRev={stats.gstRev} gst={stats.vat} taxable={stats.taxable} nonGstN={stats.nonGstN} nonGstRev={stats.nonGstRev} />
              ) : (
                <p className="text-[13px] text-slate-400">No bills in this period.</p>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ============ TODAY ============ */}
      {tab === "today" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Today's revenue" value={rupee(tstats.revenue)} hint="Billed today" icon="rupee" tone="emerald" />
            <Kpi label="Today's bills" value={tstats.count} hint="Billed today" icon="billing" tone="sky" />
            <Kpi label="Today's pieces sold" value={<>{round3(tstats.units)} <span className="text-[14px] font-bold">pcs</span></>} hint="Quantity sold today" icon="box" tone="violet" />
            <Kpi label="Today's avg bill" value={rupee(tstats.avg)} hint="Per invoice today" icon="zap" tone="orange" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s transactions</span>}
              right={<SearchBox value={q} onChange={setQ} placeholder="Search name or contact no…" className="w-full sm:w-64" />}
            >
              <div className="adm-scroll overflow-x-auto rounded-xl">
                <table className="w-full min-w-[620px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Invoice ID</th>
                      <th className={th}>Customer</th>
                      <th className={th}>Items</th>
                      <th className={cx(th, "text-right")}>Grand total</th>
                      <th className={cx(th, "text-right")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayRows
                      .filter((b) => !needle || `${b.customerPhone} ${b.id} ${b.customerName}`.toLowerCase().includes(needle))
                      .slice()
                      .sort((a, b) => b.createdAt - a.createdAt)
                      .map((b) => (
                        <tr key={b.id} className="border-b border-slate-100 last:border-0">
                          <td className={cx(td, "font-semibold text-slate-900")}>
                            {b.id}
                            <span className="block text-[11px] font-normal text-slate-400">{fmtTime(b.createdAt)}</span>
                          </td>
                          <td className={cx(td, "text-slate-700")}>
                            <b className="block text-slate-900">{b.customerName || "Walk-in"}</b>
                            <span className="adm-num text-[11.5px] text-slate-500">{b.customerPhone || "No number"}</span>
                          </td>
                          <td className={cx(td, "text-slate-700")}>{b.items.length}</td>
                          <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(b.total)}</td>
                          <td className={cx(td, "text-right")}>{actions(b)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!todayRows.length && <p className="py-14 text-center text-[14px] italic text-slate-400">No transactions found for today.</p>}
              </div>
            </Card>
            <div className="space-y-5">
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s payment mode</span>}>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-slate-500">Cash</dt><dd className="font-bold text-slate-900">{rupee(tstats.cash)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Card</dt><dd className="font-bold text-slate-900">{rupee(tstats.card)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">UPI</dt><dd className="font-bold text-slate-900">{rupee(tstats.upi)}</dd></div>
                </dl>
              </Card>
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s top products</span>}>
                <TopProducts products={tstats.products} empty="No products sold today." />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ============ PRODUCTS ============ */}
      {tab === "products" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Pieces sold" value={round3(stats.units)} hint="In the selected period" icon="box" tone="violet" />
            <Kpi label="Products sold" value={stats.products.length} hint="Different products billed" icon="list" tone="sky" />
            <Kpi label="Best seller" value={bestSeller?.name ?? "—"} hint={bestSeller ? `${qtyLabel(bestSeller.unit, round3(bestSeller.qty))} · ${rupee(bestSeller.total)}` : "No sales yet"} icon="trophy" tone="amber" small />
          </div>
          <Card
            title="Product performance"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox value={q} onChange={setQ} placeholder="Search products…" className="w-full sm:w-64" />
                <select value={prodSort} onChange={(e) => setProdSort(e.target.value as ProdSort)} aria-label="Sort products" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-700 outline-none focus:border-slate-400">
                  <option value="revenue">Sort: Revenue</option>
                  <option value="qty">Sort: Quantity</option>
                  <option value="name">Sort: Name</option>
                </select>
              </div>
            }
          >
            {productRows.length === 0 ? (
              <Empty icon="box" title={stats.products.length ? "Nothing matches" : "No sales in this period"} />
            ) : (
              <div className="adm-scroll overflow-x-auto">
                <table className="w-full min-w-[860px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>#</th>
                      <th className={th}>Product</th>
                      <th className={cx(th, "text-right")}>Qty sold</th>
                      <th className={cx(th, "text-right")}>Bills</th>
                      <th className={cx(th, "text-right")}>Revenue</th>
                      <th className={cx(th, "w-[20%]")}>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productRows.map((p, i) => (
                      <tr key={p.key} className="border-b border-slate-100 last:border-0">
                        <td className={cx(td, "text-slate-400")}>{i + 1}</td>
                        <td className={cx(td, "font-semibold text-slate-900")}>{p.name}</td>
                        <td className={cx(td, "text-right font-semibold")}>{qtyLabel(p.unit, round3(p.qty))}</td>
                        <td className={cx(td, "text-right text-slate-600")}>{p.bills}</td>
                        <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(p.total)}</td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              {p.total > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(p.total / productTotal) * 100}%` }} />}
                            </div>
                            <span className="w-10 text-right text-[11px] text-slate-500">{Math.round((p.total / productTotal) * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ============ CUSTOMERS ============ */}
      {tab === "customers" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Customers" value={stats.customers.length} hint="Different buyers billed" icon="users" tone="sky" />
            <Kpi label="Repeat customers" value={stats.repeat} hint="Came back in the period" icon="zap" tone="orange" />
            <Kpi label="Avg spend / bill" value={rupee(stats.avg)} hint="Per wholesale bill" icon="rupee" tone="emerald" />
            <Kpi label="Bills" value={stats.count} hint="In the selected period" icon="billing" tone="violet" />
          </div>

          <Card title="Customer history" right={<span className="text-[12px] text-slate-500">Every invoice, whatever the period above</span>}>
            <SearchBox value={custQ} onChange={(v) => { setCustQ(v); setPicked(null); }} placeholder="Search customer name or mobile…" className="max-w-md" />
            {!custNeedle ? (
              <p className="mt-4 text-[13px] text-slate-400">Type a name or number to pull up all of that customer&apos;s invoices — or tap one in the list below.</p>
            ) : matches.length === 0 ? (
              <Empty icon="users" title="No customer found">Check the spelling, or try the mobile number.</Empty>
            ) : (
              <>
                {matches.length > 1 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {matches.slice(0, 12).map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPicked(p.key)}
                        className={cx("rounded-xl border px-3 py-2 text-left transition", person?.key === p.key ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-red-200 hover:bg-red-50/40")}
                      >
                        <b className="block text-[13px] text-slate-800">{p.name}</b>
                        <span className="text-[11px] text-slate-400">{p.phone || "no phone"} · {p.bills.length} bill{p.bills.length === 1 ? "" : "s"}</span>
                      </button>
                    ))}
                    {matches.length > 12 && <span className="self-center text-[12px] text-slate-400">+{matches.length - 12} more — narrow the search</span>}
                  </div>
                )}
                {person ? (
                  <div className="mt-4">
                    <div className="mb-3 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-4">
                      <div className="col-span-2 sm:col-span-1">
                        <b className="block truncate text-[15px] text-slate-900">{person.name}</b>
                        <span className="text-[12px] text-slate-500">{person.phone || "no phone"}</span>
                      </div>
                      <div><span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Invoices</span><b className="adm-num text-[15px]">{person.bills.length}</b></div>
                      <div><span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Total billed</span><b className="adm-num text-[15px]">{rupee(person.total)}</b></div>
                      <div><span className="block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">Last bill</span><b className="text-[15px]">{fmtDate(person.last)}</b></div>
                    </div>
                    <div className="adm-scroll overflow-x-auto rounded-2xl border border-slate-100">
                      <table className="w-full min-w-[560px]">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className={th}>Invoice no</th>
                            <th className={th}>Date</th>
                            <th className={th}>Items</th>
                            <th className={th}>Total</th>
                            <th className={th}>Payment</th>
                            <th className={cx(th, "text-right")}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((b) => (
                            <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                              <td className={cx(td, "whitespace-nowrap font-bold text-red-600")}>{b.id}</td>
                              <td className={cx(td, "whitespace-nowrap text-slate-600")}>{fmtDate(b.createdAt)}</td>
                              <td className={cx(td, "text-slate-600")}>{b.items.length}</td>
                              <td className={cx(td, "adm-num whitespace-nowrap font-bold text-slate-900")}>{rupee(b.total)}</td>
                              <td className={cx(td, "whitespace-nowrap text-slate-600")}>{PAYMENT_LABEL[b.payment]}</td>
                              <td className={cx(td, "text-right")}>{actions(b)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-[13px] text-slate-400">{matches.length} customers match — tap one to see their invoices.</p>
                )}
              </>
            )}
          </Card>

          <Card title="Top customers">
            {!stats.customers.length ? (
              <Empty icon="users" title="No customers yet">Saved wholesale bills show up here.</Empty>
            ) : (
              <div className="adm-scroll overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Customer</th>
                      <th className={cx(th, "w-[30%]")}>Revenue</th>
                      <th className={cx(th, "text-right")}>Bills</th>
                      <th className={cx(th, "text-right")}>Avg / bill</th>
                      <th className={cx(th, "text-right")}>Last bill</th>
                      <th className={cx(th, "w-[90px] pr-5 text-right")}>History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.customers.map((c) => (
                      <tr key={c.key} className="border-b border-slate-100 last:border-0">
                        <td className={td}>
                          <b className="block text-slate-900">{c.name || "Walk-in"}</b>
                          <span className="adm-num text-[12px] text-slate-500">{c.phone || "No number"}</span>
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-3">
                            <b className="adm-num w-24 shrink-0 text-slate-900">{rupee(c.total)}</b>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              {c.total > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(c.total / (stats.customers[0]?.total || 1)) * 100}%` }} />}
                            </div>
                          </div>
                        </td>
                        <td className={cx(td, "text-right font-semibold")}>{c.count}</td>
                        <td className={cx(td, "text-right")}>{rupee(round3(c.total / c.count))}</td>
                        <td className={cx(td, "text-right text-slate-500")}>{fmtDate(c.last)}</td>
                        <td className={cx(td, "w-[90px] pr-5 text-right")}>
                          <button
                            type="button"
                            title="Show all invoices"
                            aria-label="Show all invoices"
                            onClick={() => {
                              setCustQ(c.phone || c.name);
                              setPicked(people.find((p) => (c.phone ? normPhone(p.phone) === normPhone(c.phone) : p.name === c.name))?.key ?? null);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                            className="ml-auto grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            <Icon name="eye" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <WholesaleBillDetail bill={viewBill} onClose={() => setViewBill(null)} onPrint={setPrintBill} />
      <PrintModal bill={printBill ? wholesaleToBill(printBill) : null} onClose={() => setPrintBill(null)} />
    </Page>
  );
}

/** Top products by revenue, in the same list style as the POS "Top Items". */
function TopProducts({ products, n = 5, empty = "No sales in this period." }: { products: { key: string; name: string; total: number; qty: number; unit: "piece" | "gram" }[]; n?: number; empty?: string }) {
  const top = products.slice(0, n);
  const max = top[0]?.total || 1;
  if (!top.length) return <p className="py-8 text-center text-[13px] text-slate-500">{empty}</p>;
  return (
    <ol className="space-y-4">
      {top.map((t, i) => (
        <li key={t.key} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-3">
          <span className="pt-0.5 text-[12px] font-semibold text-slate-400">{i + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-800">{t.name}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(t.total / max) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <b className="adm-num block text-[13px] text-red-600">{rupee(t.total)}</b>
            <span className="text-[10.5px] text-slate-400">{qtyLabel(t.unit, round3(t.qty))}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
