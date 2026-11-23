import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BILLER_COOKIE, LOCK_COOKIE, SESSION_COOKIE,
  verifyBillerToken, verifyLockToken, verifySessionToken, type Role,
} from '../../lib/session';
import { getServerSupabase } from '../../lib/supabaseServer';
import { HttpError, bad, deny, throttle, isObj, str, int, money, round3, clientIp } from '../../lib/server/http';
import { priceItems, checkCoupon, consumeCoupon, releaseCoupon, TAX_RATE } from '../../lib/server/pricing';
import { applySaleForBill, applySaleForOrder, reverseSaleForBill, reverseSaleForOrder } from '../../lib/server/stock';
import { feeForAreaName } from '../../lib/delivery/server';
import { orderingEnabled } from '../../lib/server/ops';

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
    'is_chef_special', 'is_best_seller', 'is_spicy', 'stock', 'low_stock_threshold', 'sku', 'cost', 'weight_grams', 'variants', 'created_at'],
  coupons: ['id', 'code', 'discount_percent', 'min_order', 'expiry', 'usage_limit', 'used_count', 'active', 'created_at',
    'targeted_only', 'sent_phones'],
  app_settings: ['id', 'value'],
  tables: ['id', 'number', 'label', 'seats', 'zone', 'active', 'session_id', 'created_at'],
  sessions: ['id', 'table_number', 'mode', 'status', 'standing_label', 'customer_name', 'customer_phone', 'guests',
    'opened_at', 'closed_at', 'bill_requested_at', 'bill_id', 'created_at'],
  orders: ['id', 'table_number', 'items', 'status', 'priority', 'subtotal', 'tax', 'total', 'source', 'mode',
    'discount', 'coupon_code', 'delivery_fee', 'standing_label', 'session_id', 'billed', 'created_at',
    // Customer remark + hand-over stamp — see supabase/order_notes_handover.sql.
    'note', 'handed_over_at',
    // Customer identity + delivery address — see supabase/add_customer_columns.sql.
    'user_id', 'customer_name', 'customer_phone', 'customer_email', 'delivery_address'],
  // `invoice_no` + `payload` carry the admin POS's rich bill so the short
  // `/invoice/INV-…` link can rebuild it without a URL blob. See
  // supabase/add_bill_payload.sql for the migration.
  bills: ['id', 'session_id', 'subtotal', 'tax', 'discount', 'total', 'coupon_code', 'paid_method', 'created_at', 'invoice_no', 'payload'],
  waiter_calls: ['id', 'table_number', 'resolved', 'created_at'],
  // Shop expenses — see supabase/expenses.sql. Admin-only, like the catalogue.
  expenses: ['id', 'title', 'category', 'amount', 'expense_date', 'notes', 'created_at'],
  // Wholesale (B2B) module — see supabase/wholesale.sql. All admin-only.
  wholesale_products: ['id', 'name', 'category', 'unit', 'wholesale_price', 'retail_price', 'cost_price', 'active', 'created_at'],
  wholesale_customers: ['id', 'name', 'phone', 'note', 'created_at'],
  wholesale_prices: ['id', 'customer_id', 'product_id', 'price', 'created_at'],
  // `biller` is who was on the counter — stamped here from the signed biller
  // cookie, never from the browser. See supabase/wholesale_biller.sql.
  wholesale_bills: ['id', 'customer_id', 'customer_name', 'customer_phone', 'items', 'subtotal', 'discount',
    'delivery_fee', 'delivery_partner', 'extra', 'gst_percent', 'gst_amount', 'total', 'payment', 'received', 'cash_amount', 'card_amount', 'created_at', 'biller'],
};

const isStaff = (r: Role | null) => r === 'admin' || r === 'waiter' || r === 'chef';
const isFloor = (r: Role | null) => r === 'admin' || r === 'waiter'; // may bill / serve
/* The back office — catalogue, tables, coupons, expenses, settings, wholesale.
   There is one panel login now, so this is simply the owner's. What stops the
   second man behind the counter wiping a record is not a role but the manager
   lock: see requireUnlocked() below. */
const isBackOffice = (r: Role | null) => r === 'admin';

// Columns that newer migrations added. When one of them hasn't been applied
// yet, PostgREST answers "Could not find the 'note' column of 'orders' in the
// schema cache" and refuses the whole row — so a customer typing a remark
// could not order at all. We drop the column it names and try again, which
// keeps the shop taking orders while the migration is still pending. Only
// these columns may be dropped: a missing core column is a real error.
const DROPPABLE: Record<string, string[]> = {
  orders: ['note', 'handed_over_at', 'delivery_fee', 'user_id', 'customer_name', 'customer_phone', 'customer_email', 'delivery_address'],
  bills: ['invoice_no', 'payload'],
  coupons: ['targeted_only', 'sent_phones'],
  menu_items: ['is_best_seller', 'sku', 'cost', 'stock', 'low_stock_threshold', 'weight_grams', 'variants'],
  // Columns added by the wholesale migration — if the owner hasn't re-run
  // supabase/wholesale.sql yet, save the row without them instead of failing.
  wholesale_products: ['cost_price'],
  wholesale_bills: ['discount', 'delivery_fee', 'delivery_partner', 'extra', 'gst_percent', 'gst_amount', 'payment', 'received', 'cash_amount', 'card_amount', 'biller'],
};

/** The column name out of a PostgREST "missing column" error, if that's what it is. */
function missingColumn(message: string): string | null {
  const m = /could not find the '([^']+)' column|column "?([\w.]+)"? does not exist/i.exec(message || '');
  if (!m) return null;
  const name = m[1] ?? m[2] ?? '';
  return name.includes('.') ? name.split('.').pop()! : name || null;
}

async function insertTolerant(sb: SupabaseClient, table: string, row: Values) {
  const droppable = DROPPABLE[table] ?? [];
  const payload: Values = { ...row };
  for (let attempt = 0; attempt <= droppable.length; attempt++) {
    const res = await sb.from(table).insert(payload);
    if (!res.error) return res;
    const col = missingColumn(res.error.message);
    if (!col || !droppable.includes(col) || !(col in payload)) return res;
    delete payload[col];
    console.warn(
      `[api/db] ${table}.${col} is missing from the database — saving without it. ` +
        'Apply the migrations in supabase/ (see docs/GO-LIVE.md) to stop losing this field.',
    );
  }
  return sb.from(table).insert(payload);
}

function assertKeys(obj: Values | undefined, allowed: string[], what: string) {
  for (const k of Object.keys(obj ?? {})) if (!allowed.includes(k)) throw bad(`Unknown ${what} field "${k}"`);
}

// ---- per-table handlers ----
type Ctx = {
  sb: SupabaseClient;
  role: Role | null;
  ip: string;
  /** The manager password was typed in this browser recently (ADMIN_LOCK_PASSWORD). */
  unlocked: boolean;
  /** Who is on the counter, from the signed biller cookie. Null = nobody. */
  biller: string | null;
};

/* The manager lock, server side.
   Deleting a record is not something the counter decides on its own, so every
   delete — and voiding a bill — needs the manager password to have been typed
   in that browser inside the last few minutes. The panel asks for it in a
   dialog before it calls us; this is what makes refusing it mean something,
   because a hand-written POST to /api/db gets the same answer. */
function requireUnlocked(ctx: Ctx, what: string): void {
  if (!ctx.unlocked) throw deny(`${what} needs the manager password.`);
}

async function backOfficeWrite(ctx: Ctx, table: string, op: Op, values: Values, match: Match) {
  if (!isBackOffice(ctx.role)) throw deny('Admin only');
  // insertTolerant drops any DROPPABLE column the database doesn't have yet, so
  // a pending migration degrades the row instead of rejecting it.
  if (op === 'insert') return insertTolerant(ctx.sb, table, values);
  const q = ctx.sb.from(table);
  if (Object.keys(match).length === 0) throw bad('match is required');
  /* Clearing a customer's special price deletes its row, but it is a price
     edit, not a record being wiped — the row is derived, deterministically
     keyed, and re-made the moment a price is typed again. It would be absurd
     to ask for the manager password to take an override off, so this one table
     is exempt. Everything else: password first. */
  if (op === 'delete' && table !== 'wholesale_prices') requireUnlocked(ctx, 'Deleting this');
  return op === 'update' ? q.update(values).match(match) : q.delete().match(match);
}

/* Wholesale bills are back-office rows like the rest, except for who signed
   them: the biller's name is stamped from the cookie, so the man at the
   counter cannot file a bill under the owner's name by editing the request. */
async function wholesaleBillsWrite(ctx: Ctx, op: Op, values: Values, match: Match) {
  if (op !== 'insert') return backOfficeWrite(ctx, 'wholesale_bills', op, values, match);
  if (!isBackOffice(ctx.role)) throw deny('Admin only');
  if (!ctx.biller) throw deny('Nobody is signed in as the biller. Pick your name and enter your password first.');
  return insertTolerant(ctx.sb, 'wholesale_bills', { ...values, biller: ctx.biller });
}

async function sessionsWrite(ctx: Ctx, op: Op, v: Values, match: Match) {
  const { sb, role } = ctx;
  if (op === 'delete') throw deny();
  if (op === 'insert') {
    throttle(`s:${ctx.ip}`);
    // 'delivery' used to fall through to 'table' here, which saved every
    // delivery as a dine-in with no table number and failed the insert.
    const mode =
      v.mode === 'standing' || v.mode === 'takeaway' || v.mode === 'delivery' ? v.mode : 'table';
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
  /* 'closed' is a tab being BILLED — the ordinary end of a sale, and it must
     never ask for a password. 'void' is a tab thrown away with no bill, which
     is a sale disappearing, so it needs the manager password like any other
     deletion. Only the admin panel ever sends it (Open tabs → Cancel tab). */
  if (v.status === 'void') requireUnlocked(ctx, 'Cancelling a tab');
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
    assertKeys(v, ['status', 'billed', 'priority', 'handed_over_at', 'note'], 'order');
    if (keys.length === 0) throw bad('Nothing to update');
    const mk = Object.keys(match);
    if (mk.length !== 1 || (mk[0] !== 'id' && mk[0] !== 'session_id')) throw bad('match must be { id } or { session_id }');
    if (!isStaff(role)) throw deny('Staff only');
    if (v.status !== undefined && !['pending', 'cooking', 'ready', 'served', 'cancelled'].includes(String(v.status))) throw bad('Invalid status');
    if ((v.billed !== undefined || mk[0] === 'session_id' || v.status === 'served' || v.status === 'cancelled') && !isFloor(role)) throw deny('Waiter or admin only');
    if (v.billed !== undefined && typeof v.billed !== 'boolean') throw bad('Invalid billed');
    if (v.handed_over_at !== undefined) {
      if (!isFloor(role)) throw deny('Waiter or admin only');
      if (v.handed_over_at !== null && typeof v.handed_over_at !== 'number') throw bad('Invalid handed_over_at');
    }
    if (v.note !== undefined && v.note !== null) {
      if (typeof v.note !== 'string') throw bad('Invalid note');
      v.note = v.note.slice(0, 300);
    }

    // Stock follows the order: it comes off the shelf when the ticket reaches
    // the kitchen, and goes back on if that ticket is then cancelled.
    //
    // The approve is done as ONE guarded write — update … where status =
    // 'awaiting_admin' … returning the rows — so two taps on Accept, or two
    // devices accepting at once, can only move the order once. Reading first
    // and writing after would let both callers see 'awaiting_admin' and take
    // the stock off twice, which is how stock ended up double-counted.
    const goingToKitchen = v.status === 'pending';
    const cancelling = v.status === 'cancelled';

    if (goingToKitchen) {
      const moved = await sb
        .from('orders')
        .update(v)
        .match(match)
        .eq('status', 'awaiting_admin')
        .select('id,items,session_id,source');
      if (moved.error) return moved;
      for (const o of moved.data ?? []) await applySaleForOrder(sb, o);
      // Anything the guard skipped (an order already past approval) still gets
      // the plain update, so moving a ticket back to 'pending' keeps working.
      if ((moved.data?.length ?? 0) > 0 && Object.keys(v).length === 1) return moved;
    }

    const affected = cancelling
      ? (await sb.from('orders').select('id,items,session_id,source,status').match(match)).data ?? []
      : [];

    const res = await sb.from('orders').update(v).match(match);
    if (!res.error && cancelling) {
      for (const o of affected) {
        // Declined before the kitchen ever saw it → no stock ever moved.
        if (o.status !== 'awaiting_admin') await reverseSaleForOrder(sb, o, 'Order cancelled');
      }
    }
    return res;
  }

  // insert
  const staff = isStaff(role);
  if (!staff) throttle(`o:${ctx.ip}`, 20);
  /* Online ordering can be switched off from the panel (Online orders → the
     website switch). With it off the website is a menu to look at: a customer
     cannot send an order, however they ask. Staff carry on billing and taking
     orders at the counter, which is the point of the switch. */
  if (!staff && !(await orderingEnabled(sb))) {
    throw deny('Online ordering is closed right now. Please order at the counter.');
  }
  // Who put this on the tab. It is printed on the ticket and shown as the
  // "added by" badge, so an admin's line must not be filed as the customer's.
  const claimed = v.source === 'waiter' || v.source === 'admin' ? v.source : 'customer';
  const source = claimed === 'admin' && role !== 'admin' ? 'customer' : claimed;
  if (source === 'waiter' && !isFloor(role)) throw deny('Waiter orders need a staff login');
  const mode =
    v.mode === 'standing' || v.mode === 'takeaway' || v.mode === 'delivery' ? v.mode : 'table';
  const id = str(v.id, 24, 'id');
  if (!/^TK-[A-Z0-9]{3,16}$/.test(id)) throw bad('Invalid id');

  const tableNumber = mode === 'table' ? int(v.table_number, 1, 999, 'table') : 0;
  if (mode === 'table') {
    const { data } = await sb.from('tables').select('number').eq('number', tableNumber).eq('active', true).maybeSingle();
    if (!data) throw bad('Unknown table');
  }

  // Who has to see it first depends on where the food is going. A guest in the
  // shop (dine-in or walk-in) goes straight to the chef — nobody should have to
  // approve an order from somebody sitting at a table. A takeaway or delivery
  // waits in the admin's queue. Staff orders never queue.
  const isHome = mode === 'takeaway' || mode === 'delivery';
  let status = source === 'customer' && isHome ? 'awaiting_admin' : 'pending';
  let billed = false;
  const allowedStatuses = ['awaiting_admin', 'pending', 'cooking', 'ready', 'served', 'cancelled'];
  if (role === 'admin') {
    if (v.status !== undefined) {
      if (!allowedStatuses.includes(String(v.status))) throw bad('Invalid status');
      status = String(v.status);
    }
    billed = v.billed === true;
  } else if (source === 'customer' && v.status !== undefined) {
    // A customer can only ask to queue, and only for a home order; any other
    // hint is ignored. Their dine-in order always goes straight to the chef.
    if (String(v.status) === 'awaiting_admin' && isHome) status = 'awaiting_admin';
  }
  const priority = staff && v.priority === 'high' ? 'high' : 'normal';

  // ---- items, prices and coupon: checked against the database, not the client ----
  const { items, subtotal, grams } = await priceItems(sb, v.items, { admin: role === 'admin' });
  const coupon = await checkCoupon(sb, v.coupon_code, subtotal, v.customer_phone);
  let discount = coupon?.discount ?? 0;

  // Delivery is charged on top of the goods, and it is priced HERE from the
  // area's weight brackets — never taken from the browser. Without this the
  // fee the customer agreed to never reached the order, so the tab, the bill
  // and the invoice were all short by the delivery charge.
  const addressArea =
    mode === 'delivery' && v.delivery_address && typeof v.delivery_address === 'object'
      ? (v.delivery_address as Record<string, unknown>).governorate ?? (v.delivery_address as Record<string, unknown>).area
      : null;
  let deliveryFee = mode === 'delivery' ? await feeForAreaName(sb, addressArea, grams) : 0;
  // An admin writing the order themselves may set the charge by hand.
  if (role === 'admin' && v.delivery_fee != null) deliveryFee = money(v.delivery_fee, 'delivery fee');

  let tax: number;
  let total: number;
  if (role === 'admin') {
    // Admin POS: manual discounts, delivery and tax-free sales are legitimate.
    if (v.discount != null) discount = Math.min(subtotal, money(v.discount, 'discount'));
    tax = v.tax != null ? Math.min(subtotal, money(v.tax, 'tax')) : round3((subtotal - discount) * TAX_RATE);
    total = v.total != null ? money(v.total, 'total') : round3(subtotal - discount + deliveryFee + tax);
  } else {
    tax = round3((subtotal - discount) * TAX_RATE);
    total = round3(subtotal - discount + deliveryFee + tax);
  }

  const sessionId = typeof v.session_id === 'string' && /^SN-[0-9]+-[0-9]+$/.test(v.session_id) ? v.session_id : null;

  // Customer identity + delivery address — carried from the browser so the
  // admin profile view, order history and WhatsApp dispatch can find the
  // shopper later. We trust name/phone/email as free text (short-capped) and
  // only store user_id when it looks like a real Supabase uuid; a demo id
  // like "demo-abc-123" would be rejected by the uuid column.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const userId = typeof v.user_id === 'string' && UUID_RE.test(v.user_id) ? v.user_id : null;
  const customerName  = typeof v.customer_name  === 'string' ? v.customer_name.slice(0, 80)  : null;
  const customerPhone = typeof v.customer_phone === 'string' ? v.customer_phone.slice(0, 24) : null;
  const customerEmail = typeof v.customer_email === 'string' ? v.customer_email.slice(0, 120) : null;
  const deliveryAddress = (mode === 'delivery' && v.delivery_address && typeof v.delivery_address === 'object')
    ? v.delivery_address
    : null;

  const row = {
    id, table_number: tableNumber, items, status, priority, subtotal, tax, total, source, mode,
    discount: discount > 0 ? round3(discount) : null,
    coupon_code: coupon?.code ?? null,
    delivery_fee: round3(deliveryFee),
    standing_label: typeof v.standing_label === 'string' ? v.standing_label.slice(0, 40) : null,
    session_id: sessionId, billed, created_at: Date.now(),
    // The customer's remark typed at checkout; staff screens all show it.
    note: typeof v.note === 'string' && v.note.trim() ? v.note.trim().slice(0, 300) : null,
    user_id: userId,
    customer_name: customerName,
    customer_phone: customerPhone,
    customer_email: customerEmail,
    delivery_address: deliveryAddress,
  };
  const res = await insertTolerant(sb, 'orders', row);
  if (!res.error && coupon) await consumeCoupon(sb, coupon);
  // Staff orders skip the approval queue, so they hit the kitchen immediately
  // and the stock comes off now. A customer order waits for the admin.
  if (!res.error && status !== 'awaiting_admin') {
    await applySaleForOrder(sb, { id, items: row.items, session_id: sessionId, source });
  }
  return res;
}

/** Delete a bill. The shop asked for one way out, not two: a bill is either
 *  in the records or it is gone. Deleting undoes the sale with it — the stock
 *  goes back on the shelf and any coupon use is given back.
 *
 *  (There used to be a "void" that kept the row marked dead. It confused the
 *  counter — two buttons, both final-looking — so the panel now deletes and
 *  nothing writes a void. Old rows already marked void still read correctly
 *  wherever bills are listed.) */
async function billDelete(ctx: Ctx, op: 'update' | 'delete', match: Match) {
  if (ctx.role !== 'admin') throw deny('Only the admin panel can delete a bill');
  if (op !== 'delete') throw bad('A bill can only be deleted, not edited');
  // Taking a bill back out of the records is the owner's decision, and the
  // manager password is how he makes it. Refused here as well as in the
  // panel, so calling this directly fails the same way.
  requireUnlocked(ctx, 'Deleting a bill');
  if (typeof match.id !== 'string' || Object.keys(match).length !== 1) throw bad('match must be { id }');
  const id = match.id;
  if (!/^BL-[A-Za-z0-9]+$/.test(id)) throw bad('Invalid id');
  const { data: row, error } = await ctx.sb
    .from('bills').select('id,session_id,coupon_code,payload').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, 'Bill lookup failed');
  if (!row) throw bad('That bill no longer exists');

  const stored = (row.payload && typeof row.payload === 'object' ? row.payload : null) as Record<string, unknown> | null;
  const wasVoid = stored?.status === 'void';
  const sessionId = (row.session_id as string | null) ?? null;
  const couponCode = (row.coupon_code as string | null) ?? (typeof stored?.couponCode === 'string' ? (stored.couponCode as string) : null);

  // A bill left over from the old void gave its stock and its coupon back at
  // the time, so deleting it now is only the paperwork — nothing is undone
  // twice.
  if (!wasVoid) {
    await reverseSaleForBill(ctx.sb, { id, sessionId }, 'Bill deleted');
    await releaseCoupon(ctx.sb, couponCode);
  }

  return ctx.sb.from('bills').delete().eq('id', id);
}

async function billsWrite(ctx: Ctx, op: Op, v: Values, match: Match) {
  if (op !== 'insert') return billDelete(ctx, op, match);
  if (!isFloor(ctx.role)) throw deny('Waiter or admin only');
  const id = str(v.id, 40, 'id');
  if (!/^BL-[A-Za-z0-9]+$/.test(id)) throw bad('Invalid id');
  const invoiceNo = typeof v.invoice_no === 'string' ? v.invoice_no.slice(0, 40) : null;
  /* Who billed it. Taken from the signed biller cookie and written OVER
     whatever the browser sent, which is the whole point: two people share the
     panel login, and neither of them can put a bill in the other's name.
     No biller signed in → no bill. The panel says so and asks for a name and
     password; refusing it here is what makes that more than a nag. */
  const biller = ctx.biller;
  if (ctx.role === 'admin' && !biller) {
    throw deny('Nobody is signed in as the biller. Pick your name and enter your password first.');
  }
  const payload: Record<string, unknown> | null =
    v.payload && typeof v.payload === 'object'
      ? { ...(v.payload as Record<string, unknown>), biller: biller ?? '' }
      : null;
  const sessionIdRaw = v.session_id;
  // The lines the bill actually charges for. A counter sale never becomes a
  // kitchen ticket, so this is the ONLY record that it left the shelf — the
  // stock has to come off here or it never comes off at all.
  const billLines = Array.isArray(payload?.items)
    ? (payload.items as { productId?: string | null; qty?: number | null }[])
    : [];
  // Counter walk-in bills have no session — trust the payload for amounts.
  if (sessionIdRaw === null || sessionIdRaw === undefined || sessionIdRaw === '') {
    const res = await insertTolerant(ctx.sb, 'bills', {
      id, session_id: null,
      subtotal: money(v.subtotal ?? 0, 'subtotal'),
      tax: money(v.tax ?? 0, 'tax'),
      discount: money(v.discount ?? 0, 'discount'),
      total: money(v.total ?? 0, 'total'),
      coupon_code: typeof v.coupon_code === 'string' ? v.coupon_code.slice(0, 40) : null,
      paid_method: typeof v.paid_method === 'string' ? v.paid_method.slice(0, 20) : null,
      invoice_no: invoiceNo,
      payload,
      created_at: Date.now(),
    });
    if (!res.error) await applySaleForBill(ctx.sb, { id, sessionId: null, items: billLines });
    return res;
  }
  const sessionId = str(sessionIdRaw, 60, 'session');
  // Amounts come from the session's real orders, not from the client.
  const { data: orders, error } = await ctx.sb
    .from('orders').select('subtotal,tax,discount,total,coupon_code').eq('session_id', sessionId);
  if (error) throw new HttpError(500, 'Order lookup failed');
  if (!orders || orders.length === 0) throw bad('Nothing to bill for this session');
  const sum = (k: 'subtotal' | 'tax' | 'discount' | 'total') => round3(orders.reduce((s, o) => s + (Number(o[k]) || 0), 0));
  const res = await insertTolerant(ctx.sb, 'bills', {
    id, session_id: sessionId,
    subtotal: sum('subtotal'), tax: sum('tax'), discount: sum('discount'), total: sum('total'),
    coupon_code: orders.find((o) => o.coupon_code)?.coupon_code ?? null,
    paid_method: typeof v.paid_method === 'string' ? v.paid_method.slice(0, 20) : null,
    invoice_no: invoiceNo,
    payload,
    created_at: Date.now(),
  });
  // The tickets already moved their own stock; this only catches lines the
  // admin typed straight onto the bill, which never were a ticket.
  if (!res.error) await applySaleForBill(ctx.sb, { id, sessionId, items: billLines });
  return res;
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
    // Both of these are signed cookies this server minted (/api/lock,
    // /api/biller), so neither can be set by hand in the browser.
    const [unlocked, biller] = await Promise.all([
      verifyLockToken(request.cookies.get(LOCK_COOKIE)?.value),
      verifyBillerToken(request.cookies.get(BILLER_COOKIE)?.value),
    ]);
    const ctx: Ctx = { sb, role, ip: clientIp(request), unlocked, biller };

    let result: { error: { message: string; code?: string } | null };
    switch (table) {
      case 'menu_items':
      case 'coupons':
      case 'tables':
      case 'app_settings':
      case 'expenses':
      case 'wholesale_products':
      case 'wholesale_customers':
      case 'wholesale_prices':
        result = await backOfficeWrite(ctx, table, op, values, match);
        break;
      case 'wholesale_bills': result = await wholesaleBillsWrite(ctx, op, values, match); break;
      case 'sessions': result = await sessionsWrite(ctx, op, values, match); break;
      case 'orders': result = await ordersWrite(ctx, op, values, match); break;
      case 'bills': result = await billsWrite(ctx, op, values, match); break;
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
