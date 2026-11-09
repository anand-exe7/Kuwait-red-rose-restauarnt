import type { Bill } from "./types";
import { rupee } from "./money";
import { fmtDateTime } from "./kit";
import { BRAND } from "../../lib/brand";
import { publicLink } from "../../lib/publicUrl";
import { shopIdentity } from "../../lib/shop";

const PAY = { cash: "Cash", upi: "UPI", card: "Card", split: "Cash + Card", none: "—" } as const;

/* Shop identity shown on every receipt — name, branch, owner, phone, address.
   All of it comes from NEXT_PUBLIC_SHOP_* so the owner can change a number or
   move branch without a code change (see app/lib/shop.ts). */
const SHOP = shopIdentity();
export const SHOP_ADDRESS = SHOP.address || BRAND.city;
/** "Owner: Janakiraman Sampath · 55568759" — blank when neither is configured. */
export const SHOP_CONTACT = [SHOP.owner && `Prop. ${SHOP.owner}`, SHOP.phone && `Tel ${SHOP.phone}`]
  .filter(Boolean)
  .join(" · ");

/** Short, public link to the invoice page — reads the bill back from the
 *  realtime store by invoice number. No URL blob. */
export const invoiceUrl = (b: Bill, publicUrl = "") =>
  publicLink(`/invoice/${encodeURIComponent(b.invoiceNo)}`, publicUrl);

/** WhatsApp confirmation we send the guest. Short, with a few emojis so the
 *  message reads like something a human would type, and a bare invoice link. */
export function billText(b: Bill, shop: string, publicUrl = "") {
  const greet = b.customerName ? `Hi ${b.customerName.split(" ")[0]}! 👋` : `Hi there! 👋`;
  const L = [
    greet,
    `Thanks for choosing *${shop}* 🌹`,
    "",
    `🧾 Invoice *${b.invoiceNo}*`,
    `💰 Total: *${rupee(b.total)}*`,
    `💳 Paid by ${PAY[b.payment]}`,
    "",
    `View your invoice 👇`,
    invoiceUrl(b, publicUrl),
    "",
    `See you again soon! ✨`,
  ];
  return L.join("\n");
}

/* Kuwait numbers are 8 digits with +965 as the country code. A customer can
   also paste a full international number (e.g. 965…), in which case we don't
   prefix anything. */
export const toKuwaitWa = (phone: string) => {
  const d = (phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("965")) return d;
  if (d.length === 8) return `965${d}`;
  return d; // treat as already-international
};
export const waLink = (phone: string, text: string) => `https://wa.me/${toKuwaitWa(phone)}?text=${encodeURIComponent(text)}`;

/* ---------- print formats ---------- */
export type PrintFormat = { kind: "thermal"; roll: 2 | 3 } | { kind: "sheet"; size: "A3" | "A4" | "A5" };

export const THERMAL_ROLLS = [2, 3] as const;
export const SHEET_SIZES = ["A3", "A4", "A5"] as const;
export const DEFAULT_FORMAT: PrintFormat = { kind: "thermal", roll: 3 };

const ROLL_MM = { 2: [58, 48], 3: [80, 72] } as const;

const pageCss = (f: PrintFormat) =>
  f.kind === "thermal"
    ? `@page{size:${ROLL_MM[f.roll][0]}mm 297mm;margin:2mm 0}`
    : `@page{size:${f.size};margin:${f.size === "A3" ? 16 : f.size === "A4" ? 14 : 10}mm}`;

/** Receipt for the chosen printer, rendered into the print area. */
export function Receipt({ b, shop, fmt = DEFAULT_FORMAT }: { b: Bill; shop: string; fmt?: PrintFormat }) {
  return (
    <>
      <style>{pageCss(fmt)}</style>
      {fmt.kind === "thermal" ? <Thermal b={b} shop={shop} roll={fmt.roll} /> : <Sheet b={b} shop={shop} size={fmt.size} />}
    </>
  );
}

/** Full-page invoice for A3 / A4 / A5 — elegant layout with logo, customer
 *  block, itemised table and a totals rail. Scales by paper via inv--a{n}. */
export function Sheet({ b, shop, size, hideSize = false }: { b: Bill; shop: string; size: "A3" | "A4" | "A5"; hideSize?: boolean }) {
  return (
    <div className={`inv ${hideSize ? "" : `inv--${size.toLowerCase()}`}`}>
      <header className="inv__head">
        <div className="inv__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/finallogo.jpeg" alt="" className="inv__logo" />
          <div>
            <h1>{shop}</h1>
            <p>{SHOP_ADDRESS}</p>
            {SHOP_CONTACT && <p>{SHOP_CONTACT}</p>}
          </div>
        </div>
        <div className="inv__meta">
          <h2>{b.isGst ? "Tax invoice" : "Invoice"}</h2>
          <p className="inv__no"><b>{b.invoiceNo}</b></p>
          <p>{fmtDateTime(b.createdAt)}</p>
        </div>
      </header>

      <section className="inv__to">
        <div>
          <span>Billed to</span>
          <b>{b.customerName || "Walk-in customer"}</b>
          {b.customerPhone && <p>{b.customerPhone}</p>}
        </div>
        <div className="inv__r">
          <span>Order type</span>
          <b>{b.source === "tab" ? "Customer tab" : "Counter"}</b>
          <p>Paid by {PAY[b.payment]}</p>
        </div>
      </section>

      <table className="inv__tbl">
        <thead>
          <tr>
            <th>#</th>
            <th>Item</th>
            <th className="n">Qty</th>
            <th className="n">Rate</th>
            <th className="n">Amount</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i, k) => (
            <tr key={k}>
              <td>{k + 1}</td>
              <td>{i.name}</td>
              <td className="n">{i.qty}</td>
              <td className="n">{rupee(i.price)}</td>
              <td className="n">{rupee(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="inv__sum">
        <div>
          <dt>Subtotal ({b.itemCount} items)</dt>
          <dd>{rupee(b.subtotal)}</dd>
        </div>
        {b.couponDiscount > 0 && (
          <div>
            <dt>Coupon {b.couponCode} ({b.couponPercent}%)</dt>
            <dd>-{rupee(b.couponDiscount)}</dd>
          </div>
        )}
        {b.manualDiscount > 0 && (
          <div><dt>Discount</dt><dd>-{rupee(b.manualDiscount)}</dd></div>
        )}
        {b.extra > 0 && (
          <div><dt>Extra charges</dt><dd>{rupee(b.extra)}</dd></div>
        )}
        {b.isGst && (
          <div><dt>GST ({b.gstPercent}%) on {rupee(b.taxableAmount)}</dt><dd>{rupee(b.gstAmount)}</dd></div>
        )}
        <div className="inv__tot">
          <dt>Grand total</dt>
          <dd>{rupee(b.total)}</dd>
        </div>
        {b.payment === "split" ? (
          <>
            <div><dt>Received · Cash</dt><dd>{rupee(b.cashAmount)}</dd></div>
            <div><dt>Received · Card</dt><dd>{rupee(b.cardAmount)}</dd></div>
          </>
        ) : (
          <div><dt>Received · {PAY[b.payment]}</dt><dd>{rupee(b.received)}</dd></div>
        )}
        {b.change > 0 && <div><dt>Change</dt><dd>{rupee(b.change)}</dd></div>}
      </dl>

      <footer className="inv__foot">
        <span>Thank you for visiting {BRAND.name}.</span>
        <span>{[SHOP_ADDRESS, SHOP_CONTACT].filter(Boolean).join(" · ")}</span>
      </footer>
    </div>
  );
}

function Thermal({ b, shop, roll }: { b: Bill; shop: string; roll: 2 | 3 }) {
  return (
    <div className={`rcpt rcpt--${roll}`} style={{ width: `${ROLL_MM[roll][1]}mm` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/finallogo.jpeg" alt="" className="rcpt__logo" />
      <h1>{shop}</h1>
      <p className="c rcpt__addr">{SHOP_ADDRESS}</p>
      {SHOP_CONTACT && <p className="c rcpt__addr">{SHOP_CONTACT}</p>}
      {b.isGst && <p className="c rcpt__tag">Tax invoice</p>}

      <div className="rcpt__meta">
        <div className="row">
          <span>Invoice</span>
          <b>{b.invoiceNo}</b>
        </div>
        <div className="row">
          <span>Date</span>
          <span>{fmtDateTime(b.createdAt)}</span>
        </div>
        <div className="row">
          <span>Type</span>
          <span>{b.source === "tab" ? "Customer tab" : "Counter"}</span>
        </div>
        {b.customerName && (
          <div className="row">
            <span>Guest</span>
            <span>{b.customerName}</span>
          </div>
        )}
      </div>

      <table className="rcpt__tbl">
        <thead>
          <tr>
            <th className="rcpt__item">Item</th>
            <th className="rcpt__qty">Qty</th>
            <th className="rcpt__amt">Amt</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((i, k) => (
            <tr key={k}>
              <td className="rcpt__item">
                <span className="rcpt__name">{i.name}</span>
                <span className="rcpt__rate">{rupee(i.price)}</span>
              </td>
              <td className="rcpt__qty">{i.qty}</td>
              <td className="rcpt__amt">{rupee(i.qty * i.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="rcpt__sum">
        <div className="row">
          <span>Subtotal ({b.itemCount})</span>
          <span>{rupee(b.subtotal)}</span>
        </div>
        {b.couponDiscount > 0 && (
          <div className="row"><span>Coupon {b.couponCode}</span><span>-{rupee(b.couponDiscount)}</span></div>
        )}
        {b.manualDiscount > 0 && (
          <div className="row"><span>Discount</span><span>-{rupee(b.manualDiscount)}</span></div>
        )}
        {b.extra > 0 && (
          <div className="row"><span>Extra</span><span>{rupee(b.extra)}</span></div>
        )}
        {b.isGst && (
          <div className="row"><span>GST ({b.gstPercent}%)</span><span>{rupee(b.gstAmount)}</span></div>
        )}
        <div className="row rcpt__total">
          <span>Total</span>
          <span>{rupee(b.total)}</span>
        </div>
        {b.payment === "split" ? (
          <>
            <div className="row"><span>Cash</span><span>{rupee(b.cashAmount)}</span></div>
            <div className="row"><span>Card</span><span>{rupee(b.cardAmount)}</span></div>
          </>
        ) : (
          <div className="row"><span>Paid · {PAY[b.payment]}</span><span>{rupee(b.received)}</span></div>
        )}
        {b.change > 0 && <div className="row"><span>Change</span><span>{rupee(b.change)}</span></div>}
      </dl>

      <p className="c rcpt__thank">Thank you — see you again at {BRAND.name}.</p>
    </div>
  );
}
