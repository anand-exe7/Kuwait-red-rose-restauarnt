import { requireAdmin } from "../../../_ui/auth";
import LockGate from "../../../_ui/LockGate";
import WholesaleAnalyticsPage from "../../../_ui/WholesaleAnalyticsPage";

export const metadata = { title: "Wholesale analytics" };

// Behind the manager password, exactly like the shop's analytics.
export default async function Page() {
  await requireAdmin("/admin-secure-portal-xyz-345/billing");
  return (
    <LockGate title="Wholesale analytics">
      <WholesaleAnalyticsPage />
    </LockGate>
  );
}
