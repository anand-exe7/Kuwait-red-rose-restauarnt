import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SESSION_COOKIE, verifySessionToken, type Role } from '../../lib/session';
import { getServerSupabase } from '../../lib/supabaseServer';
import { HttpError, bad, deny, throttle, isObj, str, int, money, round3, clientIp } from '../../lib/server/http';
import { priceItems, checkCoupon, consumeCoupon, TAX_RATE } from '../../lib/server/pricing';

// Single guarded door for every database WRITE made by the browser.
//
// The browser still READS (and listens to Realtime) with the public anon key,
// but it no longer writes with it. Each write is checked here against:
//   * who is calling  (the signed staff cookie, or an anonymous guest),
//   * what they may do (per-table / per-operation rules below),
//   * what the data must look like (prices, tax, totals and bill amounts are
//     recomputed from the database, never trusted from the client).
//
// Once SUPABASE_SERVICE_ROLE_KEY is set and supabase/security.sql has been run,
// the database itself refuses anonymous writes, so this route is the only way in.

type Op = 'insert' | 'update' | 'delete';
type Values = Record<string, unknown>;
type Match = Record<string, string | number | boolean>;
interface Body { table?: string; op?: Op; values?: Values; match?: Match }

const COLUMNS: Record<string, string[]> = {
  menu_items: ['id', 'name', 'category', 'price', 'description', 'image', 'prep_time', 'status', 'is_popular',
    'is_chef_special', 'is_spicy', 'stock', 'low_stock_threshold', 'sku', 'cost', 'created_at'],
  coupons: ['id', 'code', 'discount_percent', 'min_order', 'expiry', 'usage_limit', 'used_count', 'active', 'created_at'],
  tables: ['id', 'number', 'label', 'seats', 'zone', 'active', 'session_id', 'created_at'],
  sessions: ['id', 'table_number', 'mode', 'status', 'standing_label', 'customer_name', 'customer_phone', 'guests',
    'opened_at', 'closed_at', 'bill_requested_at', 'bill_id', 'created_at'],
  orders: ['id', 'table_number', 'items', 'status', 'priority', 'subtotal', 'tax', 'total', 'source', 'mode',
    'discount', 'coupon_code', 'standing_label', 'session_id', 'billed', 'created_at'],
  bills: ['id', 'session_id', 'subtotal', 'tax', 'discount', 'total', 'coupon_code', 'paid_method', 'created_at'],
  waiter_calls: ['id', 'table_number', 'resolved', 'created_at'],
};

const isStaff = (r: Role | null) => r === 'admin' || r === 'waiter' || r === 'chef';
const isFloor = (r: Role | null) => r === 'admin' || r === 'waiter'; // may bill / serve

function assertKeys(obj: Values | undefined, allowed: string[], what: string) {
  for (const k of Object.keys(obj ?? {})) if (!allowed.includes(k)) throw bad(`Unknown ${what} field "${k}"`);
}

// ---- per-table handlers ----
type Ctx = { sb: SupabaseClient; role: Role | null; ip: string };

async function adminOnlyWrite(ctx: Ctx, table: string, op: Op, values: Values, match: Match) {
  if (ctx.role !== 'admin') throw deny('Admin only');
  const q = ctx.sb.from(table);
  if (op === 'insert') return q.insert(values);
  if (Object.keys(match).length === 0) throw bad('match is required');
  return op === 'update' ? q.update(values).match(match) : q.delete().match(match);
}

async function sessionsWrite(ctx: Ctx, op: Op, v: Values, match: Match) {
  const { sb, role } = ctx;
  if (op === 'delete') throw deny();
  if (op === 'insert') {
    throttle(`s:${ctx.ip}`);
    const mode = v.mode === 'standing' || v.mode === 'takeaway' ? v.mode : 'table';
    const id = str(v.id, 60, 'id');
    if (!/^SN-[0-9]+-[0-9]+$/.test(id)) throw bad('Invalid id');
    let tableNumber: number | null = null;
    if (mode === 'table') {
      tableNumber = int(v.table_number, 1, 999, 'table');
      const { data } = await sb.from('tables').select('number').eq('number', tableNumber).eq('active', true).maybeSingle();
      if (!data) throw bad('Unknown table');
    }
    const now = Date.now();
    const row = {
      id, table_number: tableNumber, mode, status: 'open',
      standing_label: typeof v.standing_label === 'string' ? v.standing_label.slice(0, 40) : null,
      customer_name: isStaff(role) && typeof v.customer_name === 'string' ? v.customer_name.slice(0, 60) : null,
      customer_phone: isStaff(role) && typeof v.customer_phone === 'string' ? v.customer_phone.slice(0, 20) : null,
      guests: isStaff(role) && v.guests != null ? int(v.guests, 1, 99, 'guests') : null,
      opened_at: now, created_at: now,
    };
    const res = await sb.from('sessions').insert(row);
    if (!res.error && mode === 'table') {
      await sb.from('tables').update({ session_id: id }).eq('number', tableNumber);
    }
    return res;
  }
  // update
  const id = match.id;
  if (typeof id !== 'string' || Object.keys(match).length !== 1) throw bad('match must be { id }');
  const keys = Object.keys(v);
  if (keys.length === 0) throw bad('Nothing to update');
  const guestOnly = keys.every((k) => k === 'bill_requested_at');
  if (guestOnly) {
    throttle(`s:${ctx.ip}`);
    return sb.from('sessions').update({ bill_requested_at: Date.now() }).eq('id', id).eq('status', 'open');
  }
  if (!isFloor(role)) throw deny('Staff only');
  assertKeys(v, ['status', 'closed_at', 'bill_id', 'bill_requested_at'], 'session');
  if (v.status !== undefined && v.status !== 'closed' && v.status !== 'void') throw bad('Invalid status');
  const patch: Values = { ...v };
  if (v.status) patch.closed_at = Date.now();
  const res = await sb.from('sessions').update(patch).eq('id', id);
  if (!res.error && v.status) await sb.from('tables').update({ session_id: null }).eq('session_id', id);
  return res;
}

async function ordersWrite(ctx: Ctx, op: Op, v: Values, match: Match) {
  const { sb, role } = ctx;
  if (op === 'delete') throw deny();

  if (op === 'update') {
    const keys = Object.keys(v);
    assertKeys(v, ['status', 'billed', 'priority'], 'order');
    if (keys.length === 0) throw bad('Nothing to update');
    const mk = Object.keys(match);
    if (mk.length !== 1 || (mk[0] !== 'id' && mk[0] !== 'session_id')) throw bad('match must be { id } or { session_id }');
    if (!isStaff(role)) throw deny('Staff only');
    if (v.status !== undefined && !['pending', 'cooking', 'ready', 'served'].includes(String(v.status))) throw bad('Invalid status');
    if ((v.billed !== undefined || mk[0] === 'session_id' || v.status === 'served') && !isFloor(role)) throw deny('Waiter or admin only');
    if (v.billed !== undefined && typeof v.billed !== 'boolean') throw bad('Invalid billed');
    return sb.from('orders').update(v).match(match);
  }

  // insert
  const staff = isStaff(role);
  if (!staff) throttle(`o:${ctx.ip}`, 20);
  const source = v.source === 'waiter' ? 'waiter' : 'customer';
  if (source === 'waiter' && !isFloor(role)) throw deny('Waiter orders need a staff login');
  const mode = v.mode === 'standing' || v.mode === 'takeaway' ? v.mode : 'table';
  const id = str(v.id, 24, 'id');
  if (!/^TK-[A-Z0-9]{3,16}$/.test(id)) throw bad('Invalid id');

  const tableNumber = mode === 'table' ? int(v.table_number, 1, 999, 'table') : 0;
  if (mode === 'table') {
    const { data } = await sb.from('tables').select('number').eq('number', tableNumber).eq('active', true).maybeSingle();
    if (!data) throw bad('Unknown table');
  }

  // Only the admin POS may record an order that is already served/billed.
  let status = 'pending';
  let billed = false;
  if (role === 'admin') {
    if (v.status !== undefined) {
      if (!['pending', 'cooking', 'ready', 'served'].includes(String(v.status))) throw bad('Invalid status');
      status = String(v.status);
    }
    billed = v.billed === true;
  }
  const priority = staff && v.priority === 'high' ? 'high' : 'normal';

  // ---- items, prices and coupon: checked against the database, not the client ----
  const { items, subtotal } = await priceItems(sb, v.items, { admin: role === 'admin' });
  const coupon = await checkCoupon(sb, v.coupon_code, subtotal);
  let discount = coupon?.discount ?? 0;

  let tax: number;
  let total: number;
  if (role === 'admin') {
    // Admin POS: manual discounts, delivery and tax-free sales are legitimate.
    if (v.discount != null) discount = Math.min(subtotal, money(v.discount, 'discount'));
    tax = v.tax != null ? Math.min(subtotal, money(v.tax, 'tax')) : round3((subtotal - discount) * TAX_RATE);
    total = v.total != null ? money(v.total, 'total') : round3(subtotal - discount + tax);
  } else {
    tax = round3((subtotal - discount) * TAX_RATE);
    total = round3(subtotal - discount + tax);
  }

  const sessionId = typeof v.session_id === 'string' && /^SN-[0-9]+-[0-9]+$/.test(v.session_id) ? v.session_id : null;
  const row = {
    id, table_number: tableNumber, items, status, priority, subtotal, tax, total, source, mode,
    discount: discount > 0 ? round3(discount) : null,
    coupon_code: coupon?.code ?? null,
    standing_label: typeof v.standing_label === 'string' ? v.standing_label.slice(0, 40) : null,
    session_id: sessionId, billed, created_at: Date.now(),
  };
  const res = await sb.from('orders').insert(row);
  if (!res.error && coupon) await consumeCoupon(sb, coupon);
  return res;
}

async function billsWrite(ctx: Ctx, op: Op, v: Values) {
  if (op !== 'insert') throw deny();
  if (!isFloor(ctx.role)) throw deny('Waiter or admin only');
  const id = str(v.id, 40, 'id');
  if (!/^BL-[A-Za-z0-9]+$/.test(id)) throw bad('Invalid id');
  const sessionId = str(v.session_id, 60, 'session');
  // Amounts come from the session's real orders, not from the client.
  const { data: orders, error } = await ctx.sb
    .from('orders').select('subtotal,tax,discount,total,coupon_code').eq('session_id', sessionId);
  if (error) throw new HttpError(500, 'Order lookup failed');
  if (!orders || orders.length === 0) throw bad('Nothing to bill for this session');
  const sum = (k: 'subtotal' | 'tax' | 'discount' | 'total') => round3(orders.reduce((s, o) => s + (Number(o[k]) || 0), 0));
  return ctx.sb.from('bills').insert({
    id, session_id: sessionId,
    subtotal: sum('subtotal'), tax: sum('tax'), discount: sum('discount'), total: sum('total'),
    coupon_code: orders.find((o) => o.coupon_code)?.coupon_code ?? null,
    paid_method: typeof v.paid_method === 'string' ? v.paid_method.slice(0, 20) : null,
    created_at: Date.now(),
  });
}

async function waiterCallsWrite(ctx: Ctx, op: Op, v: Values, match: Match) {
  if (op === 'delete') throw deny();
  if (op === 'insert') {
    throttle(`w:${ctx.ip}`, 10);
    const id = str(v.id, 40, 'id');
    if (!/^WC-[A-Za-z0-9]+$/.test(id)) throw bad('Invalid id');
    const table = int(v.table_number, 1, 999, 'table');
    const { data } = await ctx.sb.from('tables').select('number').eq('number', table).eq('active', true).maybeSingle();
    if (!data) throw bad('Unknown table');
    return ctx.sb.from('waiter_calls').insert({ id, table_number: table, resolved: false, created_at: Date.now() });
  }
  if (!isFloor(ctx.role)) throw deny('Waiter or admin only');
  assertKeys(v, ['resolved'], 'call');
  if (typeof match.id !== 'string' || Object.keys(match).length !== 1) throw bad('match must be { id }');
  return ctx.sb.from('waiter_calls').update({ resolved: v.resolved === true }).eq('id', match.id);
}

export async function POST(request: NextRequest) {
  try {
    // Same-origin JSON only (blocks cross-site form posts / CSRF).
    if (!request.headers.get('content-type')?.includes('application/json')) throw bad('JSON required');
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.nextUrl.host) throw deny('Cross-origin request blocked');

    let body: Body;
    try { body = await request.json(); } catch { throw bad('Invalid JSON'); }
    const { table, op } = body;
    if (!table || !(table in COLUMNS)) throw bad('Unknown table');
    if (op !== 'insert' && op !== 'update' && op !== 'delete') throw bad('Unknown operation');
    const values = body.values ?? {};
    const match = body.match ?? {};
    if (!isObj(values) || !isObj(match)) throw bad('Invalid body');
    assertKeys(values, COLUMNS[table], 'column');
    assertKeys(match, COLUMNS[table], 'match');
    for (const x of [...Object.values(values), ...Object.values(match)]) {
      if (typeof x === 'function' || typeof x === 'symbol') throw bad('Invalid value');
    }

    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');
    const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    const ctx: Ctx = { sb, role, ip: clientIp(request) };

    let result: { error: { message: string; code?: string } | null };
    switch (table) {
      case 'menu_items':
      case 'coupons':
      case 'tables':
        result = await adminOnlyWrite(ctx, table, op, values, match);
        break;
      case 'sessions': result = await sessionsWrite(ctx, op, values, match); break;
      case 'orders': result = await ordersWrite(ctx, op, values, match); break;
      case 'bills': result = await billsWrite(ctx, op, values); break;
      default: result = await waiterCallsWrite(ctx, op, values, match);
    }
    if (result.error) {
      return NextResponse.json({ ok: false, error: { message: result.error.message, code: result.error.code } }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, error: { message: e.message, code: e.code } }, { status: e.status });
    }
    console.error('[api/db]', e);
    return NextResponse.json({ ok: false, error: { message: 'Server error' } }, { status: 500 });
  }
}
