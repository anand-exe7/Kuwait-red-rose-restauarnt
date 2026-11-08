// Behind the sign-in: feed every panel page the admin Store + sidebar shell.
// Auth is handled at the edge by proxy.ts (rr_session cookie), so if a signed
// -out visitor reaches this layout they've already been bounced to the Red
// Rose login page. We still re-check on the server as a belt-and-braces guard.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "../../lib/session";
import { emptyAdminState } from "../_ui/types";
import { AdminProvider } from "../_ui/Store";
import Shell from "../_ui/Shell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const role = await verifySessionToken(token);
  if (role !== "admin") redirect("/admin/login");

  // Empty seed — the Store in _ui/Store.tsx hydrates from Red Rose's live
  // Supabase stores on mount, so the first paint is instant but the numbers
  // fill in as the client subscribes.
  const initial = emptyAdminState();
  return (
    <AdminProvider initial={initial} role="admin">
      <Shell>{children}</Shell>
    </AdminProvider>
  );
}
