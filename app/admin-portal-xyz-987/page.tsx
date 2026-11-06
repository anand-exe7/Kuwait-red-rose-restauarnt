"use client";
import './admin.css';
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import { Eye, Printer, ExternalLink } from 'lucide-react';
import { Order, getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders } from '../lib/orderStore';
import { getBillsSnapshot, getBillsServerSnapshot, subscribeToBills } from '../lib/billStore';
import { formatKWD } from '../lib/currency';
import { invoiceNumber } from '../lib/invoice';
import { adminFonts } from '../fonts';
import { BRAND } from '../lib/brand';
import TablesSection from './TablesSection';
import CouponsSection from './CouponsSection';
import BillingSection from './BillingSection';
import AnalyticsSection from './AnalyticsSection';
import IncomingOrdersSection from './IncomingOrdersSection';
import OpenTabsSection from './OpenTabsSection';
import DeliveriesSection from './DeliveriesSection';
import AreasPanel from './AreasPanel';
import PhotoField from './PhotoField';
import {
  subscribeToHomeMedia, getHomeMediaSnapshot, getHomeMediaServerSnapshot, homeMediaFrom, saveHomeMedia,
  HOME_MEDIA_LIMITS, type HomeMedia,
} from '../lib/homeMediaStore';
import { compressToWebp } from '../lib/compressImage';
import { Period, isInPeriod, groupOrdersIntoInvoices } from './analyticsHelpers';
import {
  MenuItem,
  MenuCategory,
  MENU_CATEGORIES,
  getMenuSnapshot,
  getMenuServerSnapshot,
  subscribeToMenu,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from '../lib/menuStore';
import {
  Page,
  PageHead,
  Card,
  Kpi,
  Btn,
  Badge,
  SearchBox,
  Pills,
  Modal,
  Field,
  Empty,
  Icon,
  Toaster,
  toast,
  printReceipt,
  inputCls,
  cx,
  type IconName,
  type BadgeTone,
} from './_ui/kit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) => formatKWD(n);

function exportOrdersToCSV(orders: Order[]) {
  const headers = ['Ticket ID', 'Table', 'Source', 'Items', 'Subtotal', 'Total', 'Status', 'Date'];
  const rows = orders.map(o => [
    o.id,
    String(o.table),
    o.source === 'customer' ? 'Self-order' : 'Waiter',
    o.items.map(i => `${i.qty}x ${i.name}`).join('; '),
    o.subtotal.toFixed(2),
    o.total.toFixed(2),
    o.status,
    new Date(o.createdAt).toLocaleString(),
  ]);
  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type Section =
  | 'incoming'
  | 'opentabs'
  | 'analytics'
  | 'orders'
  | 'inventory'
  | 'tables'
  | 'coupons'
  | 'billing'
  | 'deliveries'
  | 'delivery-zones'
  | 'homepage';

type NavItem = { key: Section; icon: IconName; label: string; badge?: number };

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('billing');
  const rawOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  // Billed-only history for the Orders / Analytics sections.
  const orders = useMemo(() => rawOrders.filter(o => o.billed), [rawOrders]);
  const incomingCount = useMemo(() => rawOrders.filter(o => o.status === 'awaiting_admin').length, [rawOrders]);
  // Delivery orders still in the pipeline (placed → cooking → ready) so the
  // admin sees at a glance that a delivery is waiting to be arranged.
  const deliveryCount = useMemo(
    () => rawOrders.filter(o => o.mode === 'delivery' && o.status !== 'served').length,
    [rawOrders]
  );
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);

  const nav: NavItem[] = [
    { key: 'billing', icon: 'billing', label: 'Billing' },
    { key: 'incoming', icon: 'bell', label: 'Incoming', badge: incomingCount },
    { key: 'opentabs', icon: 'users', label: 'Open Tabs' },
    { key: 'analytics', icon: 'chart', label: 'Analytics' },
    { key: 'orders', icon: 'orders', label: 'Orders' },
    { key: 'inventory', icon: 'box', label: 'Inventory' },
    { key: 'tables', icon: 'tables', label: 'Tables' },
    { key: 'coupons', icon: 'coupon', label: 'Coupons' },
    { key: 'deliveries', icon: 'cart', label: 'Deliveries', badge: deliveryCount },
    { key: 'delivery-zones', icon: 'pin', label: 'Delivery Zones' },
    { key: 'homepage', icon: 'image', label: 'Homepage' },
  ];

  return (
    <div className={`adm ${adminFonts}`}>
      <AdminShell nav={nav} section={section} onSelect={setSection}>
        {section === 'incoming' && <IncomingOrdersSection orders={rawOrders} />}
        {section === 'opentabs' && <OpenTabsSection />}
        {section === 'analytics' && <AnalyticsSection orders={orders} />}
        {section === 'orders' && <OrdersSection orders={orders} onOpenPOS={() => setSection('billing')} />}
        {section === 'inventory' && <InventorySection menu={menu} />}
        {section === 'tables' && <TablesSection />}
        {section === 'billing' && <BillingSection />}
        {section === 'coupons' && <CouponsSection />}
        {section === 'deliveries' && <DeliveriesSection />}
        {section === 'delivery-zones' && <DeliveryZonesSection />}
        {section === 'homepage' && <HomepageSection />}
      </AdminShell>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell — cocoa/wine sidebar, warm-paper canvas, collapsible rail, mobile drawer
// ---------------------------------------------------------------------------

function AdminShell({
  nav,
  section,
  onSelect,
  children,
}: {
  nav: NavItem[];
  section: Section;
  onSelect: (s: Section) => void;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [rail, setRail] = useState(false);
  const active = nav.find(n => n.key === section);

  const toggleRail = () => setRail(c => !c);

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/login?role=admin');
  };

  const select = (s: Section) => {
    onSelect(s);
    setMenu(false);
  };

  const renderSide = (mini: boolean) => (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => select('billing')}
        className={cx('adm-side__brand flex items-center gap-3 pb-6 pt-6 text-left', mini ? 'justify-center px-0' : 'px-5')}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.logo} alt={BRAND.fullName} className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/20" />
        {!mini && (
          <span className="leading-tight">
            <b className="block text-[19px]" style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
              {BRAND.name}
            </b>
            <small className="text-[10px] font-bold uppercase tracking-[0.18em]">Admin console</small>
          </span>
        )}
      </button>

      <nav className="adm-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="Admin">
        {nav.map(n => {
          const on = n.key === section;
          return (
            <button
              key={n.key}
              type="button"
              onClick={() => select(n.key)}
              title={mini ? n.label : undefined}
              className={cx('adm-link relative flex h-11 w-full items-center rounded-xl text-[14px] font-semibold', on && 'is-on', mini ? 'justify-center px-0' : 'gap-3 px-3')}
            >
              <Icon name={n.icon} size={19} />
              {!mini && <span className="flex-1 text-left">{n.label}</span>}
              {!mini && !!n.badge && (
                <span className="adm-pulse grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">{n.badge}</span>
              )}
              {mini && !!n.badge && <span className="adm-pulse absolute right-2 top-2 h-2 w-2 rounded-full bg-red-600 text-red-600" />}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 px-3 py-4" style={{ borderTop: '1px solid var(--line-dark)' }}>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          title={mini ? 'Guest website' : undefined}
          className={cx('adm-link flex h-10 items-center rounded-xl text-[13px] font-semibold', mini ? 'justify-center px-0' : 'gap-3 px-3')}
        >
          <Icon name="globe" size={17} />
          {!mini && 'Guest website'}
        </a>
        <button
          type="button"
          onClick={signOut}
          title={mini ? 'Sign out' : undefined}
          className={cx('adm-link flex h-10 w-full items-center rounded-xl text-[13px] font-semibold', mini ? 'justify-center px-0' : 'gap-3 px-3')}
        >
          <Icon name="logout" size={17} />
          {!mini && 'Sign out'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="adm-app">
      {/* sidebar — desktop */}
      <aside className={cx('adm-side fixed inset-y-0 left-0 z-40 hidden transition-[width] duration-200 lg:block', rail ? 'w-[76px]' : 'w-[248px]')}>
        {renderSide(rail)}
        <button
          type="button"
          onClick={toggleRail}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          title={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-[72px] z-50 hidden h-7 w-7 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:text-slate-900 lg:grid"
        >
          <Icon name="chevron" size={15} className={cx('transition-transform', rail ? '' : 'rotate-180')} />
        </button>
      </aside>

      {/* top bar — mobile */}
      <header className="adm-side sticky top-0 z-40 flex h-14 items-center gap-3 px-4 lg:hidden">
        <button type="button" onClick={() => setMenu(true)} className="adm-link grid h-10 w-10 place-items-center rounded-xl" aria-label="Open menu">
          <Icon name="menu" size={20} />
        </button>
        <b className="min-w-0 flex-1 truncate text-[16px]" style={{ fontFamily: 'var(--display)', fontWeight: 700 }}>
          {BRAND.name} · {active?.label ?? 'Admin'}
        </b>
      </header>
      {menu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="adm-scrim absolute inset-0 bg-slate-900/40" onClick={() => setMenu(false)} aria-label="Close menu" />
          <aside className="adm-side adm-in absolute inset-y-0 left-0 w-[270px] shadow-2xl">{renderSide(false)}</aside>
        </div>
      )}

      {/* main */}
      <div className={cx('flex flex-1 flex-col min-w-0 transition-[padding] duration-200', rail ? 'lg:pl-[76px]' : 'lg:pl-[248px]')}>
        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 p-3 sm:p-6">{children}</main>
        <footer className="mx-auto grid w-full max-w-[1480px] grid-cols-1 items-center gap-2 border-t border-slate-200 px-4 py-7 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500 sm:grid-cols-3 sm:px-6">
          <span className="sm:text-left">© {new Date().getFullYear()} All rights reserved. {BRAND.fullName}.</span>
          <a href="https://www.cenexasystems.com" target="_blank" rel="noopener noreferrer" className="justify-self-center transition-colors hover:text-red-600">
            Powered by <span className="text-red-600">Cenexa Systems</span> ©{new Date().getFullYear()}
          </a>
          <span className="italic text-red-600 sm:text-right">{BRAND.shortTagline}</span>
        </footer>
      </div>

      <div id="adm-layer" />
      <Toaster />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function OrdersSection({ orders, onOpenPOS }: { orders: Order[]; onOpenPOS: () => void }) {
  const bills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);
  const [typeFilter, setTypeFilter] = useState<'all' | 'tab' | 'counter'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printing, setPrinting] = useState<{ sessionId: string; invNo: string } | null>(null);

  // One row per bill (a dine-in tab's many orders are a single invoice).
  const invoices = useMemo(() => {
    const payOf = (sid?: string) => (sid ? bills.find(b => b.sessionId === sid)?.paidMethod ?? null : null);
    const q = search.trim().toLowerCase();
    return groupOrdersIntoInvoices(orders)
      .map(inv => {
        const o0 = inv.orders.find(o => o.customer) ?? inv.orders[0];
        return {
          ...inv,
          invNo: invoiceNumber(inv.sessionId ?? inv.key, inv.createdAt),
          customerName: o0.customer?.name ?? '',
          mobile: o0.customer?.phone ?? '',
          isTab: (inv.mode ?? 'table') === 'table',
          payment: payOf(inv.sessionId),
        };
      })
      .filter(inv => {
        if (typeFilter === 'tab' && !inv.isTab) return false;
        if (typeFilter === 'counter' && inv.isTab) return false;
        if (dateFilter !== 'all' && !isInPeriod(inv.createdAt, dateFilter as Period, customFrom, customTo)) return false;
        if (q) {
          const hay = `${inv.invNo} ${inv.customerName} ${inv.mobile} ${inv.orders.map(o => o.id).join(' ')} ${inv.items.map(i => i.name).join(' ')}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }, [orders, bills, typeFilter, dateFilter, customFrom, customTo, search]);

  const pager = usePagination(invoices, 15, `${typeFilter}|${dateFilter}|${customFrom}|${customTo}|${search}`);

  return (
    <Page>
      <div className="mb-5 flex items-center justify-between gap-3">
        <PageHead title="Order Management" sub="Every bill, one invoice per tab." />
        <Btn kind="red" icon="cart" onClick={onOpenPOS}>Open POS</Btn>
      </div>

      <Card className="mb-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Pills label="Type" value={typeFilter} onChange={setTypeFilter} options={[
              { v: 'all', t: 'All bills' },
              { v: 'tab', t: 'Customer tab' },
              { v: 'counter', t: 'Counter' },
            ]} />
            <SearchBox value={search} onChange={setSearch} placeholder="Search invoice, name, mobile, item…" className="w-full sm:w-72" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Pills label="Date" value={dateFilter} onChange={setDateFilter} options={[
              { v: 'all', t: 'All' },
              { v: 'today', t: 'Today' },
              { v: 'week', t: 'This Week' },
              { v: 'month', t: 'This Month' },
              { v: 'custom', t: 'Custom Range' },
            ]} />
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={cx(inputCls, 'h-9 w-auto')} />
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={cx(inputCls, 'h-9 w-auto')} />
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden !p-0">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-[13px] font-semibold text-slate-500">{invoices.length} result(s)</p>
          <Btn kind="plain" size="sm" icon="download" onClick={() => exportOrdersToCSV(invoices.flatMap(i => i.orders))} disabled={invoices.length === 0}>Export CSV</Btn>
        </div>
        <div className="adm-scroll mt-2 overflow-x-auto">
          <table className="w-full min-w-[860px] text-left">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-bold">Invoice No</th>
                <th className="px-5 py-3 font-bold">Customer</th>
                <th className="px-5 py-3 font-bold">Mobile</th>
                <th className="px-5 py-3 font-bold">Bill Type</th>
                <th className="px-5 py-3 font-bold">Total</th>
                <th className="px-5 py-3 font-bold">Payment</th>
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-5 py-3 font-bold">Status</th>
                <th className="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pager.items.map(inv => (
                <React.Fragment key={inv.key}>
                  <tr className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5">
                      <a href={inv.sessionId ? `/receipt/${inv.sessionId}` : undefined} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[13px] font-bold text-red-600 hover:underline">
                        {inv.invNo} <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{inv.customerName || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500">{inv.mobile || '—'}</td>
                    <td className="px-5 py-3.5"><Badge tone={inv.isTab ? 'violet' : 'sky'}>{inv.isTab ? 'Customer tab' : 'Counter'}</Badge></td>
                    <td className="adm-num px-5 py-3.5 font-extrabold text-slate-800">{fmt(inv.total)}</td>
                    <td className="px-5 py-3.5 text-slate-600">{inv.payment ? <span className="uppercase">{inv.payment}</span> : '—'}</td>
                    <td className="px-5 py-3.5 text-[13px] text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-3.5"><Badge tone="green">Completed</Badge></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" title="View items" onClick={() => setExpanded(expanded === inv.key ? null : inv.key)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"><Eye size={15} /></button>
                        <button type="button" title="Print invoice" disabled={!inv.sessionId} onClick={() => inv.sessionId && setPrinting({ sessionId: inv.sessionId, invNo: inv.invNo })}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40"><Printer size={15} /></button>
                      </div>
                    </td>
                  </tr>
                  {expanded === inv.key && (
                    <tr className="bg-slate-50">
                      <td colSpan={9} className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          {inv.items.map((item, i) => (
                            <div key={i} className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0">
                              <div className="flex items-center gap-3">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-100 bg-red-50 text-xs font-black text-red-600">{item.qty}x</span>
                                <span className="font-bold text-slate-800">{item.name}</span>
                              </div>
                              <span className="adm-num shrink-0 font-bold text-slate-700">{fmt(item.price * item.qty)}</span>
                            </div>
                          ))}
                          <div className="mt-1 flex items-center justify-between pt-2">
                            <span className="text-sm text-slate-500">{new Date(inv.createdAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="adm-num text-lg font-black text-red-600">{fmt(inv.total)}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <Empty icon="orders" title="No bills match these filters." />}
        </div>
        <Pagination p={pager} label="bills" />
      </Card>

      {printing && <PrintModal sessionId={printing.sessionId} invNo={printing.invNo} onClose={() => setPrinting(null)} />}
    </Page>
  );
}

const PRINT_ROLL_SIZES = [{ size: '2inch', label: '2 inch roll' }, { size: '3inch', label: '3 inch roll' }];
const PRINT_SHEET_SIZES = [{ size: 'a3', label: 'A3' }, { size: 'a4', label: 'A4' }, { size: 'a5', label: 'A5' }];
const printOptCls = 'rounded-2xl border border-slate-200 px-5 py-4 text-center text-sm font-bold text-slate-800 transition-colors hover:border-red-300 hover:bg-red-50';

function PrintModal({ sessionId, invNo, onClose }: { sessionId: string; invNo: string; onClose: () => void }) {
  const pick = (size: string, label: string) => {
    printReceipt(sessionId, size);
    toast.info(`Preparing ${invNo} · ${label}`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Print ${invNo}`}>
      <p className="flex items-center gap-2 text-sm text-slate-500"><Printer size={15} /> Choose the printer and paper size — the invoice resizes to match.</p>

      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Thermal printer · roll</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {PRINT_ROLL_SIZES.map(o => (
          <button key={o.size} type="button" onClick={() => pick(o.size, o.label)} className={printOptCls}>{o.label}</button>
        ))}
      </div>

      <p className="mt-5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">Sheet printer · paper</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {PRINT_SHEET_SIZES.map(o => (
          <button key={o.size} type="button" onClick={() => pick(o.size, o.label)} className={printOptCls}>{o.label}</button>
        ))}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Delivery Zones — admin-managed governorates/areas + their delivery fee.
// These drive the governorate picker and the delivery charge at checkout.
// ---------------------------------------------------------------------------

function DeliveryZonesSection() {
  return (
    <Page>
      <PageHead
        title="Delivery Zones"
        sub="Add the governorates / areas you deliver to and set each one's delivery fee. Customers can only pick a zone listed here, and the fee shows on their bill."
        bar
      />
      <Card>
        <AreasPanel />
      </Card>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Homepage — admin-managed photos & videos for the public landing page.
// ---------------------------------------------------------------------------

async function uploadHomeFile(file: File, kind: 'image' | 'video'): Promise<string | null> {
  try {
    let blob: Blob = file;
    let filename = 'video.mp4';
    if (kind === 'image') {
      if (file.size > 5 * 1024 * 1024) { toast.error('Photo is too large (max 5 MB).'); return null; }
      blob = (await compressToWebp(file)).blob;
      filename = 'photo.webp';
    } else {
      if (file.size > 10 * 1024 * 1024) { toast.error('Video is too large (max 10 MB).'); return null; }
      if (!/mp4/i.test(file.type) && !/\.mp4$/i.test(file.name)) { toast.error('Please upload an MP4 video.'); return null; }
    }
    const form = new FormData();
    form.append('file', blob, filename);
    form.append('kind', kind);
    const res = await fetch('/api/upload-media', { method: 'POST', body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error(json?.error?.message ?? 'Upload failed. Please try again.');
    return json.url as string;
  } catch (e) {
    toast.error((e as Error).message);
    return null;
  }
}

function MediaAddButton({ kind, disabled, label, onUploaded }: { kind: 'image' | 'video'; disabled?: boolean; label: string; onUploaded: (url: string) => void }) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    const url = await uploadHomeFile(f, kind);
    setBusy(false);
    if (ref.current) ref.current.value = '';
    if (url) { onUploaded(url); toast.success(kind === 'video' ? 'Video added.' : 'Photo added.'); }
  };
  return (
    <>
      <input ref={ref} type="file" accept={kind === 'image' ? 'image/*' : 'video/mp4'} className="hidden" onChange={e => pick(e.target.files?.[0])} />
      <button type="button" disabled={disabled || busy} onClick={() => ref.current?.click()}
        className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 transition-colors hover:border-red-300 hover:text-red-500 disabled:opacity-40">
        <Icon name={busy ? 'clock' : 'plus'} size={22} />
        <span className="text-[11px] font-bold">{busy ? 'Uploading…' : label}</span>
      </button>
    </>
  );
}

function MediaTile({ url, isVideo, onDelete }: { url: string; isVideo?: boolean; onDelete: () => void }) {
  return (
    <div className="group relative aspect-[9/16] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      {isVideo
        ? <video src={url} className="h-full w-full object-cover" muted playsInline />
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt="" className="h-full w-full object-cover" />}
      <button type="button" onClick={onDelete} aria-label="Remove"
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function HomepageSection() {
  const rows = useSyncExternalStore(subscribeToHomeMedia, getHomeMediaSnapshot, getHomeMediaServerSnapshot);
  const media = homeMediaFrom(rows);
  const update = (patch: Partial<HomeMedia>) => saveHomeMedia({ ...media, ...patch });

  return (
    <Page>
      <PageHead
        title="Homepage"
        sub="Photos and videos shown on your public homepage. Upload portrait (mobile) media — photos up to 5 MB, videos up to 10 MB. Empty slots keep the built-in images."
        bar
      />

      <Card title={`Photo gallery (${media.gallery.length}/${HOME_MEDIA_LIMITS.gallery})`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: HOME_MEDIA_LIMITS.gallery }).map((_, i) => {
            const url = media.gallery[i];
            return url
              ? <MediaTile key={url} url={url} onDelete={() => update({ gallery: media.gallery.filter((_, j) => j !== i) })} />
              : <MediaAddButton key={`g-add-${i}`} kind="image" label="Add photo" onUploaded={u => update({ gallery: [...media.gallery, u] })} />;
          })}
        </div>
      </Card>

      <Card className="mt-5" title={`Videos (${media.videos.length}/${HOME_MEDIA_LIMITS.videos})`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: HOME_MEDIA_LIMITS.videos }).map((_, i) => {
            const url = media.videos[i];
            return url
              ? <MediaTile key={url} url={url} isVideo onDelete={() => update({ videos: media.videos.filter((_, j) => j !== i) })} />
              : <MediaAddButton key={`v-add-${i}`} kind="video" label="Add video" onUploaded={u => update({ videos: [...media.videos, u] })} />;
          })}
        </div>
      </Card>

      <Card className="mt-5" title={`Kuwait's Finest Flavours (${media.finest.length}/${HOME_MEDIA_LIMITS.finest} photos)`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: HOME_MEDIA_LIMITS.finest }).map((_, i) => {
            const url = media.finest[i];
            return url
              ? <MediaTile key={url} url={url} onDelete={() => update({ finest: media.finest.filter((_, j) => j !== i) })} />
              : <MediaAddButton key={`f-add-${i}`} kind="image" label="Add photo" onUploaded={u => update({ finest: [...media.finest, u] })} />;
          })}
        </div>
      </Card>

      <Card className="mt-5" title="“Made for Celebrations” photo">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {media.celebrations
            ? <MediaTile url={media.celebrations} onDelete={() => update({ celebrations: '' })} />
            : <MediaAddButton kind="image" label="Add photo" onUploaded={url => update({ celebrations: url })} />}
        </div>
      </Card>
    </Page>
  );
}


// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

function InventorySection({ menu }: { menu: MenuItem[] }) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | MenuCategory>('All');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Built-in categories plus any custom ones already in use, so new categories
  // an admin adds from the product form show up here as filters too.
  const categories = useMemo(
    () => Array.from(new Set([...MENU_CATEGORIES, ...menu.map(m => m.category)].filter(Boolean))),
    [menu]
  );

  const filtered = menu.filter(m => {
    const q = search.toLowerCase();
    const matchesSearch = m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || (m.sku || '').toLowerCase().includes(q);
    const matchesCat = categoryFilter === 'All' || m.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const pager = usePagination(filtered, 10, `${search}|${categoryFilter}`);

  const totalProducts = menu.length;
  const activeCount = menu.filter(m => m.status === 'active').length;
  const inactiveCount = totalProducts - activeCount;

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item: MenuItem) => { setEditing(item); setFormOpen(true); };

  return (
    <Page>
      <PageHead
        title="Inventory"
        sub="Your product catalog — pricing, categories and availability."
        bar
        right={<Btn kind="red" icon="plus" onClick={openAdd}>Add product</Btn>}
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Kpi label="Total Products" value={totalProducts} icon="box" tone="amber" small />
        <Kpi label="Active" value={activeCount} icon="check" tone="emerald" small />
        <Kpi label="Inactive" value={inactiveCount} icon="alert" tone="red" small />
      </div>

      <Card className="mb-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBox value={search} onChange={setSearch} placeholder="Search by name, category or SKU…" className="sm:max-w-md sm:flex-1" />
          <Pills
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={['All', ...categories].map(c => ({ v: c as 'All' | MenuCategory, t: c }))}
          />
        </div>
      </Card>

      <Card className="overflow-hidden !p-0">
        <div className="adm-scroll overflow-x-auto">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3.5 font-bold">Product</th>
                <th className="px-5 py-3.5 font-bold">Category</th>
                <th className="px-5 py-3.5 font-bold">Price</th>
                <th className="px-5 py-3.5 font-bold">Status</th>
                <th className="px-5 py-3.5 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pager.items.map(item => (
                <tr key={item.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {item.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={item.image} alt={item.name} className="h-11 w-11 shrink-0 rounded-lg border border-slate-100 object-cover" />
                      ) : (
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-red-100 bg-red-50 font-black text-red-600">{item.name.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.sku || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone="slate">{item.category}</Badge>
                  </td>
                  <td className="adm-num px-5 py-3.5 font-bold text-slate-800">{fmt(item.price)}</td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => updateMenuItem(item.id, { status: item.status === 'active' ? 'inactive' : 'active' })}
                      className="cursor-pointer"
                    >
                      <Badge tone={item.status === 'active' ? 'green' : 'slate'}>{item.status === 'active' ? 'Active' : 'Inactive'}</Badge>
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="text-slate-500">Delete?</span>
                        <button type="button" onClick={() => { deleteMenuItem(item.id); setConfirmDeleteId(null); }} className="text-red-600 hover:underline">Yes</button>
                        <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-slate-400 hover:underline">No</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Btn kind="plain" size="sm" icon="edit" onClick={() => openEdit(item)}>Edit</Btn>
                        <Btn kind="plain" size="sm" icon="trash" className="text-red-600" onClick={() => setConfirmDeleteId(item.id)}>Delete</Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty icon="box" title="No products found." />}
        </div>
        <Pagination p={pager} label="products" />
      </Card>

      {formOpen && <ProductFormModal item={editing} categories={categories} onClose={() => setFormOpen(false)} />}
    </Page>
  );
}

const NEW_CATEGORY = '__new__';

function ProductFormModal({ item, categories, onClose }: { item: MenuItem | null; categories: string[]; onClose: () => void }) {
  const [name, setName] = useState(item?.name || '');
  const knownCategories = categories.length ? categories : MENU_CATEGORIES;
  const [category, setCategory] = useState<string>(item?.category || knownCategories[0]);
  // When the admin picks "Add new category…", the <select> switches to this
  // sentinel and a text input appears; its value becomes the real category.
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [description, setDescription] = useState(item?.description || '');
  const [image, setImage] = useState(item?.image || '');
  const [prepTime, setPrepTime] = useState(item?.prepTime || '5 min');
  const [status, setStatus] = useState<'active' | 'inactive'>(item?.status || 'active');
  const [isPopular, setIsPopular] = useState(!!item?.isPopular);
  const [isChefSpecial, setIsChefSpecial] = useState(!!item?.isChefSpecial);
  const [isBestSeller, setIsBestSeller] = useState(!!item?.isBestSeller);
  const [isSpicy, setIsSpicy] = useState(!!item?.isSpicy);
  const [sku, setSku] = useState(item?.sku || '');
  const [stock, setStock] = useState(item?.stock != null ? String(item.stock) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    const priceNum = Number(price);
    const finalCategory = (addingCategory ? newCategory : category).trim();
    if (!name.trim()) { setError('Please enter a product name.'); return; }
    if (!finalCategory) { setError('Please choose or enter a category.'); return; }
    if (!Number.isFinite(priceNum) || priceNum <= 0) { setError('Please enter a valid price.'); return; }

    const stockNum = stock.trim() === '' ? undefined : Number(stock);
    if (stockNum != null && (!Number.isFinite(stockNum) || stockNum < 0)) {
      setError('Please enter a valid stock quantity.');
      return;
    }

    const payload = {
      name: name.trim(),
      category: finalCategory,
      price: priceNum,
      description: description.trim(),
      image: image.trim() || FALLBACK_IMAGE,
      prepTime: prepTime.trim() || '5 min',
      status,
      isPopular,
      isChefSpecial,
      isBestSeller,
      isSpicy,
      sku: sku.trim() || undefined,
      stock: stockNum,
    };

    setSaving(true);
    try {
      if (item) updateMenuItem(item.id, payload);
      else addMenuItem(payload);
      setTimeout(() => { onClose(); }, 400);
    } catch {
      setSaving(false);
      setError('Could not save. Please try again.');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={item ? 'Edit product' : 'Add new product'}
      wide
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="red" disabled={saving} onClick={() => { const f = document.getElementById('product-form') as HTMLFormElement | null; f?.requestSubmit(); }}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add product'}
          </Btn>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Product name">
          <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} placeholder="e.g. Pistachio Baklava" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category">
            {addingCategory ? (
              <div className="flex gap-2">
                <input
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  autoFocus
                  className={inputCls}
                  placeholder="New category name"
                />
                <button type="button" onClick={() => { setAddingCategory(false); setNewCategory(''); }}
                  className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-500 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            ) : (
              <select
                value={category}
                onChange={e => { if (e.target.value === NEW_CATEGORY) { setAddingCategory(true); } else { setCategory(e.target.value); } }}
                className={inputCls}
              >
                {knownCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value={NEW_CATEGORY}>➕ Add new category…</option>
              </select>
            )}
          </Field>
          <Field label="Price (KD)">
            <input value={price} onChange={e => setPrice(e.target.value)} required type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
          </Field>
        </div>

        <Field label="Description">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className={cx(inputCls, 'h-auto resize-none py-2.5')} placeholder="Short menu description" />
        </Field>

        <PhotoField value={image} onChange={setImage} />

        <Field label="Prep time">
          <input value={prepTime} onChange={e => setPrepTime(e.target.value)} className={inputCls} placeholder="e.g. 5 min" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="SKU / Code">
            <input value={sku} onChange={e => setSku(e.target.value)} className={inputCls} placeholder="e.g. AS-BKL" />
          </Field>
          <Field label="Stock quantity">
            <input value={stock} onChange={e => setStock(e.target.value)} type="number" min="0" step="1" className={inputCls} placeholder="Optional" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-4 text-slate-700">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isPopular} onChange={e => setIsPopular(e.target.checked)} className="accent-red-600" /> Popular
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isChefSpecial} onChange={e => setIsChefSpecial(e.target.checked)} className="accent-red-600" /> Chef special
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isBestSeller} onChange={e => setIsBestSeller(e.target.checked)} className="accent-red-600" /> Best seller
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={isSpicy} onChange={e => setIsSpicy(e.target.checked)} className="accent-red-600" /> Spicy
          </label>
          <label className="ml-auto flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={status === 'active'} onChange={e => setStatus(e.target.checked ? 'active' : 'inactive')} className="accent-red-600" /> Active
          </label>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
