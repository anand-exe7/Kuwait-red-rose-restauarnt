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


/* ── Sizes ────────────────────────────────────────────────────────────────
   A product sold in sizes keeps a separate count per size, inside
   menu_items.variants. An order line for one of them is keyed
   "<productId>::<sizeId>", so the stock has to come off that size's shelf and
   not off a product-level count that does not exist. */
function splitLineId(raw: string): { productId: string; variantId?: string } {
  const i = raw.indexOf('::');
  return i < 0 ? { productId: raw } : { productId: raw.slice(0, i), variantId: raw.slice(i + 2) };
}

interface VariantRow { id?: string; amount?: number; unit?: string; price?: number; stock?: number | null }

function variantText(v: VariantRow | undefined): string {
  if (!v || v.amount == null || !v.unit) return '';
  const n = Number(v.amount);
  const amount = Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
  return `${amount}${v.unit === 'l' ? 'L' : v.unit}`;
}

/**
 * Take `want` off the shelf and return the movements to log.
 *
 * Keys are either a product id or "<productId>::<sizeId>". Sizes are written
 * back into the product's `variants` array; everything else moves the
 * product's own `stock`. One product is read once even when several of its
 * sizes sold, so the two writes cannot clobber each other.
 */
async function takeOffShelf(
  sb: SupabaseClient,
  want: Map<string, number>,
  meta: { orderId: string; sessionId?: string | null; actor: string; reason: string },
): Promise<MovementInput[]> {
  // Group the wanted quantities by the product they belong to.
  const byProduct = new Map<string, { variantId?: string; qty: number }[]>();
  for (const [key, qty] of want) {
    if (qty <= 0) continue;
    const { productId, variantId } = splitLineId(key);
    const list = byProduct.get(productId) ?? [];
    list.push({ variantId, qty });
    byProduct.set(productId, list);
  }
  if (byProduct.size === 0) return [];

  const { data: products, error } = await sb
    .from('menu_items')
    .select('id,name,price,stock,variants')
    .in('id', [...byProduct.keys()]);
  if (error) {
    console.error('[stock] product lookup failed', error.message);
    return [];
  }

  const movements: MovementInput[] = [];
  for (const p of products ?? []) {
    const lines = byProduct.get(p.id as string) ?? [];
    const variants: VariantRow[] = Array.isArray(p.variants) ? [...(p.variants as VariantRow[])] : [];
    let variantsTouched = false;

    for (const line of lines) {
      if (line.variantId) {
        const idx = variants.findIndex((v) => String(v?.id ?? '') === line.variantId);
        if (idx < 0) {
          // The size was deleted between ordering and billing. Record the sale
          // so the ledger is honest; there is no shelf left to take it off.
          movements.push({
            productId: p.id as string,
            productName: String(p.name ?? ''),
            kind: 'sale',
            qty: -line.qty,
            beforeQty: null,
            afterQty: null,
            unitPrice: Number(p.price ?? 0),
            orderId: meta.orderId,
            sessionId: meta.sessionId ?? null,
            actor: meta.actor,
            reason: `${meta.reason} (size no longer listed)`,
          });
          continue;
        }
        const v = variants[idx];
        const tracked = v.stock !== null && v.stock !== undefined;
        const before = tracked ? Number(v.stock) : null;
        const after = tracked ? Math.max(0, (before as number) - line.qty) : null;
        if (tracked && after !== before) {
          variants[idx] = { ...v, stock: after };
          variantsTouched = true;
        }
        movements.push({
          productId: p.id as string,
          productName: `${String(p.name ?? '')} (${variantText(v)})`,
          kind: 'sale',
          qty: -line.qty,
          beforeQty: before,
          afterQty: after,
          unitPrice: Number(v.price ?? p.price ?? 0),
          orderId: meta.orderId,
          sessionId: meta.sessionId ?? null,
          actor: meta.actor,
          reason: meta.reason,
        });
      } else {
        const tracked = p.stock !== null && p.stock !== undefined;
        const before = tracked ? Number(p.stock) : null;
        const after = tracked ? Math.max(0, (before as number) - line.qty) : null;
        if (tracked && after !== before) {
          const { error: upErr } = await sb.from('menu_items').update({ stock: after }).eq('id', p.id);
          if (upErr) console.error('[stock] could not reduce stock for', p.id, upErr.message);
        }
        movements.push({
          productId: p.id as string,
          productName: String(p.name ?? ''),
          kind: 'sale',
          qty: -line.qty,
          beforeQty: before,
          afterQty: after,
          unitPrice: Number(p.price ?? 0),
          orderId: meta.orderId,
          sessionId: meta.sessionId ?? null,
          actor: meta.actor,
          reason: meta.reason,
        });
      }
    }

    // One write per product, after every size of it has been accounted for.
    if (variantsTouched) {
      const { error: upErr } = await sb.from('menu_items').update({ variants }).eq('id', p.id);
      if (upErr) console.error('[stock] could not reduce size stock for', p.id, upErr.message);
    }
  }
  return movements;
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

  const movements = await takeOffShelf(sb, want, {
    orderId: order.id,
    sessionId: order.session_id ?? null,
    actor: order.source === 'customer' ? 'customer' : order.source === 'waiter' ? 'waiter' : 'admin',
    reason: 'Order accepted',
  });
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

interface BillLine { productId?: string | null; id?: string | null; qty?: number | null }

/**
 * Take a BILL's quantities off the shelf.
 *
 * Orders already move stock when they reach the kitchen, so for a tab this
 * only has to cover the difference: the lines the admin typed straight onto
 * the bill in the Billing panel, which never existed as a kitchen ticket. For
 * a counter sale there is no session and no order at all, so the whole bill is
 * the difference — that is the case where stock silently never moved.
 *
 * Keyed on the bill id, so re-sending the same bill cannot double-count.
 */
export async function applySaleForBill(
  sb: SupabaseClient,
  bill: { id: string; sessionId?: string | null; items: BillLine[]; actor?: string },
): Promise<void> {
  const lines = Array.isArray(bill.items) ? bill.items : [];
  if (lines.length === 0) return;
  if (await alreadyApplied(sb, bill.id)) return;

  // What the bill charges for, per product.
  const want = new Map<string, number>();
  for (const l of lines) {
    const id = String(l?.productId ?? l?.id ?? '');
    const qty = Number(l?.qty ?? 0);
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    want.set(id, (want.get(id) ?? 0) + qty);
  }
  if (want.size === 0) return;

  // What the session's tickets already took off the shelf.
  if (bill.sessionId) {
    const { data: orders } = await sb.from('orders').select('items').eq('session_id', bill.sessionId);
    for (const o of orders ?? []) {
      const items = Array.isArray(o.items) ? (o.items as Record<string, unknown>[]) : [];
      for (const line of items) {
        const id = String(line?.id ?? '');
        const qty = Number(line?.qty ?? 0);
        if (!id || !Number.isFinite(qty) || qty <= 0) continue;
        const left = (want.get(id) ?? 0) - qty;
        if (left > 0) want.set(id, left);
        else want.delete(id);
      }
    }
  }
  if (want.size === 0) return;

  const movements = await takeOffShelf(sb, want, {
    orderId: bill.id,
    sessionId: bill.sessionId ?? null,
    actor: bill.actor ?? 'admin',
    reason: bill.sessionId ? 'Added on the bill' : 'Counter sale',
  });
  await logMovements(sb, movements);
}

/**
 * Put a whole bill's stock back — the bill was voided or deleted, so nothing
 * on it left the shop.
 *
 * A counter sale moved its stock under the bill's own id; a tab moved most of
 * it under each kitchen ticket's id and only the typed-on-the-bill extras
 * under the bill's. So both sets have to be reversed, which is why this walks
 * the session's orders as well. Anything already put back is skipped, so
 * voiding and then deleting the same bill cannot return the stock twice.
 */
export async function reverseSaleForBill(
  sb: SupabaseClient,
  bill: { id: string; sessionId?: string | null },
  reason = 'Bill voided',
): Promise<void> {
  if (ledgerMissing) return;
  const ids = [bill.id];
  if (bill.sessionId) {
    const { data: orders } = await sb.from('orders').select('id').eq('session_id', bill.sessionId);
    for (const o of orders ?? []) {
      const id = String(o.id ?? '');
      if (id) ids.push(id);
    }
  }
  const { data: done, error } = await sb
    .from('stock_movements')
    .select('order_id')
    .eq('kind', 'return')
    .in('order_id', ids);
  if (error && isMissingTable(error.message || '')) {
    ledgerMissing = true;
    return;
  }
  const already = new Set((done ?? []).map((r) => String(r.order_id ?? '')));
  for (const id of ids) {
    if (already.has(id)) continue;
    await reverseSaleForOrder(sb, { id, session_id: bill.sessionId ?? null }, reason);
  }
}
