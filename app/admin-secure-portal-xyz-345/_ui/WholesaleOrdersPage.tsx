"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot,
  qtyLabel, PAYMENT_LABEL, type WholesaleBill,
} from "../../lib/wholesaleStore";
import { printWholesaleReceipt, sendWholesaleBillWhatsApp } from "./wholesalePrint";
import { rupee } from "./money";
import {
  Page, PageHead, Btn, Modal, Badge, Empty, SearchBox, Kpi,
  fmtDateTime,
} from "./kit";

export default function WholesaleOrdersPage() {
  const bills = useSyncExternalStore(subscribeToWholesaleBills, getWholesaleBillsSnapshot, getWholesaleBillsServerSnapshot);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState<WholesaleBill | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...bills]
      .filter((b) => !needle || b.customerName.toLowerCase().includes(needle) || b.customerPhone.includes(needle) || b.id.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [bills, q]);

  const today = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t = start.getTime();
    const todays = bills.filter((b) => b.createdAt >= t);
    return { count: todays.length, total: todays.reduce((s, b) => s + b.total, 0) };
  }, [bills]);

  return (
    <Page>
      <PageHead bar title="Wholesale orders" sub="Every wholesale bill you've saved, newest first." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Bills today" value={today.count} icon="billing" tone="sky" />
        <Kpi label="Sales today" value={rupee(today.total)} icon="rupee" tone="emerald" />
        <Kpi label="All bills" value={bills.length} icon="orders" tone="violet" />
      </div>

      <div className="mb-4 max-w-sm">
        <SearchBox value={q} onChange={setQ} placeholder="Search customer, phone or bill id…" />
      </div>

      {shown.length === 0 ? (
        <Empty icon="orders" title={bills.length === 0 ? "No bills yet" : "Nothing matches"}>
          {bills.length === 0 ? "Saved wholesale bills show up here." : "Try a different search."}
        </Empty>
      ) : (
        <div className="space-y-2">
          {shown.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setOpen(b)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left transition hover:border-slate-200 hover:shadow-[0_4px_14px_-6px_rgba(15,23,42,.18)]"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <b className="truncate text-[14px] text-slate-900">{b.customerName || "Walk-in"}</b>
                  {!b.customerId && <Badge tone="slate">Walk-in</Badge>}
                </div>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {b.id} · {fmtDateTime(b.createdAt)} · {b.items.length} item{b.items.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="adm-num shrink-0 text-[16px] font-extrabold text-slate-900">{rupee(b.total)}</span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Bill ${open.id}` : ""}
        footer={open && (
          <div className="flex flex-wrap justify-end gap-2">
            <Btn kind="green" onClick={() => sendWholesaleBillWhatsApp(open)}>WhatsApp</Btn>
            <Btn kind="ghost" icon="print" onClick={() => printWholesaleReceipt(open, "invoice")}>A4 invoice</Btn>
            <Btn kind="dark" icon="print" onClick={() => printWholesaleReceipt(open, "thermal")}>Thermal receipt</Btn>
          </div>
        )}
      >
        {open && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-slate-50 p-4 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-500">Customer</span><b className="text-slate-900">{open.customerName || "Walk-in"}</b></div>
              {open.customerPhone && <div className="mt-1 flex justify-between"><span className="text-slate-500">Phone</span><span className="text-slate-700">{open.customerPhone}</span></div>}
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Date</span><span className="text-slate-700">{fmtDateTime(open.createdAt)}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-slate-500">Payment</span><span className="text-slate-700">{PAYMENT_LABEL[open.payment]}</span></div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100">
              <table className="w-full text-[13px]">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">Item</th>
                    <th className="px-3 py-2 text-right font-bold">Qty</th>
                    <th className="px-3 py-2 text-right font-bold">Rate</th>
                    <th className="px-3 py-2 text-right font-bold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {open.items.map((i, k) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-800">{i.name}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{qtyLabel(i.unit, i.qty)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{rupee(i.unitPrice)}{i.unit === "gram" ? "/100g" : ""}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{rupee(i.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5">
              <Line label="Subtotal" value={rupee(open.subtotal)} />
              {open.discount > 0 && <Line label="Discount" value={`−${rupee(open.discount)}`} minus />}
              {open.deliveryFee > 0 && <Line label="Delivery charge" value={rupee(open.deliveryFee)} />}
              {open.extra > 0 && <Line label="Other charges" value={rupee(open.extra)} />}
              {open.gstAmount > 0 && <Line label={`VAT (${open.gstPercent}%)`} value={rupee(open.gstAmount)} />}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[13px] font-bold uppercase tracking-wide text-slate-500">Total</span>
                <span className="adm-num text-[20px] font-extrabold text-slate-900">{rupee(open.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

function Line({ label, value, minus }: { label: string; value: string; minus?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className={minus ? "text-red-600" : "text-slate-700"}>{value}</span>
    </div>
  );
}
