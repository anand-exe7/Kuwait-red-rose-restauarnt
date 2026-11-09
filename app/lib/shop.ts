// Who the shop is. Every customer-facing surface — the printed receipt, the
// public invoice page, the WhatsApp message, the admin footer — reads the name,
// owner, phone and address from here instead of carrying its own copy.
//
// The values come from NEXT_PUBLIC_* environment variables so a rebrand, a new
// branch or a changed phone number is a .env edit and a redeploy, never a code
// change. Next.js inlines NEXT_PUBLIC_* at build time, so these must be read as
// whole `process.env.X` expressions (destructuring or dynamic keys do not work).

function val(raw: string | undefined, fallback = ''): string {
  const v = (raw || '').trim();
  return v || fallback;
}

/** Shop name, e.g. "Red Rose". */
export function shopName(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_NAME, 'Red Rose');
}

/** Legal / long name used on printed documents. */
export function shopFullName(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_FULL_NAME, 'Red Rose Sweets');
}

/** Branch or neighbourhood, e.g. "Al Qurain". */
export function shopLocation(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_LOCATION);
}

/** Proprietor's name, printed on the invoice. */
export function shopOwner(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_OWNER);
}

/** Contact number as the customer should dial it (local format is fine). */
export function shopPhone(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_PHONE);
}

/**
 * Street address for receipts. Falls back to the location so a receipt never
 * prints a blank address line when only NEXT_PUBLIC_SHOP_LOCATION is set.
 */
export function shopAddress(): string {
  const explicit = val(process.env.NEXT_PUBLIC_SHOP_ADDRESS);
  if (explicit) return explicit;
  const loc = shopLocation();
  const country = val(process.env.NEXT_PUBLIC_SHOP_COUNTRY, 'Kuwait');
  return [loc, country].filter(Boolean).join(', ');
}

/** The whole identity in one object, for components that render several lines. */
export interface ShopIdentity {
  name: string;
  fullName: string;
  location: string;
  owner: string;
  phone: string;
  address: string;
}

export function shopIdentity(): ShopIdentity {
  return {
    name: shopName(),
    fullName: shopFullName(),
    location: shopLocation(),
    owner: shopOwner(),
    phone: shopPhone(),
    address: shopAddress(),
  };
}

/** "Red Rose · Al Qurain" — the one-line header used above an invoice. */
export function shopHeadline(): string {
  const loc = shopLocation();
  return loc ? `${shopName()} · ${loc}` : shopName();
}
