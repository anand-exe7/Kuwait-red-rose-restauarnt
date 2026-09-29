import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client for Route Handlers (login lockout, etc.).
// Uses the PUBLIC anon key (NEXT_PUBLIC_* vars are available on the server too).
// Kept separate from the browser client — no realtime socket needed here.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return client;
}
