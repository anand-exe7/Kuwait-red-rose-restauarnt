"use client";

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

// Customer sign-in (Google through Supabase Auth) and the helper that calls our
// signed-in delivery API. The server verifies the token; nothing here is trusted.

export interface CustomerInfo {
  name: string;
  email: string | null;
}

// Local testing only: lets a developer act as a fake customer without Google.
// The server ignores this header in production builds.
const DEV_LOGIN = process.env.NEXT_PUBLIC_ALLOW_DEV_CUSTOMER_LOGIN === '1';
const DEV_KEY = 'rr_dev_customer';

function readDev(): string | null {
  try { return window.localStorage.getItem(DEV_KEY); } catch { return null; }
}

export function useCustomer() {
  const [session, setSession] = useState<Session | null>(null);
  const [dev, setDev] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reading browser-only state after mount (localStorage / Supabase session).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (DEV_LOGIN) setDev(readDev());
    const sb = getSupabase();
    if (!sb) { setReady(true); return; }
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) throw new Error('Sign-in is not configured');
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
    if (error) throw error;
  }, []);

  const signInAsDev = useCallback((name: string) => {
    try { window.localStorage.setItem(DEV_KEY, name); } catch { /* ignore */ }
    setDev(name);
  }, []);

  const signOut = useCallback(async () => {
    try { window.localStorage.removeItem(DEV_KEY); } catch { /* ignore */ }
    setDev(null);
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
  }, []);

  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const user: CustomerInfo | null = session
    ? { name: String(meta.full_name ?? meta.name ?? session.user.email ?? 'Customer'), email: session.user.email ?? null }
    : dev ? { name: `Test ${dev}`, email: null } : null;

  /** Calls /api/delivery/customer with the signed-in customer's credentials. */
  const call = useCallback(async <T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
    else if (dev) headers['x-dev-customer'] = dev;
    const res = await fetch('/api/delivery/customer', { method: 'POST', headers, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Something went wrong. Please try again.');
    return json as T & { ok: true };
  }, [session, dev]);

  return { user, ready, signInWithGoogle, signInAsDev, signOut, call, devLoginAvailable: DEV_LOGIN };
}

/** Public (no sign-in) delivery API: distance quote and rules. */
export async function publicDelivery<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}) {
  const res = await fetch('/api/delivery/public', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Could not reach the server');
  return json as T & { ok: true };
}
