"use client";

// Shop switches, live on every screen.
//
// One `app_settings` row (id = 'ops', value jsonb) holds them, so the admin
// panel, the customer menu and the landing page all read the same answer and
// all three change the moment the owner flips the switch — no reload, because
// `app_settings` is already on Realtime.
//
// So far there is one switch: online ordering. With it off, customers can still
// browse the whole menu and see every price; they just cannot send an order.
// The shop asked for this because they are opening the counter first and do not
// want website orders arriving yet.
//
// The browser's copy decides what the UI SHOWS. What it is allowed to DO is
// decided on the server from the same row — see app/lib/server/ops.ts.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export const OPS_ROW_ID = 'ops';

export interface Ops {
  /** Customers may order from the website. */
  orderingEnabled: boolean;
}

export const DEFAULT_OPS: Ops = { orderingEnabled: true };

interface Row { id: string; orderingEnabled: boolean }

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    // Absent counts as ON: a shop that has never touched the switch is open.
    orderingEnabled: v.orderingEnabled !== false,
  };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToOps(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getOpsSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getOpsServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** The switches out of the store's rows. */
export function opsFrom(rows: Row[]): Ops {
  const row = rows.find((r) => r.id === OPS_ROW_ID);
  return row ? { orderingEnabled: row.orderingEnabled } : DEFAULT_OPS;
}

function hint(message: string | undefined): string {
  return /schema cache|does not exist|unknown table/i.test(message || '')
    ? 'This needs supabase/app_settings.sql — run it in the Supabase SQL editor.'
    : message || 'Could not save that.';
}

/** Save the switches. Creates the row the first time it is used.
 *
 *  app_settings.sql only seeds the tax row, so on a shop that has never
 *  touched this switch there is nothing to UPDATE — and an update that matches
 *  no row comes back from PostgREST as a success, not an error. So which way
 *  round we go is decided by what the store has, not by a failed update. */
export async function saveOps(next: Ops): Promise<{ ok: boolean; error?: string }> {
  const existed = store.get().some((r) => r.id === OPS_ROW_ID);
  const row: Row = { id: OPS_ROW_ID, ...next };
  store.patchLocal((cur) =>
    existed ? cur.map((r) => (r.id === OPS_ROW_ID ? row : r)) : [row, ...cur],
  );
  const value = { orderingEnabled: next.orderingEnabled };

  if (existed) {
    const { error } = await write({ table: 'app_settings', op: 'update', values: { value }, match: { id: OPS_ROW_ID } });
    if (error) { void store.refetch(); return { ok: false, error: hint(error.message) }; }
    return { ok: true };
  }

  const ins = await write({ table: 'app_settings', op: 'insert', values: { id: OPS_ROW_ID, value } });
  if (!ins.error) return { ok: true };
  // Another device created the row between our read and this insert — the
  // switch is still what the owner asked for, so write it as an update.
  const up = await write({ table: 'app_settings', op: 'update', values: { value }, match: { id: OPS_ROW_ID } });
  if (up.error) { void store.refetch(); return { ok: false, error: hint(ins.error.message) }; }
  return { ok: true };
}
