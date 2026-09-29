"use client";

// Waiter calls — Supabase + Realtime backed. Public API unchanged. A customer
// taps "call waiter" and it pops up on the waiter dashboard on another device.

import { createRealtimeStore } from './createRealtimeStore';
import { getSupabase } from './supabase';

export interface WaiterCall {
  id: string;
  table: number;
  createdAt: number;
  resolved: boolean;
}

function fromRow(r: Record<string, unknown>): WaiterCall {
  return {
    id: r.id as string,
    table: Number(r.table_number),
    createdAt: Number(r.created_at),
    resolved: (r.resolved as boolean) ?? false,
  };
}

const store = createRealtimeStore<WaiterCall>({ table: 'waiter_calls', fromRow });

export function getWaiterCallsSnapshot(): WaiterCall[] {
  return store.getSnapshot();
}

export function getWaiterCallsServerSnapshot(): WaiterCall[] {
  return store.getServerSnapshot();
}

/** Call for a table — reuses any existing unresolved call for that table. */
export function callWaiter(table: number): WaiterCall {
  const existing = store.get().find((c) => c.table === table && !c.resolved);
  if (existing) return existing;
  const call: WaiterCall = { id: `WC-${Date.now().toString(36)}`, table, createdAt: Date.now(), resolved: false };
  store.patchLocal((cur) => [call, ...cur]);
  const sb = getSupabase();
  if (sb) void sb.from('waiter_calls')
    .insert({ id: call.id, table_number: table, resolved: false, created_at: call.createdAt })
    .then(({ error }) => { if (error) console.error('[waiter_calls] add failed', error.message); });
  return call;
}

export function resolveWaiterCall(id: string) {
  store.patchLocal((cur) => cur.map((c) => (c.id === id ? { ...c, resolved: true } : c)));
  const sb = getSupabase();
  if (sb) void sb.from('waiter_calls').update({ resolved: true }).eq('id', id).then(({ error }) => {
    if (error) console.error('[waiter_calls] resolve failed', error.message);
  });
}

export function subscribeToWaiterCalls(callback: () => void): () => void {
  return store.subscribe(callback);
}
