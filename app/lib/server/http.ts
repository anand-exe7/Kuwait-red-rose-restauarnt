import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';

// Shared helpers for guarded API routes (/api/db, /api/delivery/*, /api/driver/*).

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export const deny = (message = 'Not allowed') => new HttpError(403, message);
export const bad = (message: string) => new HttpError(400, message);
export const unauthorized = (message = 'Please sign in') => new HttpError(401, message);

// ---- tiny in-memory throttle (best effort, per server instance) ----
const hits = new Map<string, { n: number; reset: number }>();
export function throttle(key: string, max = 40, windowMs = 60_000) {
  const now = Date.now();
  const cur = hits.get(key);
  if (!cur || cur.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return;
  }
  if (++cur.n > max) throw new HttpError(429, 'Too many requests. Slow down.');
}

// ---- validation helpers ----
export const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown, max: number, name: string): string => {
  if (typeof v !== 'string' || v.length > max) throw bad(`Invalid ${name}`);
  return v;
};
export const optStr = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const int = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`Invalid ${name}`);
  return n;
};
export const num = (v: unknown, min: number, max: number, name: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`Invalid ${name}`);
  return n;
};
export const money = (v: unknown, name: string, max = 1_000_000): number => num(v, 0, max, name);
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function clientIp(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0].trim() : request.headers.get('x-real-ip')) || 'unknown';
}

/** Same-origin JSON only (blocks cross-site form posts / CSRF) and parses the body. */
export async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw bad('JSON required');
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.nextUrl.host) throw deny('Cross-origin request blocked');
  let body: unknown;
  try { body = await request.json(); } catch { throw bad('Invalid JSON'); }
  if (!isObj(body)) throw bad('Invalid body');
  return body;
}

/** Wraps a handler so thrown HttpErrors become JSON responses. */
export async function respond(fn: () => Promise<Record<string, unknown> | void>) {
  try {
    const out = await fn();
    return NextResponse.json({ ok: true, ...(out ?? {}) });
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ ok: false, error: { message: e.message, code: e.code } }, { status: e.status });
    }
    console.error('[api]', e);
    return NextResponse.json({ ok: false, error: { message: 'Server error' } }, { status: 500 });
  }
}
