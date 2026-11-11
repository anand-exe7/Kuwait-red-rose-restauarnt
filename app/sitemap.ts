import type { MetadataRoute } from 'next';
import { siteOrigin } from './lib/publicUrl';

/**
 * sitemap.xml, generated the Next-native way (MetadataRoute.Sitemap).
 *
 * The public, indexable surface of this site is deliberately small: the
 * marketing home page and the single public menu/ordering page. Everything
 * else is a staff console or a private per-customer document (invoice,
 * receipt, coupon) reachable only by a shared link — none of it belongs in a
 * sitemap, and all of it is disallowed in robots.ts + marked noindex.
 *
 * There are no dynamically-generated *content* routes (no blog, no per-product
 * pages — the menu renders from the live store on one URL), so there is
 * nothing to fetch and fan out here. If product/landing pages are added later,
 * map them to entries below.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteOrigin();
  const now = new Date();
  return [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${base}/menu`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];
}
