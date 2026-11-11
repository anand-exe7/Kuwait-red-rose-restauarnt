import BillingPage from "../../_ui/BillingPage";

export const metadata = { title: "Billing" };

export default async function Page({ searchParams }: PageProps<"/admin-secure-portal-xyz-345/billing">) {
  const { tab } = await searchParams;
  const sessionId = typeof tab === "string" ? tab : undefined;
  return <BillingPage key={sessionId ?? "none"} sessionId={sessionId} />;
}
