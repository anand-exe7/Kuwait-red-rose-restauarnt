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
import { createBill } from './billStore';

export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

/** Where the order is served. 'table' = seated dine-in (uses `table`),
 *  'standing' = walk-in eating in but not at a table, 'takeaway' = to-go. */
export type OrderMode = 'table' | 'standing' | 'takeaway';

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
  source: 'customer' | 'waiter';
  mode?: OrderMode; // undefined on legacy orders → treated as 'table'
  discount?: number;   // coupon/manual discount applied (KD)
  couponCode?: string; // coupon used, if any
  standingLabel?: string; // optional name/tag distinguishing walk-in parties (mode === 'standing')
  sessionId?: string;  // groups multiple orders into one dining session
  billed?: boolean;    // true after waiter closes the bill — only billed orders show in admin analytics
}

/** Human label for where an order goes — used by every role's UI. */
export function orderLabel(o: Pick<Order, 'mode' | 'table' | 'standingLabel'>): string {
  if (o.mode === 'standing') return o.standingLabel ? `Standing · ${o.standingLabel}` : 'Standing';
  if (o.mode === 'takeaway') return 'Takeaway';
  return `Table ${o.table}`;
}

function fromRow(r: Record<string, unknown>): Order {
  return {
    id: r.id as string,
    table: Number(r.table_number ?? 0),
    items: Array.isArray(r.items) ? (r.items as OrderItem[]) : [],
    status: (r.status as OrderStatus) ?? 'pending',
    priority: (r.priority as Order['priority']) ?? 'normal',
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    total: Number(r.total),
    createdAt: Number(r.created_at),
    source: (r.source as Order['source']) ?? 'customer',
    mode: (r.mode as OrderMode) ?? 'table',
    discount: r.discount == null ? undefined : Number(r.discount),
    couponCode: (r.coupon_code as string) ?? undefined,
    standingLabel: (r.standing_label as string) ?? undefined,
    sessionId: (r.session_id as string) ?? undefined,
    billed: (r.billed as boolean) ?? false,
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
    standing_label: o.standingLabel ?? null,
    session_id: o.sessionId ?? null,
    billed: o.billed ?? false,
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

/** Mark all orders in a session as billed and served, write a Bill, and close the Session. */
export function billSession(sessionId: string) {
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

  // Record the bill and close the guest tab.
  const bill = createBill({ sessionId, ...totals, couponCode });
  closeSession(sessionId, bill.id);
}

/** Resolve (or open) the session an order belongs to, honoring an explicit id. */
function resolveSessionId(input: {
  table: number;
  mode: OrderMode;
  standingLabel?: string;
  sessionId?: string;
}): string {
  if (input.sessionId) return input.sessionId;
  if (input.mode === 'standing') {
    const label = input.standingLabel ?? '';
    return (getOpenStandingSession(label)?.id
      ?? openSession({ tableNumber: null, mode: 'standing', standingLabel: label }).id);
  }
  if (input.mode === 'takeaway') {
    return openSession({ tableNumber: null, mode: 'takeaway' }).id;
  }
  // dine-in
  return (getOpenSessionForTable(input.table)?.id
    ?? openSession({ tableNumber: input.table, mode: 'table' }).id);
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
  source: 'customer' | 'waiter';
  mode?: OrderMode;
  discount?: number;
  couponCode?: string;
  status?: OrderStatus;
  standingLabel?: string;
  sessionId?: string;
  /** Admin POS: the sale is paid on the spot, so bill and close it as soon as it is saved. */
  billImmediately?: boolean;
}): Order {
  const mode = input.mode ?? 'table';
  const sessionId = resolveSessionId({ table: input.table, mode, standingLabel: input.standingLabel, sessionId: input.sessionId });
  const newOrder: Order = {
    id: newOrderId(),
    table: input.table,
    items: input.items,
    status: input.status ?? 'pending',
    priority: input.priority,
    subtotal: input.subtotal,
    tax: input.tax,
    total: input.total,
    createdAt: Date.now(),
    source: input.source,
    mode,
    discount: input.discount,
    couponCode: input.couponCode,
    standingLabel: input.standingLabel,
    sessionId,
  };
  store.patchLocal((cur) => [newOrder, ...cur]);
  void settleSessionId(sessionId).then((finalId) => {
    if (finalId !== sessionId) {
      // Session was de-duplicated against an already-open one for this table.
      store.patchLocal((cur) => cur.map((o) => (o.id === newOrder.id ? { ...o, sessionId: finalId } : o)));
    }
    return write({ table: 'orders', op: 'insert', values: toRow({ ...newOrder, sessionId: finalId }) }).then(({ error }) => {
      if (error) {
        console.error('[orders] add failed', error.message);
        // The server refused it (or it never arrived): drop the optimistic copy.
        store.patchLocal((cur) => cur.filter((o) => o.id !== newOrder.id));
        return;
      }
      // Settle only once the order row exists, so the bill can see it.
      if (input.billImmediately) billSession(finalId);
    });
  });
  return newOrder;
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  const order = store.get().find((o) => o.id === id);
  // Takeaway has no table tab to settle later: once it is handed over it is
  // paid, so serve = bill + close the session.
  if (status === 'served' && order?.mode === 'takeaway' && order.sessionId && !order.billed) {
    billSession(order.sessionId);
    return;
  }
  store.patchLocal((cur) => cur.map((o) => (o.id === id ? { ...o, status } : o)));
  void write({ table: 'orders', op: 'update', values: { status }, match: { id } }).then(({ error }) => {
    if (error) console.error('[orders] status update failed', error.message);
  });
}

export function subscribeToOrders(callback: () => void): () => void {
  return store.subscribe(callback);
}
