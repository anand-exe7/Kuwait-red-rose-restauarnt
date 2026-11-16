import type { Metadata } from "next";
import Link from "next/link";
import InvoiceView from "./InvoiceView";
import { BRAND } from "../../lib/brand";
import "../../admin-secure-portal-xyz-345/admin.css";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const ref = decodeURIComponent(id).trim();
  // A bare 5-digit ref is an order that has not been billed yet; only an
  // INV-… ref is actually an invoice.
  const isInvoice = /^(INV|WB)-/i.test(ref);
  return {
    title: isInvoice ? `Invoice ${ref}` : `Order #${ref}`,
    description: isInvoice ? `Your ${BRAND.name} invoice.` : `Track your ${BRAND.name} order.`,
    // A private, per-customer document shared by link — never indexable.
    robots: { index: false, follow: false },
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6ecd6] px-4 py-8 text-[#1a0f0a]">
      {/* Roses drifting behind the paper. Decoration only — aria-hidden, and
          dropped entirely from the print sheet (see .brand-rose in globals.css)
          so none of it reaches the printer or a saved PDF. */}
      <span aria-hidden className="brand-roses">
        <img src="/cutouts/rose.webp" alt="" className="brand-rose brand-rose--a" />
        <img src="/cutouts/rose.webp" alt="" className="brand-rose brand-rose--b" />
        <img src="/cutouts/petal-a.webp" alt="" className="brand-rose brand-rose--c" />
      </span>

      <div className="relative mx-auto max-w-3xl">
        {/* The shop's own mark and name, so a link landing in WhatsApp is
            recognisably from this shop before the invoice even loads. */}
        <header className="mb-6 flex items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BRAND.logo}
              alt=""
              className="h-12 w-12 shrink-0 rounded-full border border-[#c9a961]/50 object-cover shadow-[0_6px_18px_-8px_rgba(74,21,21,0.5)] sm:h-14 sm:w-14"
            />
            <span className="min-w-0">
              <span className="block truncate font-serif text-[20px] leading-tight text-[#1a0f0a] sm:text-[24px]">
                {BRAND.fullName}
              </span>
              <span className="block truncate text-[10.5px] font-bold uppercase tracking-[0.22em] text-[#b01e28]">
                {BRAND.area}
              </span>
            </span>
          </Link>
        </header>

        <InvoiceView id={decodeURIComponent(id)} />
      </div>
    </main>
  );
}
