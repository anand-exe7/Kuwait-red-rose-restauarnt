import type { Bill } from "./types";
import { rupee } from "./money";
import { fmtDateTime } from "./kit";
import { BRAND } from "../../lib/brand";
import { publicLink } from "../../lib/publicUrl";
import { shopIdentity } from "../../lib/shop";
import { WA } from "../../lib/waLink";

const PAY = { cash: "Cash", upi: "UPI", card: "Card", split: "Cash + Card", none: "—" } as const;

/* How the food left the shop, in the customer's words. A delivery must say
   "Delivery" on the paper even when the delivery itself was free, so this
   comes off the bill's `mode` rather than off the delivery fee. */
const MODE = { table: "Dine-in", standing: "Dine-in", takeaway: "Takeaway", delivery: "Delivery" } as const;
export function orderTypeLabel(b: Bill): string {
  if (/^WB-/i.test(b.invoiceNo)) return "Wholesale";
  const m = MODE[b.mode as keyof typeof MODE];
  if (m) return m;
  return b.source === "tab" ? "Customer tab" : "Counter";
}

/* Shop identity shown on every receipt — name, address and telephone. All of
   it comes from NEXT_PUBLIC_SHOP_* so the owner can change a number or move
   branch without a code change (see app/lib/shop.ts). The proprietor's name
   is deliberately NOT printed: the customer wants the shop and a number to
   call, not who owns it. */
const SHOP = shopIdentity();
export const SHOP_ADDRESS = SHOP.address || BRAND.city;
/** "Tel 55568759" — blank when no number is configured. */
export const SHOP_CONTACT = SHOP.phone ? `Tel ${SHOP.phone}` : "";
/* The shop badge. Deliberately the file path and NOT an environment variable:
   the logo is a file that ships with the app, the same one the landing nav and
   the sign-in page already hard-code, and making it configurable only meant
   one more thing to set up in Vercel for no gain. Swapping the logo is a
   matter of replacing public/finallogo.jpeg.

   It is printed twice on a sheet invoice — a small mark in the letterhead and
   a dimmed copy behind the body, the way a printed letterpad carries it — and
   once, small and in greyscale, at the top of a thermal slip. */
export const SHOP_LOGO = "/finallogo.jpeg";

/** Short, public link to the invoice page — reads the bill back from the
 *  realtime store by invoice number. No URL blob. */
export const invoiceUrl = (b: Bill, publicUrl = "") =>
  publicLink(`/invoice/${encodeURIComponent(b.invoiceNo)}`, publicUrl);

/** WhatsApp confirmation we send the guest. Short, with a few emojis so the
 *  message reads like something a human would type, and a bare invoice link.
 *
 *  Emoji come from the safe-list in app/lib/waLink.ts and are never typed as
 *  characters here — see the note at the top of that file. The receipt emoji
 *  this used to open with (U+1F9FE) is a 2018 addition and showed as a box on
 *  older phones; it is a bookmark now. */
export function billText(b: Bill, shop: string, publicUrl = "") {
  const greet = b.customerName ? `Hi ${b.customerName.split(" ")[0]}! ${WA.wave}` : `Hi there! ${WA.wave}`;
  const L = [
    greet,
    `Thanks for choosing *${shop}* ${WA.rose}`,
    "",
    `${WA.bookmark} Invoice *${b.invoiceNo}*`,
    `Items (${b.itemCount}): ${rupee(b.subtotal)}`,
  ];
  // Say what came off and what went on, so the total on the message and the
  // total on the invoice can never look like two different numbers.
  if (b.couponDiscount > 0) L.push(`Coupon ${b.couponCode ?? ""}: -${rupee(b.couponDiscount)}`.replace("  ", " "));
  if (b.manualDiscount > 0) L.push(`Discount: -${rupee(b.manualDiscount)}`);
  if (b.deliveryFee > 0) L.push(`Delivery: ${rupee(b.deliveryFee)}`);
  if (b.extra > 0) L.push(`Extra: ${rupee(b.extra)}`);
  if (b.isGst && b.gstAmount > 0) L.push(`VAT (${b.gstPercent}%): ${rupee(b.gstAmount)}`);
  L.push(
    `${WA.money} Total: *${rupee(b.total)}*`,
    `${WA.card} Paid by ${PAY[b.payment]}`,
    "",
    `View your invoice ${WA.down}`,
    invoiceUrl(b, publicUrl),
    "",
    `See you again soon! ${WA.sparkle}`,
  );
  return L.join("\n");
}

/* The number normaliser and the link builder moved to app/lib/waLink.ts, so
   the invoice, the order hand-off, the coupon and the enquiry all produce the
   same URL. Re-exported under the old names: every caller here already says
   `waLink`, and the point of the move was to have one builder, not to rename
   things across four pages. */
export { toWaNumber as toKuwaitWa, waLink } from "../../lib/waLink";

/* ---------- print formats ---------- */
export type PrintFormat = { kind: "thermal"; roll: 2 | 3 } | { kind: "sheet"; size: "A3" | "A4" | "A5" };

export const THERMAL_ROLLS = [2, 3] as const;
export const SHEET_SIZES = ["A3", "A4", "A5"] as const;
export const DEFAULT_FORMAT: PrintFormat = { kind: "thermal", roll: 3 };

const ROLL_MM = { 2: [58, 48], 3: [80, 72] } as const;

/** Id of the thermal @page rule, so the printer can give it a real height
 *  once the slip has been laid out. See THERMAL_PAGE_STYLE_ID below. */
export const THERMAL_PAGE_STYLE_ID = "rcpt-page-size";

/** `@page{size:58mm 120mm;margin:2mm 0}` for a roll of the given width. */
export const thermalPageCss = (roll: 2 | 3, heightMm: number) =>
  `@page{size:${ROLL_MM[roll][0]}mm ${Math.max(40, Math.round(heightMm))}mm;margin:2mm 0}`;

/* A roll has no page length — the printer cuts where the slip ends. CSS has no
   way to say that: `size: 58mm auto` is NOT valid, Chrome throws the whole
   declaration away and falls back to A4, and a fixed `58mm 297mm` is what put
   a short bill at the top of a long empty page. So a roll gets a real height
   in millimetres, measured off the laid-out slip just before the dialog opens
   (app/.../Store.tsx). The 297mm here is only the fallback for the moment
   before that measurement lands. */
const pageCss = (f: PrintFormat) =>
  f.kind === "thermal"
    ? thermalPageCss(f.roll, 297)
    : `@page{size:${f.size};margin:${f.size === "A3" ? 16 : f.size === "A4" ? 14 : 10}mm}`;

/** Receipt for the chosen printer, rendered into the print area. */
export function Receipt({ b, shop, fmt = DEFAULT_FORMAT }: { b: Bill; shop: string; fmt?: PrintFormat }) {
  return (
    <>
      <style id={fmt.kind === "thermal" ? THERMAL_PAGE_STYLE_ID : undefined}>{pageCss(fmt)}</style>
      {fmt.kind === "thermal" ? <Thermal b={b} shop={shop} roll={fmt.roll} /> : <Sheet b={b} shop={shop} size={fmt.size} />}
    </>
  );
}

/**
 * Every money line that can appear on a bill, in the order they are read:
 * what the goods cost, what came off, what went on, then the tax. A line is
 * on the paper whenever it applies — a delivery, a coupon, a hand-written
 * discount, an extra charge, VAT — and silent when it does not, so no printed
 * total can ever be an unexplained jump from the subtotal.
 */
function moneyLines(b: Bill): { label: string; value: string; minus?: boolean }[] {
  const L: { label: string; value: string; minus?: boolean }[] = [];
  if (b.couponDiscount > 0) {
    L.push({
      label: `Coupon${b.couponCode ? ` ${b.couponCode}` : ""}${b.couponPercent > 0 ? ` (${b.couponPercent}%)` : ""}`,
      value: rupee(b.couponDiscount),
      minus: true,
    });
  }
  if (b.manualDiscount > 0) L.push({ label: "Discount", value: rupee(b.manualDiscount), minus: true });
  // A delivery says so even when it was free, so the customer can see the
  // delivery was part of the order and simply cost nothing.
  if (b.deliveryFee > 0) L.push({ label: "Delivery charge", value: rupee(b.deliveryFee) });
  else if (b.mode === "delivery") L.push({ label: "Delivery charge", value: "Free" });
  if (b.extra > 0) L.push({ label: "Extra charges", value: rupee(b.extra) });
  if (b.isGst && b.gstAmount > 0) {
    L.push({ label: `VAT (${b.gstPercent}%) on ${rupee(b.taxableAmount)}`, value: rupee(b.gstAmount) });
  }
  return L;
}

/** Full-page invoice for A3 / A4 / A5 — a letterpad: the shop badge and
 *  address up top, the same badge dimmed in the middle of the sheet behind the
 *  writing, a customer block, an itemised table and a totals rail.
 *
 *  The colour is carried by TEXT and BORDERS, never by a fill alone, because
 *  Chrome's print dialog leaves "Background graphics" off by default — the
 *  cream panels are a bonus when it is ticked, and the invoice still prints in
 *  the shop's red and gold when it is not. Scales by paper via inv--a{n}. */
export function Sheet({ b, shop, size, hideSize = false }: { b: Bill; shop: string; size: "A3" | "A4" | "A5"; hideSize?: boolean }) {
  const lines = moneyLines(b);
  return (
    <div className={`inv ${hideSize ? "" : `inv--${size.toLowerCase()}`}`}>
      {/* The letterpad watermark: the same badge, dimmed, centred behind the
          body. An <img> rather than a CSS background so it still prints when
          "Background graphics" is off. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {SHOP_LOGO && <img className="inv__wm" src={SHOP_LOGO} alt="" aria-hidden="true" />}

      <header className="inv__head">
        <div className="inv__brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {SHOP_LOGO && <img className="inv__logo" src={SHOP_LOGO} alt="" aria-hidden="true" />}
          <div>
            <h1>{shop}</h1>
            <p>{SHOP_ADDRESS}</p>
            {SHOP_CONTACT && <p>{SHOP_CONTACT}</p>}
          </div>
        </div>
        <div className="inv__meta">
          <h2>{b.isGst && b.gstAmount > 0 ? "Tax invoice" : "Invoice"}</h2>
          <p className="inv__no"><b>{b.invoiceNo}</b></p>
          <p>{fmtDateTime(b.createdAt)}</p>
        </div>
      </header>
      <div className="inv__rule" aria-hidden="true" />

      <section className="inv__to">
        <div>
          <span>Billed to</span>
          <b>{b.customerName || "Walk-in customer"}</b>
          {b.customerPhone && <p>{b.customerPhone}</p>}
        </div>
        <div className="inv__r">
          <span>Order type</span>
          <b>{orderTypeLabel(b)}</b>
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
        {lines.map((l, k) => (
          <div key={k}>
            <dt>{l.label}</dt>
            <dd>{l.minus ? `-${l.value}` : l.value}</dd>
          </div>
        ))}
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
        <span className="inv__thanks">Thank you for visiting {BRAND.name}.</span>
        <span>{[SHOP_ADDRESS, SHOP_CONTACT].filter(Boolean).join(" · ")}</span>
      </footer>
    </div>
  );
}

/** 2-inch and 3-inch thermal rolls. The shop badge sits at the top, small and
 *  pushed to greyscale with the contrast lifted: a thermal head has no colour
 *  and a full-size photo comes out a grey smear, so the mark is kept to a few
 *  millimetres where its outline still reads. Shop name, address and telephone
 *  follow it, which is what the customer actually needs off the top of a slip. */
function Thermal({ b, shop, roll }: { b: Bill; shop: string; roll: 2 | 3 }) {
  const lines = moneyLines(b);
  return (
    <div className={`rcpt rcpt--${roll}`} data-roll={roll} style={{ width: `${ROLL_MM[roll][1]}mm` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {SHOP_LOGO && <img className="rcpt__logo" src={SHOP_LOGO} alt="" aria-hidden="true" />}
      <h1>{shop}</h1>
      <p className="c rcpt__addr">{SHOP_ADDRESS}</p>
      {SHOP_CONTACT && <p className="c rcpt__addr">{SHOP_CONTACT}</p>}
      {b.isGst && b.gstAmount > 0 && <p className="c rcpt__tag">Tax invoice</p>}

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
          <span>{orderTypeLabel(b)}</span>
        </div>
        {b.customerName && (
          <div className="row">
            <span>Guest</span>
            <span>{b.customerName}</span>
          </div>
        )}
        {b.customerPhone && (
          <div className="row">
            <span>Phone</span>
            <span>{b.customerPhone}</span>
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
        {lines.map((l, k) => (
          <div className="row" key={k}>
            <span>{l.label}</span>
            <span>{l.minus ? `-${l.value}` : l.value}</span>
          </div>
        ))}
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
