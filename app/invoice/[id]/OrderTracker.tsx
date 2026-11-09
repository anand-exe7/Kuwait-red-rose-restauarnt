"use client";

// What the customer sees at /invoice/<order no> BEFORE the shop has billed
// their order. There is no invoice yet — only an order working its way through
// the shop — so this shows the order number, where it has got to, and what is
// on it. The moment the admin closes the bill, the same URL starts rendering
// the real INV-YYYY-##### invoice instead.

import { BRAND } from "../../lib/brand";
import { shopOwner, shopPhone } from "../../lib/shop";
import type { Order } from "../../lib/orderStore";

/** The journey, in the customer's words rather than the kitchen's. */
const STEPS: { key: Order["status"]; label: string; note: string }[] = [
  { key: "awaiting_admin", label: "Order placed", note: "We have your order and are confirming it." },
  { key: "pending", label: "Confirmed", note: "The shop accepted it — the kitchen has it now." },
  { key: "cooking", label: "Being made", note: "Freshly prepared for you." },
  { key: "ready", label: "Ready", note: "Ready for collection / on its way to you." },
  { key: "served", label: "Completed", note: "Your invoice is on its way." },
];

export interface TrackerLine {
  name: string;
  qty: number;
  amount: string;
}

export default function OrderTracker({
  orderNo,
  placedAt,
  status,
  where,
  customerName,
  lines,
  total,
}: {
  orderNo: string;
  placedAt: number;
  status: Order["status"];
  where: string;
  customerName: string;
  lines: TrackerLine[];
  total: string;
}) {
  const current = Math.max(0, STEPS.findIndex((s) => s.key === status));
  const phone = shopPhone();
  const owner = shopOwner();

  return (
    <div className="overflow-hidden rounded-3xl border border-[#c9a961]/30 bg-white shadow-[0_18px_42px_-18px_rgba(74,21,21,0.3)]">
      <header className="border-b border-[#c9a961]/25 bg-[#fbf8ee] px-6 py-7 sm:px-9">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#9b7b3f]">
          {BRAND.name}
          {BRAND.area ? ` · ${BRAND.area}` : ""}
        </p>
        <h1 className="mt-2 font-serif text-[30px] leading-none text-[#1a0f0a] sm:text-[36px]">
          Order <span className="text-[#b01e28]">#{orderNo}</span>
        </h1>
        <p className="mt-2 text-[13px] text-[#6b5340]">
          {customerName ? `${customerName.split(" ")[0]}, your` : "Your"} {where.toLowerCase()} order, placed{" "}
          {new Date(placedAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
        </p>
        <p className="mt-3 rounded-xl bg-[#b01e28]/[0.07] px-3 py-2 text-[12px] leading-relaxed text-[#7a2730]">
          This is your order number, not an invoice. Once the shop closes your bill we issue
          <b> INV-{new Date(placedAt).getFullYear()}-{orderNo}</b> and this page becomes your invoice.
        </p>
      </header>

      {/* Progress — a vertical list on a phone, so nothing is squeezed. */}
      <ol className="flex flex-col gap-0 px-6 py-6 sm:px-9">
        {STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={s.key} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={[
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-[12px] font-black",
                    done ? "border-[#3f8f3a] bg-[#3f8f3a] text-white" : "",
                    now ? "border-[#b01e28] bg-[#b01e28] text-white" : "",
                    !done && !now ? "border-[#d9cbb0] bg-white text-[#c0ae92]" : "",
                  ].join(" ")}
                >
                  {done ? "✓" : i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className={`w-0.5 flex-1 ${i < current ? "bg-[#3f8f3a]" : "bg-[#e5dac2]"}`} style={{ minHeight: 26 }} />
                )}
              </div>
              <div className={`pb-5 ${now ? "" : "opacity-70"}`}>
                <p className={`text-[14px] font-black ${now ? "text-[#b01e28]" : "text-[#1a0f0a]"}`}>{s.label}</p>
                <p className="text-[12.5px] leading-snug text-[#6b5340]">{s.note}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border-t border-[#c9a961]/25 px-6 py-6 sm:px-9">
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-[#9b7b3f]">Your order</p>
        <ul className="divide-y divide-[#efe4cd]">
          {lines.map((l, k) => (
            <li key={k} className="flex items-center justify-between gap-3 py-2.5 text-[14px] text-[#3a2a1c]">
              <span className="min-w-0">
                <b className="text-[#1a0f0a]">{l.qty}×</b> {l.name}
              </span>
              <span className="shrink-0 tabular-nums text-[#6b5340]">{l.amount}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-[#c9a961]/40 pt-3">
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6b5340]">Total</span>
          <span className="font-serif text-[24px] text-[#b01e28]">{total}</span>
        </div>
      </div>

      <footer className="flex flex-col gap-1 border-t border-[#c9a961]/25 bg-[#fbf8ee] px-6 py-5 text-[12px] text-[#6b5340] sm:px-9">
        <span>{BRAND.address}</span>
        {owner && <span>Prop. {owner}</span>}
        {phone && (
          <a href={`tel:${phone}`} className="font-bold text-[#b01e28]">
            Call us on {phone}
          </a>
        )}
      </footer>
    </div>
  );
}
