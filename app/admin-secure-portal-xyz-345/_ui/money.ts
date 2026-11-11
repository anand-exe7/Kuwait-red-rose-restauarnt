import type { Coupon, OrderItem } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

// Red Rose shows KD to 3dp.
export const rupee = (n: number) =>
  `KD ${(Math.round(n * 1000) / 1000).toFixed(3)}`;

// Stubs for the helpers the ported Billing page imports. Red Rose's real
// coupon/bill logic lives in app/lib/couponStore + the Billing API, so these
// keep the UI compiling without stepping on the real pricing engine.

export type CouponCheck =
  | { ok: true; coupon: Coupon; discount: number }
  | { ok: false; reason: string };

/** Called with the two-arg signature from the ported BillingPage. The coupon
 *  itself is the first argument (already looked up upstream); subtotal is
 *  all we need to validate the min-order and compute the discount. */
export function checkCoupon(coupon: Coupon | null | undefined, subtotal: number): CouponCheck {
  if (!coupon) return { ok: false, reason: "That code isn't right." };
  if (!coupon.active) return { ok: false, reason: "That coupon is paused." };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) return { ok: false, reason: "That coupon has expired." };
  if (coupon.limit !== null && coupon.used >= coupon.limit) return { ok: false, reason: "That coupon has been used up." };
  if (subtotal < coupon.minOrder) return { ok: false, reason: `Minimum order is KD ${coupon.minOrder.toFixed(3)}.` };
  return { ok: true, coupon, discount: round2((subtotal * coupon.percent) / 100) };
}

export type CouponStatus = "active" | "expired" | "exhausted" | "paused";
export function couponStatus(c: Coupon): CouponStatus {
  if (!c.active) return "paused";
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) return "expired";
  if (c.limit !== null && c.used >= c.limit) return "exhausted";
  return "active";
}

/** Collapse duplicate order lines by productId + name + price so the admin
 *  shows one row per product even when several orders brought the same item. */
export function mergeItems(items: OrderItem[]): OrderItem[] {
  const out: OrderItem[] = [];
  for (const it of items) {
    const hit = out.findIndex(
      (i) => i.productId === it.productId && i.name === it.name && i.price === it.price
    );
    if (hit < 0) out.push({ ...it });
    else out[hit] = { ...out[hit], qty: out[hit].qty + it.qty };
  }
  return out;
}

export interface BillComputed {
  subtotal: number;
  couponOk: CouponCheck | null;
  couponDiscount: number;
  manualDiscount: number;
  discount: number;
  /** Delivery charge, added after the discount. */
  deliveryFee: number;
  taxable: number;
  tax: number;
  gstAmount: number;
  extra: number;
  total: number;
  itemCount: number;
}

export interface BillInputs {
  items: OrderItem[];
  coupon?: Coupon | null;
  manualType?: "percent" | "amount" | "none";
  manualValue?: number;
  /** Delivery charge for this bill (0 for anything but a delivery). */
  deliveryFee?: number;
  extra?: number;
  gst?: boolean;
  gstPercent?: number;
}

export function computeBill(input: BillInputs): BillComputed {
  const { items, coupon, manualType = "none", manualValue = 0, deliveryFee = 0, extra = 0, gst = false, gstPercent = 0 } = input;
  const subtotal = round2(items.reduce((s, i) => s + i.price * i.qty, 0));
  const couponOk: CouponCheck | null = coupon ? checkCoupon(coupon, subtotal) : null;
  const couponDiscount = couponOk && couponOk.ok ? couponOk.discount : 0;
  const manualDiscount =
    manualType === "percent"
      ? round2((subtotal * manualValue) / 100)
      : manualType === "amount"
        ? round2(manualValue)
        : 0;
  const discount = round2(couponDiscount + manualDiscount);
  /* VAT in Kuwait is charged ON TOP of what the customer actually pays for the
     goods, and the discount comes off FIRST. So a KD 7 cake with KD 1 off is
     KD 6 of goods, and 5% VAT on that is KD 0.300 — never 5% of 7, and never
     carved back out of the 6. The delivery charge is a service fee, not part
     of the goods, so it is added after the VAT rather than taxed. */
  const taxable = Math.max(0, round2(subtotal - discount));
  const gstAmount = gst ? round2((taxable * gstPercent) / 100) : 0;
  const total = round2(taxable + gstAmount + deliveryFee + extra);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  return {
    subtotal,
    couponOk,
    couponDiscount,
    manualDiscount,
    discount,
    deliveryFee,
    taxable,
    tax: gstAmount,
    gstAmount,
    extra,
    total,
    itemCount,
  };
}

