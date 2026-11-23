import type { MetadataRoute } from 'next';
import { siteOrigin } from './lib/publicUrl';

/**
 * robots.txt, generated the Next-native way (MetadataRoute.Robots).
 *
 * Only the marketing surface — the home page and the public menu — is meant to
 * be indexed. Everything else is a staff console, an auth hop, or a private
 * per-customer document (an invoice/receipt/coupon shared by link), so it is
 * disallowed here and additionally carries `robots: noindex` in its own
 * metadata. The sitemap is advertised so crawlers find the canonical set fast.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteOrigin();
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/menu'],
        disallow: [
          '/api/',
          '/admin-secure-portal-xyz-345/',
          '/chef-station-abc-123/',
          '/waiter-dashboard-def-456/',
          '/login',
          '/auth/',
          '/invoice/',
          '/receipt/',
          '/coupon/',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
