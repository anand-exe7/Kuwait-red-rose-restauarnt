import { redirect } from "next/navigation";

export const metadata = { title: "Admin" };

// Admin landing — drop into Billing (the POS).
export default function Page() {
  redirect("/admin/billing");
}
