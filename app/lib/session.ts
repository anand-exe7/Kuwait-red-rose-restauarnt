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
//
// There used to be a fourth role, 'staff' — a second login to the same admin
// panel, minus the order history and the analytics. The shop does not want two
// panel logins any more: there is ONE panel login (the owner's), and the two
// things that used to separate the roles are now handled differently:
//   * the manager lock  (ADMIN_LOCK_PASSWORD) guards the analytics and every
//     destructive action — see the lock helpers at the bottom of this file;
//   * the biller gate   (BILLERS) records WHO is on the counter, so a bill can
//     never be filed under somebody else's name.

export type Role = 'admin' | 'waiter' | 'chef';

export const ROLES: Role[] = ['admin', 'waiter', 'chef'];

/** Every role has a sign-in page and a slug of its own. */
export type GateRole = Role;
export const GATE_ROLES: GateRole[] = ['admin', 'waiter', 'chef'];
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

/** The signing secret for server-only code (customer sign-in links). Null if unusable. */
export function getAuthSecret(): string | null {
  return authSecret();
}

/** HMAC-SHA256 hex of any message with the auth secret (null if the secret is unusable). */
export const signMessage = hmac;

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

/** Which roles may access a given authenticated role's pages. The owner can go
 *  anywhere; the waiter and the chef only to their own station. */
export function roleCanAccess(sessionRole: Role, requiredRole: Role): boolean {
  if (sessionRole === 'admin') return true;
  return sessionRole === requiredRole;
}

/** Signed in to the admin panel. Only the owner's login opens it. */
export function isPanelRole(role: Role | null): role is 'admin' {
  return role === 'admin';
}

// ---------------------------------------------------------------------------
// The manager lock — analytics + every destructive action
// ---------------------------------------------------------------------------
//
// The panel login is shared by whoever is behind the counter, so it cannot be
// what protects the figures or the ability to wipe a bill out of the records.
// A second password does that. Typing it correctly mints a short-lived signed
// cookie, which is what the server checks on the write that follows.
//
// The cookie is NOT a session. The panel throws it away on every route change,
// so opening the analytics and then going anywhere else locks them again, and
// every delete asks for the password on its own.

export const LOCK_COOKIE = 'rr_lock';
/** A backstop, not the real limit. What actually ends an unlock is leaving the
 *  page: the panel clears this cookie on every route change and on load, so an
 *  unlock belongs to the one page visit that earned it and never to the next.
 *  This TTL only catches the case where nobody navigates at all. */
export const LOCK_TTL_MS = 5 * 60 * 1000;

/** The manager password, or undefined when it has not been configured. */
export function lockPassword(): string | undefined {
  const v = (process.env.ADMIN_LOCK_PASSWORD || '').trim();
  return v || undefined;
}

export async function createLockToken(): Promise<string | null> {
  const exp = Date.now() + LOCK_TTL_MS;
  const sig = await hmac(`lock:${exp}`);
  return sig ? `${exp}.${sig}` : null;
}

/** True when this browser has typed the manager password recently. */
export async function verifyLockToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig, ...rest] = token.split('.');
  if (rest.length || !expRaw || !sig) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmac(`lock:${exp}`);
  return !!expected && safeEqual(sig, expected);
}

// ---------------------------------------------------------------------------
// The biller gate — who is on the counter right now
// ---------------------------------------------------------------------------
//
// Two people work the counter: the owner and one other. Both bill through the
// same panel login, so without this every bill would look like the owner's.
//
// BILLERS lists them, each with a password of their own:
//     BILLERS="Anand:4821,Ravi:7390"
// A name can only be switched on by somebody who knows THAT person's password,
// which is the whole point: the second man cannot bill under the owner's name,
// and the owner cannot bill under his. Switching off takes no password (anyone
// can hand the counter over) and stays off until the next person signs in.
//
// The biller's name is stamped on the bill BY THE SERVER, from this cookie —
// never from the browser — so it cannot be faked by editing a request.

export const BILLER_COOKIE = 'rr_biller';
/** A biller stays signed in for a long shift; they sign out when they leave. */
export const BILLER_TTL_MS = 16 * 60 * 60 * 1000;

export interface Biller {
  name: string;
  password: string;
}

/** The counter staff from BILLERS, in the order they are listed. */
export function billers(): Biller[] {
  const raw = (process.env.BILLERS || '').trim();
  if (!raw) return [];
  const out: Biller[] = [];
  for (const entry of raw.split(',')) {
    const at = entry.indexOf(':');
    if (at < 1) continue;
    const name = entry.slice(0, at).trim().slice(0, 40);
    const password = entry.slice(at + 1).trim();
    if (!name || !password) continue;
    if (out.some((b) => b.name.toLowerCase() === name.toLowerCase())) continue;
    out.push({ name, password });
  }
  return out;
}

/** Just the names — safe to send to the browser (the passwords are not). */
export function billerNames(): string[] {
  return billers().map((b) => b.name);
}

/** The biller whose name AND password both match, or null. */
export async function matchBiller(name: string, password: string): Promise<Biller | null> {
  const wanted = (name || '').trim().toLowerCase();
  const found = billers().find((b) => b.name.toLowerCase() === wanted);
  // Still run a comparison when the name is unknown, so a wrong name and a
  // wrong password take the same amount of time to come back.
  const expected = found?.password ?? '\u0000unmatchable';
  const ok = await passwordMatches(password ?? '', expected);
  return found && ok ? found : null;
}

export async function createBillerToken(name: string): Promise<string | null> {
  const exp = Date.now() + BILLER_TTL_MS;
  // The name goes in the signature, so it cannot be swapped for another's.
  const sig = await hmac(`biller:${name}:${exp}`);
  return sig ? `${encodeURIComponent(name)}.${exp}.${sig}` : null;
}

/** The name of the biller on this browser, or null when nobody is signed in.
 *  A name that has since been taken out of BILLERS stops verifying. */
export async function verifyBillerToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const [rawName, expRaw, sig, ...rest] = token.split('.');
  if (rest.length || !rawName || !expRaw || !sig) return null;
  let name: string;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    return null;
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmac(`biller:${name}:${exp}`);
  if (!expected || !safeEqual(sig, expected)) return null;
  return billerNames().some((n) => n === name) ? name : null;
}
