"use client";

import { useMemo, useState } from "react";
import type { Bill } from "./types";
import { rupee } from "./money";
import { CHANNEL_LABEL, channelOf, completedIn, customerStats, expensesIn, gstReport, isoWeek, itemStats, monthly, rangeOf, startOfWeek, paymentStats, summary, weekly, type Channel, type Period } from "./analytics";
import Link from "next/link";
import { useAdmin } from "./Store";
import { Badge, Btn, Card, DateRange, Empty, Kpi, Page, PageHead, Pills, SearchBox, Switch, Tabs, cx, downloadExcel, fmtDate, fmtTime, type ExcelSheet } from "./kit";
import { BRAND } from "../../lib/brand";

type Tab = "revenue" | "today" | "products" | "customers" | "coupons";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ---------------- charts ---------------- */

/** Single-series column chart: thin red columns, value on hover/focus. */
function Columns({ data, height = 200, empty }: { data: { label: string; full: string; value: number }[]; height?: number; empty?: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);
  return (
    <div>
      <div className="relative flex items-end gap-1 sm:gap-2" style={{ height }} role="img" aria-label={data.map((d) => `${d.full}: ${rupee(d.value)}`).join(", ")}>
        {!max && empty && <p className="absolute inset-0 grid place-items-center text-[13px] text-slate-400">{empty}</p>}
        {data.map((d, i) => {
          const pct = max ? (d.value / max) * 88 : 0;
          return (
            <div key={d.full} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center rounded-lg outline-none transition-colors hover:bg-slate-50 focus-visible:bg-slate-50">
              {d.value > 0 && (
                <div className="adm-bar w-3 rounded-t-[4px] bg-red-600 transition-colors group-hover:bg-red-700 sm:w-4" style={{ height: `${pct}%`, ["--i" as string]: i }} />
              )}
              <div
                className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] leading-tight text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                style={{ bottom: `calc(${pct}% + 8px)` }}
              >
                <span className="block text-slate-300">{d.full}</span>
                <b className="text-[12.5px]">{rupee(d.value)}</b>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 border-t border-slate-100 pt-3 sm:gap-2">
        {data.map((d) => (
          <span key={d.full} className="flex-1 text-center text-[10.5px] font-semibold uppercase text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Income the three ways the shop sells: dine-in, takeaway, delivery. This is
 *  what the owner asks for — not "tab vs counter", which is a till detail. */
function ChannelSplit({ by, money = true }: { by: Record<Channel, { revenue: number; count: number; items: number }>; money?: boolean }) {
  const rows = [
    { key: "dinein" as const, label: CHANNEL_LABEL.dinein, text: "text-slate-700", bar: "bg-slate-800" },
    { key: "takeaway" as const, label: CHANNEL_LABEL.takeaway, text: "text-sky-700", bar: "bg-sky-500" },
    { key: "delivery" as const, label: CHANNEL_LABEL.delivery, text: "text-violet-700", bar: "bg-violet-500" },
  ];
  const max = Math.max(...rows.map((r) => (money ? by[r.key].revenue : by[r.key].count)), 1);
  const total = rows.reduce((a, r) => a + by[r.key].revenue, 0);
  if (total === 0 && rows.every((r) => by[r.key].count === 0)) {
    return <p className="py-8 text-center text-[13px] text-slate-400">No sales in this period yet.</p>;
  }
  return (
    <div className="space-y-5">
      {rows.map((r) => {
        const v = by[r.key];
        const w = (money ? v.revenue : v.count) / max;
        return (
          <div key={r.key}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={cx("text-[11px] font-bold uppercase tracking-[0.14em]", r.text)}>{r.label}</span>
              <span className="text-right leading-tight">
                <b className="adm-num block text-[15px] text-slate-900">{rupee(v.revenue)}</b>
                <small className="text-[10.5px] text-slate-400">
                  {v.count} bill{v.count === 1 ? "" : "s"} · {total > 0 ? Math.round((v.revenue / total) * 100) : 0}%
                </small>
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              {w > 0 && <div className={cx("adm-fill h-full rounded-full", r.bar)} style={{ width: `${w * 100}%` }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** VAT invoices vs bills with no VAT: how revenue splits, and the tax collected. */
function GstSplit({ gstN, gstRev, gst, taxable, nonGstN, nonGstRev }: { gstN: number; gstRev: number; gst: number; taxable: number; nonGstN: number; nonGstRev: number }) {
  const total = gstRev + nonGstRev;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <div className="space-y-4">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {gstRev > 0 && <div className="adm-fill h-full bg-amber-500" style={{ width: `${pct(gstRev)}%` }} title={`VAT ${rupee(gstRev)}`} />}
        {nonGstRev > 0 && <div className="adm-fill h-full bg-slate-400" style={{ width: `${pct(nonGstRev)}%` }} title={`No VAT ${rupee(nonGstRev)}`} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700">VAT invoices</span>
            <b className="adm-num text-[16px] text-slate-900">{rupee(gstRev)}</b>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-500">
            {gstN} invoice{gstN === 1 ? "" : "s"} · {rupee(gst)} VAT on {rupee(taxable)} after discount
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Bills with no VAT</span>
            <b className="adm-num text-[16px] text-slate-900">{rupee(nonGstRev)}</b>
          </div>
          <p className="mt-1 text-[11.5px] text-slate-500">{nonGstN} bill{nonGstN === 1 ? "" : "s"} · no tax charged</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-slate-200 pt-3 text-[13px]">
        <dt className="font-semibold text-slate-600">Total VAT collected</dt>
        <dd className="adm-num font-extrabold text-amber-700">{rupee(gst)}</dd>
      </div>
    </div>
  );
}

/** Per-rate VAT table: how much was taxable and how much VAT fell under each rate. */
function GstByRate({ rates }: { rates: { rate: number; invoices: number; taxable: number; gst: number; total: number }[] }) {
  if (!rates.length) return <p className="py-8 text-center text-[13px] text-slate-400">No VAT invoices in this period yet.</p>;
  const cell = "px-3 py-2.5 text-[12.5px] whitespace-nowrap";
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 adm-scroll">
      <table className="w-full min-w-[480px]">
        <thead className="bg-slate-50">
          <tr>
            <th className={cx(th, "text-left")}>VAT rate</th>
            <th className={cx(th, "text-right")}>Invoices</th>
            <th className={cx(th, "text-right")}>Taxable</th>
            <th className={cx(th, "text-right")}>VAT collected</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((r) => (
            <tr key={r.rate} className="border-b border-slate-100 last:border-0">
              <td className={cx(cell, "font-bold text-slate-900")}>{r.rate}%</td>
              <td className={cx(cell, "text-right text-slate-600")}>{r.invoices}</td>
              <td className={cx(cell, "adm-num text-right text-slate-700")}>{rupee(r.taxable)}</td>
              <td className={cx(cell, "adm-num text-right font-bold text-amber-700")}>{rupee(r.gst)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Invoice-by-invoice VAT — the list an accountant files from. Shows the latest few, the Excel export has them all. */
function GstRegister({ bills, onExport }: { bills: Bill[]; onExport: () => void }) {
  const [all, setAll] = useState(false);
  const rows = all ? bills : bills.slice(0, 12);
  const cell = "px-3 py-2.5 text-[12.5px] whitespace-nowrap";
  return (
    <Card
      title="VAT invoices"
      right={
        <Btn size="sm" icon="download" onClick={onExport} disabled={!bills.length}>
          Download Excel
        </Btn>
      }
    >
      {!bills.length ? (
        <p className="py-8 text-center text-[13px] text-slate-400">No VAT invoices in this period yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-100 adm-scroll">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={cx(th, "text-left")}>Invoice</th>
                  <th className={cx(th, "text-left")}>Date</th>
                  <th className={cx(th, "text-left")}>Customer</th>
                  <th className={cx(th, "text-right")}>Rate</th>
                  <th className={cx(th, "text-right")}>Taxable</th>
                  <th className={cx(th, "text-right")}>VAT</th>
                  <th className={cx(th, "text-right")}>Invoice total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0">
                      <td className={cx(cell, "font-semibold text-slate-900")}>{b.invoiceNo}</td>
                      <td className={cx(cell, "text-slate-600")}>{fmtDate(b.createdAt)}</td>
                      <td className={cx(cell, "max-w-[180px] truncate text-slate-700")}>{b.customerName || b.customerPhone || "—"}</td>
                      <td className={cx(cell, "text-right text-slate-600")}>{b.gstPercent}%</td>
                      <td className={cx(cell, "adm-num text-right text-slate-700")}>{rupee(b.taxableAmount)}</td>
                      <td className={cx(cell, "adm-num text-right font-bold text-amber-700")}>{rupee(b.gstAmount)}</td>
                      <td className={cx(cell, "adm-num text-right font-bold text-amber-700")}>{rupee(b.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {bills.length > rows.length || all ? (
            <button type="button" onClick={() => setAll(!all)} className="mt-3 text-[12.5px] font-bold text-red-600 hover:underline">
              {all ? "Show fewer" : `Show all ${bills.length} invoices`}
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function TopItems({ bills, n = 5, empty = "No sales in this period." }: { bills: Bill[]; n?: number; empty?: string }) {
  const top = itemStats(bills).slice(0, n);
  const max = top[0]?.revenue || 1;
  if (!top.length) return <p className="py-8 text-center text-[13px] text-slate-500">{empty}</p>;
  return (
    <ol className="space-y-4">
      {top.map((t, i) => (
        <li key={t.key} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-3">
          <span className="pt-0.5 text-[12px] font-semibold text-slate-400">{i + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-slate-800">{t.name}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(t.revenue / max) * 100}%` }} />
            </div>
          </div>
          <div className="text-right">
            <b className="adm-num block text-[13px] text-red-600">{rupee(t.revenue)}</b>
            <span className="text-[10.5px] text-slate-400">{t.qty} pcs</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500";
const td = "px-4 py-3.5 text-[13px]";

/* ---------------- page ---------------- */

export default function AnalyticsPage() {
  const { s, floor, now } = useAdmin();
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("revenue");
  const [gstView, setGstView] = useState(false);
  const [q, setQ] = useState("");

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const inPeriod = useMemo(() => completedIn(s.bills, range), [s.bills, range]);
  const gstr = useMemo(() => gstReport(inPeriod), [inPeriod]);
  const today = useMemo(() => completedIn(s.bills, rangeOf("today")), [s.bills, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const sum = summary(inPeriod);
  const pay = paymentStats(inPeriod);
  const tsum = summary(today);

  const year = new Date().getFullYear();
  const months = monthly(s.bills, year);
  const yearTotal = months.reduce((a, b) => a + b, 0);
  const activeMonths = new Date().getMonth() + 1;
  const wkStart = startOfWeek();
  const week = weekly(s.bills, wkStart);
  const wk = isoWeek();

  const needle = q.trim().toLowerCase();

  /* The Expenses tab has its own filters; this uses the period picked here, so
     the two agree on what "this month" means but can differ in range. */
  const expensesTotal = useMemo(() => expensesIn(s.expenses, range).reduce((a, e) => a + e.amount, 0), [s.expenses, range]);
  /* VAT collected is passed on to the government, so it isn't earnings. */
  const net = sum.revenue - sum.gst - expensesTotal;
  const gstBills = useMemo(() => inPeriod.filter((b) => b.isGst).sort((a, b) => b.createdAt - a.createdAt), [inPeriod]);
  const exportGst = () => {
    const head = ["Invoice", "Date", "Customer", "Mobile", "VAT %", "Taxable amount", "VAT amount", "Invoice total"];
    const body = gstBills.map((b) => [b.invoiceNo, fmtDate(b.createdAt), b.customerName, b.customerPhone, b.gstPercent, b.taxableAmount, b.gstAmount, b.total]);
    downloadExcel(`vat-invoices-${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: "VAT invoices", rows: [head, ...body] }]);
  };
  const lowCount = s.products.filter((p) => p.stock !== null && p.stock <= p.lowAt).length;
  const customers = useMemo(() => customerStats(inPeriod), [inPeriod]);
  const repeat = customers.filter((c) => c.visits > 1).length;

  const periodLabel = ({ all: "all-time", today: "today", week: "this-week", month: "this-month", year: "this-year", custom: `${from || "start"}_${to || "end"}` } as const)[period];
  /* A multi-sheet .xls — opens in Excel, Numbers and Google Sheets with real
     columns and real numbers. Captures what each tab shows for the chosen
     period, so an owner can file the whole report in one click. */
  const exportExcel = () => {
    const products = itemStats(inPeriod);
    const sheets: ExcelSheet[] = [
      {
        name: "Summary",
        rows: [
          [`${BRAND.fullName} · Analytics`],
          ["Period", periodLabel],
          [],
          ["Metric", "Value"],
          ["Total revenue", sum.revenue],
          ["Total expenses", expensesTotal],
          ["VAT collected", sum.gst],
          ["Net earnings", net],
          ["Completed bills", sum.count],
          [],
          ["Channel", "Revenue", "Bills", "Items"],
          ["Dine-in", sum.byChannel.dinein.revenue, sum.byChannel.dinein.count, sum.byChannel.dinein.items],
          ["Takeaway", sum.byChannel.takeaway.revenue, sum.byChannel.takeaway.count, sum.byChannel.takeaway.items],
          ["Delivery", sum.byChannel.delivery.revenue, sum.byChannel.delivery.count, sum.byChannel.delivery.items],
          ["Delivery charges collected", sum.delivery],
          [],
          ["Items sold", sum.items],
          ["Avg order value", Math.round(sum.aov)],
          ["Discounts given", sum.discount],
          ["Discounted bills", sum.discounted],
          ["Top product", sum.top],
          [],
          ["Payment", "Amount"],
          ["Cash", pay.cash],
          ["Card", pay.card],
          ["UPI", pay.upi],
        ],
      },
      {
        name: "Bills",
        rows: [
          ["Invoice", "Date", "Time", "Channel", "Customer", "Phone", "Items", "Subtotal", "Discount", "Coupon", "Delivery", "Extra", "VAT %", "Taxable", "VAT amount", "Total", "Payment", "Status"],
          ...inPeriod
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((b) => [b.invoiceNo, fmtDate(b.createdAt), fmtTime(b.createdAt), CHANNEL_LABEL[channelOf(b)], b.customerName, b.customerPhone, b.itemCount, b.subtotal, b.discount, b.couponCode ?? "", b.deliveryFee, b.extra, b.gstPercent, b.taxableAmount, b.gstAmount, b.total, b.payment, b.status]),
        ],
      },
      {
        name: "Products",
        rows: [
          ["#", "Product", "Category", "Units sold", "Revenue", "Share %", "In stock"],
          ...products.map((p, i) => {
            const prod = p.productId ? s.products.find((x) => x.id === p.productId) : null;
            const total = products.reduce((a, x) => a + x.revenue, 0) || 1;
            return [i + 1, p.name, prod?.category ?? "Custom", p.qty, p.revenue, Math.round((p.revenue / total) * 100), prod?.stock ?? ""];
          }),
        ],
      },
      {
        name: "Customers",
        rows: [
          ["Customer", "Phone", "Visits", "Revenue", "Avg / visit"],
          ...customers.map((c) => [c.name || "Guest", c.phone, c.visits, c.spent, Math.round(c.spent / c.visits)]),
        ],
      },
      {
        name: "Expenses",
        rows: [
          ["Date", "Title", "Category", "Amount", "Notes"],
          ...expensesIn(s.expenses, range)
            .slice()
            .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate))
            .map((e) => [e.expenseDate, e.title, e.category, e.amount, e.notes]),
          [],
          ["Total", "", "", expensesTotal, ""],
        ],
      },
      {
        name: "Coupons",
        rows: [
          ["Invoice", "Date", "Customer phone", "Coupon", "Order total", "Discount applied", "Source"],
          ...inPeriod
            .filter((b) => b.discount > 0)
            .map((b) => [b.invoiceNo, fmtDate(b.createdAt), b.customerPhone, b.couponCode ?? "Manual", b.subtotal, b.discount, b.couponSource ?? "staff"]),
        ],
      },
    ];
    const slug = BRAND.name.toLowerCase().replace(/\s+/g, "-");
    downloadExcel(`${slug}-analytics-${periodLabel}-${new Date().toISOString().slice(0, 10)}`, sheets);
  };

  return (
    <Page>
      <PageHead
        title="Analytics"
        sub="Real-time store & customer insights"
        right={
          tab === "revenue" ? (
            <div
              className={cx(
                "flex items-center gap-2.5 rounded-full border px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-wide transition",
                gstView ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500",
              )}
            >
              VAT view
              <Switch on={gstView} onChange={setGstView} label="VAT view" />
            </div>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pills
          label="Period:"
          value={period}
          onChange={setPeriod}
          options={[
            { v: "all", t: "All time" },
            { v: "today", t: "Today" },
            { v: "week", t: "This week" },
            { v: "month", t: "This month" },
            { v: "year", t: "This year" },
            { v: "custom", t: "Custom" },
          ]}
        />
        {period === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
        <Btn size="md" kind="dark" icon="download" onClick={exportExcel} disabled={!inPeriod.length} className="ml-auto">
          Export Excel
        </Btn>
      </div>

      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          setQ("");
        }}
        options={[
          { v: "revenue", t: "Revenue" },
          { v: "today", t: "Today's sales" },
          { v: "products", t: "Products" },
          { v: "customers", t: "Customers" },
          { v: "coupons", t: "Coupons" },
        ]}
      />

      {/* ============ VAT VIEW ============ */}
      {tab === "revenue" && gstView && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="VAT collected" value={rupee(gstr.gst)} hint={gstr.avgRate > 0 ? `Avg ${gstr.avgRate.toFixed(1)}% on taxable sales` : "No VAT collected yet"} icon="percent" tone="amber" />
            <Kpi label="Taxable sales" value={rupee(gstr.taxable)} hint="Value VAT was charged on" icon="rupee" tone="sky" />
            <Kpi label="VAT invoice value" value={rupee(gstr.revenue)} hint="Taxable sales + VAT" icon="billing" tone="emerald" />
            <Kpi label="VAT invoices" value={gstr.invoices} hint={`of ${sum.count} bill${sum.count === 1 ? "" : "s"} in period`} icon="list" tone="violet" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Sales with no VAT" value={rupee(sum.nonGstRev)} hint={`${gstr.nonGstBills} bill${gstr.nonGstBills === 1 ? "" : "s"} billed without VAT`} icon="bag" tone="slate" />
            <Kpi label="VAT rates used" value={gstr.rates.length ? gstr.rates.map((r) => `${r.rate}%`).join(", ") : "—"} hint={`${gstr.rates.length} rate${gstr.rates.length === 1 ? "" : "s"} in this period`} icon="sliders" tone="amber" small />
          </div>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Card title="VAT by rate">
              <GstByRate rates={gstr.rates} />
            </Card>
            <Card title="With VAT vs without" right={<span className="text-[12px] text-slate-500">{sum.count} bill{sum.count === 1 ? "" : "s"} in period</span>}>
              {sum.count ? (
                <GstSplit gstN={sum.gstN} gstRev={sum.gstRev} gst={sum.gst} taxable={sum.taxable} nonGstN={sum.nonGstN} nonGstRev={sum.nonGstRev} />
              ) : (
                <p className="text-[13px] text-slate-400">No bills in this period.</p>
              )}
            </Card>
          </div>

          <GstRegister bills={gstBills} onExport={exportGst} />

          <p className="rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-2.5 text-center text-[12.5px] text-amber-800">
            VAT view — only the tax side of the books. Turn off <b>VAT view</b> to see full revenue, products and customers.
          </p>
        </div>
      )}

      {/* ============ REVENUE ============ */}
      {tab === "revenue" && !gstView && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Net earnings" value={rupee(net)} hint={sum.gst > 0 ? "Revenue − VAT − expenses" : "Revenue − expenses"} icon="rupee" tone={net >= 0 ? "emerald" : "red"} />
            <Kpi label="Total revenue" value={rupee(sum.revenue)} hint={sum.gst > 0 ? `Includes ${rupee(sum.gst)} VAT collected` : "Customer tabs + counter combined"} icon="rupee" tone="emerald" />
            <Kpi label="Total expenses" value={rupee(expensesTotal)} hint="Recorded on the Expenses page" icon="bag" tone="rose" />
            <Kpi label="Discounts given" value={rupee(sum.discount)} hint={`${sum.discounted} discounted bills`} icon="coupon" tone="violet" />
          </div>
          <p className="rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-center text-[12.5px] font-semibold text-slate-500">
            Calculation: <b className="text-slate-800">Revenue {rupee(sum.revenue)}</b>
            {sum.gst > 0 && (
              <>
                {" "}− <b className="text-slate-800">GST {rupee(sum.gst)}</b>
              </>
            )}{" "}
            − <b className="text-slate-800">Expenses {rupee(expensesTotal)}</b> = <b className={net >= 0 ? "text-emerald-600" : "text-red-600"}>{rupee(net)}</b>
          </p>
          {/* The three ways the shop sells. This is the split the owner runs
              the business on, so it leads — "tab vs counter" was a till
              detail nobody was asking for. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Dine-in income" value={rupee(sum.byChannel.dinein.revenue)} hint={`${sum.byChannel.dinein.count} bill${sum.byChannel.dinein.count === 1 ? "" : "s"} eaten in`} icon="utensils" tone="rose" />
            <Kpi label="Takeaway income" value={rupee(sum.byChannel.takeaway.revenue)} hint={`${sum.byChannel.takeaway.count} bill${sum.byChannel.takeaway.count === 1 ? "" : "s"} collected`} icon="bag" tone="sky" />
            <Kpi label="Delivery income" value={rupee(sum.byChannel.delivery.revenue)} hint={sum.delivery > 0 ? `includes ${rupee(sum.delivery)} delivery charges` : `${sum.byChannel.delivery.count} bill${sum.byChannel.delivery.count === 1 ? "" : "s"} sent out`} icon="cart" tone="violet" />
            <Kpi label="Completed bills" value={sum.count} hint="Every settled bill in the period" icon="billing" tone="amber" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Total items sold" value={sum.items} hint="From completed bills" icon="box" tone="violet" />
            <Kpi label="Avg order value" value={rupee(Math.round(sum.aov))} hint="Per completed bill" icon="zap" tone="orange" />
            <Kpi label="Delivery charges" value={rupee(sum.delivery)} hint="Collected on top of the goods" icon="cart" tone="sky" />
            <Kpi label="Top product" value={sum.top} hint="Most sold item" icon="star" tone="amber" small />
          </div>

          {/* Two balanced columns: the browser flows the cards down the first column and
              then the second, so neither side is left with a gap under it however tall the
              cards turn out. */}
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
                Revenue This Week{" "}
                <span className="text-red-600">
                  (Week {wk.week} of {wk.year})
                </span>
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
            <Card title="Top Items by Revenue">
              <TopItems bills={inPeriod} />
            </Card>
            <Card title="Customers" right={<span className="text-[12px] text-slate-500">{customers.length} known · {repeat} repeat</span>}>
              {customers.length ? (
                <ul className="space-y-2.5 text-[13px]">
                  {customers.slice(0, 5).map((c) => (
                    <li key={c.key} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <b className="block truncate text-slate-800">{c.name || "—"}</b>
                        <span className="text-[11.5px] text-slate-400">{c.phone} · {c.visits} visit{c.visits === 1 ? "" : "s"}</span>
                      </span>
                      <b className="shrink-0 text-slate-900">{rupee(c.spent)}</b>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-slate-400">No customer mobiles on bills in this period.</p>
              )}
            </Card>
            <Card title="With VAT vs without" right={<span className="text-[12px] text-slate-500">{sum.count} bill{sum.count === 1 ? "" : "s"} in period</span>}>
              {sum.count ? (
                <GstSplit gstN={sum.gstN} gstRev={sum.gstRev} gst={sum.gst} taxable={sum.taxable} nonGstN={sum.nonGstN} nonGstRev={sum.nonGstRev} />
              ) : (
                <p className="text-[13px] text-slate-400">No bills in this period.</p>
              )}
            </Card>
            <Card title="Income by channel" right={<span className="text-[12px] text-slate-500">dine-in · takeaway · delivery</span>}>
              <ChannelSplit by={sum.byChannel} />
            </Card>
            <Card title="Payment mode" right={pay.splitN ? <span className="text-[12px] text-slate-500">{pay.splitN} split bill{pay.splitN === 1 ? "" : "s"}</span> : undefined}>
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-slate-500">Cash</dt><dd className="font-bold text-slate-900">{rupee(pay.cash)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Card</dt><dd className="font-bold text-slate-900">{rupee(pay.card)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">UPI</dt><dd className="font-bold text-slate-900">{rupee(pay.upi)}</dd></div>
              </dl>
            </Card>
          </div>
        </div>
      )}

      {/* ============ TODAY ============ */}
      {tab === "today" && (
        <div className="adm-in space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Today's revenue" value={rupee(tsum.revenue)} hint="Completed today" icon="rupee" tone="emerald" />
            <Kpi label="Today's bills" value={tsum.count} hint="Completed today" icon="billing" tone="sky" />
            <Kpi
              label="Today's items sold"
              value={
                <>
                  {tsum.items} <span className="text-[14px] font-bold">pcs</span>
                </>
              }
              hint="Quantity sold today"
              icon="box"
              tone="violet"
            />
            <Kpi label="Today's avg order value" value={rupee(Math.round(tsum.aov))} hint="Per invoice today" icon="zap" tone="orange" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Dine-in today" value={rupee(tsum.byChannel.dinein.revenue)} hint={`${tsum.byChannel.dinein.count} bill${tsum.byChannel.dinein.count === 1 ? "" : "s"}`} icon="utensils" tone="rose" />
            <Kpi label="Takeaway today" value={rupee(tsum.byChannel.takeaway.revenue)} hint={`${tsum.byChannel.takeaway.count} bill${tsum.byChannel.takeaway.count === 1 ? "" : "s"}`} icon="bag" tone="sky" />
            <Kpi label="Delivery today" value={rupee(tsum.byChannel.delivery.revenue)} hint={`${tsum.byChannel.delivery.count} bill${tsum.byChannel.delivery.count === 1 ? "" : "s"}`} icon="cart" tone="violet" />
          </div>
          <div className="grid gap-5 xl:grid-cols-3">
            <Card
              className="xl:col-span-2"
              title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s transactions</span>}
              right={<SearchBox value={q} onChange={setQ} placeholder="Search contact no…" className="w-full sm:w-64" />}
            >
              <div className="overflow-x-auto rounded-xl adm-scroll">
                <table className="w-full min-w-[560px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th}>Invoice ID</th>
                      <th className={th}>Customer</th>
                      <th className={th}>Source</th>
                      <th className={th}>Items</th>
                      <th className={cx(th, "text-right")}>Grand total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {today
                      .filter((b) => !needle || `${b.customerPhone} ${b.invoiceNo} ${b.customerName}`.toLowerCase().includes(needle))
                      .slice()
                      .reverse()
                      .map((b) => (
                        <tr key={b.id} className="border-b border-slate-100 last:border-0">
                          <td className={cx(td, "font-semibold text-slate-900")}>
                            {b.invoiceNo}
                            <span className="block text-[11px] font-normal text-slate-400">{fmtTime(b.createdAt)}</span>
                          </td>
                          <td className={cx(td, "text-slate-700")}>
                            <b className="block text-slate-900">{b.customerName || "Guest"}</b>
                            <span className="adm-num text-[11.5px] text-slate-500">{b.customerPhone || "No number"}</span>
                          </td>
                          {/* Where the sale came from, in the shop's own words. */}
                          <td className={td}>
                            <Badge tone={channelOf(b) === "delivery" ? "violet" : channelOf(b) === "takeaway" ? "sky" : "red"}>{CHANNEL_LABEL[channelOf(b)]}</Badge>
                          </td>
                          <td className={cx(td, "text-slate-700")}>{b.itemCount}</td>
                          <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(b.total)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!today.length && <p className="py-14 text-center text-[14px] italic text-slate-400">No transactions found for today.</p>}
              </div>
            </Card>
            <div className="space-y-5">
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Live right now</span>}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Open tabs</p>
                    <p className="adm-num mt-1 text-[22px] font-extrabold">{floor.filter((f) => f.session).length}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">Unbilled</p>
                    <p className="adm-num mt-1 text-[22px] font-extrabold">{rupee(floor.reduce((a, f) => a + f.total, 0))}</p>
                  </div>
                </div>
              </Card>
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s channel split</span>}>
                {today.length ? <ChannelSplit by={tsum.byChannel} /> : <p className="py-8 text-center text-[14px] text-slate-600">No sales today.</p>}
              </Card>
              <Card title={<span className="text-[14px] uppercase tracking-[0.14em] text-slate-900">Today&apos;s top items</span>}>
                <TopItems bills={today} empty="No items sold today." />
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ============ PRODUCTS ============ */}
      {tab === "products" && <ProductsTab bills={inPeriod} q={q} setQ={setQ} />}

      {/* ============ CUSTOMERS ============ */}
      {tab === "customers" && <CustomersTab bills={inPeriod} />}

      {/* ============ COUPONS ============ */}
      {tab === "coupons" && (
        <div className="adm-in grid gap-5 xl:grid-cols-[minmax(300px,380px)_1fr]">
          <Card title="Discount Summary">
            <div className="space-y-4">
              {[
                { l: "Total discounts given", v: rupee(sum.discount), c: "text-red-600", i: "%" },
                { l: "Discounted orders", v: String(sum.discounted), c: "text-slate-900", i: "▦" },
                { l: "Guest-applied coupons", v: `${inPeriod.filter((b) => b.couponSource === "guest").length} · ${rupee(inPeriod.filter((b) => b.couponSource === "guest").reduce((a, b) => a + b.couponDiscount, 0))}`, c: "text-sky-600", i: "☺" },
                { l: "Avg discount per order", v: rupee(sum.discounted ? Math.round(sum.discount / sum.discounted) : 0), c: "text-slate-900", i: "₹" },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl border border-stone-100 bg-[#f8f7f3] p-5">
                  <div className="flex items-start justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">{x.l}</span>
                    <span className="text-[15px] font-bold text-red-500">{x.i}</span>
                  </div>
                  <p className={cx("adm-num mt-2 text-[22px] font-extrabold", x.c)}>{x.v}</p>
                </div>
              ))}
              <div className="pt-1">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">By coupon</p>
                {(() => {
                  const m = new Map<string, { n: number; d: number }>();
                  for (const b of inPeriod) if (b.couponCode) m.set(b.couponCode, { n: (m.get(b.couponCode)?.n ?? 0) + 1, d: (m.get(b.couponCode)?.d ?? 0) + b.couponDiscount });
                  const rows = [...m.entries()].sort((a, b) => b[1].d - a[1].d);
                  return rows.length ? (
                    <ul className="space-y-2 text-[13px]">
                      {rows.map(([c, v]) => (
                        <li key={c} className="flex justify-between">
                          <b className="text-slate-800">{c}</b>
                          <span className="text-slate-500">
                            {v.n}× · <span className="font-semibold text-red-600">-{rupee(v.d)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[13px] text-slate-400">No coupons redeemed in this period.</p>
                  );
                })()}
              </div>
            </div>
          </Card>
          <Card title="Promo Campaign Performance" right={<SearchBox value={q} onChange={setQ} placeholder="Search code/mobile/amount…" className="w-full sm:w-64" />}>
            <div className="overflow-x-auto adm-scroll">
              <table className="w-full min-w-[620px]">
                <thead className="bg-[#f8f7f3]">
                  <tr>
                    <th className={th}>Transaction ID</th>
                    <th className={th}>Customer mobile</th>
                    <th className={th}>Coupon</th>
                    <th className={cx(th, "text-right")}>Order total</th>
                    <th className={cx(th, "text-right")}>Discount applied</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod
                    .filter((b) => b.discount > 0)
                    .filter((b) => !needle || `${b.invoiceNo} ${b.customerPhone} ${b.couponCode ?? ""} ${b.subtotal} ${b.discount}`.toLowerCase().includes(needle))
                    .slice()
                    .reverse()
                    .map((b) => (
                      <tr key={b.id} className="border-b border-slate-100 last:border-0">
                        <td className={cx(td, "font-semibold text-slate-900")}>{b.invoiceNo}</td>
                        <td className={cx(td, "font-medium text-slate-700")}>{b.customerPhone || "—"}</td>
                        <td className={td}>{b.couponCode ? <span className="inline-flex items-center gap-1.5"><Badge tone="violet">{b.couponCode}</Badge>{b.couponSource === "guest" && <Badge tone="sky">Guest</Badge>}</span> : <span className="text-[12px] text-slate-400">Manual</span>}</td>
                        <td className={cx(td, "text-right font-semibold text-slate-800")}>{rupee(b.subtotal)}</td>
                        <td className={cx(td, "text-right font-semibold text-red-600")}>-{rupee(b.discount)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {!inPeriod.some((b) => b.discount > 0) && <Empty icon="coupon" title="No discounted bills in this period" />}
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

function ProductsTab({ bills, q, setQ }: { bills: Bill[]; q: string; setQ: (v: string) => void }) {
  const { s } = useAdmin();
  const stats = itemStats(bills);
  const total = stats.reduce((a, x) => a + x.revenue, 0) || 1;
  const rows = [
    ...stats,
    ...s.products.filter((p) => !stats.some((x) => x.productId === p.id)).map((p) => ({ key: p.id, productId: p.id, name: p.name, qty: 0, revenue: 0 })),
  ];
  const needle = q.trim().toLowerCase();
  const low = s.products.filter((p) => p.stock !== null && p.stock <= p.lowAt);
  const byQty = [...stats].sort((a, b) => b.qty - a.qty);
  return (
    <div className="adm-in space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Units sold" value={stats.reduce((a, x) => a + x.qty, 0)} hint="In the selected period" icon="box" tone="violet" />
        <Kpi label="Products sold" value={stats.length} hint={`of ${s.products.length} on the catalogue`} icon="list" tone="sky" />
        <Kpi label="Best seller" value={byQty[0]?.name ?? "—"} hint={byQty[0] ? `${byQty[0].qty} pcs` : "No sales yet"} icon="trophy" tone="amber" small />
        <Kpi label="Low / sold out" value={low.length} hint="Check the inventory" icon="alert" tone={low.length ? "red" : "slate"} />
      </div>
      <Card title="Product performance" right={<SearchBox value={q} onChange={setQ} placeholder="Search products…" className="w-full sm:w-64" />}>
        <div className="overflow-x-auto adm-scroll">
          <table className="w-full min-w-[720px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>#</th>
                <th className={th}>Product</th>
                <th className={th}>Category</th>
                <th className={cx(th, "text-right")}>Units</th>
                <th className={cx(th, "text-right")}>Revenue</th>
                <th className={cx(th, "w-[22%]")}>Share</th>
                <th className={cx(th, "text-right")}>In stock</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => !needle || r.name.toLowerCase().includes(needle))
                .map((r, i) => {
                  const p = r.productId ? s.products.find((x) => x.id === r.productId) : null;
                  return (
                    <tr key={r.key} className="border-b border-slate-100 last:border-0">
                      <td className={cx(td, "text-slate-400")}>{i + 1}</td>
                      <td className={cx(td, "font-semibold text-slate-900")}>{r.name}</td>
                      <td className={cx(td, "text-slate-500")}>{p?.category ?? "Custom item"}</td>
                      <td className={cx(td, "text-right font-semibold")}>{r.qty}</td>
                      <td className={cx(td, "text-right font-bold text-slate-900")}>{rupee(r.revenue)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                            {r.revenue > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(r.revenue / total) * 100}%` }} />}
                          </div>
                          <span className="w-10 text-right text-[11px] text-slate-500">{Math.round((r.revenue / total) * 100)}%</span>
                        </div>
                      </td>
                      <td className={cx(td, "text-right")}>
                        {!p ? (
                          <span className="text-slate-300">—</span>
                        ) : p.stock === null ? (
                          <span className="text-slate-400">∞</span>
                        ) : (
                          <span className={cx("font-semibold", p.stock <= 0 ? "text-red-600" : p.stock <= p.lowAt ? "text-amber-600" : "text-slate-700")}>{p.stock}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CustomersTab({ bills }: { bills: Bill[] }) {
  const { s } = useAdmin();
  const tbills = bills.filter((b) => b.source === "tab");
  /* A customer is a mobile number; counter walk-ins without one aren't grouped. */
  const byPhone = new Map<string, Bill[]>();
  for (const b of bills) if (b.customerPhone) byPhone.set(b.customerPhone, [...(byPhone.get(b.customerPhone) ?? []), b]);
  const rows = [...byPhone.entries()]
    .map(([phone, mine]) => {
      const revenue = mine.reduce((a, b) => a + b.total, 0);
      return {
        phone,
        name: mine.find((b) => b.customerName)?.customerName ?? "",
        visits: mine.length,
        revenue,
        avg: revenue / mine.length,
        last: Math.max(...mine.map((b) => b.createdAt)),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const max = rows[0]?.revenue || 1;
  const revenue = tbills.reduce((a, b) => a + b.total, 0);
  const durations = tbills
    .map((b) => {
      const sess = s.sessions.find((x) => x.id === b.sessionId);
      return sess ? b.createdAt - sess.openedAt : null;
    })
    .filter((x): x is number => x !== null);
  return (
    <div className="adm-in space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Customers" value={rows.length} hint="Different mobiles billed" icon="users" tone="sky" />
        <Kpi label="Repeat customers" value={rows.filter((r) => r.visits > 1).length} hint="Came back in the period" icon="zap" tone="orange" />
        <Kpi label="Avg spend / visit" value={rupee(tbills.length ? Math.round(revenue / tbills.length) : 0)} hint="Per settled tab" icon="rupee" tone="emerald" />
        <Kpi label="Avg time on a tab" value={durations.length ? `${Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000)} min` : "—"} hint="First order → bill" icon="clock" tone="violet" />
      </div>
      <Card title="Top customers">
        {!rows.length ? (
          <Empty icon="users" title="No customers yet">
            Bills that carry a mobile number show up here.
          </Empty>
        ) : (
          <div className="overflow-x-auto adm-scroll">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Customer</th>
                  <th className={cx(th, "w-[30%]")}>Revenue</th>
                  <th className={cx(th, "text-right")}>Visits</th>
                  <th className={cx(th, "text-right")}>Avg / visit</th>
                  <th className={cx(th, "text-right")}>Last visit</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.phone} className="border-b border-slate-100 last:border-0">
                    <td className={td}>
                      <b className="block text-slate-900">{r.name || "Guest"}</b>
                      <span className="adm-num text-[12px] text-slate-500">{r.phone}</span>
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <b className="adm-num w-24 shrink-0 text-slate-900">{rupee(r.revenue)}</b>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          {r.revenue > 0 && <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(r.revenue / max) * 100}%` }} />}
                        </div>
                      </div>
                    </td>
                    <td className={cx(td, "text-right font-semibold")}>{r.visits}</td>
                    <td className={cx(td, "text-right")}>{rupee(Math.round(r.avg))}</td>
                    <td className={cx(td, "text-right text-slate-500")}>{fmtDate(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
