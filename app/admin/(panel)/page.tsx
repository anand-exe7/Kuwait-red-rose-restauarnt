import { redirect } from "next/navigation";

export const metadata = { title: "Admin" };

// Admin landing — drop straight into Billing (the POS). Each distinct panel
// (Billing, Orders, Kitchen, Analytics, Inventory, Coupons) lives at its own
// route under this group.
export default function Page() {
  redirect("/admin/billing");
}
