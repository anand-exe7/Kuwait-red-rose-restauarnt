import type { WholesaleBill } from "../../lib/wholesaleStore";
import { qtyLabel, PAYMENT_LABEL } from "../../lib/wholesaleStore";
import { rupee } from "./money";
import { shopName, shopAddress, shopPhoneDisplay } from "../../lib/shop";
import { waLink, WA } from "../../lib/waLink";

export type WholesalePrintFormat = "thermal" | "invoice";

/* Wholesale receipt printing.
 *
 * This prints into a hidden <iframe> that carries its OWN, fully inlined
 * stylesheet, instead of relying on the app's shared window.print() + an
 * off-screen React node. That shared path was coming up blank for the
 * wholesale slip, and an iframe is the dependable way to print one document:
 * the iframe holds exactly the receipt and nothing else, so there is no page
 * chrome to hide and no render-timing race.
 *
 * Follows the shop's print house rules: shop name, address and Tel at the top,
 * every money line on the paper, and NO logo / NO owner name. Black ink only.
 */

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

const money = (label: string, value: string, minus = false) =>
  `<div class="row"><span>${esc(label)}</span><span>${minus ? "-" : ""}${esc(value)}</span></div>`;

/** The receipt as a standalone HTML document. Exported so it can be rendered
 *  or tested on its own, independent of the print path. */
export function buildWholesaleReceiptHtml(bill: WholesaleBill): string {
  const shop = shopName();
  const address = shopAddress();
  const phone = shopPhoneDisplay();
  const date = new Date(bill.createdAt).toLocaleString("en-GB", { day: "numeric", month: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const rows = bill.items
    .map(
      (i) => `
      <tr>
        <td class="item"><span class="name">${esc(i.name)}</span><span class="rate">${esc(rupee(i.unitPrice))} ${i.unit === "gram" ? "/100g" : "/pc"}</span></td>
        <td class="qty">${esc(qtyLabel(i.unit, i.qty))}</td>
        <td class="amt">${esc(rupee(i.lineTotal))}</td>
      </tr>`,
    )
    .join("");

  const lines = [money(`Subtotal (${bill.items.length})`, rupee(bill.subtotal))];
  if (bill.discount > 0) lines.push(money("Discount", rupee(bill.discount), true));
  if (bill.deliveryFee > 0) lines.push(money("Delivery charge", rupee(bill.deliveryFee)));
  if (bill.extra > 0) lines.push(money("Other charges", rupee(bill.extra)));
  if (bill.gstPercent > 0 && bill.gstAmount > 0) lines.push(money(`VAT (${bill.gstPercent}%)`, rupee(bill.gstAmount)));

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(bill.id)}</title>
<style>
  @page { size: 80mm auto; margin: 2mm 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: ui-sans-serif, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #000; }
  .rcpt { width: 72mm; margin: 0 auto; padding: 3mm 2mm 5mm; line-height: 1.35; }
  h1 { font-size: 13pt; font-weight: 800; text-align: center; margin: 0; letter-spacing: .02em; }
  .addr { font-size: 8pt; text-align: center; margin: .6mm 0 0; }
  .tag { text-align: center; font-size: 7.5pt; letter-spacing: .18em; text-transform: uppercase; border: 1px solid #000; padding: .6mm 0; margin: 2mm 6mm; }
  .meta { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1.5mm 0; margin: 2mm 0; }
  .meta .row, .sum .row { display: flex; justify-content: space-between; gap: 2mm; font-size: 8.5pt; padding: .3mm 0; }
  .meta .row span:first-child { text-transform: uppercase; letter-spacing: .08em; font-size: 7.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 1.5mm; }
  th { font-size: 7pt; text-transform: uppercase; letter-spacing: .1em; text-align: left; padding: .8mm 0; border-bottom: 1px solid #000; }
  th.qty, th.amt, td.qty, td.amt { text-align: right; }
  td { padding: 1.4mm 0 1mm; font-size: 8.5pt; border-bottom: 1px dotted #999; vertical-align: top; }
  td.item .name { display: block; }
  td.item .rate { display: block; font-size: 7pt; color: #444; }
  .sum { margin-top: 1.5mm; }
  .sum .total { font-weight: 800; font-size: 10.5pt; border-top: 1px solid #000; margin-top: 1mm; padding-top: 1.2mm; }
  .thank { text-align: center; font-size: 8pt; margin-top: 3mm; }
</style></head>
<body>
  <div class="rcpt">
    <h1>${esc(shop)}</h1>
    ${address ? `<p class="addr">${esc(address)}</p>` : ""}
    ${phone ? `<p class="addr">Tel ${esc(phone)}</p>` : ""}
    <p class="tag">Wholesale</p>
    <div class="meta">
      <div class="row"><span>Bill</span><b>${esc(bill.id)}</b></div>
      <div class="row"><span>Date</span><span>${esc(date)}</span></div>
      <div class="row"><span>Customer</span><span>${esc(bill.customerName || "Walk-in")}</span></div>
      ${bill.customerPhone ? `<div class="row"><span>Phone</span><span>${esc(bill.customerPhone)}</span></div>` : ""}
    </div>
    <table>
      <thead><tr><th class="item">Item</th><th class="qty">Qty</th><th class="amt">Amt</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sum">
      ${lines.join("")}
      <div class="row total"><span>Total</span><span>${esc(rupee(bill.total))}</span></div>
      <div class="row"><span>Paid · ${esc(PAYMENT_LABEL[bill.payment])}</span><span>${esc(rupee(bill.total))}</span></div>
    </div>
    <p class="thank">Thank you.</p>
  </div>
</body></html>`;
}


/** A full A4 tax-style invoice. Same house rules as the receipt: shop name,
 *  address and Tel in the header, every money line shown, no logo, no owner. */
export function buildWholesaleInvoiceHtml(bill: WholesaleBill): string {
  const shop = shopName();
  const address = shopAddress();
  const phone = shopPhoneDisplay();
  const date = new Date(bill.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  const rows = bill.items
    .map(
      (i, n) => `
      <tr>
        <td class="n">${n + 1}</td>
        <td>${esc(i.name)}</td>
        <td class="r">${esc(qtyLabel(i.unit, i.qty))}</td>
        <td class="r">${esc(rupee(i.unitPrice))}${i.unit === "gram" ? " /100g" : " /pc"}</td>
        <td class="r b">${esc(rupee(i.lineTotal))}</td>
      </tr>`,
    )
    .join("");

  const line = (label: string, value: string, minus = false) =>
    `<div class="sl"><span>${esc(label)}</span><span>${minus ? "-" : ""}${esc(value)}</span></div>`;
  const sums = [line("Subtotal", rupee(bill.subtotal))];
  if (bill.discount > 0) sums.push(line("Discount", rupee(bill.discount), true));
  if (bill.deliveryFee > 0) sums.push(line("Delivery charge", rupee(bill.deliveryFee)));
  if (bill.extra > 0) sums.push(line("Other charges", rupee(bill.extra)));
  if (bill.gstPercent > 0 && bill.gstAmount > 0) sums.push(line(`VAT (${bill.gstPercent}%)`, rupee(bill.gstAmount)));

  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(bill.id)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: ui-sans-serif, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; font-size: 10.5pt; line-height: 1.4; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 5mm; }
  .shop h1 { margin: 0; font-size: 22pt; font-weight: 800; letter-spacing: .01em; }
  .shop p { margin: 1mm 0 0; font-size: 9.5pt; color: #333; }
  .doc { text-align: right; }
  .doc h2 { margin: 0; font-size: 18pt; letter-spacing: .22em; text-transform: uppercase; }
  .doc p { margin: 1mm 0 0; font-size: 9.5pt; }
  .info { display: flex; gap: 10mm; margin: 6mm 0; }
  .box { flex: 1; border: 1px solid #000; padding: 3mm 4mm; }
  .box h3 { margin: 0 0 1.5mm; font-size: 8pt; letter-spacing: .16em; text-transform: uppercase; color: #444; }
  .box b { font-size: 11.5pt; }
  .box p { margin: .5mm 0 0; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #000; color: #fff; font-size: 8.5pt; letter-spacing: .1em; text-transform: uppercase; padding: 2.2mm 3mm; text-align: left; }
  td { padding: 2.4mm 3mm; border-bottom: 1px solid #bbb; vertical-align: top; }
  .r { text-align: right; } .b { font-weight: 700; } .n { width: 10mm; color: #555; }
  th.r { text-align: right; }
  .bottom { display: flex; justify-content: space-between; gap: 10mm; margin-top: 6mm; }
  .note { flex: 1; font-size: 9pt; color: #333; }
  .sum { width: 82mm; }
  .sl { display: flex; justify-content: space-between; padding: 1.2mm 0; }
  .tot { display: flex; justify-content: space-between; font-weight: 800; font-size: 14pt; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 2.5mm 0; margin-top: 1.5mm; }
  .paid { display: flex; justify-content: space-between; padding-top: 1.5mm; font-size: 9.5pt; }
  .foot { margin-top: 16mm; text-align: center; font-size: 9.5pt; border-top: 1px dashed #777; padding-top: 4mm; }
</style></head>
<body>
  <div class="top">
    <div class="shop">
      <h1>${esc(shop)}</h1>
      ${address ? `<p>${esc(address)}</p>` : ""}
      ${phone ? `<p>Tel ${esc(phone)}</p>` : ""}
    </div>
    <div class="doc">
      <h2>Invoice</h2>
      <p><b>${esc(bill.id)}</b></p>
      <p>${esc(date)}</p>
      <p>Wholesale</p>
    </div>
  </div>
  <div class="info">
    <div class="box">
      <h3>Billed to</h3>
      <b>${esc(bill.customerName || "Walk-in customer")}</b>
      ${bill.customerPhone ? `<p>Tel ${esc(bill.customerPhone)}</p>` : ""}
    </div>
    <div class="box">
      <h3>Payment</h3>
      <b>${esc(PAYMENT_LABEL[bill.payment])}</b>
      <p>Amount ${esc(rupee(bill.total))}</p>
    </div>
  </div>
  <table>
    <thead><tr><th class="n">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="bottom">
    <div class="note">${bill.gstPercent > 0 ? "VAT invoice." : ""} Goods once sold are not returnable unless damaged on delivery.</div>
    <div class="sum">
      ${sums.join("")}
      <div class="tot"><span>Total</span><span>${esc(rupee(bill.total))}</span></div>
      <div class="paid"><span>Paid · ${esc(PAYMENT_LABEL[bill.payment])}</span><span>${esc(rupee(bill.total))}</span></div>
    </div>
  </div>
  <div class="foot">Thank you for your business.</div>
</body></html>`;
}

/** The WhatsApp message for a bill — plain text, encoded once inside waLink. */
export function buildWholesaleWhatsAppText(bill: WholesaleBill): string {
  const shop = shopName();
  const phone = shopPhoneDisplay();
  const L: string[] = [];
  L.push(`${WA.rose} *${shop}* — Wholesale invoice`);
  L.push(`${WA.bookmark} Bill: ${bill.id}`);
  L.push(`${WA.person} ${bill.customerName || "Customer"}`);
  L.push("");
  for (const i of bill.items) {
    L.push(`• ${i.name} — ${qtyLabel(i.unit, i.qty)} × ${rupee(i.unitPrice)}${i.unit === "gram" ? "/100g" : ""} = ${rupee(i.lineTotal)}`);
  }
  L.push("");
  L.push(`Subtotal: ${rupee(bill.subtotal)}`);
  if (bill.discount > 0) L.push(`Discount: -${rupee(bill.discount)}`);
  if (bill.deliveryFee > 0) L.push(`Delivery charge: ${rupee(bill.deliveryFee)}`);
  if (bill.extra > 0) L.push(`Other charges: ${rupee(bill.extra)}`);
  if (bill.gstPercent > 0 && bill.gstAmount > 0) L.push(`VAT (${bill.gstPercent}%): ${rupee(bill.gstAmount)}`);
  L.push(`${WA.money} *Total: ${rupee(bill.total)}*`);
  L.push(`${WA.check} Paid · ${PAYMENT_LABEL[bill.payment]}`);
  L.push("");
  L.push(`Thank you for your business! ${WA.sparkle}`);
  if (phone) L.push(`${WA.phone} ${phone}`);
  return L.join("\n");
}

/** Open WhatsApp with the bill pre-filled for the customer (or let the user
 *  pick a chat when the bill has no phone). */
export function sendWholesaleBillWhatsApp(bill: WholesaleBill): void {
  if (typeof window === "undefined") return;
  window.open(waLink(bill.customerPhone, buildWholesaleWhatsAppText(bill)), "_blank", "noopener,noreferrer");
}

/** Print one wholesale bill as a thermal receipt. Safe to call from a click
 *  handler right after saving — it owns its own document, so nothing on the
 *  admin page affects it. */
export function printWholesaleReceipt(bill: WholesaleBill, format: WholesalePrintFormat = "thermal"): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) { iframe.remove(); return; }

  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; try { iframe.remove(); } catch { /* already gone */ } };

  doc.open();
  doc.write(format === "invoice" ? buildWholesaleInvoiceHtml(bill) : buildWholesaleReceiptHtml(bill));
  doc.close();

  win.onafterprint = cleanup;
  // Give the iframe a moment to lay the document out before printing. The
  // afterprint handler clears it; a long fallback covers browsers that never
  // fire afterprint (or where the user leaves the dialog open).
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { cleanup(); }
  }, 250);
  setTimeout(cleanup, 60000);
}
