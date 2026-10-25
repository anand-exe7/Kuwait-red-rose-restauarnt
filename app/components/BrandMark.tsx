import Link from 'next/link';
import { BRAND } from '../lib/brand';

/**
 * The rose mark + RED ROSE wordmark lockup used in the landing nav, reused by
 * the customer and staff screens so every page carries the same signature.
 * Needs the landing font variables (see app/fonts.ts) on an ancestor.
 */
export default function BrandMark({ href, sub = 'Pastry · Kuwait', compact = false }: { href?: string; sub?: string; compact?: boolean }) {
  // finallogo.jpeg is a circular stamped badge with "Red Rose Sweets"
  // already inside it, so the wordmark text is redundant here. We just
  // show the badge and (optionally) the context sub-line next to it.
  const imgCls = compact
    ? 'h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-brand-gold/60 shadow-[0_2px_8px_rgba(30,0,4,0.35)] transition-transform duration-500 group-hover:scale-105 sm:h-11 sm:w-11'
    : 'h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-brand-gold/60 shadow-[0_2px_8px_rgba(30,0,4,0.35)] transition-transform duration-500 group-hover:scale-105 sm:h-14 sm:w-14';
  const subCls = compact
    ? 'block font-body text-[7.5px] font-medium uppercase tracking-[0.3em] text-brand-gold-light/85 sm:text-[9px] sm:tracking-[0.36em]'
    : 'block font-body text-[8.5px] font-medium uppercase tracking-[0.32em] text-brand-gold-light/85 sm:text-[10px] sm:tracking-[0.4em]';

  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/finallogo.jpeg"
        alt={BRAND.fullName}
        width={56}
        height={56}
        className={imgCls}
      />
      {sub ? (
        <span className="leading-none">
          <span className="sr-only">{BRAND.fullName}</span>
          <span
            aria-hidden
            className={`block font-wordmark uppercase tracking-[0.04em] text-white ${compact ? 'text-[18px] sm:text-[22px]' : 'text-[22px] sm:text-[26px]'}`}
            style={{ transform: 'scaleY(1.12)', transformOrigin: 'bottom' }}
          >
            Red Rose
          </span>
          <span aria-hidden className={`mt-0.5 ${subCls}`}>{sub}</span>
        </span>
      ) : (
        <span className="sr-only">{BRAND.fullName}</span>
      )}
    </>
  );

  const cls = compact ? 'group flex shrink-0 items-center gap-2 pr-1' : 'group flex shrink-0 items-center gap-2.5 pr-1';
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
