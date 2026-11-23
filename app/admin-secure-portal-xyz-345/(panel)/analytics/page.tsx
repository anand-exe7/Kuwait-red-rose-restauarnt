import { requireAdmin } from "../../_ui/auth";
import LockGate from "../../_ui/LockGate";
import AnalyticsPage from "../../_ui/AnalyticsPage";

export const metadata = { title: "Analytics" };

// The figures are the owner's. The panel login is shared by whoever is on the
// counter, so what guards them is the manager password (ADMIN_LOCK_PASSWORD),
// asked for by LockGate. Until it is typed the page below is never mounted, so
// no revenue number reaches the browser at all.
export default async function Page() {
  await requireAdmin("/admin-secure-portal-xyz-345/billing");
  return (
    <LockGate title="Analytics">
      <AnalyticsPage />
    </LockGate>
  );
}
