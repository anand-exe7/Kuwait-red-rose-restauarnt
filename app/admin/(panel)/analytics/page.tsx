import { requireAdmin } from "../../_ui/auth";
import AnalyticsPage from "../../_ui/AnalyticsPage";

export const metadata = { title: "Analytics" };

export default async function Page() {
  await requireAdmin("/admin/billing");
  return <AnalyticsPage />;
}
