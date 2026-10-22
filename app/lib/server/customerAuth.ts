import 'server-only';
import type { NextRequest } from 'next/server';
import { getServerSupabase } from '../supabaseServer';
import { HttpError, unauthorized } from './http';

// Customers sign in with Google through Supabase Auth. The browser sends its
// access token as "Authorization: Bearer <jwt>"; we ask Supabase who it belongs
// to. We never trust a user id sent in the request body.

export interface Customer {
  id: string;
  email: string | null;
  name: string;
}

export async function requireCustomer(request: NextRequest): Promise<Customer> {
  // LOCAL TESTING ONLY: lets a developer act as a fake customer without Google.
  // Ignored in production builds, whatever the env var says.
  if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_CUSTOMER_LOGIN === '1') {
    const dev = request.headers.get('x-dev-customer');
    if (dev && /^[a-z0-9_-]{3,40}$/i.test(dev)) return { id: `dev-${dev}`, email: `${dev}@example.test`, name: `Dev ${dev}` };
  }

  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw unauthorized();
  const sb = getServerSupabase();
  if (!sb) throw new HttpError(503, 'Database is not configured');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw unauthorized('Your session expired. Please sign in again.');
  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(meta.full_name ?? meta.name ?? u.email ?? 'Customer');
  return { id: u.id, email: u.email ?? null, name };
}
