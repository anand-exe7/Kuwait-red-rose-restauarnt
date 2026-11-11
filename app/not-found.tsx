import Link from 'next/link';
import { landingFonts } from './fonts';

// Custom 404. Next serves this with a 404 status (so it is correctly
// non-indexable) in place of the default framework page.
export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      className={`${landingFonts} flex min-h-screen flex-col items-center justify-center bg-brand-cream px-6 text-center text-brand-ink`}
    >
      <p className="font-display text-[88px] font-bold leading-none text-brand-red">404</p>
      <h1 className="mt-4 font-display text-[28px] font-semibold text-brand-wine">
        This page has crumbled
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-brand-ink/65">
        The page you&apos;re looking for isn&apos;t here. Let&apos;s get you back to something sweet.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full bg-brand-red px-6 text-[13px] font-bold uppercase tracking-wide text-white"
        >
          Back home
        </Link>
        <Link
          href="/menu"
          className="inline-flex h-11 items-center justify-center rounded-full border border-brand-gold/50 px-6 text-[13px] font-bold uppercase tracking-wide text-brand-wine"
        >
          See the menu
        </Link>
      </div>
    </main>
  );
}
