"use client";

// Printable tax-style INVOICE for one bill (session). Reads the session's
// orders + bill straight from the realtime stores, so it works on any device
// the moment the admin closes the bill. Linked from the customer profile, the
// admin Order Management + Today's Sales, and the counter-billing WhatsApp
// message. "Print" uses the browser's print dialog (paper or Save as PDF).

import React, { use, useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Printer, ChevronLeft, Phone, MapPin, Mail, User } from 'lucide-react';
import {
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, type OrderItem, orderLabel,
} from '../../lib/orderStore';
import {
  getSessionsSnapshot, getSessionsServerSnapshot, subscribeToSessions,
} from '../../lib/sessionStore';
import {
  getBillsSnapshot, getBillsServerSnapshot, subscribeToBills,
} from '../../lib/billStore';
import { formatKWD } from '../../lib/currency';
import { BRAND } from '../../lib/brand';
import { resolveInvoiceNo } from '../../lib/invoice';
import { shopOwner } from '../../lib/shop';
import { landingFonts } from '../../fonts';

/** Shop WhatsApp/phone, prettified for the invoice header. */
function shopPhone(): string | null {
  const raw = process.env.NEXT_PUBLIC_SHOP_WHATSAPP?.replace(/\D/g, '');
  if (!raw) return null;
  // Kuwait: +965 and an 8-digit local number.
  if (raw.startsWith('965') && raw.length === 11) return `+965 ${raw.slice(3, 7)} ${raw.slice(7)}`;
  return `+${raw}`;
}

// Paper/roll sizes the print dialog offers. `page` drives the CSS @page rule
// (what the printer actually uses); `width` constrains the sheet to match.
const SIZES: Record<string, { page: string; width: string; roll: boolean }> = {
  '2inch': { page: '58mm auto', width: '58mm', roll: true },
  '3inch': { page: '80mm auto', width: '80mm', roll: true },
  a5: { page: 'A5 portrait', width: '148mm', roll: false },
  a4: { page: 'A4 portrait', width: '210mm', roll: false },
  a3: { page: 'A3 portrait', width: '297mm', roll: false },
};

export default function ReceiptPage({ params }: { params: Promise<{ session: string }> }) {
  const { session: sessionId } = use(params);
  const sp = useSearchParams();
  const sizeKey = (sp.get('size') || '').toLowerCase();
  const size = SIZES[sizeKey];
  const isRoll = !!size?.roll; // thermal 2"/3" roll → dedicated receipt layout
  const autoPrint = sp.get('print') === '1';

  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const sessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const bills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);

  // The URL ref is normally a session id, but we also accept a bill id or a
  // single order's ticket id so any invoice link resolves to the right bill.
  const resolvedSessionId = React.useMemo(() => {
    if (sessions.some(s => s.id === sessionId) || orders.some(o => o.sessionId === sessionId)) return sessionId;
    const byBill = bills.find(b => b.id === sessionId);
    if (byBill && byBill.sessionId) return byBill.sessionId;
    const byOrder = orders.find(o => o.id === sessionId);
    return byOrder?.sessionId ?? sessionId;
  }, [sessionId, sessions, orders, bills]);

  const session = sessions.find(s => s.id === resolvedSessionId);
  const bill = bills.find(b => b.sessionId === resolvedSessionId);
  const tabOrders = React.useMemo(
    () => orders.filter(o => o.sessionId === resolvedSessionId).sort((a, b) => a.createdAt - b.createdAt),
    [orders, resolvedSessionId]
  );

  // Aggregate identical items across every order on the bill into one line.
  // Staff/admin-added lines stay separate so we can tag them on the invoice.
  const lines = React.useMemo(() => {
    const map = new Map<string, OrderItem & { lineTotal: number; byAdmin: boolean }>();
    for (const o of tabOrders) {
      const byAdmin = o.source === 'waiter' || o.source === 'admin';
      for (const it of o.items) {
        const k = `${it.name}@@${it.price}@@${byAdmin ? 'a' : 'c'}`;
        const cur = map.get(k);
        if (cur) { cur.qty += it.qty; cur.lineTotal += it.price * it.qty; }
        else map.set(k, { ...it, lineTotal: it.price * it.qty, byAdmin });
      }
    }
    return [...map.values()];
  }, [tabOrders]);

  const subtotal = tabOrders.reduce((s, o) => s + o.subtotal, 0);
  const discount = bill?.discount ?? tabOrders.reduce((s, o) => s + (o.discount ?? 0), 0);
  const tax = bill?.tax ?? tabOrders.reduce((s, o) => s + (o.tax ?? 0), 0);
  const total = bill?.total ?? tabOrders.reduce((s, o) => s + o.total, 0);
  const couponCode = bill?.couponCode ?? tabOrders.find(o => o.couponCode)?.couponCode ?? null;
  const customerName = session?.customerName || tabOrders[0]?.customer?.name || '';
  const customerPhone = session?.customerPhone || tabOrders[0]?.customer?.phone || '';
  const customerEmail = tabOrders[0]?.customer?.email || '';
  const when = bill?.createdAt ?? session?.closedAt ?? tabOrders[0]?.createdAt;
  // Session-keyed: the guest sees the same number before and after staff
  // close the bill. A number persisted on the bill always wins.
  const invoiceNo = resolveInvoiceNo(
    { invoiceNo: bill?.invoiceNo, sessionId: resolvedSessionId, id: bill?.id, createdAt: when },
  );
  const where = tabOrders[0] ? orderLabel(tabOrders[0]) : (session?.tableNumber != null ? `Table ${session.tableNumber}` : 'Counter');
  const phone = shopPhone();
  const owner = shopOwner();

  // Stores hydrate from realtime a tick after mount (and at different times), so
  // give them a short grace window before deciding the invoice doesn't exist —
  // otherwise "not found" flashes before the data lands.
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => { const t = setTimeout(() => setGraceOver(true), 1500); return () => clearTimeout(t); }, []);
  const missing = !session && tabOrders.length === 0;
  const hydrating = missing && !graceOver;
  const notFound = missing && graceOver;

  // Opened with ?print=1 → print once the invoice is fully on screen, so the
  // chosen paper size takes effect immediately. Wait for webfonts + the logo
  // image first (otherwise the roll prints with a broken logo / fallback fonts),
  // with a fallback so it never hangs. When embedded in the admin print iframe
  // we hand control to the parent (it prints just this frame, never the whole
  // dashboard); opened directly in a tab, we print and then close ourselves.
  useEffect(() => {
    if (!autoPrint || hydrating || notFound) return;
    const embedded = window.self !== window.top;
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      if (embedded) {
        window.parent?.postMessage({ type: 'receipt-print-ready' }, window.location.origin);
      } else {
        window.print();
      }
    };
    // Standalone tab: close once the print dialog is dismissed (script-opened).
    const afterPrint = () => { if (!embedded) { try { window.close(); } catch { /* ignore */ } } };
    window.addEventListener('afterprint', afterPrint);

    const imgs = Array.from(document.images);
    const ready = Promise.allSettled([
      (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(),
      ...imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = img.onerror = () => res(); })),
    ]);
    const settle = setTimeout(() => void ready.then(() => setTimeout(fire, 150)), 250);
    const fallback = setTimeout(fire, 2500); // never hang if something stalls
    return () => { clearTimeout(settle); clearTimeout(fallback); window.removeEventListener('afterprint', afterPrint); };
  }, [autoPrint, hydrating, notFound]);

  return (
    <div className={`landing ${landingFonts} min-h-screen bg-brand-sand/40 px-4 py-8 font-body text-brand-ink print:bg-white print:p-0`}>
      {/* Screen-only toolbar */}
      <div className="no-print mx-auto mb-5 flex max-w-2xl items-center justify-between">
        <Link href="/menu" className="inline-flex items-center gap-1.5 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-brand-wine/70 hover:text-brand-red">
          <ChevronLeft size={14} /> Back to menu
        </Link>
        {!notFound && !hydrating && (
          <button onClick={() => window.print()} className="btn btn-wine px-5 py-3 text-[10px]">
            <Printer size={14} /> Print / Save PDF
          </button>
        )}
      </div>

      {hydrating ? (
        <div className="mx-auto max-w-2xl rounded-3xl border border-brand-gold/30 bg-white p-12 text-center shadow-sm">
          <p className="font-body text-sm text-brand-wine/50">Loading invoice…</p>
        </div>
      ) : notFound ? (
        <div className="mx-auto max-w-2xl rounded-3xl border border-brand-gold/30 bg-white p-10 text-center shadow-sm">
          <h1 className="font-wordmark text-2xl text-brand-wine" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>Invoice not found</h1>
          <p className="mt-3 font-body text-sm text-brand-wine/60">We couldn’t find a bill for this reference. It may not have been closed yet.</p>
          <Link href="/menu" className="btn btn-outline mt-6 inline-flex px-5 py-3 text-[10px]">Back to menu</Link>
        </div>
      ) : isRoll ? (
        <ThermalReceipt
          sizeKey={sizeKey} invoiceNo={invoiceNo} when={when} where={where}
          customerName={customerName} customerPhone={customerPhone}
          lines={lines} subtotal={subtotal} discount={discount} tax={tax} total={total}
          couponCode={couponCode} paid={!!bill} paidMethod={bill?.paidMethod ?? undefined} shopPhone={phone}
        />
      ) : (
        <div id="invoice" className="invoice-sheet mx-auto max-w-2xl overflow-hidden rounded-[1.5rem] border border-brand-gold/30 bg-white shadow-[0_30px_70px_-30px_rgba(74,21,21,0.5)] print:rounded-none print:border-0 print:shadow-none">
          {/* Brand bar */}
          <div className="brand-bar h-2 w-full bg-gradient-to-r from-brand-red via-brand-wine to-brand-plum" />

          <div className="inv-pad p-7 sm:p-9">
            {/* Header: brand + invoice meta */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BRAND.logo} alt={BRAND.fullName} className="inv-logo h-16 w-16 rounded-full border border-brand-gold/40 object-cover shadow-sm" />
                <div>
                  <p className="font-wordmark text-[26px] uppercase leading-none tracking-[0.015em] text-brand-red" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>
                    {BRAND.fullName}
                  </p>
                  <p className="mt-1.5 font-body text-[11px] font-medium uppercase tracking-[0.22em] text-brand-gold-dark">Pastry · {BRAND.area}</p>
                  <div className="mt-2 flex flex-col gap-0.5 font-body text-[11px] text-brand-wine/60">
                    <span className="inline-flex items-center gap-1.5"><MapPin size={11} /> {BRAND.address}</span>
                    {phone && <span className="inline-flex items-center gap-1.5"><Phone size={11} /> {phone}</span>}
                    {owner && <span className="inline-flex items-center gap-1.5"><User size={11} /> Prop. {owner}</span>}
                  </div>
                </div>
              </div>

              <div className="sm:text-right">
                <p className="font-wordmark text-[30px] uppercase leading-none tracking-[0.04em] text-brand-wine" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>
                  Invoice
                </p>
                <dl className="mt-3 space-y-1 font-body text-[12px] text-brand-wine/70 sm:ml-auto">
                  <div className="flex justify-between gap-6 sm:justify-end"><dt className="font-medium">No.</dt><dd className="font-mono font-bold text-brand-wine">{invoiceNo}</dd></div>
                  {when != null && (
                    <div className="flex justify-between gap-6 sm:justify-end"><dt className="font-medium">Date</dt><dd className="text-brand-wine">{new Date(when).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}</dd></div>
                  )}
                  <div className="flex justify-between gap-6 sm:justify-end">
                    <dt className="font-medium">Status</dt>
                    <dd>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${bill ? 'bg-brand-green/10 text-brand-green' : 'bg-brand-gold/15 text-brand-gold-dark'}`}>
                        {bill ? 'Paid' : 'Open'}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* Bill-to / details */}
            <div className="mt-7 grid grid-cols-1 gap-4 rounded-2xl bg-brand-sand/40 p-4 sm:grid-cols-2 sm:p-5">
              <div>
                <p className="font-body text-[10px] font-black uppercase tracking-[0.22em] text-brand-wine/50">Billed to</p>
                <p className="mt-1.5 font-wordmark text-lg text-brand-wine" style={{ transform: 'scaleY(1.06)', display: 'inline-block' }}>{customerName || 'Walk-in guest'}</p>
                <div className="mt-1 flex flex-col gap-0.5 font-body text-[12px] text-brand-wine/65">
                  {customerPhone && <span className="inline-flex items-center gap-1.5"><Phone size={11} /> {customerPhone}</span>}
                  {customerEmail && <span className="inline-flex items-center gap-1.5"><Mail size={11} /> {customerEmail}</span>}
                </div>
              </div>
              <div className="sm:text-right">
                <p className="font-body text-[10px] font-black uppercase tracking-[0.22em] text-brand-wine/50">Details</p>
                <p className="mt-1.5 font-body text-[13px] text-brand-wine/80">{where}</p>
                {when != null && <p className="font-body text-[12px] text-brand-wine/55">{new Date(when).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
                {tabOrders.length > 1 && <p className="font-body text-[12px] text-brand-wine/55">{tabOrders.length} orders on this tab</p>}
              </div>
            </div>

            {/* Items */}
            <table className="mt-7 w-full border-collapse font-body text-[13px]">
              <thead>
                <tr className="border-b-2 border-brand-wine/15 text-[10px] font-black uppercase tracking-[0.14em] text-brand-wine/55">
                  <th className="py-2.5 pr-2 text-left">Item</th>
                  <th className="py-2.5 px-2 text-right">Unit</th>
                  <th className="py-2.5 px-2 text-center">Qty</th>
                  <th className="py-2.5 pl-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={`${l.name}-${i}`} className="border-b border-brand-gold/15">
                    <td className="py-2.5 pr-2 text-brand-wine">
                      {l.name}
                      {l.byAdmin && (
                        <span className="ml-2 align-middle rounded-full bg-brand-gold/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-brand-gold-dark">
                          Added by staff
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right text-brand-wine/60">{formatKWD(l.price)}</td>
                    <td className="py-2.5 px-2 text-center text-brand-wine/70">{l.qty}</td>
                    <td className="py-2.5 pl-2 text-right font-semibold text-brand-wine">{formatKWD(l.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-5 flex justify-end">
              <div className="w-full max-w-[280px] space-y-1.5 font-body text-[13px]">
                <div className="flex justify-between text-brand-wine/65"><span>Subtotal</span><span>{formatKWD(subtotal)}</span></div>
                {discount > 0 && (
                  <div className="flex justify-between text-brand-green"><span>Discount{couponCode ? ` · ${couponCode}` : ''}</span><span>− {formatKWD(discount)}</span></div>
                )}
                {tax > 0 && (
                  <div className="flex justify-between text-brand-wine/65"><span>Tax</span><span>{formatKWD(tax)}</span></div>
                )}
                <div className="mt-2 flex items-center justify-between rounded-xl bg-brand-wine px-4 py-3 text-white">
                  <span className="font-body text-[11px] font-black uppercase tracking-[0.18em]">Total</span>
                  <span className="font-wordmark text-2xl text-brand-gold-light" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{formatKWD(total)}</span>
                </div>
                {bill?.paidMethod && (
                  <div className="flex justify-between pt-1 text-brand-wine/60"><span>Paid by</span><span className="capitalize">{bill.paidMethod}</span></div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-8 border-t border-dashed border-brand-gold/40 pt-5 text-center">
              <p className="font-wordmark text-lg text-brand-red" style={{ transform: 'scaleY(1.06)', display: 'inline-block' }}>Thank you!</p>
              <p className="mt-1 font-body text-[12px] italic text-brand-wine/55">
                We hope you enjoyed your visit to {BRAND.name}. See you again soon.
              </p>
              <p className="mt-4 font-body text-[10px] font-medium uppercase tracking-[0.2em] text-brand-wine/40">
                {BRAND.fullName} · {BRAND.city} · Prices in KWD
              </p>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: ${size ? size.page : 'A4 portrait'}; margin: ${size?.roll ? '2mm' : '10mm'}; }
          html, body { background: #fff !important; }
          .invoice-sheet { max-width: ${size && !isRoll ? size.width : '100%'} !important; margin: 0 auto !important; }
          /* Thermal roll: the receipt fills the whole roll width, no card frame. */
          .thermal { width: 100% !important; max-width: none !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
          .thermal * { color: #000 !important; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thermal receipt (2"/3" roll)
// ---------------------------------------------------------------------------
// A plain, monospace, single-column receipt sized for a thermal roll printer —
// the colourful A4 invoice above doesn't shrink down cleanly, so counter prints
// (2"/3") get this dedicated layout instead. Same on screen as on paper, so the
// preview is exactly what prints.

function Dashed() {
  return <div className="my-2 border-t border-dashed border-black/50" />;
}

function ThermalReceipt(props: {
  sizeKey: string;
  invoiceNo: string;
  when?: number;
  where: string;
  customerName: string;
  customerPhone: string;
  lines: (OrderItem & { lineTotal: number; byAdmin: boolean })[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  couponCode: string | null;
  paid: boolean;
  paidMethod?: string;
  shopPhone: string | null;
}) {
  const {
    sizeKey, invoiceNo, when, where, customerName, customerPhone,
    lines, subtotal, discount, tax, total, couponCode, paid, paidMethod, shopPhone,
  } = props;
  // On-screen preview width mirrors the paper (58mm ≈ 220px, 80mm ≈ 300px).
  const screenWidth = sizeKey === '2inch' ? 220 : 300;

  return (
    <div
      className="thermal mx-auto bg-white px-3 py-4 text-black shadow-[0_10px_40px_-18px_rgba(0,0,0,0.5)] print:shadow-none"
      style={{ width: screenWidth, maxWidth: '100%', fontFamily: '"Courier New", ui-monospace, monospace', fontSize: 12, lineHeight: 1.45 }}
    >
      {/* Header */}
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt={BRAND.fullName} className="mx-auto mb-1 h-12 w-12 rounded-full object-cover" />
        <p className="font-bold uppercase tracking-wide" style={{ fontSize: 14 }}>{BRAND.fullName}</p>
        <p className="uppercase" style={{ fontSize: 10 }}>Pastry · {BRAND.city}</p>
        <p style={{ fontSize: 10 }}>{BRAND.address}</p>
        {shopPhone && <p style={{ fontSize: 10 }}>{shopPhone}</p>}
      </div>

      <Dashed />

      {/* Meta */}
      <div style={{ fontSize: 11 }}>
        <div className="flex justify-between"><span>Invoice</span><span className="font-bold">{invoiceNo}</span></div>
        {when != null && (
          <div className="flex justify-between">
            <span>Date</span>
            <span>{new Date(when).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
        <div className="flex justify-between"><span>Order</span><span>{where}</span></div>
        {customerName && <div className="flex justify-between gap-2"><span>Customer</span><span className="truncate text-right">{customerName}</span></div>}
        {customerPhone && <div className="flex justify-between"><span>Phone</span><span>{customerPhone}</span></div>}
        <div className="flex justify-between"><span>Status</span><span className="font-bold uppercase">{paid ? 'Paid' : 'Open'}</span></div>
      </div>

      <Dashed />

      {/* Items */}
      <div style={{ fontSize: 11 }}>
        {lines.map((l, i) => (
          <div key={`${l.name}-${i}`} className="mb-1.5">
            <div className="flex justify-between gap-2">
              <span className="min-w-0 break-words">{l.name}{l.byAdmin ? ' *' : ''}</span>
              <span className="whitespace-nowrap font-bold">{formatKWD(l.lineTotal)}</span>
            </div>
            <div className="opacity-70">{l.qty} × {formatKWD(l.price)}</div>
          </div>
        ))}
      </div>

      <Dashed />

      {/* Totals */}
      <div style={{ fontSize: 11 }}>
        <div className="flex justify-between"><span>Subtotal</span><span>{formatKWD(subtotal)}</span></div>
        {discount > 0 && (
          <div className="flex justify-between"><span>Discount{couponCode ? ` (${couponCode})` : ''}</span><span>− {formatKWD(discount)}</span></div>
        )}
        {tax > 0 && <div className="flex justify-between"><span>Tax</span><span>{formatKWD(tax)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-black/70 pt-1 font-bold" style={{ fontSize: 14 }}>
          <span>TOTAL</span><span>{formatKWD(total)}</span>
        </div>
        {paidMethod && <div className="mt-0.5 flex justify-between capitalize"><span>Paid by</span><span>{paidMethod}</span></div>}
      </div>

      {lines.some(l => l.byAdmin) && <p className="mt-1 opacity-70" style={{ fontSize: 9 }}>* added by staff</p>}

      <Dashed />

      {/* Footer */}
      <div className="text-center" style={{ fontSize: 11 }}>
        <p className="font-bold">Thank you!</p>
        <p style={{ fontSize: 10 }}>Prices in KWD</p>
      </div>
    </div>
  );
}
