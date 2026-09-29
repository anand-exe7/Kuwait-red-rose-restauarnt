"use client";

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// Factory behind every domain store. It gives each Supabase table:
//   * an in-memory cache with a STABLE array reference (required by
//     useSyncExternalStore — the snapshot must not change identity unless the
//     data actually changed, or React loops forever),
//   * a Realtime subscription that, on any row change, simply RE-FETCHES the
//     table and notifies listeners. The Realtime message itself carries no data
//     (payload is ignored) — it's just a "something changed" ping, so an
//     offline client self-heals by re-fetching on its next connect/notify.
//   * optimistic local mutation (`patchLocal`) so a write feels instant; the
//     Realtime echo then reconciles every device (including this one) to the
//     server's truth. Client-generated text ids make that reconcile a no-op.

export interface RealtimeStore<T> {
  /** Synchronous cache snapshot — stable reference until data changes. */
  getSnapshot(): T[];
  /** Server/SSR snapshot — always the same empty array. */
  getServerSnapshot(): T[];
  /** Subscribe a listener; opens Realtime on first listener, closes on last. */
  subscribe(cb: () => void): () => void;
  /** Kick off the initial fetch if it hasn't happened yet. */
  ensureHydrated(): void;
  /** Re-fetch the whole table from Supabase and notify. */
  refetch(): Promise<void>;
  /** Current cache (sync). */
  get(): T[];
  /** Optimistically transform the cache and notify listeners. */
  patchLocal(fn: (cur: T[]) => T[]): void;
}

export function createRealtimeStore<T extends { id: string | number }>(opts: {
  table: string;
  /** Map a raw DB row (snake_case) to the app type (camelCase). */
  fromRow: (row: Record<string, unknown>) => T;
}): RealtimeStore<T> {
  const EMPTY: T[] = [];
  let cache: T[] = EMPTY;
  let hydrated = false;
  let hydrating: Promise<void> | null = null;
  let channel: RealtimeChannel | null = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const l of listeners) l();
  };

  const refetch = async (): Promise<void> => {
    const sb = getSupabase();
    if (!sb) return;
    const { data, error } = await sb.from(opts.table).select('*');
    if (error) {
      console.error(`[store:${opts.table}] fetch failed`, error.message);
      return;
    }
    cache = (data ?? []).map((r) => opts.fromRow(r as Record<string, unknown>));
    hydrated = true;
    notify();
  };

  const ensureHydrated = () => {
    if (hydrated || hydrating) return;
    hydrating = refetch().finally(() => {
      hydrating = null;
    });
  };

  const openChannel = () => {
    const sb = getSupabase();
    if (!sb || channel) return;
    channel = sb
      .channel(`rt:${opts.table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: opts.table },
        () => {
          // Ignore the payload — just resync from source of truth.
          void refetch();
        }
      )
      .subscribe();
  };

  const closeChannel = () => {
    const sb = getSupabase();
    if (sb && channel) sb.removeChannel(channel);
    channel = null;
  };

  return {
    getSnapshot: () => cache,
    getServerSnapshot: () => EMPTY,
    subscribe(cb) {
      listeners.add(cb);
      if (listeners.size === 1) openChannel();
      ensureHydrated();
      return () => {
        listeners.delete(cb);
        if (listeners.size === 0) closeChannel();
      };
    },
    ensureHydrated,
    refetch,
    get: () => cache,
    patchLocal(fn) {
      cache = fn(cache);
      hydrated = true;
      notify();
    },
  };
}
