import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// The stock ledger.
//
// Every change to a product's stock count is written here as one row, so the
// admin's Stock movements page can answer "where did my stock go?" and export
// it. Stock only ever moves on the server: an accepted order takes it off the
// shelf, and the admin's +/- and stock counts go through /api/stock.
//
// See supabase/stock_movements.sql for the table. If it hasn't been applied
// yet, nothing here throws — we warn once and carry on, so ordering never
// breaks because the ledger is missing.

export type MovementKind = 'sale' | 'restock' | 'adjust' | 'waste' | 'return';

export interface MovementInput {
  productId: string;
  productName?: string;
  kind: MovementKind;
  qty: number; // signed: negative takes stock off the shelf
  beforeQty?: number | null;
  afterQty?: number | null;
  unitPrice?: number | null;
  orderId?: string | null;
  sessionId?: string | null;
  reason?: string | null;
  actor?: string | null;
}

let ledgerMissing = false;

function isMissingTable(msg: string): boolean {
  return /relation .* does not exist|could not find the table|schema cache|stock_movements/i.test(msg);
}

function newId(i: number): string {
  return `SM-${Date.now().toString(36).toUpperCase()}-${i}-${Math.floor(Math.random() * 1296)
    .toString(36)
    .toUpperCase()
    .padStart(2, '0')}`;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Append rows to the ledger. Never throws. */
export async function logMovements(sb: SupabaseClient, rows: MovementInput[]): Promise<void> {
  if (ledgerMissing || rows.length === 0) return;
  const payload = rows.map((m, i) => ({
    id: newId(i),
    product_id: m.productId,
    product_name: m.productName ?? '',
    kind: m.kind,
    qty: r3(m.qty),
    before_qty: m.beforeQty ?? null,
    after_qty: m.afterQty ?? null,
    unit_price: m.unitPrice ?? null,
    value: m.unitPrice == null ? null : r3(Math.abs(m.qty) * m.unitPrice),
    order_id: m.orderId ?? null,
    session_id: m.sessionId ?? null,
    reason: m.reason ?? null,
    actor: m.actor ?? 'system',
    created_at: Date.now(),
  }));
  const { error } = await sb.from('stock_movements').insert(payload);
  if (!error) return;
  if (isMissingTable(error.message || '')) {
    ledgerMissing = true;
    console.warn(
      '[stock] no stock_movements table yet — apply supabase/stock_movements.sql in the ' +
        'Supabase SQL editor to record the stock ledger. Stock counts still work.',
    );
    return;
  }
  console.error('[stock] movement insert failed', error.message);
}

interface OrderRow {
  id: string;
  items?: unknown;
  session_id?: string | null;
  source?: string | null;
}

/** Already taken off the shelf? Keeps approve/re-approve from double-counting. */
async function alreadyApplied(sb: SupabaseClient, orderId: string): Promise<boolean> {
  if (ledgerMissing) return false;
  const { data, error } = await sb.from('stock_movements').select('id').eq('order_id', orderId).limit(1);
  if (error) {
    if (isMissingTable(error.message || '')) ledgerMissing = true;
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Take an accepted order's quantities off the shelf and log one `sale` per line.
 *
 * Called when an order reaches the kitchen — the admin accepting a customer
 * order, or staff placing one directly — never while it is still waiting for
 * approval, so a declined order doesn't eat your stock. Safe to call twice.
 */
export async function applySaleForOrder(sb: SupabaseClient, order: OrderRow): Promise<void> {
  const raw = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];
  if (raw.length === 0) return;
  if (await alreadyApplied(sb, order.id)) return;

  // Collapse duplicate lines of the same product into one movement.
  const want = new Map<string, number>();
  for (const line of raw) {
    const id = String(line?.id ?? '');
    const qty = Number(line?.qty ?? 0);
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    want.set(id, (want.get(id) ?? 0) + qty);
  }
  if (want.size === 0) return;

  const { data: products, error } = await sb
    .from('menu_items')
    .select('id,name,price,stock')
    .in('id', [...want.keys()]);
  if (error) {
    console.error('[stock] product lookup failed', error.message);
    return;
  }

  const movements: MovementInput[] = [];
  for (const p of products ?? []) {
    const qty = want.get(p.id as string) ?? 0;
    if (qty <= 0) continue;
    const tracked = p.stock !== null && p.stock !== undefined;
    const before = tracked ? Number(p.stock) : null;
    const after = tracked ? Math.max(0, (before as number) - qty) : null;
    if (tracked && after !== before) {
      const { error: upErr } = await sb.from('menu_items').update({ stock: after }).eq('id', p.id);
      if (upErr) console.error('[stock] could not reduce stock for', p.id, upErr.message);
    }
    movements.push({
      productId: p.id as string,
      productName: String(p.name ?? ''),
      kind: 'sale',
      qty: -qty,
      beforeQty: before,
      afterQty: after,
      unitPrice: Number(p.price ?? 0),
      orderId: order.id,
      sessionId: order.session_id ?? null,
      actor: order.source === 'customer' ? 'customer' : order.source === 'waiter' ? 'waiter' : 'admin',
      reason: 'Order accepted',
    });
  }
  await logMovements(sb, movements);
}

/**
 * Put stock back when an order is cancelled after it was accepted. Logs a
 * `return` per line so the ledger shows the reversal rather than a silent edit.
 */
export async function reverseSaleForOrder(sb: SupabaseClient, order: OrderRow, reason = 'Order cancelled'): Promise<void> {
  if (ledgerMissing) return;
  const { data: sales, error } = await sb
    .from('stock_movements')
    .select('product_id,product_name,qty,unit_price')
    .eq('order_id', order.id)
    .eq('kind', 'sale');
  if (error || !sales || sales.length === 0) return;
  const movements: MovementInput[] = [];
  for (const s of sales) {
    const qty = Math.abs(Number(s.qty) || 0);
    if (qty <= 0) continue;
    const { data: p } = await sb.from('menu_items').select('stock').eq('id', s.product_id as string).maybeSingle();
    const tracked = p && p.stock !== null && p.stock !== undefined;
    const before = tracked ? Number(p!.stock) : null;
    const after = tracked ? (before as number) + qty : null;
    if (tracked) await sb.from('menu_items').update({ stock: after }).eq('id', s.product_id as string);
    movements.push({
      productId: s.product_id as string,
      productName: String(s.product_name ?? ''),
      kind: 'return',
      qty,
      beforeQty: before,
      afterQty: after,
      unitPrice: s.unit_price == null ? null : Number(s.unit_price),
      orderId: order.id,
      sessionId: order.session_id ?? null,
      actor: 'admin',
      reason,
    });
  }
  await logMovements(sb, movements);
}
