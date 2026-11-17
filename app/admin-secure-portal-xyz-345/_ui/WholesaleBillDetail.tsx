"use client";

import {
  qtyLabel, PAYMENT_LABEL, round3, type WholesaleBill,
} from "../../lib/wholesaleStore";
import { useAdmin } from "./Store";
import { billText, waLink } from "./receipt";
import { wholesaleToBill } from "./wholesaleAdapter";
import { rupee } from "./money";
import { Badge, Btn, Modal, WaIcon, fmtDateTime } from "./kit";

/* The detail sheet for one wholesale bill — the eye button on Wholesale Orders
   and on a customer's history in Wholesale Analytics open this same sheet. */
export default function WholesaleBillDetail({ bill, onClose, onPrint }: { bill: WholesaleBill | null; onClose: () => void; onPrint: (b: WholesaleBill) => void }) {
  const { s } = useAdmin();
  return (
    <Modal
      open={!!bill}
      onClose={onClose}
      title={bill?.id ?? ""}
      footer={
        bill && (
          <>
            {bill.customerPhone && (
              <a href={waLink(bill.customerPhone, billText(wholesaleToBill(bill), s.settings.shopName, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#22c55e] px-4 text-[13px] font-semibold text-white hover:bg-[#16a34a]">
                <WaIcon size={16} /> WhatsApp
              </a>
            )}
            <a href={`/invoice/${encodeURIComponent(bill.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center rounded-xl border border-slate-200 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
              View invoice
            </a>
            <Btn kind="dark" icon="print" onClick={() => onPrint(bill)}>
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
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Wholesale</span>
              <b>{fmtDateTime(bill.createdAt)}</b>
              <span className="block"><Badge tone="green">Completed</Badge></span>
            </p>
          </div>
          <ul className="adm-scroll my-4 max-h-[42dvh] divide-y divide-dashed divide-slate-200 overflow-y-auto pr-1">
            {bill.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3 py-2">
                <span className="min-w-0">
                  <b>{qtyLabel(i.unit, i.qty)}</b> {i.name} <span className="text-slate-400">@ {rupee(i.unitPrice)}{i.unit === "gram" ? "/100g" : ""}</span>
                </span>
                <b className="shrink-0">{rupee(i.lineTotal)}</b>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-slate-200 pt-3">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal ({bill.items.length} items)</dt>
              <dd>{rupee(bill.subtotal)}</dd>
            </div>
            {bill.discount > 0 && (
              <div className="flex justify-between text-red-600">
                <dt>Discount</dt>
                <dd>-{rupee(bill.discount)}</dd>
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
            {bill.gstPercent > 0 ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">VAT ({bill.gstPercent}%) on {rupee(round3(bill.subtotal - bill.discount))}</dt>
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
              <dt>Paid · {PAYMENT_LABEL[bill.payment]}</dt>
              <dd>
                {rupee(bill.payment === "cash" ? bill.received : bill.total)}
                {bill.payment === "cash" && bill.received > bill.total && ` (change ${rupee(round3(bill.received - bill.total))})`}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}
