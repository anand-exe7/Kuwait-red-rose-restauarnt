// Third-party delivery partners the shop hands counter deliveries to.
//
// The list is configuration, not code: set NEXT_PUBLIC_DELIVERY_PARTNERS to a
// comma-separated list in .env to change it. The default is the four partners
// the shop works with today.

const DEFAULT_PARTNERS = "Talabat,Keeta,Deliveroo,Soonu";

export function deliveryPartners(): string[] {
  const raw = (process.env.NEXT_PUBLIC_DELIVERY_PARTNERS || "").trim() || DEFAULT_PARTNERS;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of raw.split(",")) {
    const name = p.trim();
    if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); out.push(name); }
  }
  return out;
}
