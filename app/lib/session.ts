// Server-side session helpers for the simple per-role password gate.
//
// Passwords live ONLY in environment variables (never in the client bundle):
//   ADMIN_PASSWORD, WAITER_PASSWORD, CHEF_PASSWORD
// A successful password check issues a signed, tamper-proof cookie value of the
// form "<role>.<expiresAtMs>.<hmac>". The HMAC (keyed by AUTH_SECRET) covers the
// role AND the expiry, so a user can neither forge a role nor extend a session.
//
// This module is import-safe from both Route Handlers (Node runtime) and
// proxy.ts (Edge runtime): it uses Web Crypto (globalThis.crypto.subtle), which
// exists in both.

export type Role = 'admin' | 'waiter' | 'chef';

export const ROLES: Role[] = ['admin', 'waiter', 'chef'];
export const SESSION_COOKIE = 'rr_session';
/** How long a staff login lasts (one shift). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

/** Signing secret, or null when it is unusable (missing in production). */
function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  // A constant fallback would let anyone forge a cookie, so it is dev-only.
  if (process.env.NODE_ENV === 'production') return null;
  return 'red-rose-dev-secret-change-me';
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(message: string): Promise<string | null> {
  const secret = authSecret();
  if (!secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Constant-time password check that does not leak the password length. */
export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([hmac(`pw:${input}`), hmac(`pw:${expected}`)]);
  return a !== null && b !== null && safeEqual(a, b);
}

/** Builds the signed cookie value for a role. Null if the server is misconfigured. */
export async function createSessionToken(role: Role): Promise<string | null> {
  const exp = Date.now() + SESSION_TTL_MS;
  const sig = await hmac(`rr:${role}:${exp}`);
  return sig ? `${role}.${exp}.${sig}` : null;
}

/** Returns the role if the token is valid, untampered and unexpired, otherwise null. */
export async function verifySessionToken(token: string | undefined | null): Promise<Role | null> {
  if (!token) return null;
  const [role, expRaw, sig, ...rest] = token.split('.');
  if (rest.length || !role || !expRaw || !sig) return null;
  if (!ROLES.includes(role as Role)) return null;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmac(`rr:${role}:${exp}`);
  if (!expected || !safeEqual(sig, expected)) return null;
  return role as Role;
}

/** Which roles may access a given authenticated role's pages. Admin can go anywhere. */
export function roleCanAccess(sessionRole: Role, requiredRole: Role): boolean {
  return sessionRole === 'admin' || sessionRole === requiredRole;
}
