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
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { code } = await params;
  const clean = decodeURIComponent(code).toUpperCase();
  return (
    <main className="min-h-screen bg-brand-cream px-4 py-8 text-brand-ink">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-6 inline-block text-[12px] font-bold uppercase tracking-[0.18em] text-brand-red">
          &larr; {BRAND.name}
        </Link>
        <CouponView code={clean} />
      </div>
    </main>
  );
}
