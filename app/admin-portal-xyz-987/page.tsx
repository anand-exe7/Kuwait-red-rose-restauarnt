"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  ClipboardList,
  Package,
  ArrowLeft,
  DollarSign,
  Activity,
  Users,
  TrendingUp,
  Star,
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
} from 'lucide-react';
import { Order, getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { BRAND } from '../lib/brand';
import TablesSection from './TablesSection';
import CouponsSection from './CouponsSection';
import BillingSection from './BillingSection';
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

type Period = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

const fmt = (n: number) => formatKWD(n);

function isInPeriod(createdAt: number, period: Period, from?: string, to?: string): boolean {
  if (period === 'all') return true;
  const d = new Date(createdAt);
  const now = new Date();
  if (period === 'today') return d.toDateString() === now.toDateString();
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  if (period === 'custom') {
    if (!from || !to) return true;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}

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

type Section = 'analytics' | 'orders' | 'inventory' | 'tables' | 'coupons' | 'billing';

export default function AdminDashboard() {
  const [section, setSection] = useState<Section>('analytics');
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);

  const navItems: { key: Section; icon: typeof LayoutDashboard; label: string }[] = [
    { key: 'analytics', icon: LayoutDashboard, label: 'Analytics' },
    { key: 'orders', icon: ClipboardList, label: 'Orders' },
    { key: 'inventory', icon: Package, label: 'Inventory' },
    { key: 'tables', icon: LayoutGrid, label: 'Tables' },
    { key: 'billing', icon: Receipt, label: 'Billing' },
    { key: 'coupons', icon: Ticket, label: 'Coupons' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans">
      {/* Sidebar Navigation */}
      <div className="fixed left-0 top-0 h-full w-16 sm:w-20 md:w-64 bg-[#141414] border-r border-white/5 flex flex-col p-3 sm:p-4 z-50 transition-all">
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
              className={`flex items-center justify-center md:justify-start gap-4 p-3 rounded-xl transition-all ${section === item.key ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
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

        <main className="bg-[#f4f5f7] min-h-[calc(100vh-4rem)] text-black p-4 sm:p-6 md:p-8">
          {section === 'analytics' && <AnalyticsSection orders={orders} />}
          {section === 'orders' && <OrdersSection orders={orders} />}
          {section === 'inventory' && <InventorySection menu={menu} />}
          {section === 'tables' && <TablesSection />}
          {section === 'billing' && <BillingSection />}
          {section === 'coupons' && <CouponsSection />}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

function AnalyticsSection({ orders }: { orders: Order[] }) {
  const [period, setPeriod] = useState<Period>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const periodOrders = useMemo(
    () => orders.filter(o => isInPeriod(o.createdAt, period, customFrom, customTo)),
    [orders, period, customFrom, customTo]
  );
  const completed = useMemo(() => periodOrders.filter(o => o.status === 'served'), [periodOrders]);
  const staffOrders = useMemo(() => completed.filter(o => o.source === 'waiter'), [completed]);
  const selfOrders = useMemo(() => completed.filter(o => o.source === 'customer'), [completed]);

  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const staffRevenue = staffOrders.reduce((s, o) => s + o.total, 0);
  const selfRevenue = selfOrders.reduce((s, o) => s + o.total, 0);
  const totalItemsSold = completed.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgOrderValue = completed.length ? totalRevenue / completed.length : 0;

  const topItems = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; qty: number }>();
    completed.forEach(o =>
      o.items.forEach(i => {
        const cur = map.get(i.name) || { name: i.name, revenue: 0, qty: 0 };
        cur.revenue += i.price * i.qty;
        cur.qty += i.qty;
        map.set(i.name, cur);
      })
    );
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [completed]);
  const topItem = topItems[0];
  const maxItemRevenue = topItems[0]?.revenue || 1;

  const year = new Date().getFullYear();
  const monthLabels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthly = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) =>
        completed
          .filter(o => {
            const d = new Date(o.createdAt);
            return d.getFullYear() === year && d.getMonth() === m;
          })
          .reduce((s, o) => s + o.total, 0)
      ),
    [completed, year]
  );
  const maxMonthly = Math.max(1, ...monthly);

  const startOfWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const weekDayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weekly = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date(startOfWeek);
        day.setDate(startOfWeek.getDate() + i);
        return completed
          .filter(o => new Date(o.createdAt).toDateString() === day.toDateString())
          .reduce((s, o) => s + o.total, 0);
      }),
    [completed, startOfWeek]
  );
  const maxWeekly = Math.max(1, ...weekly);
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const weekNumber = Math.ceil(
    ((startOfWeek.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7
  );

  const PERIODS: { key: Period; label: string }[] = [
    { key: 'all', label: 'All Time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This Week' },
    { key: 'month', label: 'This Month' },
    { key: 'year', label: 'This Year' },
    { key: 'custom', label: 'Custom' },
  ];

  const stats: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string }[] = [
    { label: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hint: 'From served orders' },
    { label: 'Completed Orders', value: String(completed.length), icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-500/10', hint: 'Fully served bills' },
    { label: 'Staff-Taken Revenue', value: fmt(staffRevenue), icon: Users, color: 'text-brand-red', bg: 'bg-brand-red/10', hint: 'Waiter-placed orders' },
    { label: 'Self-Ordered Revenue', value: fmt(selfRevenue), icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10', hint: 'Customer QR orders' },
  ];

  const stats2: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string }[] = [
    { label: 'Total Staff Orders', value: String(staffOrders.length), icon: Users, color: 'text-brand-red', bg: 'bg-brand-red/10', hint: 'Waiter-taken bills' },
    { label: 'Total Self-Orders', value: String(selfOrders.length), icon: Activity, color: 'text-purple-500', bg: 'bg-purple-500/10', hint: 'Customer self-ordered' },
    { label: 'Total Items Sold', value: String(totalItemsSold), icon: Package, color: 'text-blue-500', bg: 'bg-blue-500/10', hint: 'From completed bills' },
    { label: 'Avg Order Value', value: fmt(avgOrderValue), icon: TrendingUp, color: 'text-brand-gold', bg: 'bg-brand-gold/10', hint: 'Per completed order' },
    { label: 'Top Item', value: topItem ? topItem.name : '—', icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-500/10', hint: 'Most sold item' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black">Restaurant Analytics</h2>
            <p className="text-sm text-black/50">Real-time revenue & order channel insights</p>
          </div>
          <div className="flex flex-wrap gap-2 bg-black/5 p-1 rounded-full">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${period === p.key ? 'bg-brand-red text-white shadow' : 'text-black/50 hover:text-black'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mb-6 bg-black/5 rounded-xl p-3">
            <label className="text-xs font-bold text-black/60">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-1.5 rounded-lg border border-black/10 text-sm" />
            <label className="text-xs font-bold text-black/60">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-1.5 rounded-lg border border-black/10 text-sm" />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {stats.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {stats2.map((s, i) => (
            <StatCard key={i} {...s} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="text-sm font-bold text-black/50">Revenue Trend This Year <span className="text-brand-red">{year}</span></p>
            <p className="text-2xl sm:text-3xl font-black mt-1">{fmt(monthly.reduce((a, b) => a + b, 0))}</p>
            <div className="mt-8 flex items-end justify-between gap-0.5 sm:gap-2 h-48">
              {monthly.map((v, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 sm:gap-2 relative group">
                  {hoveredMonth === i && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-10">
                      {fmt(v)}
                    </div>
                  )}
                  <div
                    onMouseEnter={() => setHoveredMonth(i)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className={`w-full rounded-md transition-all cursor-pointer ${v > 0 ? 'bg-brand-red hover:bg-brand-red-dark' : 'bg-black/5'}`}
                    style={{ height: `${Math.max(3, (v / maxMonthly) * 100)}%` }}
                  />
                  <span className="text-[7px] sm:text-[10px] font-bold text-black/40 truncate w-full text-center">{monthLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="text-sm font-bold text-black/50">
              Revenue This Week <span className="text-brand-red">(Week {weekNumber} of {year})</span>
            </p>
            <p className="text-xs text-black/40 mt-1">{fmt(weekTotal)} total</p>
            <div className="mt-8 flex items-end justify-between gap-1 sm:gap-2 h-40">
              {weekly.map((v, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center gap-1.5 sm:gap-2 relative group">
                  {hoveredDay === i && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-black text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-10">
                      {fmt(v)}
                    </div>
                  )}
                  <div
                    onMouseEnter={() => setHoveredDay(i)}
                    onMouseLeave={() => setHoveredDay(null)}
                    className={`w-full rounded-md transition-all cursor-pointer ${v > 0 ? 'bg-brand-red hover:bg-brand-red-dark' : 'bg-black/5'}`}
                    style={{ height: `${Math.max(3, (v / maxWeekly) * 100)}%` }}
                  />
                  <span className="text-[8px] sm:text-[10px] font-bold text-black/40 truncate w-full text-center">{weekDayLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="font-black mb-5">Order Source</p>
            <div className="flex flex-col gap-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-brand-red uppercase tracking-wide">Staff-Taken</span>
                  <span>{staffOrders.length}</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div className="h-full bg-brand-red rounded-full" style={{ width: `${completed.length ? (staffOrders.length / completed.length) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-purple-500 uppercase tracking-wide">Self-Ordered</span>
                  <span>{selfOrders.length}</span>
                </div>
                <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                  <div className="h-full bg-purple-500 rounded-full" style={{ width: `${completed.length ? (selfOrders.length / completed.length) * 100 : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="font-black mb-5">Top Items by Revenue</p>
            {topItems.length === 0 ? (
              <p className="text-sm text-black/40">No completed orders in this period yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {topItems.map((item, i) => (
                  <div key={item.name}>
                    <div className="flex justify-between items-baseline gap-2 mb-1.5">
                      <span className="text-sm font-bold flex items-center gap-2 min-w-0">
                        <span className="text-black/30 shrink-0">{i + 1}</span>
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="text-brand-red font-black text-sm shrink-0">{fmt(item.revenue)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
                      <div className="h-full bg-brand-red rounded-full" style={{ width: `${(item.revenue / maxItemRevenue) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-black/40 mt-1">{item.qty} pcs sold</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color, bg, hint }: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string }) {
  return (
    <div className="bg-[#fafafa] p-4 sm:p-5 rounded-2xl border border-black/5">
      <div className={`w-9 h-9 rounded-xl ${bg} ${color} flex items-center justify-center mb-3`}>
        <Icon size={18} />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-black/40">{label}</p>
      <p className="text-lg sm:text-xl font-black mt-0.5 truncate">{value}</p>
      <p className="text-[11px] text-black/30 mt-0.5">{hint}</p>
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

  const clearDates = () => {
    setDateFilter('all');
    setCustomFrom('');
    setCustomTo('');
  };

  return (
    <div className="flex flex-col gap-6">
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
          <table className="w-full text-left min-w-[720px]">
            <thead>
              <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                <th className="px-5 py-4 font-bold">Ticket</th>
                <th className="px-5 py-4 font-bold">Table</th>
                <th className="px-5 py-4 font-bold">Source</th>
                <th className="px-5 py-4 font-bold">Items</th>
                <th className="px-5 py-4 font-bold">Total</th>
                <th className="px-5 py-4 font-bold">Date</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <React.Fragment key={o.id}>
                  <tr className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}>
                    <td className="px-5 py-4 font-bold text-brand-red">{o.id}</td>
                    <td className="px-5 py-4">Table {o.table}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${o.source === 'customer' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-red/10 text-brand-red-dark'}`}>
                        {o.source === 'customer' ? 'Self-Order' : 'Staff-Taken'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-black/60">{o.items.reduce((s, i) => s + i.qty, 0)} items</td>
                    <td className="px-5 py-4 font-bold">{fmt(o.total)}</td>
                    <td className="px-5 py-4 text-black/60 text-sm">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${STATUS_STYLES[o.status]}`}>
                        {o.status === 'served' ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                        {o.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-black/30">{expandedId === o.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                  </tr>
                  {expandedId === o.id && (
                    <tr className="bg-black/[0.02]">
                      <td colSpan={8} className="px-5 py-4">
                        <div className="flex flex-col gap-1.5">
                          {o.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-sm max-w-md">
                              <span className="text-black/70">
                                {item.qty}x {item.name}
                                {item.notes && <span className="text-black/40"> ({item.notes})</span>}
                              </span>
                              <span className="font-bold">{fmt(item.price * item.qty)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-xs text-black/40 max-w-md pt-2 mt-1 border-t border-black/10">
                            <span>Subtotal {fmt(o.subtotal)} · Tax/Fees {fmt(o.tax)}</span>
                            <span>{new Date(o.createdAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-black/30 font-bold">
                    No orders match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

type StockState = 'in' | 'low' | 'out' | 'untracked';
function stockState(m: MenuItem): StockState {
  if (m.stock == null) return 'untracked';
  if (m.stock <= 0) return 'out';
  if (m.lowStockThreshold != null && m.stock <= m.lowStockThreshold) return 'low';
  return 'in';
}

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

  const totalProducts = menu.length;
  const activeCount = menu.filter(m => m.status === 'active').length;
  const lowCount = menu.filter(m => stockState(m) === 'low').length;
  const outCount = menu.filter(m => stockState(m) === 'out').length;
  const retailValue = menu.reduce((s, m) => s + m.price * (m.stock || 0), 0);
  const unitsInStock = menu.reduce((s, m) => s + (m.stock || 0), 0);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (item: MenuItem) => { setEditing(item); setFormOpen(true); };
  const adjustStock = (item: MenuItem, delta: number) => {
    const next = Math.max(0, (item.stock ?? 0) + delta);
    updateMenuItem(item.id, { stock: next });
  };

  const summary: { label: string; value: string; cls: string }[] = [
    { label: 'Total Products', value: String(totalProducts), cls: 'text-brand-ink' },
    { label: 'Active', value: String(activeCount), cls: 'text-emerald-600' },
    { label: 'Low Stock', value: String(lowCount), cls: 'text-amber-600' },
    { label: 'Out of Stock', value: String(outCount), cls: 'text-brand-red' },
    { label: 'Units in Stock', value: String(unitsInStock), cls: 'text-blue-600' },
    { label: 'Retail Value', value: fmt(retailValue), cls: 'text-brand-ink' },
  ];

  const STOCK_PILL: Record<StockState, string> = {
    in: 'bg-emerald-500/10 text-emerald-600',
    low: 'bg-amber-500/10 text-amber-600',
    out: 'bg-brand-red/10 text-brand-red',
    untracked: 'bg-black/5 text-black/40',
  };
  const STOCK_LABEL: Record<StockState, string> = { in: 'In stock', low: 'Low', out: 'Out', untracked: 'Not tracked' };

  return (
    <div className="flex flex-col gap-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
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
            <p className="text-sm text-black/50">Manage pricing, stock levels, categories, and availability.</p>
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
          <table className="w-full text-left min-w-[820px]">
            <thead>
              <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                <th className="px-5 py-4 font-bold">Product</th>
                <th className="px-5 py-4 font-bold">Category</th>
                <th className="px-5 py-4 font-bold">Price</th>
                <th className="px-5 py-4 font-bold">Stock</th>
                <th className="px-5 py-4 font-bold">Status</th>
                <th className="px-5 py-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const st = stockState(item);
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
                      <div className="flex items-center gap-2">
                        <button onClick={() => adjustStock(item, -1)} className="w-7 h-7 rounded-md bg-black/5 hover:bg-black/10 flex items-center justify-center" title="−1"><ChevronDown size={14} /></button>
                        <span className="w-8 text-center font-black">{item.stock ?? '—'}</span>
                        <button onClick={() => adjustStock(item, 1)} className="w-7 h-7 rounded-md bg-black/5 hover:bg-black/10 flex items-center justify-center" title="+1"><ChevronUp size={14} /></button>
                        <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${STOCK_PILL[st]}`}>{STOCK_LABEL[st]}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-gray-500'}`}>
                        {item.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
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
                  <td colSpan={6} className="px-5 py-16 text-center text-black/30 font-bold">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
  const [stock, setStock] = useState(item?.stock != null ? String(item.stock) : '');
  const [lowStock, setLowStock] = useState(item?.lowStockThreshold != null ? String(item.lowStockThreshold) : '');
  const [cost, setCost] = useState(item?.cost != null ? String(item.cost) : '');

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
      stock: stock.trim() === '' ? undefined : Math.max(0, Number(stock) || 0),
      lowStockThreshold: lowStock.trim() === '' ? undefined : Math.max(0, Number(lowStock) || 0),
      cost: cost.trim() === '' ? undefined : Math.max(0, Number(cost) || 0),
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Image URL</label>
              <input value={image} onChange={e => setImage(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="https://..." />
            </div>
            <div>
              <label className="text-xs font-bold text-black/50 mb-1.5 block">Prep Time</label>
              <input value={prepTime} onChange={e => setPrepTime(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. 5 min" />
            </div>
          </div>

          {/* Inventory / stock */}
          <div className="rounded-xl bg-[#fafafa] border border-black/5 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-black/50 mb-3">Inventory</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-black/50 mb-1.5 block">SKU / Code</label>
                <input value={sku} onChange={e => setSku(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. AS-BKL" />
              </div>
              <div>
                <label className="text-xs font-bold text-black/50 mb-1.5 block">Cost Price (KD)</label>
                <input value={cost} onChange={e => setCost(e.target.value)} type="number" min="0" step="0.001" className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="0.000" />
              </div>
              <div>
                <label className="text-xs font-bold text-black/50 mb-1.5 block">Stock Qty</label>
                <input value={stock} onChange={e => setStock(e.target.value)} type="number" min="0" className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="leave blank = untracked" />
              </div>
              <div>
                <label className="text-xs font-bold text-black/50 mb-1.5 block">Low-stock Alert At</label>
                <input value={lowStock} onChange={e => setLowStock(e.target.value)} type="number" min="0" className="w-full px-4 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red" placeholder="e.g. 10" />
              </div>
            </div>
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
