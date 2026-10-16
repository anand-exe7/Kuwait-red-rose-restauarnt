"use client";

// Discount coupons — Supabase + Realtime backed. Public API unchanged from the
// old localStorage version. Discount applies to the product subtotal only.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

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

function fromRow(r: Record<string, unknown>): Coupon {
  return {
    id: r.id as string,
    code: r.code as string,
    discountPercent: Number(r.discount_percent),
    minOrder: Number(r.min_order),
    expiry: (r.expiry as string) ?? '',
    usageLimit: Number(r.usage_limit ?? 0),
    usedCount: Number(r.used_count ?? 0),
    active: (r.active as boolean) ?? true,
    createdAt: Number(r.created_at),
  };
}

function toRow(c: Partial<Coupon>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.id !== undefined) row.id = c.id;
  if (c.code !== undefined) row.code = c.code;
  if (c.discountPercent !== undefined) row.discount_percent = c.discountPercent;
  if (c.minOrder !== undefined) row.min_order = c.minOrder;
  if (c.expiry !== undefined) row.expiry = c.expiry;
  if (c.usageLimit !== undefined) row.usage_limit = c.usageLimit;
  if (c.usedCount !== undefined) row.used_count = c.usedCount;
  if (c.active !== undefined) row.active = c.active;
  if (c.createdAt !== undefined) row.created_at = c.createdAt;
  return row;
}

const store = createRealtimeStore<Coupon>({ table: 'coupons', fromRow });

export function getCouponsSnapshot(): Coupon[] {
  return store.getSnapshot();
}
export function getCouponsServerSnapshot(): Coupon[] {
  return store.getServerSnapshot();
}
export function getCoupons(): Coupon[] {
  store.ensureHydrated();
  return [...store.get()].sort((a, b) => b.createdAt - a.createdAt);
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
  const coupon: Coupon = {
    ...input,
    code: input.code.trim().toUpperCase(),
    usedCount: input.usedCount ?? 0,
    id: `c${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  store.patchLocal((cur) => [coupon, ...cur]);
  void write({ table: 'coupons', op: 'insert', values: toRow(coupon) }).then(({ error }) => {
    if (error) console.error('[coupons] add failed', error.message);
  });
  return coupon;
}

export function updateCoupon(id: string, patch: Partial<Omit<Coupon, 'id' | 'createdAt'>>) {
  const norm = patch.code !== undefined ? { ...patch, code: patch.code.trim().toUpperCase() } : patch;
  store.patchLocal((cur) => cur.map((c) => (c.id === id ? { ...c, ...norm } : c)));
  void write({ table: 'coupons', op: 'update', values: toRow(norm), match: { id: id } }).then(({ error }) => {
    if (error) console.error('[coupons] update failed', error.message);
  });
}

export function deleteCoupon(id: string) {
  store.patchLocal((cur) => cur.filter((c) => c.id !== id));
  void write({ table: 'coupons', op: 'delete', match: { id: id } }).then(({ error }) => {
    if (error) console.error('[coupons] delete failed', error.message);
  });
}

export function codeExists(code: string, exceptId?: string): boolean {
  const c = code.trim().toUpperCase();
  return store.get().some((x) => x.code === c && x.id !== exceptId);
}

export interface CouponResult {
  ok: boolean;
  coupon?: Coupon;
  discount?: number;
  reason?: string;
}

/** Validate a code against a product subtotal (KD). Discount = subtotal × %. */
export function validateCoupon(code: string, subtotal: number): CouponResult {
  const c = store.get().find((x) => x.code === code.trim().toUpperCase());
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
  return store.subscribe(callback);
}
