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
    });
  }
  return client;
}

let warned = false;
