"use client";

// Browser-side door for database WRITES. The browser reads with the public anon
// key, but every insert/update/delete goes through /api/db, which checks the
// caller's role and re-validates the data (see app/api/db/route.ts).
//
// Writes are sent one at a time, in the order they were requested, so a later
// write that depends on an earlier one (an order before its bill, a bill before
// the session closing) can never overtake it.

export type WriteOp = 'insert' | 'update' | 'delete';

export interface WriteRequest {
  table: string;
  op: WriteOp;
  values?: Record<string, unknown>;
  match?: Record<string, string | number | boolean>;
}

export interface WriteResult {
  error: { message: string; code?: string } | null;
}

let queue: Promise<unknown> = Promise.resolve();

async function send(req: WriteRequest): Promise<WriteResult> {
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message: string; code?: string } } | null;
    if (res.ok && json?.ok) return { error: null };
    return { error: json?.error ?? { message: `Request failed (${res.status})` } };
  } catch {
    return { error: { message: 'Network error' } };
  }
}

/** Queue a write. Resolves with `{ error }` (never rejects), like supabase-js. */
export function write(req: WriteRequest): Promise<WriteResult> {
  const result = queue.then(() => send(req));
  queue = result;
  return result;
}
