import Link from 'next/link';
import { BRAND } from '../lib/brand';

/**
 * The rose mark + RED ROSE wordmark lockup used in the landing nav, reused by
 * the customer and staff screens so every page carries the same signature.
 * Needs the landing font variables (see app/fonts.ts) on an ancestor.
 */
export default function BrandMark({ href, sub = 'Pastry · Kuwait' }: { href?: string; sub?: string }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/rose-mark.webp"
        alt=""
        width={40}
        height={40}
        className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-brand-gold/60 transition-transform duration-500 group-hover:scale-105 sm:h-10 sm:w-10"
      />
      <span className="leading-none">
        <span className="sr-only">{BRAND.fullName}</span>
        <span
          aria-hidden
          className="block font-wordmark text-[21px] uppercase tracking-[0.04em] text-white sm:text-[24px]"
          style={{ transform: 'scaleY(1.12)', transformOrigin: 'bottom' }}
        >
          Red Rose
        </span>
        <span
          aria-hidden
          className="mt-1 block font-body text-[7.5px] font-medium uppercase tracking-[0.5em] text-brand-gold-light/85"
        >
          {sub}
        </span>
      </span>
    </>
  );

  const cls = 'group flex shrink-0 items-center gap-2.5 pr-1';
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
