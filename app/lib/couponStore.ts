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
  targetedOnly: boolean;   // only works for the phones it was sent to
  sentPhones: string[];    // normalised (last-8) numbers it was shared with
  createdAt: number;
}

/** Last-8-digit form so +965 / spaces / country codes all compare equal. */
export function normalizePhone(p: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length > 8 ? d.slice(-8) : d;
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
    targetedOnly: (r.targeted_only as boolean) ?? false,
    sentPhones: Array.isArray(r.sent_phones) ? (r.sent_phones as string[]) : [],
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
  if (c.targetedOnly !== undefined) row.targeted_only = c.targetedOnly;
  if (c.sentPhones !== undefined) row.sent_phones = c.sentPhones;
  if (c.createdAt !== undefined) row.created_at = c.createdAt;
  return row;
}

// If the live DB hasn't had supabase/coupon_targeting.sql applied yet, writes
// that include the new columns are rejected. We retry once without them so the
// coupon still saves (minus the targeting it couldn't persist).
const OPTIONAL_COUPON_COLUMNS = ['targeted_only', 'sent_phones'] as const;
let couponSchemaIsLegacy = false;

/** True once a write has told us the targeting columns aren't in the database.
 *  The Coupons page shows this, so "only for this customer" never looks saved
 *  when it couldn't be. */
export function couponTargetingAvailable(): boolean {
  return !couponSchemaIsLegacy;
}

function stripLegacy(row: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...row };
  for (const k of OPTIONAL_COUPON_COLUMNS) delete clean[k];
  return clean;
}

/** True for every "that column doesn't exist yet" shape Supabase/PostgREST can
 *  return — including "Could not find the 'sent_phones' column ... in the schema
 *  cache" and "Unknown column field ...". */
function isMissingColumnError(msg: string): boolean {
  return /unknown .*field|could not find the .* column|column .* does not exist|schema cache|sent_phones|targeted_only/i.test(msg);
}

async function writeCoupon(op: 'insert' | 'update' | 'delete', values: Record<string, unknown>, match?: Record<string, string>) {
  const payload = couponSchemaIsLegacy ? stripLegacy(values) : values;
  const res = await write({ table: 'coupons', op, values: payload, match });
  if (res.error && isMissingColumnError(res.error.message || '')) {
    couponSchemaIsLegacy = true;
    console.warn('[coupons] targeting columns missing — apply supabase/coupon_targeting.sql to enable "only for customers it is sent to". Saving without targeting for now.');
    return write({ table: 'coupons', op, values: stripLegacy(values), match });
  }
  return res;
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

export function addCoupon(
  input: Omit<Coupon, 'id' | 'createdAt' | 'usedCount' | 'targetedOnly' | 'sentPhones'>
    & { usedCount?: number; targetedOnly?: boolean; sentPhones?: string[] }
): Coupon {
  const coupon: Coupon = {
    ...input,
    code: input.code.trim().toUpperCase(),
    usedCount: input.usedCount ?? 0,
    targetedOnly: input.targetedOnly ?? false,
    sentPhones: input.sentPhones ?? [],
    id: `c${Date.now().toString(36)}`,
    createdAt: Date.now(),
  };
  store.patchLocal((cur) => [coupon, ...cur]);
  void writeCoupon('insert', toRow(coupon)).then(({ error }) => {
    if (error) console.error('[coupons] add failed', error.message);
  });
  return coupon;
}

export function updateCoupon(id: string, patch: Partial<Omit<Coupon, 'id' | 'createdAt'>>) {
  const norm = patch.code !== undefined ? { ...patch, code: patch.code.trim().toUpperCase() } : patch;
  store.patchLocal((cur) => cur.map((c) => (c.id === id ? { ...c, ...norm } : c)));
  void writeCoupon('update', toRow(norm), { id }).then(({ error }) => {
    if (error) console.error('[coupons] update failed', error.message);
  });
}

export function deleteCoupon(id: string) {
  store.patchLocal((cur) => cur.filter((c) => c.id !== id));
  void writeCoupon('delete', {}, { id }).then(({ error }) => {
    if (error) console.error('[coupons] delete failed', error.message);
  });
}

/** Record that this coupon was sent to a phone (dedup, normalised). Optionally
 *  flips the coupon to "only for customers it's sent to". */
export async function recordCouponSent(
  id: string,
  phone: string,
  makeTargeted = false,
): Promise<{ ok: boolean; error?: string }> {
  const n = normalizePhone(phone);
  const cur = store.get().find((c) => c.id === id);
  if (!cur || !n) return { ok: false, error: 'That number does not look right.' };
  const sentPhones = cur.sentPhones.includes(n) ? cur.sentPhones : [...cur.sentPhones, n];
  const patch: Partial<Coupon> = { sentPhones };
  if (makeTargeted && !cur.targetedOnly) patch.targetedOnly = true;
  store.patchLocal((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const { error } = await writeCoupon('update', toRow(patch), { id });
  if (error) {
    return { ok: false, error: error.message };
  }
  if (couponSchemaIsLegacy) {
    return {
      ok: false,
      error:
        'The number could not be linked to this coupon: your database is missing the ' +
        'targeting columns. Apply supabase/coupon_targeting.sql, then send it again.',
    };
  }
  return { ok: true };
}

/** Record one more redemption of this coupon. Called at checkout, after the
 *  order is placed, so usedCount reflects actual completed orders. */
export function incrementCouponUsage(id: string) {
  const current = store.get().find((c) => c.id === id);
  if (!current) return;
  updateCoupon(id, { usedCount: (current.usedCount ?? 0) + 1 });
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
  /** True when the code is a valid *targeted* coupon but no phone was supplied
   *  yet — the caller should ask the customer for the number it was sent to and
   *  re-validate, rather than show a hard "invalid" error. */
  needsPhone?: boolean;
}

/** Validate a code against a product subtotal (KD). Discount = subtotal × %.
 *  For targeted coupons, `phone` must be one the coupon was sent to. */
export function validateCoupon(code: string, subtotal: number, phone?: string): CouponResult {
  // Make sure the coupons table is being fetched. Pages that don't display the
  // coupon list (e.g. the public customer menu) never subscribe to this store,
  // which left the cache empty and made every code look invalid.
  store.ensureHydrated();
  const c = store.get().find((x) => x.code === code.trim().toUpperCase());
  if (!c) {
    if (store.get().length === 0) {
      return { ok: false, reason: 'Still loading coupons — try again in a second.' };
    }
    return { ok: false, reason: 'Invalid coupon code' };
  }
  if (!c.active) return { ok: false, reason: 'This coupon is no longer active' };
  if (isExpired(c)) return { ok: false, reason: 'This coupon has expired' };
  const remaining = remainingUses(c);
  if (remaining !== null && remaining <= 0) return { ok: false, reason: 'This coupon has reached its usage limit' };
  if (subtotal < c.minOrder) return { ok: false, reason: `Minimum order of KD ${c.minOrder.toFixed(3)} required` };
  if (c.targetedOnly) {
    if (c.sentPhones.length === 0) {
      // Targeted, but linked to nobody — it can never be claimed. Say so
      // plainly instead of blaming the customer's number.
      return { ok: false, reason: 'This coupon isn’t linked to a number yet. Ask the shop to send it again.' };
    }
    const n = phone ? normalizePhone(phone) : '';
    if (!n) {
      // Valid coupon, just no number yet — let the UI ask for it (claim flow).
      return { ok: false, needsPhone: true, reason: 'This is a personal coupon — enter the mobile number it was sent to.' };
    }
    if (!c.sentPhones.map(normalizePhone).includes(n)) {
      return { ok: false, reason: 'This coupon wasn’t sent to that number. Check the mobile number and try again.' };
    }
  }
  const discount = (subtotal * c.discountPercent) / 100;
  return { ok: true, coupon: c, discount };
}

export function subscribeToCoupons(callback: () => void): () => void {
  return store.subscribe(callback);
}
