import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, bad, int, isObj, money, round3, str } from './http';

// Server-side pricing shared by every route that creates an order
// (/api/db for dine-in/takeaway/POS, /api/delivery/customer for delivery).
// Prices come from the menu table, never from the browser.

export const TAX_RATE = 0.1;

export interface PricedItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

/** Looks up every item in the menu and returns canonical lines + subtotal. */
export async function priceItems(
  sb: SupabaseClient,
  rawItems: unknown,
  opts: { admin: boolean }
): Promise<{ items: PricedItem[]; subtotal: number }> {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) throw bad('Invalid items');
  const ids = rawItems.map((i) => (isObj(i) ? String(i.id ?? '') : ''));
  const { data: menuRows, error } = await sb.from('menu_items').select('id,name,price,status').in('id', ids);
  if (error) throw new HttpError(500, 'Menu lookup failed');
  const menu = new Map((menuRows ?? []).map((m) => [m.id as string, m]));

  let subtotal = 0;
  const items = rawItems.map((raw) => {
    if (!isObj(raw)) throw bad('Invalid item');
    const qty = int(raw.qty, 1, 99, 'quantity');
    const m = menu.get(String(raw.id));
    let price: number;
    let name: string;
    if (m) {
      if (m.status !== 'active' && !opts.admin) throw bad(`"${m.name}" is not available`);
      price = Number(m.price);
      name = String(m.name);
    } else if (opts.admin) {
      // POS custom lines (free-form name + price) are admin-only.
      price = money(raw.price, 'price');
      name = str(raw.name ?? 'Item', 80, 'name') || 'Item';
    } else {
      throw bad('Unknown menu item');
    }
    subtotal += price * qty;
    const out: PricedItem = { id: String(raw.id), name, price, qty };
    if (typeof raw.notes === 'string' && raw.notes.trim()) out.notes = raw.notes.slice(0, 200);
    return out;
  });
  return { items, subtotal: round3(subtotal) };
}

export interface CouponCheck {
  code: string;
  id: string;
  usedCount: number;
  discount: number;
}

/** Validates a coupon against a subtotal. Throws a 400 with a friendly reason. */
export async function checkCoupon(sb: SupabaseClient, rawCode: unknown, subtotal: number): Promise<CouponCheck | null> {
  if (typeof rawCode !== 'string' || !rawCode.trim()) return null;
  const code = rawCode.trim().toUpperCase().slice(0, 40);
  const { data: c } = await sb.from('coupons').select('*').eq('code', code).maybeSingle();
  if (!c) throw bad('Invalid coupon code');
  if (!c.active) throw bad('This coupon is no longer active');
  if (c.expiry && Date.now() > new Date(`${c.expiry}T23:59:59`).getTime()) throw bad('This coupon has expired');
  if (c.usage_limit && c.used_count >= c.usage_limit) throw bad('This coupon has reached its usage limit');
  if (subtotal < Number(c.min_order)) throw bad(`Minimum order of KD ${Number(c.min_order).toFixed(3)} required`);
  return {
    code: c.code,
    id: c.id,
    usedCount: Number(c.used_count) || 0,
    discount: round3((subtotal * Number(c.discount_percent)) / 100),
  };
}

export async function consumeCoupon(sb: SupabaseClient, coupon: CouponCheck) {
  await sb.from('coupons').update({ used_count: coupon.usedCount + 1 }).eq('id', coupon.id);
}
