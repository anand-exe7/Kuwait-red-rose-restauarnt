// Shared period-filtering used by both the Orders table and the Analytics
// tabs — kept out of either component file so neither has to import the other.

import type { Order, OrderItem } from '../lib/orderStore';

export type Period = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

/** One settled bill. A dine-in table session can hold several orders (the guest
 *  ordered more than once on the same tab) — those are ONE invoice, not many.
 *  Takeaway / delivery / counter sales are one order each, so one invoice each. */
export interface Invoice {
  key: string;            // sessionId when present, else the order id
  sessionId?: string;     // set when the invoice maps to a receipt page
  orders: Order[];        // every order folded into this bill (oldest first)
  items: OrderItem[];     // line items merged across those orders
  subtotal: number;
  discount: number;
  total: number;
  itemCount: number;
  source: 'customer' | 'waiter';
  createdAt: number;      // the most recent order on the bill
  table: number;
  mode: Order['mode'];
  standingLabel?: string;
  couponCode?: string;
}

/** Fold orders into invoices by their session (table tab). Orders with no
 *  session each stand alone. */
export function groupOrdersIntoInvoices(orders: Order[]): Invoice[] {
  const groups = new Map<string, Order[]>();
  for (const o of orders) {
    const key = o.sessionId || o.id;
    const arr = groups.get(key);
    if (arr) arr.push(o);
    else groups.set(key, [o]);
  }

  const invoices: Invoice[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.createdAt - b.createdAt);
    const items = new Map<string, OrderItem>();
    for (const o of sorted) {
      for (const it of o.items) {
        const k = `${it.name}@@${it.price}`;
        const cur = items.get(k);
        if (cur) cur.qty += it.qty;
        else items.set(k, { ...it });
      }
    }
    const merged = [...items.values()];
    const last = sorted[sorted.length - 1];
    invoices.push({
      key,
      sessionId: group[0].sessionId || undefined,
      orders: sorted,
      items: merged,
      subtotal: sorted.reduce((s, o) => s + o.subtotal, 0),
      discount: sorted.reduce((s, o) => s + (o.discount ?? 0), 0),
      total: sorted.reduce((s, o) => s + o.total, 0),
      itemCount: merged.reduce((s, i) => s + i.qty, 0),
      source: last.source,
      createdAt: last.createdAt,
      table: last.table,
      mode: last.mode,
      standingLabel: last.standingLabel,
      couponCode: sorted.find(o => o.couponCode)?.couponCode,
    });
  }
  return invoices.sort((a, b) => b.createdAt - a.createdAt);
}

export function isInPeriod(createdAt: number, period: Period, from?: string, to?: string): boolean {
  if (period === 'all') return true;
  const d = new Date(createdAt);
  const now = new Date();
  if (period === 'today') return d.toDateString() === now.toDateString();
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  if (period === 'custom') {
    if (!from || !to) return true;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}
