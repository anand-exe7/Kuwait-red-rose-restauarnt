"use client";

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Browser Supabase client. Uses only the PUBLIC anon key + url, so it is safe
// to ship in the client bundle. Never import the service_role key here.
//
// The client is created lazily and cached so we don't spin one up during SSR
// (where the env vars may be present but there's no realtime socket to open).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
let dataClient: SupabaseClient | null = null;

/** True when the public env vars are configured. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Shared browser client, or null on the server / when env is missing. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!url || !anonKey) {
    // Surface a clear, one-time hint instead of failing cryptically.
    if (!warned) {
      warned = true;
      console.warn(
        '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
        'Copy .env.example to .env.local and fill them in — see SUPABASE_SETUP.md.'
      );
    }
    return null;
  }
  if (!client) {
    client = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        // Implicit flow instead of PKCE: Google puts the access token
        // directly in the URL hash on return, so there is no code-verifier
        // handshake that can get lost from localStorage (which was failing
        // with "PKCE code verifier not found in storage" on this app's
        // SPA setup — PKCE needs @supabase/ssr on both sides to survive).
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/**
 * Client for reading SHOP data (every store built on createRealtimeStore) and
 * for its Realtime channels.
 *
 * Deliberately session-less: `persistSession: false` plus its own storage key,
 * so it never picks up the Google session a customer signed in with on this
 * same browser. The app has one client otherwise, and the stores shared it —
 * so once anybody had signed in, every store read went to Postgres as
 * `authenticated` instead of `anon`. Any table whose RLS policy named only
 * `anon` then answered with zero rows, which is how a saved expense stayed in
 * the database but never showed up on the Expenses page.
 *
 * No table's read policy depends on who is asking (there is no auth.uid() in
 * supabase/*.sql — shop data is public-readable, and every write goes through
 * /api/db with the service role), so reading as `anon` is both correct and the
 * one thing that cannot be broken by a customer login.
 */
export function getSupabaseData(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (!url || !anonKey) return getSupabase(); // reuses the one-time warning
  if (!dataClient) {
    dataClient = createClient(url, anonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'rr-data-anon',
      },
    });
  }
  return dataClient;
}

let warned = false;
