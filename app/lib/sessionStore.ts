"use client";

// Guest tabs (sessions) — Supabase + Realtime backed. A session is one visit to
// a table (or one standing/takeaway party). It opens when the first order is
// placed, grows as more orders come in, and closes when staff bill it or void
// it. A DB partial-unique-index guarantees at most one OPEN dine-in session per
// table, even if two phones order at the same instant.

import { createRealtimeStore } from './createRealtimeStore';
import { getSupabaseData } from './supabase';
import { write } from './dbWrite';
import type { OrderMode } from './orderStore';

export type SessionStatus = 'open' | 'closed' | 'void';

export interface Session {
  id: string;
  tableNumber: number | null;
  mode: OrderMode;
  status: SessionStatus;
  standingLabel?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  guests?: number | null;
  openedAt: number;
  closedAt?: number | null;
  billRequestedAt?: number | null;
  billId?: string | null;
  createdAt: number;
}

function fromRow(r: Record<string, unknown>): Session {
  return {
    id: r.id as string,
    tableNumber: r.table_number == null ? null : Number(r.table_number),
    mode: (r.mode as OrderMode) ?? 'table',
    status: (r.status as SessionStatus) ?? 'open',
    standingLabel: (r.standing_label as string) ?? null,
    customerName: (r.customer_name as string) ?? null,
    customerPhone: (r.customer_phone as string) ?? null,
    guests: r.guests == null ? null : Number(r.guests),
    openedAt: Number(r.opened_at),
    closedAt: r.closed_at == null ? null : Number(r.closed_at),
    billRequestedAt: r.bill_requested_at == null ? null : Number(r.bill_requested_at),
    billId: (r.bill_id as string) ?? null,
    createdAt: Number(r.created_at),
  };
}

const store = createRealtimeStore<Session>({ table: 'sessions', fromRow });

function send(label: string, query: Promise<{ error: { message: string } | null }>) {
  void query.then(({ error }) => {
    if (error) console.error(`[sessions] ${label} failed`, error.message);
  });
}

export function getSessionsSnapshot(): Session[] {
  return store.getSnapshot();
}
export function getSessionsServerSnapshot(): Session[] {
  return store.getServerSnapshot();
}
export function getSessions(): Session[] {
  store.ensureHydrated();
  return store.get();
}

export function getOpenSessionForTable(tableNumber: number): Session | undefined {
  return store.get().find((s) => s.status === 'open' && s.mode === 'table' && s.tableNumber === tableNumber);
}

export function getOpenStandingSession(standingLabel: string): Session | undefined {
  return store.get().find((s) => s.status === 'open' && s.mode === 'standing' && s.standingLabel === standingLabel);
}

/** Most recent session for a table that closed within `withinMs` — powers the guest "paid, goodbye" screen. */
export function getRecentClosedSession(tableNumber: number, withinMs = 20 * 60 * 1000): Session | undefined {
  const cutoff = Date.now() - withinMs;
  return store
    .get()
    .filter((s) => s.tableNumber === tableNumber && s.status === 'closed' && (s.closedAt ?? 0) >= cutoff)
    .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))[0];
}

function generateSessionId(): string {
  return `SN-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/** Open a new guest session and, for dine-in, point the table at it. */
export function openSession(input: {
  tableNumber: number | null;
  mode: OrderMode;
  standingLabel?: string;
  customerName?: string;
  customerPhone?: string;
  guests?: number;
}): Session {
  const now = Date.now();
  const session: Session = {
    id: generateSessionId(),
    tableNumber: input.tableNumber,
    mode: input.mode,
    status: 'open',
    standingLabel: input.standingLabel ?? null,
    customerName: input.customerName ?? null,
    customerPhone: input.customerPhone ?? null,
    guests: input.guests ?? null,
    openedAt: now,
    createdAt: now,
  };
  store.patchLocal((cur) => [session, ...cur]);
  const settled = write({
    table: 'sessions',
    op: 'insert',
    values: {
      id: session.id,
      table_number: session.tableNumber,
      mode: session.mode,
      standing_label: session.standingLabel,
      customer_name: session.customerName,
      customer_phone: session.customerPhone,
      guests: session.guests,
    },
  }).then(async ({ error }): Promise<string> => {
    // The server links the table to the new session as part of this write.
    if (!error) return session.id;
    // One-open-session-per-table index fired: another device (or a stale tab)
    // already has this table open. Adopt that session instead of ours.
    if (error.code === '23505' && session.mode === 'table' && session.tableNumber != null) {
      const sb = getSupabaseData();
      const { data } = sb
        ? await sb
            .from('sessions')
            .select('id')
            .eq('table_number', session.tableNumber)
            .eq('mode', 'table')
            .eq('status', 'open')
            .maybeSingle()
        : { data: null };
      const existingId = data?.id as string | undefined;
      if (existingId) {
        store.patchLocal((cur) => cur.filter((s) => s.id !== session.id));
        void store.refetch();
        return existingId;
      }
    }
    console.error('[sessions] open failed', error.message);
    void store.refetch();
    return session.id;
  });
  pendingOpens.set(session.id, Promise.resolve(settled).finally(() => {
    setTimeout(() => pendingOpens.delete(session.id), 30_000);
  }));
  return session;
}

const pendingOpens = new Map<string, Promise<string>>();

/** Final session id once the DB has accepted (or de-duplicated) an optimistic open. */
export function settleSessionId(sessionId: string): Promise<string> {
  return pendingOpens.get(sessionId) ?? Promise.resolve(sessionId);
}

/** Guest tapped "Get the bill". */
export function requestBill(sessionId: string) {
  const at = Date.now();
  store.patchLocal((cur) => cur.map((s) => (s.id === sessionId ? { ...s, billRequestedAt: at } : s)));
  send('bill request', write({ table: 'sessions', op: 'update', values: { bill_requested_at: at }, match: { id: sessionId } }));
}

/** Staff settled the tab: close the session, attach the bill, free the table. */
export function closeSession(sessionId: string, billId?: string) {
  const at = Date.now();
  store.patchLocal((cur) =>
    cur.map((s) => (s.id === sessionId ? { ...s, status: 'closed', closedAt: at, billId: billId ?? s.billId } : s))
  );
  // The server also frees the table (keyed on the session id, so it works even
  // when this tab hasn't cached the session).
  send('close', write({ table: 'sessions', op: 'update', values: { status: 'closed', bill_id: billId ?? null }, match: { id: sessionId } }));
}

/** Cleared without payment. */
export function voidSession(sessionId: string) {
  const at = Date.now();
  store.patchLocal((cur) => cur.map((s) => (s.id === sessionId ? { ...s, status: 'void', closedAt: at } : s)));
  send('void', write({ table: 'sessions', op: 'update', values: { status: 'void' }, match: { id: sessionId } }));
}

export function subscribeToSessions(callback: () => void): () => void {
  return store.subscribe(callback);
}
