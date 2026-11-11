// The one place that decides which origin goes into a link we hand to a
// customer (WhatsApp invoice links, coupon links, QR codes…).
//
// Why this exists: every outbound link used to be built from
// `window.location.origin`. That is correct on the deployed site, but when
// staff send a coupon or an invoice from a laptop running `next dev`, the
// customer receives `http://localhost:3000/...` — a link that can never open
// on their phone. Set NEXT_PUBLIC_SITE_URL to the public site and every link
// is right no matter which machine sent it.

/** Hosts that only resolve on the machine that generated the link. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.localhost') ||
    // Private LAN ranges — reachable on the shop's wifi, never from outside.
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

function normalise(raw: string | undefined | null): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** The origin configured for the live site, if any. Empty when unset. */
export function configuredSiteUrl(): string {
  return (
    normalise(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalise(process.env.NEXT_PUBLIC_VERCEL_URL)
  );
}

/** The canonical production origin. Used for metadataBase, sitemap, robots and
 *  canonical/OG URLs — so it must always be absolute, even when the env var is
 *  not set at build time. Falls back to the registered domain. */
export const CANONICAL_ORIGIN = 'https://redrosesweets.com';
export function siteOrigin(): string {
  return configuredSiteUrl() || CANONICAL_ORIGIN;
}

/**
 * Origin to put in a link we send to a customer.
 *
 * @param preferred an origin the operator typed into admin Settings → public
 *                  URL. It wins over everything else.
 */
export function publicBaseUrl(preferred?: string | null): string {
  const chosen = normalise(preferred) || configuredSiteUrl();
  if (chosen) return chosen;
  if (typeof window === 'undefined') return '';
  return window.location.origin.replace(/\/$/, '');
}

/** Absolute, shareable URL for a path on our own site. */
export function publicLink(path: string, preferred?: string | null): string {
  const base = publicBaseUrl(preferred);
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/**
 * True when the link we are about to send would only work on this machine —
 * i.e. nothing is configured and we are running on localhost / the LAN. Staff
 * UIs use this to warn before a dead link goes out.
 */
export function publicLinkIsLocalOnly(preferred?: string | null): boolean {
  const base = publicBaseUrl(preferred);
  if (!base) return true;
  try {
    return isLocalHost(new URL(base).host);
  } catch {
    return true;
  }
}
