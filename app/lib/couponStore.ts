"use client";

// Discount coupons — created in the admin, applied at customer checkout and in
// the POS billing panel. Discount applies to the product subtotal only (never to
// delivery). Same localStorage + custom-event sync pattern as the other stores.

export interface Coupon {
  id: string;
  code: string;            // stored uppercase
  discountPercent: number; // 1–100
  minOrder: number;        // minimum subtotal (KD) required
  expiry: string;          // 'YYYY-MM-DD', or '' for no expiry
  usageLimit: number;      // 0 = unlimited
  usedCount: number;
  active: boolean;
  createdAt: number;
}

const STORAGE_KEY = 'cenexa_coupons_v1';
const EVENT_NAME = 'cenexa-coupons-updated';
const EMPTY: Coupon[] = [];

const SEED: Coupon[] = [
  { id: 'c1', code: 'SWEET10', discountPercent: 10, minOrder: 5, expiry: '2027-12-31', usageLimit: 100, usedCount: 0, active: true, createdAt: Date.now() },
  { id: 'c2', code: 'REDROSE15', discountPercent: 15, minOrder: 10, expiry: '2027-12-31', usageLimit: 50, usedCount: 0, active: true, createdAt: Date.now() + 1 },
];

let cachedRaw: string | null | undefined;
let cached: Coupon[] = EMPTY;

function read(): Coupon[] {
  if (typeof window === 'undefined') return EMPTY;
  let raw: string | null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { return EMPTY; }
  if (raw === null) { write(SEED); return cached; }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try { cached = JSON.parse(raw); } catch { cached = EMPTY; }
  return cached;
}

function write(coupons: Coupon[]) {
  cachedRaw = JSON.stringify(coupons);
  cached = coupons;
  window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getCouponsSnapshot(): Coupon[] { return read(); }
export function getCouponsServerSnapshot(): Coupon[] { return EMPTY; }
export function getCoupons(): Coupon[] {
  return [...read()].sort((a, b) => b.createdAt - a.createdAt);
}

export function isExpired(c: Coupon): boolean {
  if (!c.expiry) return false;
  return Date.now() > new Date(`${c.expiry}T23:59:59`).getTime();
}

export function remainingUses(c: Coupon): number | null {
  if (!c.usageLimit) return null; // unlimited
  return Math.max(0, c.usageLimit - c.usedCount);
}

export function addCoupon(input: Omit<Coupon, 'id' | 'createdAt' | 'usedCount'> & { usedCount?: number }): Coupon {
  const coupons = read();
  const coupon: Coupon = {
    ...input,
    code: input.code.trim().toUpperCase(),
    usedCount: input.usedCount ?? 0,
    id: `c${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  write([coupon, ...coupons]);
  return coupon;
}

export function updateCoupon(id: string, patch: Partial<Omit<Coupon, 'id' | 'createdAt'>>) {
  write(read().map(c => (c.id === id ? { ...c, ...patch, code: (patch.code ?? c.code).trim().toUpperCase() } : c)));
}

export function deleteCoupon(id: string) {
  write(read().filter(c => c.id !== id));
}

export function incrementCouponUsage(id: string) {
  write(read().map(c => (c.id === id ? { ...c, usedCount: c.usedCount + 1 } : c)));
}

export function codeExists(code: string, exceptId?: string): boolean {
  const c = code.trim().toUpperCase();
  return read().some(x => x.code === c && x.id !== exceptId);
}

export interface CouponResult {
  ok: boolean;
  coupon?: Coupon;
  discount?: number;
  reason?: string;
}

/** Validate a code against a product subtotal (KD). Discount = subtotal × %. */
export function validateCoupon(code: string, subtotal: number): CouponResult {
  const c = read().find(x => x.code === code.trim().toUpperCase());
  if (!c) return { ok: false, reason: 'Invalid coupon code' };
  if (!c.active) return { ok: false, reason: 'This coupon is no longer active' };
  if (isExpired(c)) return { ok: false, reason: 'This coupon has expired' };
  const remaining = remainingUses(c);
  if (remaining !== null && remaining <= 0) return { ok: false, reason: 'This coupon has reached its usage limit' };
  if (subtotal < c.minOrder) return { ok: false, reason: `Minimum order of KD ${c.minOrder.toFixed(3)} required` };
  const discount = (subtotal * c.discountPercent) / 100;
  return { ok: true, coupon: c, discount };
}

export function subscribeToCoupons(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}
