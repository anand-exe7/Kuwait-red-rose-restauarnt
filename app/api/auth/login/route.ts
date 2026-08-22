import { NextResponse } from 'next/server';
import { createSessionToken, passwordForRole, ROLES, SESSION_COOKIE, type Role } from '../../../lib/session';

// Validates a role password server-side (passwords come from env vars only) and,
// on success, sets a signed httpOnly cookie. The password never reaches the client.
export async function POST(request: Request) {
  let body: { role?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const role = body.role as Role;
  const password = (body.password ?? '').toString();

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

  if (password !== expected) {
    return NextResponse.json({ ok: false, error: 'Incorrect password' }, { status: 401 });
  }

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
