import type { Metadata } from "next";
import Link from "next/link";
import CouponView from "./CouponView";
import { BRAND } from "../../lib/brand";

type Params = { code: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { code } = await params;
  const clean = decodeURIComponent(code).toUpperCase();
  return {
    title: `${clean} · Coupon`,
    description: `Your ${BRAND.name} coupon ${clean}.`,
    // A personal, transient coupon link — not evergreen content, never indexed.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { code } = await params;
  const clean = decodeURIComponent(code).toUpperCase();
  return (
    <main className="relative min-h-screen overflow-hidden bg-brand-cream px-4 py-8 text-brand-ink">
      {/* Roses drifting behind the coupon — the same decoration the invoice
          carries, so a link the shop sends looks like it came from the shop.
          Decoration only: aria-hidden and pointer-events: none. */}
      <span aria-hidden className="brand-roses">
        <img src="/cutouts/rose.webp" alt="" className="brand-rose brand-rose--a" />
        <img src="/cutouts/rose.webp" alt="" className="brand-rose brand-rose--b" />
        <img src="/cutouts/petal-a.webp" alt="" className="brand-rose brand-rose--c" />
      </span>

      <div className="relative mx-auto max-w-md">
        {/* The shop's own mark and name. A coupon arriving in WhatsApp should
            say whose it is before the card even loads. */}
        <header className="mb-6 flex items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND.logo}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-brand-gold/50 object-cover shadow-[0_6px_18px_-8px_rgba(74,21,21,0.5)] sm:h-14 sm:w-14"
            />
            <span className="min-w-0">
              <span className="block truncate font-wordmark text-[20px] uppercase leading-tight tracking-[0.012em] text-brand-wine sm:text-[24px]">
                {BRAND.fullName}
              </span>
              <span className="block truncate font-body text-[10.5px] font-bold uppercase tracking-[0.22em] text-brand-red">
                {BRAND.area}
              </span>
            </span>
          </Link>
        </header>

        <CouponView code={clean} />
      </div>
    </main>
  );
}
