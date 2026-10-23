"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Pagination, usePagination } from '../components/Pagination';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  ArrowLeft,
  Download,
  Search,
  Plus,
  X,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  LogOut,
  Ticket,
  Receipt,
  Truck,
  Users,
  SlidersHorizontal,
} from 'lucide-react';
import { Order, getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, orderLabel } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { BRAND } from '../lib/brand';
import TablesSection from './TablesSection';
import CouponsSection from './CouponsSection';
import BillingSection from './BillingSection';
import AnalyticsSection from './AnalyticsSection';
import DeliveriesSection from './DeliveriesSection';
import DriversSection from './DriversSection';
import DeliverySettingsSection from './DeliverySettingsSection';
import PhotoField from './PhotoField';
import { Period, isInPeriod } from './analyticsHelpers';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmt = (n: number) => formatKWD(n);

function exportOrdersToCSV(orders: Order[]) {
  const headers = ['Ticket ID', 'Table', 'Source', 'Items', 'Subtotal', 'Tax', 'Total', 'Status', 'Date'];
  const rows = orders.map(o => [
    o.id,
    String(o.table),
    o.source === 'customer' ? 'Self-order' : 'Waiter',
    o.items.map(i => `${i.qty}x ${i.name}`).join('; '),
    o.subtotal.toFixed(2),
    o.tax.toFixed(2),
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

const STATUS_STYLES: Record<Order['status'], string> = {
  pending: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  cooking: 'bg-brand-red/10 text-brand-red-dark border-brand-red/20',
  ready: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  served: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
};

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=400';

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type Section = 'analytics' | 'orders' | 'inventory' | 'tables' | 'coupons' | 'billing' | 'deliveries' | 'drivers' | 'delivery';

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('billing');
  const rawOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const orders = useMemo(() => rawOrders.filter(o => o.billed), [rawOrders]);
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);

  const navItems: { key: Section; icon: typeof LayoutDashboard; label: string }[] = [
    { key: 'billing', icon: Receipt, label: 'Billing' },
    { key: 'analytics', icon: LayoutDashboard, label: 'Analytics' },
    { key: 'orders', icon: ClipboardList, label: 'Orders' },
    { key: 'inventory', icon: Package, label: 'Inventory' },
    { key: 'tables', icon: LayoutGrid, label: 'Tables' },
    { key: 'coupons', icon: Ticket, label: 'Coupons' },
    { key: 'deliveries', icon: Truck, label: 'Deliveries' },
    { key: 'drivers', icon: Users, label: 'Drivers' },
    { key: 'delivery', icon: SlidersHorizontal, label: 'Delivery Settings' },
  ];

  return (
    <div className="staff-themed min-h-screen bg-[#0d0809] text-white font-sans">
      {/* Sidebar Navigation */}
      <div className="fixed left-0 top-0 h-full w-16 sm:w-20 md:w-64 bg-[#1a0a10] border-r border-brand-red/10 flex flex-col p-3 sm:p-4 z-50 transition-all">
        <div className="flex items-center gap-3 mb-6 sm:mb-10 pl-1 sm:pl-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt={BRAND.fullName} className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-cover shrink-0 shadow-lg" />
          <span className="font-bold text-xl hidden md:block">{BRAND.name} Admin</span>
        </div>

        <nav className="flex flex-col gap-2 flex-1">
          {navItems.map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`flex items-center justify-center md:justify-start gap-4 p-3 rounded-xl transition-all ${section === item.key ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'text-gray-400 hover:bg-brand-red/5 hover:text-white'}`}
            >
              <item.icon size={20} />
              <span className="font-medium hidden md:block">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto p-2 sm:p-4 flex items-center justify-center md:justify-start gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-brand-red/20 border border-brand-red/30 text-brand-gold font-black flex items-center justify-center shrink-0">A</div>
          <div className="hidden md:block">
            <p className="text-sm font-bold">Admin</p>
            <p className="text-xs text-gray-500">Manager</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-16 sm:ml-20 md:ml-64">
        <header className="bg-white text-black border-b border-black/5 px-4 sm:px-6 md:px-8 h-16 flex items-center justify-between sticky top-0 z-40">
          <h1 className="text-lg font-black capitalize">{section}</h1>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-bold text-black/60 hover:text-black flex items-center gap-1.5">
              <ArrowLeft size={16} /> View Store
            </Link>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.assign('/login?role=admin');
              }}
              className="text-sm font-bold text-brand-red hover:text-brand-red-dark flex items-center gap-1.5"
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        <main className="bg-[#f5f0f1] min-h-[calc(100vh-4rem)] text-black p-4 sm:p-6 md:p-8 flex flex-col">
          <div className="flex-1">
            {section === 'analytics' && <AnalyticsSection orders={orders} />}
            {section === 'orders' && <OrdersSection orders={orders} />}
            {section === 'inventory' && <InventorySection menu={menu} />}
            {section === 'tables' && <TablesSection />}
            {section === 'billing' && <BillingSection />}
            {section === 'coupons' && <CouponsSection />}
            {section === 'deliveries' && <DeliveriesSection />}
            {section === 'drivers' && <DriversSection />}
            {section === 'delivery' && <DeliverySettingsSection />}
          </div>
          <footer className="mt-8 pt-6 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-black/40">
            <span>© {new Date().getFullYear()} All rights reserved. {BRAND.fullName}.</span>
            <a
              href="https://www.cenexasystems.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-black/50 hover:text-brand-red transition-colors"
            >
              POWERED BY <span className="text-brand-red">CENEXA SYSTEMS</span> © {new Date().getFullYear()}
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

function OrdersSection({ orders }: { orders: Order[] }) {
  const [typeFilter, setTypeFilter] = useState<'all' | 'waiter' | 'customer'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return orders
      .filter(o => {
        if (typeFilter !== 'all' && o.source !== typeFilter) return false;
        if (dateFilter !== 'all' && !isInPeriod(o.createdAt, dateFilter as Period, customFrom, customTo)) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const hay = `${o.id} table ${o.table}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [orders, typeFilter, dateFilter, customFrom, customTo, search]);

  const pager = usePagination(filtered, 15, `${typeFilter}|${dateFilter}|${customFrom}|${customTo}|${search}`);

  const clearDates = () => {
    setDateFilter('all');
    setCustomFrom('');
    setCustomTo('');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-brand-red/5 rounded-2xl p-4 border border-brand-red/10">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">Total Revenue</p>
          <p className="text-xl font-black text-brand-red mt-1">{fmt(filtered.reduce((s, o) => s + o.total, 0))}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">Total Orders</p>
          <p className="text-xl font-black mt-1">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">Avg Order Value</p>
          <p className="text-xl font-black mt-1">{filtered.length ? fmt(filtered.reduce((s, o) => s + o.total, 0) / filtered.length) : fmt(0)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-black/5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">Items Sold</p>
          <p className="text-xl font-black mt-1">{filtered.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0)}</p>
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <h2 className="text-2xl font-black">Order Management</h2>
          <div className="relative w-full md:w-80">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticket ID or table..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-black/40 w-14">Type</span>
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'All Bills' },
              { key: 'waiter', label: 'Staff-Taken' },
              { key: 'customer', label: 'Self-Ordered' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key as typeof typeFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${typeFilter === t.key ? 'bg-brand-red text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-black/40 w-14">Date</span>
          <div className="flex flex-wrap gap-2 items-center">
            {[
              { key: 'today', label: 'Today' },
              { key: 'week', label: 'This Week' },
              { key: 'month', label: 'This Month' },
              { key: 'custom', label: 'Custom Range' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setDateFilter(t.key as typeof dateFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${dateFilter === t.key ? 'bg-brand-red text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}
              >
                {t.label}
              </button>
            ))}
            {dateFilter !== 'all' && (
              <button onClick={clearDates} className="text-xs font-bold text-red-500 hover:underline">
                Clear Dates
              </button>
            )}
            {dateFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs" />
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-black/10 text-xs" />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-black/50">{filtered.length} result(s)</p>
          <button
            onClick={() => exportOrdersToCSV(filtered)}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 text-sm font-bold text-brand-red hover:text-brand-red-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead>
              <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                <th className="px-5 py-4 font-bold">Ticket</th>
                <th className="px-5 py-4 font-bold">Table / Mode</th>
                <th className="px-5 py-4 font-bold">Source</th>
                <th className="px-5 py-4 font-bold">Items</th>
                <th className="px-5 py-4 font-bold">Coupon</th>
                <th className="px-5 py-4 font-bold">Total</th>
                <th className="px-5 py-4 font-bold">Date</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Billed</th>
                <th className="px-5 py-4 font-bold" />
              </tr>
            </thead>
            <tbody>
              {pager.items.map(o => (
                <React.Fragment key={o.id}>
                  <tr className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td className="px-5 py-4 font-bold text-brand-red">{o.id}</td>
                    <td className="px-5 py-4 font-medium">{orderLabel(o)}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${o.source === 'customer' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-red/10 text-brand-red-dark'}`}>
                        {o.source === 'customer' ? 'Self-Order' : 'Staff-Taken'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-black/60">{o.items.reduce((s, i) => s + i.qty, 0)} items</td>
                    <td className="px-5 py-4">
                      {o.couponCode ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-brand-gold/10 text-brand-gold-dark border border-brand-gold/20">{o.couponCode}</span>
                      ) : (
                        <span className="text-black/30">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 font-black text-brand-red text-base">{fmt(o.total)}</td>
                    <td className="px-5 py-4 text-black/60 text-sm">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${STATUS_STYLES[o.status]}`}>
                        {o.status === 'served' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {o.billed ? (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">Billed</span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-yellow-500/10 text-yellow-600 border border-yellow-500/20">Active</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-black/30">{expandedId === o.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                  </tr>
                  {expandedId === o.id && (
                    <tr className="bg-black/[0.02]">
                      <td colSpan={10} className="px-5 py-4">
                        <div className="flex flex-col lg:flex-row gap-6">
                          <div className="flex-1 flex flex-col gap-1">
                            {o.items.map((item, i) => (
                              <div key={i} className="flex justify-between items-center text-sm py-2 border-b border-black/5 last:border-0">
                                <div className="flex items-center gap-3">
                                  <span className="w-8 h-8 rounded-lg bg-brand-red/10 text-brand-red font-black text-xs flex items-center justify-center shrink-0">{item.qty}x</span>
                                  <div>
                                    <span className="font-bold text-black">{item.name}</span>
                                    {item.notes && <p className="text-xs text-black/40 mt-0.5">{item.notes}</p>}
                                  </div>
                                </div>
                                <span className="font-bold text-black/80 shrink-0">{fmt(item.price * item.qty)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="w-full lg:w-72 bg-black/[0.03] rounded-2xl p-5 space-y-3 shrink-0">
                            <div className="flex justify-between text-sm">
                              <span className="text-black/50">Subtotal</span>
                              <span className="font-bold">{fmt(o.subtotal)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-black/50">Tax & Fees</span>
                              <span className="font-bold">{fmt(o.tax)}</span>
                            </div>
                            {o.discount ? (
                              <div className="flex justify-between text-sm items-center">
                                <span className="text-brand-red font-bold flex items-center gap-1.5">
                                  Discount
                                  <span className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold-dark rounded-full text-[10px] font-bold border border-brand-gold/20">{o.couponCode}</span>
                                </span>
                                <span className="text-brand-red font-black">−{fmt(o.discount)}</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between items-center pt-3 mt-1 border-t-2 border-black/10">
                              <span className="font-black text-base">Grand Total</span>
                              <span className="font-black text-xl text-brand-red">{fmt(o.total)}</span>
                            </div>
                            <p className="text-xs text-black/40 pt-1">
                              {new Date(o.createdAt).toLocaleString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-16 text-center text-black/30 font-bold">
                    No orders match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination p={pager} label="orders" />
      </div>
    </div>
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

  const summary: { label: string; value: string; cls: string }[] = [
    { label: 'Total Products', value: String(totalProducts), cls: 'text-brand-ink' },
    { label: 'Active', value: String(activeCount), cls: 'text-emerald-600' },
    { label: 'Inactive', value: String(inactiveCount), cls: 'text-brand-red' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {summary.map(s => (
          <div key={s.label} className="bg-white p-4 rounded-2xl border border-black/5 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">{s.label}</p>
            <p className={`text-xl font-black mt-1 ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-2xl font-black">Menu Inventory</h2>
            <p className="text-sm text-black/50">Manage your product catalog — pricing, categories, and availability.</p>
          </div>
          <button onClick={openAdd} className="flex items-center justify-center gap-2 px-5 py-3 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl font-bold text-sm transition-colors shrink-0">
            <Plus size={16} /> Add New Product
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/30" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, category or SKU..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {(['All', ...MENU_CATEGORIES] as const).map(c => (
              <button key={c} onClick={() => setCategoryFilter(c as 'All' | MenuCategory)} className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${categoryFilter === c ? 'bg-brand-red text-white' : 'bg-black/5 text-black/60 hover:bg-black/10'}`}>{c}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead>
              <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                <th className="px-5 py-4 font-bold">Product</th>
                <th className="px-5 py-4 font-bold">Category</th>
                <th className="px-5 py-4 font-bold">Price</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pager.items.map(item => {
                return (
                  <tr key={item.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-brand-red/10 text-brand-red-dark font-black flex items-center justify-center shrink-0">
                          {item.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate">{item.name}</p>
                          <p className="text-xs text-black/40">{item.sku || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 rounded-full bg-black/5 text-xs font-bold text-black/60">{item.category}</span>
                    </td>
                    <td className="px-5 py-4 font-bold">{fmt(item.price)}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => updateMenuItem(item.id, { status: item.status === 'active' ? 'inactive' : 'active' })}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'}`}
                      >
                        {item.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="text-black/50">Delete?</span>
                          <button onClick={() => { deleteMenuItem(item.id); setConfirmDeleteId(null); }} className="text-red-500 hover:underline">Yes</button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-black/40 hover:underline">No</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 text-sm font-bold">
                          <button onClick={() => openEdit(item)} className="text-blue-500 hover:underline flex items-center gap-1"><Pencil size={13} /> Edit</button>
                          <button onClick={() => setConfirmDeleteId(item.id)} className="text-red-500 hover:underline flex items-center gap-1"><Trash2 size={13} /> Delete</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-black/30 font-bold">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination p={pager} label="products" />
      </div>

      {formOpen && <ProductFormModal item={editing} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function ProductFormModal({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState<MenuCategory>(item?.category || MENU_CATEGORIES[0]);
  const [price, setPrice] = useState(item ? String(item.price) : '');
  const [description, setDescription] = useState(item?.description || '');
  const [image, setImage] = useState(item?.image || '');
  const [prepTime, setPrepTime] = useState(item?.prepTime || '5 min');
  const [status, setStatus] = useState<'active' | 'inactive'>(item?.status || 'active');
  const [isPopular, setIsPopular] = useState(!!item?.isPopular);
  const [isChefSpecial, setIsChefSpecial] = useState(!!item?.isChefSpecial);
  const [isSpicy, setIsSpicy] = useState(!!item?.isSpicy);
  const [sku, setSku] = useState(item?.sku || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = Number(price);
    if (!name.trim() || !Number.isFinite(priceNum) || priceNum <= 0) return;

    const payload = {
      name: name.trim(),
      category,
      price: priceNum,
      description: description.trim(),
      image: image.trim() || FALLBACK_IMAGE,
      prepTime: prepTime.trim() || '5 min',
      status,
      isPopular,
      isChefSpecial,
      isSpicy,
      sku: sku.trim() || undefined,
    };

    if (item) updateMenuItem(item.id, payload);
    else addMenuItem(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 md:p-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black">{item ? 'Edit Product' : 'Add New Product'}</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">Product Name</label>
            <input value={name} onChange={e => setName(e.target.value)} required className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. Truffle Pasta" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as MenuCategory)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red">
                {MENU_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Price (KD)</label>
              <input value={price} onChange={e => setPrice(e.target.value)} required type="number" min="0" step="0.01" className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red resize-none" placeholder="Short menu description" />
          </div>

          <PhotoField value={image} onChange={setImage} />

          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">Prep Time</label>
            <input value={prepTime} onChange={e => setPrepTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. 5 min" />
          </div>

          <div>
            <label className="text-xs font-bold text-black/50 mb-1.5 block">SKU / Code</label>
            <input value={sku} onChange={e => setSku(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. AS-BKL" />
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={isPopular} onChange={e => setIsPopular(e.target.checked)} className="accent-brand-red" /> Popular
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={isChefSpecial} onChange={e => setIsChefSpecial(e.target.checked)} className="accent-brand-red" /> Chef Special
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={isSpicy} onChange={e => setIsSpicy(e.target.checked)} className="accent-brand-red" /> Spicy
            </label>
            <label className="flex items-center gap-2 text-sm font-medium ml-auto">
              <input type="checkbox" checked={status === 'active'} onChange={e => setStatus(e.target.checked ? 'active' : 'inactive')} className="accent-brand-red" /> Active
            </label>
          </div>

          <button type="submit" className="w-full py-3.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl font-black text-sm transition-colors mt-2">
            {item ? 'Save Changes' : 'Add Product'}
          </button>
        </form>
      </div>
    </div>
  );
}
