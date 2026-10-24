"use client";

// Bills — the record that settles a session. Supabase + Realtime backed.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export interface Bill {
  id: string;
  sessionId: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  couponCode?: string | null;
  paidMethod?: string | null;
  createdAt: number;
}

function fromRow(r: Record<string, unknown>): Bill {
  return {
    id: r.id as string,
    sessionId: r.session_id as string,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    discount: Number(r.discount),
    total: Number(r.total),
    couponCode: (r.coupon_code as string) ?? null,
    paidMethod: (r.paid_method as string) ?? null,
    createdAt: Number(r.created_at),
  };
}

const store = createRealtimeStore<Bill>({ table: 'bills', fromRow });

export function getBillsSnapshot(): Bill[] {
  return store.getSnapshot();
}
export function getBillsServerSnapshot(): Bill[] {
  return store.getServerSnapshot();
}
export function getBills(): Bill[] {
  store.ensureHydrated();
  return store.get();
}

/** Create a bill that settles a session. Returns it synchronously (optimistic). */
export function createBill(input: {
  sessionId: string;
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  couponCode?: string | null;
  paidMethod?: string | null;
}): Bill {
  const bill: Bill = {
    id: `BL-${Date.now().toString(36)}`,
    sessionId: input.sessionId,
    subtotal: input.subtotal,
    tax: input.tax,
    discount: input.discount ?? 0,
    total: input.total,
    couponCode: input.couponCode ?? null,
    paidMethod: input.paidMethod ?? null,
    createdAt: Date.now(),
  };
  store.patchLocal((cur) => [bill, ...cur]);
  // The server recomputes the amounts from the session's real orders.
  void write({
    table: 'bills',
    op: 'insert',
    values: { id: bill.id, session_id: bill.sessionId, paid_method: bill.paidMethod },
  }).then(({ error }) => { if (error) console.error('[bills] create failed', error.message); });
  return bill;
}

export function subscribeToBills(callback: () => void): () => void {
  return store.subscribe(callback);
}
