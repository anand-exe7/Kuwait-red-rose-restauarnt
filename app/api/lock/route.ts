import { NextResponse, type NextRequest } from 'next/server';
import {
  LOCK_COOKIE,
  LOCK_TTL_MS,
  SESSION_COOKIE,
  createLockToken,
  isPanelRole,
  lockPassword,
  passwordMatches,
  verifyLockToken,
  verifySessionToken,
} from '../../lib/session';

// The manager lock.
//
// GET    → is this browser unlocked, and is a lock even configured?
// POST   → check ADMIN_LOCK_PASSWORD and, if it is right, mint the unlock cookie.
// DELETE → lock it again (used when the owner walks away).
//
// The password only ever exists in the environment; it is never sent to the
// browser, and the cookie it mints is signed and short-lived (LOCK_TTL_MS).
// Every caller has to hold a valid panel session first, so this is not a second
// way into the panel — it is a second door inside it.

const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;
/** Failed attempts per IP, in memory. A restart clears it; that is fine — the
 *  point is to make guessing at the counter slow, not to be a vault. */
const fails = new Map<string, number[]>();

function ip(request: NextRequest): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function tooManyFailures(key: string): boolean {
  const now = Date.now();
  const recent = (fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  fails.set(key, recent);
  return recent.length >= LIMIT;
}

function noteFailure(key: string) {
  const now = Date.now();
  fails.set(key, [...(fails.get(key) ?? []).filter((t) => now - t < WINDOW_MS), now]);
}

async function panelSession(request: NextRequest): Promise<boolean> {
  const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  return isPanelRole(role);
}

export async function GET(request: NextRequest) {
  if (!(await panelSession(request))) {
    return NextResponse.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  }
  const unlocked = await verifyLockToken(request.cookies.get(LOCK_COOKIE)?.value);
  // `configured: false` tells the panel to say "no manager password is set"
  // rather than silently refusing every delete with "wrong password".
  return NextResponse.json({ ok: true, unlocked, configured: !!lockPassword() });
}

export async function POST(request: NextRequest) {
  if (!(await panelSession(request))) {
    return NextResponse.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  }
  const expected = lockPassword();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'No manager password is set on the server. Add ADMIN_LOCK_PASSWORD to .env.' },
      { status: 500 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const key = ip(request);
  if (tooManyFailures(key)) {
    return NextResponse.json(
      { ok: false, error: 'Too many wrong tries. Wait a few minutes.' },
      { status: 429 },
    );
  }

  if (!(await passwordMatches((body.password ?? '').toString(), expected))) {
    noteFailure(key);
    return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
  }

  const token = await createLockToken();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Set AUTH_SECRET in .env so the unlock can be signed.' },
      { status: 500 },
    );
  }
  fails.delete(key);
  const res = NextResponse.json({ ok: true, until: Date.now() + LOCK_TTL_MS });
  res.cookies.set(LOCK_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCK_TTL_MS / 1000,
  });
  return res;
}

/* Lock it again. The panel calls this on load and on every route change, so
 *  it is also how it learns whether a lock is configured at all — one request
 *  instead of two. No session check: throwing a cookie away is never a
 *  privileged act, and refusing it could only ever leave a browser unlocked. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true, unlocked: false, configured: !!lockPassword() });
  res.cookies.set(LOCK_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
