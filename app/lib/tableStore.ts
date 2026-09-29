"use client";

// Restaurant tables — Supabase + Realtime backed. Public API unchanged from the
// old localStorage version. `sessionId` points at the table's current OPEN
// guest session (or null when the table is free) — managed by sessionStore.

import { createRealtimeStore } from './createRealtimeStore';
import { getSupabase } from './supabase';

export interface RestaurantTable {
  id: string;
  number: number;
  label: string;
  seats: number;
  zone: string;
  active: boolean;
  sessionId?: string | null; // current open session, or null when free
  createdAt: number;
}

function fromRow(r: Record<string, unknown>): RestaurantTable {
  return {
    id: r.id as string,
    number: Number(r.number),
    label: (r.label as string) ?? '',
    seats: Number(r.seats ?? 4),
    zone: (r.zone as string) ?? 'Indoor',
    active: (r.active as boolean) ?? true,
    sessionId: (r.session_id as string) ?? null,
    createdAt: Number(r.created_at),
  };
}

function toRow(t: Partial<RestaurantTable>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (t.id !== undefined) row.id = t.id;
  if (t.number !== undefined) row.number = t.number;
  if (t.label !== undefined) row.label = t.label;
  if (t.seats !== undefined) row.seats = t.seats;
  if (t.zone !== undefined) row.zone = t.zone;
  if (t.active !== undefined) row.active = t.active;
  if (t.sessionId !== undefined) row.session_id = t.sessionId;
  if (t.createdAt !== undefined) row.created_at = t.createdAt;
  return row;
}

const store = createRealtimeStore<RestaurantTable>({ table: 'tables', fromRow });

export function getTablesSnapshot(): RestaurantTable[] {
  return store.getSnapshot();
}
export function getTablesServerSnapshot(): RestaurantTable[] {
  return store.getServerSnapshot();
}

/** Sorted by table number for stable display. */
export function getTables(): RestaurantTable[] {
  store.ensureHydrated();
  return [...store.get()].sort((a, b) => a.number - b.number);
}

export function addTable(input: Omit<RestaurantTable, 'id' | 'createdAt'>): RestaurantTable {
  const table: RestaurantTable = { ...input, id: `t${Date.now().toString(36)}`, createdAt: Date.now() };
  store.patchLocal((cur) => [...cur, table]);
  const sb = getSupabase();
  if (sb) void sb.from('tables').insert(toRow(table)).then(({ error }) => {
    if (error) console.error('[tables] add failed', error.message);
  });
  return table;
}

export function updateTable(id: string, patch: Partial<Omit<RestaurantTable, 'id' | 'createdAt'>>) {
  store.patchLocal((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const sb = getSupabase();
  if (sb) void sb.from('tables').update(toRow(patch)).eq('id', id).then(({ error }) => {
    if (error) console.error('[tables] update failed', error.message);
  });
}

export function deleteTable(id: string) {
  store.patchLocal((cur) => cur.filter((t) => t.id !== id));
  const sb = getSupabase();
  if (sb) void sb.from('tables').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('[tables] delete failed', error.message);
  });
}

/** True if a table number is already taken by another table. */
export function isNumberTaken(num: number, exceptId?: string): boolean {
  return store.get().some((t) => t.number === num && t.id !== exceptId);
}

export function subscribeToTables(callback: () => void): () => void {
  return store.subscribe(callback);
}
