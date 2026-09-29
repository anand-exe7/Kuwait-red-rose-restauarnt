import { NextResponse } from 'next/server';
import { createSessionToken, passwordForRole, ROLES, SESSION_COOKIE, type Role } from '../../../lib/session';
import { getServerSupabase } from '../../../lib/supabaseServer';

// Validates a role password server-side (passwords come from env vars only) and,
// on success, sets a signed httpOnly cookie. The password never reaches the client.
//
// Brute-force lockout: every attempt is logged to Supabase `login_attempts`.
// After too many failures from the same IP+role within the window, further
// attempts are refused with 429 until the window passes. If Supabase isn't
// configured, the lockout is simply skipped (auth still works).

const MAX_FAILED = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

async function recentFailures(ip: string, role: string): Promise<number> {
  const sb = getServerSupabase();
  if (!sb) return 0;
  const since = Date.now() - WINDOW_MS;
  const { count, error } = await sb
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('role', role)
    .eq('success', false)
    .gte('created_at', since);
  if (error) {
    console.error('[login] lockout check failed', error.message);
    return 0;
  }
  return count ?? 0;
}

async function logAttempt(ip: string, role: string, success: boolean) {
  const sb = getServerSupabase();
  if (!sb) return;
  const { error } = await sb.from('login_attempts').insert({ ip, role, success, created_at: Date.now() });
  if (error) console.error('[login] attempt log failed', error.message);
}

export async function POST(request: Request) {
  let body: { role?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const role = body.role as Role;
  const password = (body.password ?? '').toString();
  const ip = clientIp(request);

  if (!ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Unknown role' }, { status: 400 });
  }

  const expected = passwordForRole(role);
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'Login is not configured on the server. Set the password in .env.' },
      { status: 500 }
    );
  }

  // Lockout gate.
  if ((await recentFailures(ip, role)) >= MAX_FAILED) {
    return NextResponse.json(
      { ok: false, error: 'Too many failed attempts. Try again in a few minutes.' },
      { status: 429 }
    );
  }

  if (password !== expected) {
    await logAttempt(ip, role, false);
    return NextResponse.json({ ok: false, error: 'Incorrect password' }, { status: 401 });
  }

  await logAttempt(ip, role, true);
  const token = await createSessionToken(role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 12, // 12h shift
  });
  return res;
}
