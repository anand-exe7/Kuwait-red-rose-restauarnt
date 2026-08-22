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
}

/** Human label for where an order goes — used by every role's UI. */
export function orderLabel(o: Pick<Order, 'mode' | 'table'>): string {
  if (o.mode === 'standing') return 'Standing';
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
}): Order {
  const orders = readOrders();
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
    mode: input.mode ?? 'table',
    discount: input.discount,
    couponCode: input.couponCode,
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
