"use client";

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

const STORAGE_KEY = 'cenexa_orders_v1';
const EVENT_NAME = 'cenexa-orders-updated';
const EMPTY_ORDERS: Order[] = [];

// Cache keyed on the raw localStorage string so useSyncExternalStore gets a
// stable array reference when nothing has actually changed (required to
// avoid an infinite re-render loop).
let cachedRaw: string | null | undefined;
let cachedOrders: Order[] = EMPTY_ORDERS;

function readOrders(): Order[] {
  if (typeof window === 'undefined') return EMPTY_ORDERS;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY_ORDERS;
  }
  if (raw === cachedRaw) return cachedOrders;
  cachedRaw = raw;
  try {
    cachedOrders = raw ? JSON.parse(raw) : EMPTY_ORDERS;
  } catch {
    cachedOrders = EMPTY_ORDERS;
  }
  return cachedOrders;
}

function writeOrders(orders: Order[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getOrders(): Order[] {
  return [...readOrders()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Stable snapshot for useSyncExternalStore — sorted newest-first, cached until the store changes. */
export function getOrdersSnapshot(): Order[] {
  return readOrders();
}

export function getOrdersServerSnapshot(): Order[] {
  return EMPTY_ORDERS;
}

export function getActiveOrdersForTable(table: number): Order[] {
  return readOrders().filter(o => o.table === table && o.status !== 'served');
}

/** Find the active (un-billed) session ID for a table or standing label. */
export function getActiveSessionId(table: number, mode?: OrderMode, standingLabel?: string): string | undefined {
  const orders = readOrders();
  const active = orders.find(o => {
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
  return orders.filter(o => o.sessionId === sessionId);
}

/** Mark all orders in a session as billed and served. */
export function billSession(sessionId: string) {
  const orders = readOrders().map(o =>
    o.sessionId === sessionId ? { ...o, billed: true, status: 'served' as OrderStatus } : o
  );
  writeOrders(orders);
}

function generateSessionId(): string {
  return `SN-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
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
}): Order {
  const orders = readOrders();
  const mode = input.mode ?? 'table';
  let sessionId = input.sessionId;
  if (!sessionId) {
    const existing = orders.find(o => {
      if (o.billed || !o.sessionId) return false;
      const m = o.mode || 'table';
      if (mode === 'standing') return m === 'standing' && o.standingLabel === input.standingLabel;
      if (mode === 'takeaway') return false;
      return o.table === input.table && m === 'table';
    });
    sessionId = existing?.sessionId || generateSessionId();
  }
  const newOrder: Order = {
    id: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
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
  writeOrders([newOrder, ...orders]);
  return newOrder;
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  const orders = readOrders().map(o => (o.id === id ? { ...o, status } : o));
  writeOrders(orders);
}

export function subscribeToOrders(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener('storage', handler);
  window.addEventListener(EVENT_NAME, handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener(EVENT_NAME, handler);
  };
}
