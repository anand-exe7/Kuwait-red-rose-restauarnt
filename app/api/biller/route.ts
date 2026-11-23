import { NextResponse, type NextRequest } from 'next/server';
import {
  BILLER_COOKIE,
  BILLER_TTL_MS,
  SESSION_COOKIE,
  billerNames,
  createBillerToken,
  isPanelRole,
  matchBiller,
  verifyBillerToken,
  verifySessionToken,
} from '../../lib/session';

// Who is on the counter.
//
// GET    → the biller signed in on this browser, plus the list of names.
// POST   → { name, password }: sign that person on. Needs THEIR password, so
//          one biller can never switch the counter into the other's name.
// DELETE → sign off. No password: handing the counter over is not a privilege,
//          and whoever takes it still has to type their own password to bill.
//
// The passwords live in BILLERS in the environment and never reach the browser.
// The name the panel shows comes from a signed cookie, and the name on a saved
// bill is read from that same cookie BY THE SERVER (see app/api/db/route.ts) —
// the browser's copy is for display only.

const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;
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
  const biller = await verifyBillerToken(request.cookies.get(BILLER_COOKIE)?.value);
  return NextResponse.json({ ok: true, biller, names: billerNames() });
}

export async function POST(request: NextRequest) {
  if (!(await panelSession(request))) {
    return NextResponse.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  }
  const names = billerNames();
  if (!names.length) {
    return NextResponse.json(
      { ok: false, error: 'No billers are set up on the server. Add BILLERS to .env.' },
      { status: 500 },
    );
  }

  let body: { name?: string; password?: string };
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

  const found = await matchBiller((body.name ?? '').toString(), (body.password ?? '').toString());
  if (!found) {
    noteFailure(key);
    // Deliberately one message for both a wrong name and a wrong password.
    return NextResponse.json({ ok: false, error: 'Wrong password for that name' }, { status: 401 });
  }

  const token = await createBillerToken(found.name);
  if (!token) {
    return NextResponse.json(
      { ok: false, error: 'Set AUTH_SECRET in .env so the biller can be signed.' },
      { status: 500 },
    );
  }
  fails.delete(key);
  const res = NextResponse.json({ ok: true, biller: found.name, names });
  res.cookies.set(BILLER_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: BILLER_TTL_MS / 1000,
  });
  return res;
}

export async function DELETE(request: NextRequest) {
  if (!(await panelSession(request))) {
    return NextResponse.json({ ok: false, error: 'Sign in first' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, biller: null, names: billerNames() });
  res.cookies.set(BILLER_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
