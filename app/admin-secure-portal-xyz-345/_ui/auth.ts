// Server-side auth helpers used by the Red Rose admin pages. The real
// gate is in proxy.ts (edge) + (panel)/layout.tsx; these helpers exist so the
// per-page re-checks still compile.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isPanelRole, verifySessionToken } from "../../lib/session";

/** Who is looking at the panel: the owner, or nobody. There is one panel login
 *  now — the second one ("staff") is gone, replaced by the manager lock on the
 *  analytics and the deletions, and by the biller gate on the billing pages. */
export async function panelRole(): Promise<"admin" | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const role = await verifySessionToken(token);
  return isPanelRole(role) ? role : null;
}

/**
 * Guard a panel page. Anyone without a valid panel session goes to the sign-in
 * page. proxy.ts already does this at the edge, so this is the belt-and-braces
 * half: the page cannot render even if the matcher is ever changed.
 */
export async function requireAdmin(fallback = "/admin-secure-portal-xyz-345/login"): Promise<void> {
  if (await panelRole()) return;
  redirect(fallback);
}
