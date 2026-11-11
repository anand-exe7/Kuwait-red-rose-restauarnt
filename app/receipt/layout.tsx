import type { Metadata } from 'next';

// A receipt/invoice is a private, per-customer document shared by a direct
// link (WhatsApp). It must never be indexed, even if the link leaks, so this
// server layout marks the whole /receipt segment noindex. (The page itself is
// a client component and cannot export metadata.)
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ReceiptLayout({ children }: { children: React.ReactNode }) {
  return children;
}
