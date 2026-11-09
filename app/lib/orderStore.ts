"use client";

// Orders — Supabase + Realtime backed. Public API is unchanged from the old
// localStorage version, so every role's UI works without edits. Line items are
// stored as JSONB (the OrderItem[] shape). Writes are optimistic; the Realtime
// echo reconciles all devices.
//
// Orders are tied to a Session (guest tab): the first order at an empty table
// opens one, later orders reuse it, and billing settles it (see sessionStore /
// billStore). The order-derived session helpers below are kept for the waiter
// UI, which groups un-billed orders by sessionId.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';
import {
  getOpenSessionForTable,
  getOpenStandingSession,
  openSession,
  closeSession,
  settleSessionId,
} from './sessionStore';
import { createBill, getIssuedInvoiceNumbers } from './billStore';
import { issueInvoiceNumber } from './invoice';

// Order lifecycle — the same five steps for everybody, with ONE fork at the
// start depending on where the food is going:
//
//   dine-in / walk-in   pending → cooking → ready → served
//                       The guest is sitting in the shop, so their order goes
//                       straight to the chef. No approval, no waiting.
//
//   takeaway / delivery awaiting_admin → pending → cooking → ready → served
//                       Nobody is in the shop, so the admin accepts it first;
//                       only then does the chef see it. After it is cooked the
//                       ADMIN bills it, and only then can the waiter hand it
//                       over — which is what 'served' means for a home order.
//
//   cancelled           the admin declined or killed it. It never reaches the
//                       chef, and the customer sees it as cancelled.
//
// Chef dashboards filter out 'awaiting_admin' and 'cancelled', so an unapproved
// or dead ticket can never reach the kitchen.
export type OrderStatus = 'awaiting_admin' | 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

/** Takeaway and delivery — nobody is sitting in the shop. */
export function isHomeMode(mode: OrderMode | undefined): boolean {
  return mode === 'takeaway' || mode === 'delivery';
}

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

/** Where the order is served. 'table' = seated dine-in (uses `table`),
 *  'standing' = walk-in eating in but not at a table, 'takeaway' = to-go
 *  (customer picks up at the shop), 'delivery' = we bring it to their address
 *  (handled by /api/delivery/*, not the waiter). */
export type OrderMode = 'table' | 'standing' | 'takeaway' | 'delivery';

/** Structured Kuwait address, carried on delivery orders. */
export interface DeliveryAddress {
  governorate: string;   // e.g. "Hawalli", "Salmiya"
  area: string;          // e.g. "Block 10"
  street: string;        // required
  avenue?: string;
  building: string;      // house / building number
  floor?: string;
  apartment?: string;
  landmark?: string;     // free-text hint for the driver
}

/** Lightweight customer identity captured at checkout — present on
 *  takeaway/delivery orders and on dine-in orders placed after sign-in. */
export interface CustomerInfo {
  userId?: string;    // Supabase auth user id, when signed in
  name?: string;
  phone?: string;     // required for takeaway/delivery (how the shop reaches them)
  email?: string;
}

export interface Order {
  id: string;
  table: number;
  items: OrderItem[];
  status: OrderStatus;
  priority: 'normal' | 'high';
  subtotal: number;
  tax: number;
  total: number;
  createdAt: number;
  source: 'customer' | 'waiter' | 'admin';
  mode?: OrderMode; // undefined on legacy orders → treated as 'table'
  discount?: number;   // coupon/manual discount applied (KD)
  couponCode?: string; // coupon used, if any
  /** Delivery charge added on top of the goods (delivery mode only). Priced by
   *  the server from the area's weight brackets, so it is on the order itself
   *  and every screen — tab, bill, invoice, history — can show it. */
  deliveryFee?: number;
  standingLabel?: string; // optional name/tag distinguishing walk-in parties (mode === 'standing')
  sessionId?: string;  // groups multiple orders into one dining session
  billed?: boolean;    // true after waiter closes the bill — only billed orders show in admin analytics
  customer?: CustomerInfo;        // signed-in customer / contact details
  deliveryAddress?: DeliveryAddress; // present when mode === 'delivery'
  note?: string;       // the customer's remark typed at checkout
  handedOverAt?: number; // takeaway handed to the customer / delivery given to the driver
}

/** Human label for where an order goes — used by every role's UI. */
export function orderLabel(o: Pick<Order, 'mode' | 'table' | 'standingLabel'>): string {
  if (o.mode === 'standing') return o.standingLabel ? `Standing · ${o.standingLabel}` : 'Standing';
  if (o.mode === 'takeaway') return 'Takeaway';
  if (o.mode === 'delivery') return 'Delivery';
  return `Table ${o.table}`;
}

function fromRow(r: Record<string, unknown>): Order {
  const customer: CustomerInfo | undefined =
    (r.user_id || r.customer_name || r.customer_phone || r.customer_email)
      ? {
          userId: (r.user_id as string) ?? undefined,
          name: (r.customer_name as string) ?? undefined,
          phone: (r.customer_phone as string) ?? undefined,
          email: (r.customer_email as string) ?? undefined,
        }
      : undefined;
  const deliveryAddress =
    r.delivery_address && typeof r.delivery_address === 'object'
      ? (r.delivery_address as DeliveryAddress)
      : undefined;
  const mode = (r.mode as OrderMode) ?? 'table';
  // Dine-in and walk-in orders go straight to the chef. Rows written before
  // that rule existed are sitting in 'awaiting_admin' with nobody to approve
  // them — no screen lists them, so they would hang for ever. Read them as
  // what they are: tickets for the kitchen.
  const rawStatus = (r.status as OrderStatus) ?? 'pending';
  const status: OrderStatus =
    rawStatus === 'awaiting_admin' && !isHomeMode(mode) ? 'pending' : rawStatus;
  return {
    id: r.id as string,
    table: Number(r.table_number ?? 0),
    items: Array.isArray(r.items) ? (r.items as OrderItem[]) : [],
    status,
    priority: (r.priority as Order['priority']) ?? 'normal',
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    createdAt: Number(r.created_at),
    source: (r.source as Order['source']) ?? 'customer',
    mode,
    discount: r.discount == null ? undefined : Number(r.discount),
    couponCode: (r.coupon_code as string) ?? undefined,
    deliveryFee: r.delivery_fee == null ? undefined : Number(r.delivery_fee),
    standingLabel: (r.standing_label as string) ?? undefined,
    sessionId: (r.session_id as string) ?? undefined,
    billed: (r.billed as boolean) ?? false,
    customer,
    deliveryAddress,
    note: (r.note as string) || undefined,
    handedOverAt: r.handed_over_at == null ? undefined : Number(r.handed_over_at),
  };
}

function toRow(o: Order): Record<string, unknown> {
  return {
    id: o.id,
    table_number: o.table,
    items: o.items,
    status: o.status,
    priority: o.priority,
    subtotal: o.subtotal,
    tax: o.tax,
    total: o.total,
    source: o.source,
    mode: o.mode ?? 'table',
    discount: o.discount ?? null,
    coupon_code: o.couponCode ?? null,
    delivery_fee: o.deliveryFee ?? 0,
    standing_label: o.standingLabel ?? null,
    session_id: o.sessionId ?? null,
    billed: o.billed ?? false,
    user_id: o.customer?.userId ?? null,
    customer_name: o.customer?.name ?? null,
    customer_phone: o.customer?.phone ?? null,
    customer_email: o.customer?.email ?? null,
    delivery_address: o.deliveryAddress ?? null,
    note: o.note ?? null,
    created_at: o.createdAt,
  };
}

const store = createRealtimeStore<Order>({ table: 'orders', fromRow });

export function getOrders(): Order[] {
  store.ensureHydrated();
  return [...store.get()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Stable snapshot for useSyncExternalStore. */
export function getOrdersSnapshot(): Order[] {
  return store.getSnapshot();
}

export function getOrdersServerSnapshot(): Order[] {
  return store.getServerSnapshot();
}

export function getActiveOrdersForTable(table: number): Order[] {
  store.ensureHydrated();
  return store.get().filter((o) => o.table === table && o.status !== 'served');
}

/** Find the active (un-billed) session ID for a table or standing label. */
export function getActiveSessionId(table: number, mode?: OrderMode, standingLabel?: string): string | undefined {
  const orders = store.get();
  const active = orders.find((o) => {
    if (o.billed || !o.sessionId) return false;
    const m = o.mode || 'table';
    if (mode === 'standing') return m === 'standing' && o.standingLabel === standingLabel;
    if (mode === 'takeaway') return false; // takeaway doesn't reuse sessions
    return o.table === table && m === 'table';
  });
  return active?.sessionId;
}

/** List active (un-billed) standing customer sessions for the waiter to resume. */
export function getActiveStandingSessions(orders: Order[]): { sessionId: string; label: string; orderCount: number; total: number }[] {
  const sessions = new Map<string, { label: string; count: number; total: number }>();
  for (const o of orders) {
    if ((o.mode === 'standing') && !o.billed && o.sessionId) {
      const cur = sessions.get(o.sessionId);
      if (cur) { cur.count++; cur.total += o.total; }
      else sessions.set(o.sessionId, { label: o.standingLabel || 'Standing', count: 1, total: o.total });
    }
  }
  return Array.from(sessions.entries()).map(([sessionId, v]) => ({ sessionId, label: v.label, orderCount: v.count, total: v.total }));
}

/** Get all orders belonging to a session (for billing). */
export function getSessionOrders(orders: Order[], sessionId: string): Order[] {
  return orders.filter((o) => o.sessionId === sessionId);
}

/** A customer's live, un-billed dine-in tab (one open bill they keep adding to). */
export interface UserOpenTab {
  sessionId: string;
  table: number;
  orders: Order[];     // oldest first
  subtotal: number;
  total: number;
  billRequested: boolean;
}

/** Find the signed-in customer's open dine-in tab, if any.
 *
 *  The tab is keyed to the *account*, not the table: we look for the customer's
 *  own un-billed dine-in orders that still sit on an OPEN session. This is what
 *  lets "order again" re-attach to the same bill without re-picking a table, and
 *  what powers the "add to your current bill?" prompt at checkout. A tab stays
 *  live until the admin closes it (which bills the orders and closes the
 *  session), at which point it drops out of here and becomes order history. */
export function getUserOpenDineInTab(
  orders: Order[],
  openDineInSessions: { id: string; tableNumber: number | null; billRequestedAt?: number | null }[],
  user: { id?: string | null; email?: string | null } | null | undefined,
): UserOpenTab | null {
  if (!user || (!user.id && !user.email)) return null;
  const openById = new Map(openDineInSessions.map((s) => [s.id, s]));
  const mine = orders.filter((o) => {
    if (o.billed || (o.mode ?? 'table') !== 'table' || !o.sessionId) return false;
    if (!openById.has(o.sessionId)) return false;
    if (user.id && o.customer?.userId && o.customer.userId === user.id) return true;
    if (user.email && o.customer?.email && o.customer.email === user.email) return true;
    return false;
  });
  if (mine.length === 0) return null;
  // The customer's most recently touched open tab wins (there should be only one).
  const sessionId = mine.reduce((a, b) => (b.createdAt > a.createdAt ? b : a)).sessionId!;
  const sess = openById.get(sessionId)!;
  const tabOrders = orders
    .filter((o) => o.sessionId === sessionId && !o.billed)
    .sort((a, b) => a.createdAt - b.createdAt);
  return {
    sessionId,
    table: sess.tableNumber ?? tabOrders[0]?.table ?? 0,
    orders: tabOrders,
    subtotal: tabOrders.reduce((s, o) => s + o.subtotal, 0),
    total: tabOrders.reduce((s, o) => s + o.total, 0),
    billRequested: !!sess.billRequestedAt,
  };
}

/** Mark all orders in a session as billed and served, write a Bill, and close the Session. */
export function billSession(sessionId: string, paidMethod?: string) {
  const sessionOrders = store.get().filter((o) => o.sessionId === sessionId);
  const totals = sessionOrders.reduce(
    (acc, o) => {
      acc.subtotal += o.subtotal;
      acc.tax += o.tax;
      acc.discount += o.discount ?? 0;
      acc.total += o.total;
      return acc;
    },
    { subtotal: 0, tax: 0, discount: 0, total: 0 }
  );
  const couponCode = sessionOrders.find((o) => o.couponCode)?.couponCode ?? null;

  // Optimistic: flip the orders locally.
  store.patchLocal((cur) =>
    cur.map((o) => (o.sessionId === sessionId ? { ...o, billed: true, status: 'served' as OrderStatus } : o))
  );

  void write({
    table: 'orders',
    op: 'update',
    values: { billed: true, status: 'served' },
    match: { session_id: sessionId },
  }).then(({ error }) => {
    if (error) console.error('[orders] bill failed', error.message);
  });

  // Record the bill and close the guest tab. The invoice number is derived
  // from the SESSION, not the new bill id, so it matches the number the
  // customer was already shown as their order number before we settled.
  const bill = createBill({
    sessionId,
    ...totals,
    couponCode,
    paidMethod: paidMethod ?? null,
    invoiceNo: issueInvoiceNumber(sessionId, getIssuedInvoiceNumbers()),
  });
  closeSession(sessionId, bill.id);
}

/** Resolve (or open) the session an order belongs to, honoring an explicit id. */
function resolveSessionId(input: {
  table: number;
  mode: OrderMode;
  standingLabel?: string;
  sessionId?: string;
  customerName?: string | null;
  customerPhone?: string | null;
}): string {
  if (input.sessionId) return input.sessionId;
  if (input.mode === 'standing') {
    const label = input.standingLabel ?? '';
    return (getOpenStandingSession(label)?.id
      ?? openSession({ tableNumber: null, mode: 'standing', standingLabel: label }).id);
  }
  if (input.mode === 'takeaway' || input.mode === 'delivery') {
    // One home order, one session, one bill — never reused. The session keeps
    // the order's own mode so the admin and waiter boards can tell a takeaway
    // apart from a delivery (they used to both be filed as 'takeaway', which
    // is why deliveries went missing from the delivery board).
    return openSession({
      tableNumber: null,
      mode: input.mode,
      customerName: input.customerName ?? undefined,
      customerPhone: input.customerPhone ?? undefined,
    }).id;
  }
  // dine-in — stamp the opener's name/phone on the new tab so staff see who's seated.
  return (getOpenSessionForTable(input.table)?.id
    ?? openSession({
      tableNumber: input.table,
      mode: 'table',
      customerName: input.customerName ?? undefined,
      customerPhone: input.customerPhone ?? undefined,
    }).id);
}

/** Collision-safe ticket id (a random 4-digit number clashed after ~100 orders). */
function newOrderId(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return `TK-${stamp}${rand}`;
}

export function addOrder(input: {
  table: number;
  items: OrderItem[];
  priority: 'normal' | 'high';
  subtotal: number;
  tax: number;
  total: number;
  source: 'customer' | 'waiter' | 'admin';
  mode?: OrderMode;
  discount?: number;
  couponCode?: string;
  /** Delivery charge (delivery mode). The server re-prices it from the area. */
  deliveryFee?: number;
  status?: OrderStatus;
  standingLabel?: string;
  sessionId?: string;
  /** Admin POS: the sale is paid on the spot, so bill and close it as soon as it is saved. */
  billImmediately?: boolean;
  /** Payment method recorded on the bill when billImmediately (e.g. 'cash' | 'card' | 'upi'). */
  paidMethod?: string;
  customer?: CustomerInfo;
  deliveryAddress?: DeliveryAddress;
  /** The customer's remark ("no sugar", "call before you come"). */
  note?: string;
}): Order {
  const mode = input.mode ?? 'table';
  const sessionId = resolveSessionId({
    table: input.table,
    mode,
    standingLabel: input.standingLabel,
    sessionId: input.sessionId,
    customerName: input.customer?.name,
    customerPhone: input.customer?.phone,
  });
  // Where it goes decides whether anybody has to approve it. A guest sitting
  // at a table (or standing at the counter) is already in the shop, so their
  // order goes straight to the chef. A takeaway or delivery waits for the
  // admin to accept it. Staff-placed orders never queue.
  const defaultStatus: OrderStatus =
    input.source === 'waiter' || !isHomeMode(mode) ? 'pending' : 'awaiting_admin';
  const newOrder: Order = {
    id: newOrderId(),
    table: input.table,
    items: input.items,
    status: input.status ?? defaultStatus,
    priority: input.priority,
    subtotal: input.subtotal,
    tax: input.tax,
    total: input.total,
    createdAt: Date.now(),
    source: input.source,
    mode,
    discount: input.discount,
    couponCode: input.couponCode,
    deliveryFee: input.deliveryFee,
    standingLabel: input.standingLabel,
    sessionId,
    customer: input.customer,
    deliveryAddress: input.deliveryAddress,
    note: input.note?.trim() || undefined,
  };
  store.patchLocal((cur) => [newOrder, ...cur]);
  void settleSessionId(sessionId).then((finalId) => {
    if (finalId !== sessionId) {
      // Session was de-duplicated against an already-open one for this table.
      store.patchLocal((cur) => cur.map((o) => (o.id === newOrder.id ? { ...o, sessionId: finalId } : o)));
    }
    const row = toRow({ ...newOrder, sessionId: finalId });
    return insertOrderRow(row).then(({ error }) => {
      if (error) {
        console.error('[orders] add failed', error.message);
        // The server refused it (or it never arrived): drop the optimistic copy.
        store.patchLocal((cur) => cur.filter((o) => o.id !== newOrder.id));
        return;
      }
      // Settle only once the order row exists, so the bill can see it.
      if (input.billImmediately) billSession(finalId, input.paidMethod);
    });
  });
  return newOrder;
}

// Columns the new customer-ordering flow added. If the live DB hasn't had the
// migration applied yet, Supabase rejects the whole insert with "Unknown
// column field ...". When we hit that, we retry once with those keys stripped
// so the order still lands (minus the customer identity it couldn't persist).
const OPTIONAL_ORDER_COLUMNS = ['user_id', 'customer_name', 'customer_phone', 'customer_email', 'delivery_address', 'note', 'delivery_fee'] as const;
let orderSchemaIsLegacy = false;

async function insertOrderRow(row: Record<string, unknown>) {
  const payload = orderSchemaIsLegacy ? stripLegacyColumns(row) : row;
  const result = await write({ table: 'orders', op: 'insert', values: payload });
  if (result.error && /unknown column|column .*? does not exist|could not find the .* column|schema cache/i.test(result.error.message || '')) {
    orderSchemaIsLegacy = true;
    console.warn(
      '[orders] your Supabase orders table is missing the newer columns. Apply ' +
      'supabase/add_customer_columns.sql and supabase/order_notes_handover.sql in the ' +
      'Supabase SQL editor to keep customer identity, delivery addresses and remarks ' +
      'with each order.'
    );
    return write({ table: 'orders', op: 'insert', values: stripLegacyColumns(row) });
  }
  return result;
}

function stripLegacyColumns(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...row };
  for (const k of OPTIONAL_ORDER_COLUMNS) delete clean[k];
  return clean;
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  // Takeaway and delivery used to self-bill the moment they were marked
  // served, which minted an invoice behind the admin's back. They now follow
  // the same path as a table: the admin settles them in Billing, and that is
  // what mints the invoice number and sends it to the customer.
  store.patchLocal((cur) => cur.map((o) => (o.id === id ? { ...o, status } : o)));
  void write({ table: 'orders', op: 'update', values: { status }, match: { id } }).then(({ error }) => {
    if (error) console.error('[orders] status update failed', error.message);
  });
}

/** Admin approves an order sitting in the Incoming queue → chef sees it. */
export function approveOrder(id: string) {
  updateOrderStatus(id, 'pending');
}

/** Admin declines or kills an order. It is marked cancelled — not quietly
 *  "served" — so the customer sees the truth in their order history and the
 *  stock it reserved goes back on the shelf. */
export function rejectOrder(id: string) {
  updateOrderStatus(id, 'cancelled');
}

/** Replace the items on an open order (admin-side edit of a dine-in ticket).
 *  Totals are recomputed; discount/coupon are preserved. */
export function updateOrderItems(id: string, items: OrderItem[]) {
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  store.patchLocal((cur) => cur.map((o) => {
    if (o.id !== id) return o;
    const discount = o.discount ?? 0;
    const taxable = Math.max(0, subtotal - discount);
    const tax = taxable * 0.1;
    const total = taxable + tax;
    return { ...o, items, subtotal, tax, total };
  }));
  const o = store.get().find((x) => x.id === id);
  if (o) void write({
    table: 'orders',
    op: 'update',
    values: { items: o.items, subtotal: o.subtotal, tax: o.tax, total: o.total },
    match: { id },
  }).then(({ error }) => {
    if (error) console.error('[orders] items update failed', error);
  });
}

/**
 * Flip every order on a session to billed + served, without writing a bill.
 *
 * The admin POS mints its own (much richer) bill row, so it must not go through
 * billSession — but it still has to close the orders out, or the ticket stays
 * "un-billed" forever and keeps showing up on the online-orders queue, the open
 * tabs and the waiter's board. That was the bug.
 */
export function markSessionBilled(sessionId: string) {
  if (!sessionId) return;
  // Billing does NOT mean the food reached anybody. The status stays where the
  // kitchen left it, so 'served' keeps its one meaning: the guest has it. For
  // a takeaway or delivery that is the hand-over, which happens after this.
  store.patchLocal((cur) => cur.map((o) => (o.sessionId === sessionId ? { ...o, billed: true } : o)));
  void write({
    table: 'orders',
    op: 'update',
    values: { billed: true },
    match: { session_id: sessionId },
  }).then(({ error }) => {
    if (error) console.error('[orders] mark billed failed', error.message);
  });
}

/** Kill every live ticket on a session — the admin cancelling the whole tab.
 *  Already-billed tickets are left alone: that money was taken. */
export function cancelSession(sessionId: string) {
  if (!sessionId) return;
  const live = store.get().filter((o) => o.sessionId === sessionId && !o.billed && o.status !== 'cancelled');
  if (live.length === 0) return;
  store.patchLocal((cur) =>
    cur.map((o) => (live.some((x) => x.id === o.id) ? { ...o, status: 'cancelled' as OrderStatus } : o)),
  );
  for (const o of live) {
    void write({ table: 'orders', op: 'update', values: { status: 'cancelled' }, match: { id: o.id } }).then(({ error }) => {
      if (error) console.error('[orders] cancel failed', error.message);
    });
  }
}

/** Waiter handed the takeaway to the customer / gave the delivery to the driver. */
export function markHandedOver(sessionId: string) {
  if (!sessionId) return;
  const at = Date.now();
  store.patchLocal((cur) =>
    cur.map((o) => (o.sessionId === sessionId ? { ...o, handedOverAt: at, status: 'served' as OrderStatus } : o)),
  );
  void write({
    table: 'orders',
    op: 'update',
    values: { handed_over_at: at, status: 'served' },
    match: { session_id: sessionId },
  }).then(({ error }) => {
    if (!error) return;
    if (/handed_over_at|schema cache|does not exist|unknown/i.test(error.message)) {
      console.warn(
        '[orders] no handed_over_at column yet — apply supabase/order_notes_handover.sql so a ' +
          'handed-over order stops showing on the waiter board.',
      );
      void write({ table: 'orders', op: 'update', values: { status: 'served' }, match: { session_id: sessionId } });
      return;
    }
    console.error('[orders] handover failed', error.message);
  });
}

export function subscribeToOrders(callback: () => void): () => void {
  return store.subscribe(callback);
}
