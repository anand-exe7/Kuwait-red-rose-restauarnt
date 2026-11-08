// Server-side auth helpers used by the Red Rose admin pages. The real
// gate is in proxy.ts (edge) + (panel)/layout.tsx; these helpers exist so the
// per-page re-checks still compile.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "../../lib/session";

export type Role = "admin" | "staff";

async function readRole(): Promise<"admin" | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const role = await verifySessionToken(token);
  return role === "admin" ? "admin" : null;
}

/** Guard an admin-only panel page. Redirects staff / signed-out viewers. */
export async function requireAdmin(fallback = "/admin/login"): Promise<void> {
  const role = await readRole();
  if (!role) redirect(fallback);
}

