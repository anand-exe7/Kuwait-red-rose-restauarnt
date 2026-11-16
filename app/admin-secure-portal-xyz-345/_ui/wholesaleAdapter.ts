import type { Bill, OrderItem } from "./types";
import { qtyLabel, round3, type WholesaleBill } from "../../lib/wholesaleStore";

/** Is this invoice number a wholesale one (WB-2026-48213)? */
export const isWholesaleNo = (no: string) => /^WB-/i.test((no || "").trim());

/**
 * A wholesale bill in the shape the shop's one receipt / invoice / WhatsApp
 * renderer understands. This is what lets wholesale orders print on the same
 * 2"/3" thermal rolls and A3/A4/A5 sheets, and send the same WhatsApp message,
 * as every other order — there is only one set of receipt code to keep right.
 *
 * A by-weight line has no whole-number quantity, so it is shown as one line
 * whose name carries the weight and rate ("Halwa — 500 g @ KD 1.200/100g").
 */
export function wholesaleToBill(w: WholesaleBill): Bill {
  const items: OrderItem[] = w.items.map((i) =>
    i.unit === "gram"
      ? { productId: i.productId || null, name: `${i.name} — ${qtyLabel(i.unit, i.qty)} @ ${i.unitPrice.toFixed(3)}/100g`, price: i.lineTotal, qty: 1 }
      : { productId: i.productId || null, name: i.name, price: i.unitPrice, qty: i.qty },
  );
  const taxable = Math.max(0, round3(w.subtotal - w.discount));
  const cash = w.payment === "split" ? w.cashAmount : w.payment === "cash" ? w.total : 0;
  const card = w.payment === "split" ? w.cardAmount : w.payment === "card" ? w.total : 0;
  return {
    id: w.id,
    invoiceNo: w.id,
    source: "counter",
    mode: "standing",
    sessionId: null,
    customerName: w.customerName,
    customerPhone: w.customerPhone,
    items,
    itemCount: items.reduce((a, i) => a + i.qty, 0),
    subtotal: w.subtotal,
    couponCode: null,
    couponPercent: 0,
    couponDiscount: 0,
    couponSource: null,
    manualType: w.discount > 0 ? "amount" : "none",
    manualValue: w.discount,
    manualDiscount: w.discount,
    discount: w.discount,
    deliveryFee: w.deliveryFee,
    total: w.total,
    createdAt: w.createdAt,
    tax: w.gstAmount,
    taxRate: w.gstPercent,
    status: "completed",
    isGst: w.gstPercent > 0,
    gstAmount: w.gstAmount,
    gstPercent: w.gstPercent,
    taxableAmount: taxable,
    cashAmount: cash,
    upiAmount: w.payment === "upi" ? w.total : 0,
    cardAmount: card,
    payment: w.payment,
    received: w.payment === "cash" ? w.received : w.total,
    change: w.payment === "cash" && w.received > w.total ? round3(w.received - w.total) : 0,
    extra: w.extra,
    note: "",
  };
}
