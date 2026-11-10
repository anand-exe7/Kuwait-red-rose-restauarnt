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

/** Raised to every store when the staff cookie is gone or has expired. */
export const SESSION_EXPIRED =
  'Your admin session has expired. Sign in again — nothing was saved.';

let promptedForLogin = false;

/**
 * Reads use the public anon key and keep working after the staff cookie
 * expires, but every write goes through /api/db and starts coming back 401/403.
 * The stores then roll their optimistic update back, so from the counter it
 * looks like a saved expense "vanishes" and a deleted one "comes back" — with
 * no hint that the session is the reason. Say so plainly, once, and send the
 * user to the login page so they can carry on.
 */
function handleExpiredSession() {
  if (promptedForLogin || typeof window === 'undefined') return;
  promptedForLogin = true;
  const here = window.location.pathname;
  if (here.startsWith('/admin') && !here.startsWith('/admin/login')) {
    window.location.assign('/admin/login');
  }
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
    if (res.ok && json?.ok) {
      promptedForLogin = false;
      return { error: null };
    }
    if (res.status === 401 || res.status === 403) {
      handleExpiredSession();
      return { error: { message: SESSION_EXPIRED, code: 'SESSION_EXPIRED' } };
    }
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
