"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Bill } from "./types";
import { rupee } from "./money";
import { CHANNEL_LABEL, channelOf, inRange, rangeOf, type Period } from "./analytics";
import { useAdmin } from "./Store";
import { billText, waLink } from "./receipt";
import PrintModal from "./PrintModal";
import { Badge, Btn, Empty, Icon, Modal, Page, PageHead, SearchBox, WaIcon, cx, downloadExcel, fmtDate, fmtDateTime, fmtTime } from "./kit";

type DateF = Extract<Period, "today" | "week" | "month" | "custom"> | "any";

const PAY = { cash: "Cash", upi: "UPI", card: "Card", split: "Cash + Card", none: "—" } as const;

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

export default function OrdersPage() {
  const { s, act, confirm, toast } = useAdmin();
  /* Voiding and deleting a bill both ask for the manager password — the
     confirm dialog does it (see _ui/Shell.tsx), and /api/db refuses the write
     without it, so the buttons can simply be here for everyone. */
  const [type, setType] = useState<"all" | "dinein" | "takeaway" | "delivery">("all");
  const [date, setDate] = useState<DateF>("any");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [bill, setBill] = useState<Bill | null>(null);
  const [printFor, setPrintFor] = useState<Bill | null>(null);

  /* Delete is the only way a bill leaves the records — there is no "void" any
     more. The row goes for good: out of Orders, out of Analytics, stock back
     on the shelf, any coupon use given back. */
  const remove = async (b: Bill) => {
    const body =
      "The bill is gone for good — it leaves Orders and Analytics, its items go back into stock and any coupon use is given back. This can't be undone.";
    if (await confirm({ title: `Delete ${b.invoiceNo}?`, body, ok: "Delete bill", danger: true })) {
      const r = await act("bill.delete", { id: b.id });
      if (!r.ok) return toast({ kind: "err", title: "Could not delete that bill", body: r.error });
      toast({ kind: "ok", title: `${b.invoiceNo} deleted` });
      if (bill?.id === b.id) setBill(null);
    }
  };

  const range = date === "any" ? null : rangeOf(date, from, to);
  const needle = q.trim().toLowerCase();

  const bills = useMemo(
    () =>
      s.bills
        .filter((b) => (type === "all" || channelOf(b) === type) && inRange(b.createdAt, range))
        .filter((b) => !needle || `${b.invoiceNo} ${b.customerName} ${b.customerPhone} ${b.biller ?? ""} ${b.couponCode ?? ""} ${b.items.map((i) => i.name).join(" ")}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt - a.createdAt),
    [s.bills, type, range, needle],
  );

  /* Any filter change starts the list again from page 1 (otherwise an invisible
     page number carries over to a shorter result set). */
  useEffect(() => { setPage(1); }, [type, date, from, to, needle]);

  /* The bills on screen as an Excel workbook with real columns. */
  const exportRows = (): (string | number)[][] => [
    ["Invoice", "Billed by", "Channel", "Customer", "Mobile", "Items", "Subtotal", "Coupon", "Coupon discount", "Manual discount", "Delivery", "Extra", "Bill type", "VAT %", "Taxable amount", "VAT amount", "Total", "Payment", "Cash", "UPI", "Card", "Status", "Date", "Time"],
    ...bills.map((b) => [b.invoiceNo, b.biller || "", CHANNEL_LABEL[channelOf(b)], b.customerName, b.customerPhone, b.itemCount, b.subtotal, b.couponCode ?? "", b.couponDiscount, b.manualDiscount, b.deliveryFee, b.extra, b.isGst ? "VAT" : "No VAT", b.gstPercent, b.taxableAmount, b.gstAmount, b.total, b.payment, b.cashAmount, b.upiAmount, b.cardAmount, b.status, fmtDate(b.createdAt), fmtTime(b.createdAt)]),
  ];
  const stamp = () => new Date().toISOString().slice(0, 10);
  const exportExcel = () => downloadExcel(`bills-${stamp()}.xlsx`, [{ name: "Bills", rows: exportRows() }]);

  const count = bills.length;
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = bills.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const goto = (p: number) => setPage(Math.max(1, Math.min(pages, p)));

  return (
    <Page>
      <PageHead
        title="Order Management"
        right={
          <Link href="/admin-secure-portal-xyz-345/billing" className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-[14px] font-bold text-white shadow-[0_6px_16px_-8px_rgba(220,38,38,.8)] hover:bg-red-700">
            <Icon name="cart" size={18} /> Open POS
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
                ["dinein", "Dine-in"],
                ["takeaway", "Takeaway"],
                ["delivery", "Delivery"],
              ] as const
            ).map(([v, t]) => (
              <Chip key={v} on={type === v} onClick={() => setType(v)}>
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
            <table className="w-full min-w-[940px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className={th}>Invoice no</th>
                  {/* Who put the bill in. The shop's own record — it is not on
                      the receipt, the invoice page or the WhatsApp message. */}
                  <th className={th}>Billed by</th>
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
                  <tr key={b.id} className={cx("border-b border-slate-100 transition-colors hover:bg-slate-50/60", b.status === "void" && "opacity-55")}>
                    <td className={td}>
                      <button type="button" onClick={() => setBill(b)} className="inline-flex items-center gap-2 font-bold text-red-600">
                        {b.invoiceNo}
                        <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-50 text-slate-400">
                          <Icon name="external" size={13} />
                        </span>
                      </button>
                    </td>
                    <td className={td}>
                      {b.biller ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-700">
                          <Icon name="users" size={12} /> {b.biller}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className={cx(td, "font-semibold text-slate-800")}>{b.customerName || "—"}</td>
                    <td className={cx(td, "adm-num text-slate-600")}>{b.customerPhone || <span className="text-slate-400">—</span>}</td>
                    <td className={td}>
                      <Badge tone={channelOf(b) === "delivery" ? "violet" : channelOf(b) === "takeaway" ? "sky" : "orange"}>{CHANNEL_LABEL[channelOf(b)]}</Badge>
                    </td>
                    <td className={cx(td, "font-bold text-slate-900")}>{rupee(b.total)}</td>
                    <td className={cx(td, "text-slate-600")}>{PAY[b.payment]}</td>
                    <td className={cx(td, "text-slate-600")}>{fmtDate(b.createdAt)}</td>
                    <td className={cx(td, "text-center")}>{b.status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="slate">Void</Badge>}</td>
                    <td className={cx(td, "text-right")}>
                      <span className="inline-flex gap-1.5">
                        {b.customerPhone && (
                          <a suppressHydrationWarning href={waLink(b.customerPhone, billText(b, s.settings.shopName, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" title="Send on WhatsApp" aria-label="Send on WhatsApp" className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-[#22c55e] hover:bg-emerald-100">
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
              Settled tabs and counter bills show up here.
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

      <PrintModal bill={printFor} onClose={() => setPrintFor(null)} />

      {/* ---------- bill detail ---------- */}
      <Modal
        open={!!bill}
        onClose={() => setBill(null)}
        title={bill?.invoiceNo ?? ""}
        footer={
          bill && (
            <>
              {bill.customerPhone && (
                <a href={waLink(bill.customerPhone, billText(bill, s.settings.shopName, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#22c55e] px-4 text-[13px] font-semibold text-white hover:bg-[#16a34a]">
                  <WaIcon size={16} /> WhatsApp
                </a>
              )}
              <a href={`/invoice/${encodeURIComponent(bill.invoiceNo)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
                View invoice
              </a>
              <Btn kind="dark" icon="print" onClick={() => setPrintFor(bill)}>
                Print
              </Btn>
            </>
          )
        }
      >
        {bill && (
          <div className="text-[13.5px]">
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-4">
              <p>
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Customer</span>
                <b>{bill.customerName || "—"}</b>
                <span className="block text-slate-500">{bill.customerPhone || "no phone"}</span>
              </p>
              <p className="text-right">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{CHANNEL_LABEL[channelOf(bill)]}</span>
                <b>{fmtDateTime(bill.createdAt)}</b>
                <span className="block">{bill.status === "completed" ? <Badge tone="green">Completed</Badge> : <Badge tone="slate">Void</Badge>}</span>
              </p>
              <p className="col-span-2 border-t border-slate-200 pt-3">
                <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Billed by</span>
                <b>{bill.biller || "—"}</b>
                <span className="block text-[11.5px] text-slate-400">Shown here only — never on the receipt or the customer&apos;s invoice.</span>
              </p>
            </div>
            {/* A big order used to run off the bottom of the sheet; the list
                scrolls on its own now so the totals always stay in view. */}
            {bill.items.length === 0 ? (
              <p className="my-4 rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] text-amber-800">
                This bill was saved before the shop stored its item list, and its tickets are gone — only the totals below are left.
              </p>
            ) : (
              <ul className="adm-scroll my-4 max-h-[42dvh] divide-y divide-dashed divide-slate-200 overflow-y-auto pr-1">
                {bill.items.map((i, k) => (
                  <li key={k} className="flex justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <b>{i.qty}×</b> {i.name} <span className="text-slate-400">@ {rupee(i.price)}</span>
                      {i.notes && <span className="block text-[11.5px] italic text-amber-700">{i.notes}</span>}
                    </span>
                    <b className="shrink-0">{rupee(i.qty * i.price)}</b>
                  </li>
                ))}
              </ul>
            )}
            <dl className="space-y-1.5 border-t border-slate-200 pt-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Subtotal ({bill.itemCount} items)</dt>
                <dd>{rupee(bill.subtotal)}</dd>
              </div>
              {bill.couponDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>
                    Coupon {bill.couponCode} ({bill.couponPercent}%)
                  </dt>
                  <dd>-{rupee(bill.couponDiscount)}</dd>
                </div>
              )}
              {bill.manualDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Discount{bill.manualType === "percent" ? ` (${bill.manualValue}%)` : ""}</dt>
                  <dd>-{rupee(bill.manualDiscount)}</dd>
                </div>
              )}
              {bill.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Delivery charge</dt>
                  <dd>{rupee(bill.deliveryFee)}</dd>
                </div>
              )}
              {bill.extra > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Extra charges</dt>
                  <dd>{rupee(bill.extra)}</dd>
                </div>
              )}
              {bill.isGst ? (
                <div className="flex justify-between">
                  <dt className="text-slate-500">VAT ({bill.gstPercent}%) on {rupee(bill.taxableAmount)}</dt>
                  <dd>{rupee(bill.gstAmount)}</dd>
                </div>
              ) : (
                <div className="flex justify-between text-slate-400">
                  <dt>No VAT</dt>
                  <dd>Not charged on this bill</dd>
                </div>
              )}
              <div className="flex justify-between pt-2 text-[17px]">
                <dt className="font-bold">Grand total</dt>
                <dd className="adm-num font-extrabold">{rupee(bill.total)}</dd>
              </div>
              <div className="flex justify-between text-slate-500">
                <dt>Paid · {PAY[bill.payment]}</dt>
                <dd>
                  {rupee(bill.received)}
                  {bill.change > 0 && ` (change ${rupee(bill.change)})`}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Modal>
    </Page>
  );
}
