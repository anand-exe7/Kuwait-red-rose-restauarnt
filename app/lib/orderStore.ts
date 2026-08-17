"use client";

export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
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
  source: 'customer' | 'waiter';
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
}): Order {
  const orders = readOrders();
  const newOrder: Order = {
    id: `TK-${Math.floor(1000 + Math.random() * 9000)}`,
    table: input.table,
    items: input.items,
    status: 'pending',
    priority: input.priority,
    subtotal: input.subtotal,
    tax: input.tax,
    total: input.total,
    createdAt: Date.now(),
    source: input.source,
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
