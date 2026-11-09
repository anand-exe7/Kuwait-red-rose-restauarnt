import type { Metadata } from "next";
import Link from "next/link";
import InvoiceView from "./InvoiceView";
import { BRAND } from "../../lib/brand";
import "../../admin/admin.css";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const ref = decodeURIComponent(id).trim();
  // A bare 5-digit ref is an order that has not been billed yet; only an
  // INV-… ref is actually an invoice.
  const isInvoice = /^INV-/i.test(ref);
  return {
    title: isInvoice ? `Invoice ${ref}` : `Order #${ref}`,
    description: isInvoice ? `Your ${BRAND.name} invoice.` : `Track your ${BRAND.name} order.`,
  };
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-[#f6ecd6] px-4 py-8 text-[#1a0f0a]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="mb-6 inline-block text-[11px] font-bold uppercase tracking-[0.2em] text-[#b01e28]">
          &larr; {BRAND.name}
        </Link>
        <InvoiceView id={decodeURIComponent(id)} />
      </div>
    </main>
  );
}
