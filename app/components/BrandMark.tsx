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
    ? 'block truncate font-body text-[7.5px] font-medium uppercase tracking-[0.16em] text-brand-gold-light/85 min-[360px]:tracking-[0.3em] sm:text-[9px] sm:tracking-[0.36em]'
    : 'block truncate font-body text-[8.5px] font-medium uppercase tracking-[0.18em] text-brand-gold-light/85 min-[360px]:tracking-[0.32em] sm:text-[10px] sm:tracking-[0.4em]';

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
        <span className="min-w-0 leading-none">
          <span className="sr-only">{BRAND.fullName}</span>
          <span
            aria-hidden
            className={`block truncate font-wordmark uppercase tracking-[0.04em] text-white ${compact ? 'text-[clamp(14px,4.8vw,18px)] sm:text-[22px]' : 'text-[clamp(16px,5.4vw,22px)] sm:text-[26px]'}`}
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

  // Not shrink-0: the mark yields before the action buttons do, so the
  // buttons beside it can never be pushed off the screen. The badge itself
  // stays shrink-0 inside, and the text truncates.
  const cls = compact
    ? 'group flex min-w-0 flex-1 items-center gap-2 pr-1'
    : 'group flex min-w-0 flex-1 items-center gap-2.5 pr-1';
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
