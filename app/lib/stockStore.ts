"use client";

// Stock movements — the stock ledger, Supabase + Realtime backed.
//
// One row per change to a product's stock count: an accepted order takes stock
// off the shelf ('sale'), the admin's +/- and stock counts put it back or
// correct it ('restock' / 'adjust' / 'waste' / 'return'). Writes only ever
// happen on the server (/api/db for sales, /api/stock for the admin), so this
// store is read-only.
//
// Needs supabase/stock_movements.sql. Without it the store simply stays empty
// and the page says so.

import { createRealtimeStore } from './createRealtimeStore';

export type MovementKind = 'sale' | 'restock' | 'adjust' | 'waste' | 'return';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  kind: MovementKind;
  qty: number;              // signed: negative took stock off the shelf
  beforeQty: number | null;
  afterQty: number | null;
  unitPrice: number | null;
  value: number | null;     // |qty| x unitPrice
  orderId: string | null;
  sessionId: string | null;
  reason: string;
  actor: string;
  createdAt: number;
}

export const MOVEMENT_LABEL: Record<MovementKind, string> = {
  sale: 'Sold',
  restock: 'Added',
  adjust: 'Corrected',
  waste: 'Wasted',
  return: 'Returned',
};

function fromRow(r: Record<string, unknown>): StockMovement {
  return {
    id: r.id as string,
    productId: (r.product_id as string) ?? '',
    productName: (r.product_name as string) ?? '',
    kind: ((r.kind as MovementKind) ?? 'adjust'),
    qty: Number(r.qty ?? 0),
    beforeQty: r.before_qty == null ? null : Number(r.before_qty),
    afterQty: r.after_qty == null ? null : Number(r.after_qty),
    unitPrice: r.unit_price == null ? null : Number(r.unit_price),
    value: r.value == null ? null : Number(r.value),
    orderId: (r.order_id as string) ?? null,
    sessionId: (r.session_id as string) ?? null,
    reason: (r.reason as string) ?? '',
    actor: (r.actor as string) ?? 'system',
    createdAt: Number(r.created_at ?? 0),
  };
}

const store = createRealtimeStore<StockMovement>({ table: 'stock_movements', fromRow });

export function getStockMovements(): StockMovement[] {
  store.ensureHydrated();
  return store.get();
}
export function getStockMovementsSnapshot(): StockMovement[] {
  return store.getSnapshot();
}
export function getStockMovementsServerSnapshot(): StockMovement[] {
  return store.getServerSnapshot();
}
export function subscribeToStockMovements(cb: () => void): () => void {
  return store.subscribe(cb);
}
export function refetchStockMovements(): Promise<void> {
  return store.refetch();
}

/** Record a manual stock change (admin only — the server does the real work). */
export async function recordStockChange(input: {
  productId: string;
  kind: Exclude<MovementKind, 'sale'>;
  /** Either a signed delta… */
  delta?: number;
  /** …or the exact count after a stock take. */
  set?: number;
  reason?: string;
}): Promise<{ ok: boolean; error?: string; stock?: number | null }> {
  try {
    const res = await fetch('/api/stock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { ok?: boolean; error?: { message?: string }; stock?: number | null };
    if (!res.ok || !body.ok) return { ok: false, error: body.error?.message || 'Could not save that stock change.' };
    void store.refetch();
    return { ok: true, stock: body.stock ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
