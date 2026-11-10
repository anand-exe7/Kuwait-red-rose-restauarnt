"use client";

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseData } from './supabase';

// Tables that returned PGRST205 (missing from PostgREST schema cache) — we
// warn once per table and then stay quiet, so the dev console isn't spammed
// on every refetch. The UI already has in-memory fallbacks for these.
const missingTableWarned = new Set<string>();

// Factory behind every domain store. It gives each Supabase table:
//   * an in-memory cache with a STABLE array reference (required by
//     useSyncExternalStore — the snapshot must not change identity unless the
//     data actually changed, or React loops forever),
//   * a Realtime subscription that applies each INSERT/UPDATE/DELETE payload to
//     the cache directly (no per-message table download). The table is
//     re-fetched only on initial load and each time the channel (re)connects,
//     so a client that was offline self-heals on reconnect.
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

/* Supabase caches channels by topic name, so two stores asking for the same
   topic get back the SAME channel object. The second one then calls
   .on('postgres_changes', …) on a channel that has already subscribed, which
   throws "cannot add postgres_changes callbacks after subscribe()".
   `app_settings` has four stores on it (tax, categories, expense categories,
   homepage media), so that crash was certain the moment two of them were on
   screen together. Every store instance gets its own topic. */
let channelSeq = 0;

export function createRealtimeStore<T extends { id: string | number }>(opts: {
  table: string;
  /** Map a raw DB row (snake_case) to the app type (camelCase). */
  fromRow: (row: Record<string, unknown>) => T;
}): RealtimeStore<T> {
  const topic = `rt:${opts.table}:${++channelSeq}`;
  const EMPTY: T[] = [];
  let cache: T[] = EMPTY;
  let hydrated = false;
  let hydrating: Promise<void> | null = null;
  let channel: RealtimeChannel | null = null;
  const listeners = new Set<() => void>();

  /* Bumped by every optimistic local change. A refetch snapshots this before
     it asks the server and checks it again when the answer arrives: if a local
     write happened in between, that answer predates the write and applying it
     would wipe the new row off the screen while it sits happily in the
     database. That is exactly what made a just-saved expense "vanish from the
     frontend but still be in the DB" — the Realtime channel calls refetch()
     the moment it connects, and that read could already be in flight when the
     row was saved. */
  let mutationSeq = 0;

  // ---------- Local-storage demo persistence ----------
  // When Supabase isn't configured we still want the whole app to feel real:
  // orders placed in /menu should show up in /admin on another tab, bills
  // closed in /admin should show up on the customer's /customer tab, etc.
  // So in demo mode we persist each store's cache to localStorage and listen
  // for 'storage' events to resync. This hop is removed the moment Supabase
  // env vars appear — the Supabase path takes precedence.
  const LS_KEY = `cenexa_demo_store_${opts.table}`;
  const demoMode = () => !getSupabaseData() && typeof window !== 'undefined';
  const loadFromLS = () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) cache = parsed as T[];
    } catch { /* corrupt JSON — ignore */ }
  };
  const persistToLS = () => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch { /* quota — ignore */ }
  };
  let storageHandlerAttached = false;
  const attachStorageHandler = () => {
    if (storageHandlerAttached || typeof window === 'undefined') return;
    storageHandlerAttached = true;
    window.addEventListener('storage', (e) => {
      if (e.key !== LS_KEY || !demoMode()) return;
      try {
        const parsed = e.newValue ? JSON.parse(e.newValue) : [];
        if (Array.isArray(parsed)) {
          cache = parsed as T[];
          notify();
        }
      } catch { /* ignore */ }
    });
  };

  const notify = () => {
    for (const l of listeners) l();
  };

  const refetch = async (): Promise<void> => {
    const sb = getSupabaseData();
    if (!sb) {
      // Demo mode: hydrate from localStorage once.
      if (!hydrated) { loadFromLS(); hydrated = true; notify(); }
      return;
    }
    const seenAt = mutationSeq;
    const { data, error } = await sb.from(opts.table).select('*');
    if (error) {
      // PGRST205 = table missing from PostgREST schema cache. That is a one-time
      // setup issue (apply supabase/<table>.sql), not a per-render error — warn
      // once so the dev console isn't spammed, and treat the table as empty so
      // the UI uses its fallback instead of looking broken.
      const code = (error as { code?: string }).code;
      if (code === 'PGRST205' || /schema cache/i.test(error.message)) {
        if (!missingTableWarned.has(opts.table)) {
          missingTableWarned.add(opts.table);
          console.warn(
            `[store:${opts.table}] table missing — apply supabase/${opts.table}.sql in the Supabase SQL editor to enable this feature. Using in-memory fallback for now.`
          );
        }
        hydrated = true;
        notify();
        return;
      }
      console.error(`[store:${opts.table}] fetch failed`, error.message);
      return;
    }
    if (mutationSeq !== seenAt) {
      // A local write landed while this read was in flight, so the rows we got
      // back are already out of date. Drop them and ask again.
      return refetch();
    }
    cache = (data ?? []).map((r) => opts.fromRow(r as Record<string, unknown>));
    hydrated = true;
    notify();
  };

  const ensureHydrated = () => {
    if (hydrated || hydrating) return;
    attachStorageHandler();
    hydrating = refetch().finally(() => {
      hydrating = null;
    });
  };

  // Apply one Realtime change straight to the cache instead of re-downloading the
  // whole table (which made egress grow with every message x every table row).
  // Anything unexpected falls back to a full refetch so the cache self-heals.
  const applyChange = (payload: {
    eventType: string;
    new: Record<string, unknown>;
    old: Record<string, unknown>;
  }) => {
    const { eventType } = payload;
    const key = String((eventType === 'DELETE' ? payload.old : payload.new)?.id ?? '');
    if (!key) return void refetch();

    if (eventType === 'DELETE') {
      cache = cache.filter((r) => String(r.id) !== key);
      return notify();
    }
    if (eventType !== 'INSERT' && eventType !== 'UPDATE') return void refetch();

    const row = opts.fromRow(payload.new);
    const exists = cache.some((r) => String(r.id) === key);
    cache = exists ? cache.map((r) => (String(r.id) === key ? row : r)) : [row, ...cache];
    notify();
  };

  const openChannel = () => {
    const sb = getSupabaseData();
    if (!sb || channel) return;
    channel = sb
      .channel(topic)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: opts.table },
        (payload) => applyChange(payload as unknown as Parameters<typeof applyChange>[0])
      )
      .subscribe((status) => {
        // Changes that landed before the socket was up (or while it was down)
        // are missed, so resync once each time the channel becomes live.
        if (status === 'SUBSCRIBED') void refetch();
      });
  };

  const closeChannel = () => {
    const sb = getSupabaseData();
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
      mutationSeq++;
      cache = fn(cache);
      hydrated = true;
      notify();
      if (demoMode()) persistToLS();
    },
  };
}
