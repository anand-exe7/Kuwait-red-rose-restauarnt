import { requireAdmin } from "../../../_ui/auth";
import WholesaleOrdersPage from "../../../_ui/WholesaleOrdersPage";

export const metadata = { title: "Wholesale orders" };

// Open to the panel; deleting a wholesale bill asks for the manager password.
export default async function Page() {
  await requireAdmin("/admin-secure-portal-xyz-345/billing");
  return <WholesaleOrdersPage />;
}
