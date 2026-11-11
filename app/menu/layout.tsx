import type { Metadata } from 'next';

// The menu page itself is a client component, so its SEO metadata lives here in
// a server layout. This is the second (and only other) indexable page.
export const metadata: Metadata = {
  title: 'Menu',
  description:
    'Browse the Red Rose Sweets menu — baklava, maamoul, kunafa, Medjool dates, cakes and French pastry. Order online for dine-in, takeaway or same-day delivery in Kuwait.',
  alternates: { canonical: '/menu' },
  openGraph: {
    type: 'website',
    siteName: 'Red Rose Sweets',
    locale: 'en_KW',
    url: '/menu',
    title: 'Menu · Red Rose Sweets',
    description:
      'Baklava, maamoul, kunafa, Medjool dates, cakes and French pastry — order online for delivery across Kuwait.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Menu · Red Rose Sweets',
    description:
      'Baklava, maamoul, kunafa, cakes and French pastry — order online for delivery across Kuwait.',
  },
};

export default function MenuLayout({ children }: { children: React.ReactNode }) {
  return children;
}
