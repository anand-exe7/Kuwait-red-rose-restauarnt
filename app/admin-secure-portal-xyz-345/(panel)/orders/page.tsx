import { requireAdmin } from "../../_ui/auth";
import OrdersPage from "../../_ui/OrdersPage";

export const metadata = { title: "Orders" };

// The order history is open to the panel; voiding or deleting a bill from it
// asks for the manager password (the confirm dialog in _ui/Shell.tsx), and
// /api/db refuses the write without it.
export default async function Page() {
  await requireAdmin("/admin-secure-portal-xyz-345/billing");
  return <OrdersPage />;
}
