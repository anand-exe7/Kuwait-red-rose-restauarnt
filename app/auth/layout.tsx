import type { Metadata } from 'next';

// OAuth callback hop — never a landing page, never indexable.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
