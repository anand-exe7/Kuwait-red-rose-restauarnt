import { requireAdmin } from "../../_ui/auth";
import CouponsPage from "../../_ui/CouponsPage";

export const metadata = { title: "Coupons" };

export default async function Page() {
  await requireAdmin("/admin-secure-portal-xyz-345/billing");
  return <CouponsPage />;
}
