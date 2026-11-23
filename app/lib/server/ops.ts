import type { SupabaseClient } from '@supabase/supabase-js';

// Shop switches the owner flips from the panel, read on the SERVER.
//
// They live in one `app_settings` row (id = 'ops'); the browser reads the same
// row through app/lib/opsStore.ts. The only switch so far is online ordering:
// with it off, the website is a menu people can look at and nothing more.
//
// Hiding the buttons in the browser is a courtesy; THIS is the rule. Anyone can
// post to /api/db by hand, so the answer to "may a customer place an order?"
// has to be settled here, from the database, on every insert.

export const OPS_ROW_ID = 'ops';

export interface Ops {
  /** Customers may order from the website (and the QR menu). */
  orderingEnabled: boolean;
}

export const DEFAULT_OPS: Ops = { orderingEnabled: true };

/** The shop's switches. Falls back to the defaults (ordering ON) when the row
 *  is missing or unreadable, so a database hiccup never closes the shop. */
export async function loadOps(sb: SupabaseClient): Promise<Ops> {
  const { data, error } = await sb
    .from('app_settings')
    .select('value')
    .eq('id', OPS_ROW_ID)
    .maybeSingle();
  if (error || !data) return DEFAULT_OPS;
  const v = (data.value ?? {}) as Record<string, unknown>;
  return { orderingEnabled: v.orderingEnabled !== false };
}

/** Is the website taking customer orders right now? */
export async function orderingEnabled(sb: SupabaseClient): Promise<boolean> {
  return (await loadOps(sb)).orderingEnabled;
}
