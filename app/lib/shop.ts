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

/**
 * The shop's number as a human reads it: "+965 5556 8759".
 * Falls back to the WhatsApp number when no separate phone is configured, so
 * the landing page, the footer and the receipt all print the same digits
 * instead of a placeholder somebody typed once.
 */
export function shopPhoneDisplay(): string {
  const raw = (val(process.env.NEXT_PUBLIC_SHOP_PHONE) || val(process.env.NEXT_PUBLIC_SHOP_WHATSAPP)).replace(/\D/g, '');
  if (!raw) return '';
  if (raw.startsWith('965') && raw.length === 11) return `+965 ${raw.slice(3, 7)} ${raw.slice(7)}`;
  if (raw.length === 8) return `+965 ${raw.slice(0, 4)} ${raw.slice(4)}`;
  return `+${raw}`;
}

/** The same number as a `tel:` target, digits only. */
export function shopTelHref(): string {
  const d = shopPhoneDisplay().replace(/[^\d]/g, '');
  return d ? `tel:+${d}` : '';
}

/** Map coordinates for the shop pin, e.g. "29.2000989". Empty when unset. */
export function shopMapLat(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_MAP_LAT);
}

export function shopMapLng(): string {
  return val(process.env.NEXT_PUBLIC_SHOP_MAP_LNG);
}

/**
 * The Google Maps place link for "find our shop". Falls back to a coordinate
 * search, then to an address search, so the button always goes somewhere sane.
 */
export function shopMapUrl(): string {
  const explicit = val(process.env.NEXT_PUBLIC_SHOP_MAP_URL);
  if (explicit) return explicit;
  const lat = shopMapLat();
  const lng = shopMapLng();
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${shopFullName()}, ${shopAddress()}`)}`;
}

/** The embeddable map for the landing page, centred on the real shop pin. */
export function shopMapEmbedUrl(zoom = 17): string {
  const lat = shopMapLat();
  const lng = shopMapLng();
  const q = lat && lng ? `${lat},${lng}` : encodeURIComponent(`${shopFullName()}, ${shopAddress()}`);
  return `https://www.google.com/maps?q=${q}&z=${zoom}&output=embed`;
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
