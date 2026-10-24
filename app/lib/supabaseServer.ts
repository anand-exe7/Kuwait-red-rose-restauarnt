import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client for Route Handlers (guarded writes, login lockout).
//
// Prefers the service-role key (SUPABASE_SERVICE_ROLE_KEY, server-only, never
// NEXT_PUBLIC_*), which bypasses RLS. That is what lets the database deny all
// anonymous writes (see supabase/security.sql). Until the key is set it falls
// back to the public anon key so the app keeps working under the old
// permissive policies.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

/** True when privileged server writes are available (DB can be locked down). */
export const hasServiceKey = Boolean(serviceKey);

export function getServerSupabase(): SupabaseClient | null {
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
