"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  deleteWholesaleBill, PAYMENT_LABEL, round3,
  type WholesaleBill, type WholesalePayment,
} from "../../lib/wholesaleStore";
import { inRange, rangeOf, type Period } from "./analytics";
import { useAdmin } from "./Store";
import { billText, waLink } from "./receipt";
import PrintModal from "./PrintModal";
import { wholesaleToBill } from "./wholesaleAdapter";
import WholesaleBillDetail from "./WholesaleBillDetail";
import { rupee } from "./money";
import { Badge, Empty, Icon, Page, PageHead, SearchBox, WaIcon, cx, downloadExcel, fmtDate, fmtTime } from "./kit";

/* Wholesale orders — the same screen as Order Management: the same filters,
   table, WhatsApp / view / print / delete actions, detail sheet and Excel
   export. Only the invoice numbers differ (WB-2026-48213 rather than INV-…). */

type DateF = Extract<Period, "today" | "week" | "month" | "custom"> | "any";
type PayF = "all" | WholesalePayment;

const th = "px-3 py-4 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-3 py-4 text-[13px] whitespace-nowrap";

function Chip({ on, children, onClick, tone = "red" }: { on: boolean; children: React.ReactNode; onClick: () => void; tone?: "red" | "link" }) {
  if (tone === "link")
    return (
      <button type="button" onClick={onClick} className="h-8 rounded-full px-3 text-[13px] font-semibold text-red-600 hover:bg-red-50">
        {children}
      </button>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx("h-8 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition", on ? "bg-red-600 text-white shadow-[0_4px_10px_-4px_rgba(220,38,38,.9)]" : "bg-slate-100/80 text-slate-700 hover:bg-slate-200")}
    >
      {children}
    </button>
  );
}

export default function WholesaleOrdersPage() {
  const { s, confirm, toast } = useAdmin();
  const all = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);

  const [payF, setPayF] = useState<PayF>("all");
  const [date, setDate] = useState<DateF>("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  // The page number belongs to one set of filters; change a filter and it is page 1 again.
  const filterSig = `${payF}|${date}|${from}|${to}|${q.trim().toLowerCase()}`;
  const [pg, setPg] = useState({ page: 1, sig: filterSig });
  const page = pg.sig === filterSig ? pg.page : 1;
  const PAGE_SIZE = 25;
  const [bill, setBill] = useState<WholesaleBill | null>(null);
  const [printFor, setPrintFor] = useState<WholesaleBill | null>(null);

  const remove = async (b: WholesaleBill) => {
    if (!(await confirm({ title: `Delete ${b.id}?`, body: "It is removed from Wholesale orders and Wholesale analytics for good. This can't be undone.", ok: "Delete bill", danger: true }))) return;
    const r = await deleteWholesaleBill(b.id);
    if (r.ok) { if (bill?.id === b.id) setBill(null); toast({ kind: "ok", title: "Bill deleted" }); }
    else toast({ kind: "err", title: "Couldn't delete", body: r.error });
  };

  const range = date === "any" ? null : rangeOf(date, from, to);
  const needle = q.trim().toLowerCase();

  const bills = useMemo(
    () =>
      all
        .filter((b) => (payF === "all" || b.payment === payF) && inRange(b.createdAt, range))
        .filter((b) => !needle || `${b.id} ${b.customerName} ${b.customerPhone} ${b.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt - a.createdAt),
    [all, payF, range, needle],
  );

  /* The bills on screen as an Excel workbook: one sheet of bills, one of the
     lines on them. */
  const exportExcel = () =>
    downloadExcel(`wholesale-orders-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: "Wholesale bills",
        rows: [
          ["Invoice", "Customer", "Mobile", "Items", "Subtotal", "Discount", "Delivery", "Extra", "VAT %", "VAT amount", "Total", "Payment", "Cash", "Card", "Date", "Time"],
          ...bills.map((b) => [b.id, b.customerName, b.customerPhone, b.items.length, b.subtotal, b.discount, b.deliveryFee, b.extra, b.gstPercent, b.gstAmount, b.total, PAYMENT_LABEL[b.payment], b.payment === "cash" ? b.total : b.cashAmount, b.payment === "card" ? b.total : b.cardAmount, fmtDate(b.createdAt), fmtTime(b.createdAt)]),
          [],
          ["Total", "", "", "", round3(bills.reduce((a, b) => a + b.subtotal, 0)), round3(bills.reduce((a, b) => a + b.discount, 0)), round3(bills.reduce((a, b) => a + b.deliveryFee, 0)), round3(bills.reduce((a, b) => a + b.extra, 0)), "", round3(bills.reduce((a, b) => a + b.gstAmount, 0)), round3(bills.reduce((a, b) => a + b.total, 0))],
        ],
      },
      {
        name: "Items sold",
        rows: [
          ["Invoice", "Date", "Customer", "Item", "Sold by", "Quantity", "Rate", "Amount"],
          ...bills.flatMap((b) => b.items.map((i) => [b.id, fmtDate(b.createdAt), b.customerName, i.name, i.unit === "gram" ? "Weight (g)" : "Piece", i.qty, i.unitPrice, i.lineTotal])),
        ],
      },
    ]);

  const count = bills.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = bills.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goto = (p: number) => setPg({ page: Math.max(1, Math.min(pages, p)), sig: filterSig });

  return (
    <Page>
      <PageHead
        title="Wholesale Orders"
        right={
          <Link href="/admin-secure-portal-xyz-345/wholesale/billing" className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-[14px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(220,38,38,.8)] hover:bg-red-700">
            <Icon name="cart" size={18} /> Open wholesale billing
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-slate-100 p-5 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)] lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Type</span>
            {(
              [
                ["all", "All bills"],
                ["cash", "Cash"],
                ["upi", "UPI"],
                ["card", "Card"],
                ["split", "Cash + Card"],
              ] as const
            ).map(([v, t]) => (
              <Chip key={v} on={payF === v} onClick={() => setPayF(v)}>
                {t}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-14 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Date</span>
            {(
              [
                ["today", "Today"],
                ["week", "This Week"],
                ["month", "This Month"],
                ["custom", "Custom Range"],
              ] as const
            ).map(([v, t]) => (
              <Chip key={v} on={date === v} onClick={() => setDate(v)}>
                {t}
              </Chip>
            ))}
            {date !== "any" && (
              <Chip on={false} tone="link" onClick={() => (setDate("any"), setFrom(""), setTo(""))}>
                Clear Dates
              </Chip>
            )}
            {date === "custom" && (
              <span className="adm-in flex items-center gap-2 text-[12px] text-slate-500">
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-slate-800" />
                to
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-slate-800" />
              </span>
            )}
          </div>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search invoice, name, mobile, item…" className="w-full lg:w-80" />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
        <span className="text-[12.5px] font-semibold text-slate-600">{count} result(s)</span>
        <button type="button" onClick={exportExcel} disabled={!count} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-700 hover:underline disabled:opacity-40">
          <Icon name="download" size={15} /> Export Excel
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)]">
        <div className="overflow-x-auto adm-scroll">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>Invoice no</th>
                <th className={th}>Customer name</th>
                <th className={th}>Mobile</th>
                <th className={th}>Channel</th>
                <th className={th}>Total</th>
                <th className={th}>Payment</th>
                <th className={th}>Date</th>
                <th className={cx(th, "text-center")}>Status</th>
                <th className={cx(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/60">
                  <td className={td}>
                    <button type="button" onClick={() => setBill(b)} className="inline-flex items-center gap-2 font-bold text-red-600">
                      {b.id}
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-400">
                        <Icon name="external" size={13} />
                      </span>
                    </button>
                  </td>
                  <td className={cx(td, "font-semibold text-slate-800")}>{b.customerName || "—"}</td>
                  <td className={cx(td, "adm-num text-slate-600")}>{b.customerPhone || <span className="text-slate-400">—</span>}</td>
                  <td className={td}>
                    <Badge tone="violet">Wholesale</Badge>
                  </td>
                  <td className={cx(td, "font-bold text-slate-900")}>{rupee(b.total)}</td>
                  <td className={cx(td, "text-slate-600")}>{PAYMENT_LABEL[b.payment]}</td>
                  <td className={cx(td, "text-slate-600")}>{fmtDate(b.createdAt)}</td>
                  <td className={cx(td, "text-center")}><Badge tone="green">Completed</Badge></td>
                  <td className={cx(td, "text-right")}>
                    <span className="inline-flex gap-1.5">
                      {b.customerPhone && (
                        <a suppressHydrationWarning href={waLink(b.customerPhone, billText(wholesaleToBill(b), s.settings.shopName, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" title="Send on WhatsApp" aria-label="Send on WhatsApp" className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-[#22c55e] hover:bg-emerald-100">
                          <WaIcon size={18} />
                        </a>
                      )}
                      <button type="button" title="View details" aria-label="View details" onClick={() => setBill(b)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
                        <Icon name="eye" size={16} />
                      </button>
                      <button type="button" title="Print receipt" aria-label="Print receipt" onClick={() => setPrintFor(b)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200">
                        <Icon name="print" size={16} />
                      </button>
                      <button type="button" title="Delete bill" aria-label="Delete bill" onClick={() => remove(b)} className="grid h-9 w-9 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100">
                        <Icon name="trash" size={16} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!count && (
            <Empty icon="billing" title="No bills match">
              Saved wholesale bills show up here.
            </Empty>
          )}
        </div>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-slate-500">
          <span>
            {(safePage - 1) * PAGE_SIZE + 1}–{(safePage - 1) * PAGE_SIZE + slice.length} of {count}
          </span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={safePage <= 1} onClick={() => goto(safePage - 1)} className="h-9 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">← Prev</button>
            <span className="min-w-[96px] text-center font-semibold text-slate-700">Page {safePage} of {pages}</span>
            <button type="button" disabled={safePage >= pages} onClick={() => goto(safePage + 1)} className="h-9 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40">Next →</button>
          </span>
        </div>
      )}

      <PrintModal bill={printFor ? wholesaleToBill(printFor) : null} onClose={() => setPrintFor(null)} />

      <WholesaleBillDetail bill={bill} onClose={() => setBill(null)} onPrint={setPrintFor} />
    </Page>
  );
}
