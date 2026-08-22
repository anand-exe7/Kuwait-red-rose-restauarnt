// Server-side session helpers for the simple per-role password gate.
//
// Passwords live ONLY in environment variables (never in the client bundle):
//   ADMIN_PASSWORD, WAITER_PASSWORD, CHEF_PASSWORD
// A successful password check issues a signed, tamper-proof cookie value of the
// form "<role>.<hmac>". The HMAC (keyed by AUTH_SECRET) is what makes the cookie
// unforgeable — a user cannot simply set `rr_session=admin` by hand.
//
// This module is import-safe from both Route Handlers (Node runtime) and
// proxy.ts (Edge runtime): it uses Web Crypto (globalThis.crypto.subtle), which
// exists in both.

export type Role = 'admin' | 'waiter' | 'chef';

export const ROLES: Role[] = ['admin', 'waiter', 'chef'];
export const SESSION_COOKIE = 'rr_session';

/** Maps a role to the env var holding its password. */
export function passwordForRole(role: Role): string | undefined {
  switch (role) {
    case 'admin':
      return process.env.ADMIN_PASSWORD;
    case 'waiter':
      return process.env.WAITER_PASSWORD;
    case 'chef':
      return process.env.CHEF_PASSWORD;
  }
}

function authSecret(): string {
  // Falls back to a constant only so local dev without a secret still works.
  // Always set AUTH_SECRET in production.
  return process.env.AUTH_SECRET || 'red-rose-dev-secret-change-me';
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(role: Role): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(authSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`rr:${role}`));
  return toHex(sig);
}

/** Builds the signed cookie value for a role. */
export async function createSessionToken(role: Role): Promise<string> {
  return `${role}.${await hmac(role)}`;
}

/** Returns the role if the token is valid & untampered, otherwise null. */
export async function verifySessionToken(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const role = token.slice(0, dot) as Role;
  const sig = token.slice(dot + 1);
  if (!ROLES.includes(role)) return null;
  const expected = await hmac(role);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? role : null;
}

/** Which roles may access a given authenticated role's pages. Admin can go anywhere. */
export function roleCanAccess(sessionRole: Role, requiredRole: Role): boolean {
  return sessionRole === 'admin' || sessionRole === requiredRole;
}
