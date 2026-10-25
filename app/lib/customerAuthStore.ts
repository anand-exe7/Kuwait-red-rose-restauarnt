"use client";

// Customer auth — Supabase Google OAuth, exposed through the same
// useSyncExternalStore pattern as the other stores so React stays in sync
// without a provider.
//
// Browsing the menu is public; placing an order (dine-in, takeaway, or
// delivery) requires a signed-in customer. The user record Supabase returns
// is cached in-memory and refreshed via onAuthStateChange.

import { getSupabase, isSupabaseConfigured } from './supabase';

export interface CustomerUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

type AuthState = {
  loading: boolean;        // true until the first getSession() resolves
  user: CustomerUser | null;
};

// Persisted on the device so a demo sign-in survives reloads during testing.
// Only used when Supabase isn't configured; replaced by a real session the
// moment real auth is wired up.
const DEMO_USER_KEY = 'cenexa_demo_customer';

let state: AuthState = { loading: true, user: null };
let listeners: Array<() => void> = [];
let initialized = false;
let authSub: { unsubscribe: () => void } | null = null;

function emit() {
  for (const l of listeners) l();
}

function toUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null | undefined): CustomerUser | null {
  if (!u) return null;
  const md = u.user_metadata ?? {};
  const name = (md.full_name as string) || (md.name as string) || null;
  const avatarUrl = (md.avatar_url as string) || (md.picture as string) || null;
  return { id: u.id, email: u.email ?? null, name, avatarUrl };
}

function readDemoUser(): CustomerUser | null {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    if (raw) return JSON.parse(raw) as CustomerUser;
  } catch { /* corrupt JSON — ignore */ }
  return null;
}

function ensureInit() {
  if (initialized) return;
  initialized = true;
  if (typeof window === 'undefined') return;

  // A stored demo user ALWAYS wins over Supabase — if the shopper used the
  // in-page name sign-in, we don't want a Supabase background check (which
  // may return null if OAuth never completed) to overwrite that session.
  const demo = readDemoUser();

  const sb = getSupabase();
  if (!sb) {
    state = { loading: false, user: demo };
    emit();
    return;
  }
  // Prefer the demo user immediately — real Supabase sign-ins take priority
  // only after they land (handled below).
  if (demo) {
    state = { loading: false, user: demo };
    emit();
  } else {
    void sb.auth.getSession().then(({ data }) => {
      // Only update if the demo user wasn't set during the await.
      if (!readDemoUser()) {
        state = { loading: false, user: toUser(data.session?.user ?? null) };
        emit();
      }
    });
  }
  const { data } = sb.auth.onAuthStateChange((_evt, session) => {
    const supabaseUser = toUser(session?.user ?? null);
    // A real Supabase sign-in overrides any demo user (and clears it).
    if (supabaseUser) {
      try { localStorage.removeItem(DEMO_USER_KEY); } catch { /* ignore */ }
      state = { loading: false, user: supabaseUser };
      emit();
      return;
    }
    // No Supabase user — fall back to the demo user if one exists, so a
    // "SIGNED_OUT" event with a leftover demo session doesn't wipe it out.
    const demoNow = readDemoUser();
    state = { loading: false, user: demoNow };
    emit();
  });
  authSub = data.subscription;
}

export function subscribeToCustomerAuth(cb: () => void): () => void {
  ensureInit();
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    if (listeners.length === 0 && authSub) {
      authSub.unsubscribe();
      authSub = null;
      initialized = false;
    }
  };
}

export function getCustomerAuthSnapshot(): AuthState {
  ensureInit();
  return state;
}

// Cached so useSyncExternalStore's server snapshot is reference-stable across
// renders — a new object each call would cause React to loop.
const SERVER_SNAPSHOT: AuthState = { loading: true, user: null };
export function getCustomerAuthServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

/** Kick off the Google OAuth round-trip. Supabase redirects to Google, then back
 *  to /auth/callback, which forwards to `redirectTo` (defaults to the current
 *  page). Returns false when Supabase isn't configured, so the UI can hint. */
export async function signInWithGoogle(redirectTo?: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const target =
    redirectTo
      ?? (typeof window === 'undefined'
        ? '/'
        : window.location.pathname + window.location.search);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(target)}`,
    },
  });
  if (error) {
    console.error('[auth] google sign-in failed', error.message);
    return false;
  }
  return true;
}

export async function signOut(): Promise<void> {
  // Clear any demo session first so the Supabase listener (if present)
  // doesn't fall back to it after sign-out.
  try { localStorage.removeItem(DEMO_USER_KEY); } catch { /* ignore */ }
  const sb = getSupabase();
  if (sb) {
    await sb.auth.signOut();
  }
  state = { loading: false, user: null };
  emit();
}

/** True when Supabase auth can be used at all (env vars present). */
export function customerAuthAvailable(): boolean {
  return isSupabaseConfigured();
}

/** Quick in-page sign-in — creates a local user record keyed by name and
 *  takes precedence over any Supabase session for the rest of this device.
 *  Lets a shopper check out without going through Google OAuth. */
export function signInAsDemo(name: string): CustomerUser {
  const trimmed = name.trim() || 'Guest';
  const user: CustomerUser = {
    id: `demo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    email: `${trimmed.toLowerCase().replace(/\s+/g, '.')}@demo.local`,
    name: trimmed,
    avatarUrl: null,
  };
  try { localStorage.setItem(DEMO_USER_KEY, JSON.stringify(user)); } catch { /* ignore */ }
  state = { loading: false, user };
  emit();
  return user;
}
