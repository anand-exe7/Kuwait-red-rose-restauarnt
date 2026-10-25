"use client";
import React, { useMemo, useState } from 'react';
import { DollarSign, Activity, Users, TrendingUp, Star, CheckCircle2, Package, Search, Percent, Receipt, CalendarClock, X } from 'lucide-react';
import { Order, orderLabel } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { Period, isInPeriod } from './analyticsHelpers';

/** Describes which slice of orders a stat tile stands for, so a click
 *  can show that slice in a modal. */
interface StatDetails {
  title: string;
  value: string;
  hint: string;
  orders?: Order[];
  topItems?: { name: string; qty: number; revenue: number }[];
}

function StatDetailsModal({ details, onClose }: { details: StatDetails; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2a0a0a]/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-brand-cream rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-brand-gold/30 shadow-[0_30px_60px_-20px_rgba(30,0,4,0.55)]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-brand-gold/25 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-brand-wine">{details.title}</h3>
            <p className="text-xs text-brand-wine/55 mt-0.5">{details.hint}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-brand-sand text-brand-wine"><X size={18} /></button>
        </div>
        <div className="p-5 bg-gradient-to-br from-brand-red/5 to-transparent border-b border-brand-gold/15">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-wine/50">Value</p>
          <p className="text-3xl font-black text-brand-red mt-1">{details.value}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {details.topItems && details.topItems.length > 0 && (
            <div>
              <p className="text-sm font-black text-brand-wine mb-3">Top items</p>
              <div className="flex flex-col gap-2">
                {details.topItems.map((it, i) => (
                  <div key={it.name} className="flex items-center justify-between p-3 rounded-xl bg-white border border-brand-gold/25">
                    <span className="flex items-center gap-2 min-w-0 text-sm font-bold text-brand-wine">
                      <span className="text-brand-gold-dark w-5 shrink-0">{i + 1}</span>
                      <span className="truncate">{it.name}</span>
                    </span>
                    <span className="flex items-center gap-3 text-sm shrink-0">
                      <span className="text-brand-wine/60">{it.qty} pcs</span>
                      <span className="font-black text-brand-red">{formatKWD(it.revenue)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {details.orders && details.orders.length > 0 && (
            <div className={details.topItems && details.topItems.length > 0 ? 'mt-5' : ''}>
              <p className="text-sm font-black text-brand-wine mb-3">Orders ({details.orders.length})</p>
              <div className="flex flex-col gap-2">
                {details.orders.slice(0, 25).map(o => (
                  <div key={o.id} className="flex items-center justify-between p-3 rounded-xl bg-white border border-brand-gold/25 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-brand-red truncate">{o.id}</p>
                      <p className="text-xs text-brand-wine/60">{orderLabel(o)} · {new Date(o.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className="font-black text-brand-wine shrink-0">{formatKWD(o.total)}</span>
                  </div>
                ))}
                {details.orders.length > 25 && (
                  <p className="text-xs text-brand-wine/50 text-center pt-2">Showing first 25 of {details.orders.length}</p>
                )}
              </div>
            </div>
          )}
          {(!details.orders || details.orders.length === 0) && (!details.topItems || details.topItems.length === 0) && (
            <p className="text-sm text-brand-wine/50 text-center py-10">No records in this slice yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const fmt = (n: number) => formatKWD(n);

type AnalyticsTab = 'revenue' | 'today' | 'products' | 'coupons';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const TABS: { key: AnalyticsTab; label: string }[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'today', label: "Today's Sales" },
  { key: 'products', label: 'Products' },
  { key: 'coupons', label: 'Coupons' },
];

/** Aggregate order items into a per-product leaderboard, sorted by revenue. */
function aggregateItems(orders: Order[]) {
  const map = new Map<string, { name: string; revenue: number; qty: number }>();
  orders.forEach(o =>
    o.items.forEach(i => {
      const cur = map.get(i.name) || { name: i.name, revenue: 0, qty: 0 };
      cur.revenue += i.price * i.qty;
      cur.qty += i.qty;
      map.set(i.name, cur);
    })
  );
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}

export default function AnalyticsSection({ orders }: { orders: Order[] }) {
  const [tab, setTab] = useState<AnalyticsTab>('revenue');
  const [period, setPeriod] = useState<Period>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const periodOrders = useMemo(
    () => orders.filter(o => isInPeriod(o.createdAt, period, customFrom, customTo)),
    [orders, period, customFrom, customTo]
  );
  const completed = useMemo(() => periodOrders.filter(o => o.status === 'served'), [periodOrders]);

  const todayOrders = useMemo(() => orders.filter(o => isInPeriod(o.createdAt, 'today')), [orders]);
  const todayCompleted = useMemo(() => todayOrders.filter(o => o.status === 'served'), [todayOrders]);

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-black text-brand-wine">Restaurant Analytics</h2>
            <p className="text-sm text-brand-wine/60">Real-time revenue & order channel insights</p>
          </div>
          <div className="flex flex-wrap gap-2 bg-brand-sand/60 p-1 rounded-full border border-brand-gold/25">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-all ${period === p.key ? 'bg-brand-red text-white shadow-sm' : 'text-brand-wine/60 hover:text-brand-wine'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 mb-6 bg-brand-sand/50 rounded-xl p-3 border border-brand-gold/25">
            <label className="text-xs font-bold text-brand-wine/60 uppercase tracking-wide">From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="px-3 py-1.5 rounded-lg border border-brand-gold/40 bg-white text-sm text-brand-ink" />
            <label className="text-xs font-bold text-brand-wine/60 uppercase tracking-wide">To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="px-3 py-1.5 rounded-lg border border-brand-gold/40 bg-white text-sm text-brand-ink" />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 border-b border-brand-gold/25">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-black uppercase tracking-wide border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-brand-red text-brand-red' : 'border-transparent text-brand-wine/50 hover:text-brand-wine'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'revenue' && <RevenueTab completed={completed} />}
      {tab === 'today' && <TodaySalesTab orders={todayOrders} completed={todayCompleted} />}
      {tab === 'products' && <ProductsTab completed={completed} />}
      {tab === 'coupons' && <CouponsTab completed={completed} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revenue tab
// ---------------------------------------------------------------------------

function RevenueTab({ completed }: { completed: Order[] }) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [open, setOpen] = useState<StatDetails | null>(null);

  const staffOrders = useMemo(() => completed.filter(o => o.source === 'waiter'), [completed]);
  const selfOrders = useMemo(() => completed.filter(o => o.source === 'customer'), [completed]);

  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const staffRevenue = staffOrders.reduce((s, o) => s + o.total, 0);
  const selfRevenue = selfOrders.reduce((s, o) => s + o.total, 0);
  const totalItemsSold = completed.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgOrderValue = completed.length ? totalRevenue / completed.length : 0;
  const topItem = useMemo(() => aggregateItems(completed)[0], [completed]);

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

  const topItemsAll = useMemo(() => aggregateItems(completed).slice(0, 10), [completed]);

  const stats: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string; details: StatDetails }[] = [
    { label: 'Total Revenue', value: fmt(totalRevenue), icon: DollarSign, color: 'text-brand-green', bg: 'bg-brand-green/10', hint: 'From served orders', details: { title: 'Total Revenue', value: fmt(totalRevenue), hint: 'Every served order in this period.', orders: completed, topItems: topItemsAll } },
    { label: 'Completed Orders', value: String(completed.length), icon: CheckCircle2, color: 'text-brand-wine', bg: 'bg-brand-wine/10', hint: 'Fully served bills', details: { title: 'Completed Orders', value: String(completed.length), hint: 'Served bills in this period.', orders: completed } },
    { label: 'Staff-Taken Revenue', value: fmt(staffRevenue), icon: Users, color: 'text-brand-red', bg: 'bg-brand-red/10', hint: 'Waiter-placed orders', details: { title: 'Staff-Taken Revenue', value: fmt(staffRevenue), hint: 'Orders placed by a waiter.', orders: staffOrders, topItems: aggregateItems(staffOrders).slice(0, 10) } },
    { label: 'Self-Ordered Revenue', value: fmt(selfRevenue), icon: Activity, color: 'text-brand-plum', bg: 'bg-brand-plum/10', hint: 'Customer QR orders', details: { title: 'Self-Ordered Revenue', value: fmt(selfRevenue), hint: 'Orders placed by customers themselves.', orders: selfOrders, topItems: aggregateItems(selfOrders).slice(0, 10) } },
  ];

  const stats2: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string; details: StatDetails }[] = [
    { label: 'Total Staff Orders', value: String(staffOrders.length), icon: Users, color: 'text-brand-red', bg: 'bg-brand-red/10', hint: 'Waiter-taken bills', details: { title: 'Staff Orders', value: String(staffOrders.length), hint: 'Each bill a waiter rang up.', orders: staffOrders } },
    { label: 'Total Self-Orders', value: String(selfOrders.length), icon: Activity, color: 'text-brand-plum', bg: 'bg-brand-plum/10', hint: 'Customer self-ordered', details: { title: 'Self-Orders', value: String(selfOrders.length), hint: 'Each self-placed customer order.', orders: selfOrders } },
    { label: 'Total Items Sold', value: String(totalItemsSold), icon: Package, color: 'text-brand-wine', bg: 'bg-brand-wine/10', hint: 'From completed bills', details: { title: 'Items Sold', value: String(totalItemsSold), hint: 'Every unit sold in this period.', topItems: topItemsAll } },
    { label: 'Avg Order Value', value: fmt(avgOrderValue), icon: TrendingUp, color: 'text-brand-gold-dark', bg: 'bg-brand-gold/15', hint: 'Per completed order', details: { title: 'Avg Order Value', value: fmt(avgOrderValue), hint: 'Mean total across the orders below.', orders: completed } },
    { label: 'Top Item', value: topItem ? topItem.name : '—', icon: Star, color: 'text-brand-gold-dark', bg: 'bg-brand-gold/15', hint: 'Most sold item', details: { title: 'Top Items', value: topItem ? topItem.name : '—', hint: 'Leaderboard by revenue.', topItems: topItemsAll } },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6 md:p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
          {stats.map((s, i) => (
            <StatCard key={i} {...s} onOpen={() => setOpen(s.details)} />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {stats2.map((s, i) => (
            <StatCard key={i} {...s} onOpen={() => setOpen(s.details)} />
          ))}
        </div>
      </div>
      {open && <StatDetailsModal details={open} onClose={() => setOpen(null)} />}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
            <p className="text-sm font-bold text-brand-wine/60">Revenue Trend This Year <span className="text-brand-red">{year}</span></p>
            <p className="text-2xl sm:text-3xl font-black mt-1 text-brand-wine">{fmt(monthly.reduce((a, b) => a + b, 0))}</p>
            <div className="mt-8 flex items-stretch justify-between gap-0.5 sm:gap-2 h-56">
              {monthly.map((v, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center relative group">
                  {hoveredMonth === i && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-brand-wine text-brand-gold-light text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-10 border border-brand-gold/40">
                      {fmt(v)}
                    </div>
                  )}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      onMouseEnter={() => setHoveredMonth(i)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className={`w-full rounded-md transition-all cursor-pointer ${v > 0 ? 'hover:brightness-110' : 'bg-brand-sand/70'}`}
                      style={v > 0
                        ? { height: `${Math.max(6, (v / maxMonthly) * 100)}%`, backgroundImage: 'linear-gradient(180deg, #d8313d 0%, #b01e28 60%, #8f1720 100%)' }
                        : { height: '6%' }}
                    />
                  </div>
                  <span className="mt-2 text-[7px] sm:text-[10px] font-bold text-brand-wine/50 truncate w-full text-center">{monthLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
            <p className="text-sm font-bold text-brand-wine/60">
              Revenue This Week <span className="text-brand-red">(Week {weekNumber} of {year})</span>
            </p>
            <p className="text-xs text-brand-wine/50 mt-1">{fmt(weekTotal)} total</p>
            <div className="mt-8 flex items-stretch justify-between gap-1 sm:gap-2 h-48">
              {weekly.map((v, i) => (
                <div key={i} className="flex-1 min-w-0 flex flex-col items-center relative group">
                  {hoveredDay === i && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-brand-wine text-brand-gold-light text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg z-10 border border-brand-gold/40">
                      {fmt(v)}
                    </div>
                  )}
                  <div className="flex-1 w-full flex items-end">
                    <div
                      onMouseEnter={() => setHoveredDay(i)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={`w-full rounded-md transition-all cursor-pointer ${v > 0 ? 'hover:brightness-110' : 'bg-brand-sand/70'}`}
                      style={v > 0
                        ? { height: `${Math.max(6, (v / maxWeekly) * 100)}%`, backgroundImage: 'linear-gradient(180deg, #ecd8a6 0%, #c9a961 60%, #a5843f 100%)' }
                        : { height: '6%' }}
                    />
                  </div>
                  <span className="mt-2 text-[8px] sm:text-[10px] font-bold text-brand-wine/50 truncate w-full text-center">{weekDayLabels[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6 h-fit">
          <p className="font-black mb-5 text-brand-wine">Order Source</p>
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-brand-red uppercase tracking-wide">Staff-Taken</span>
                <span className="text-brand-wine">{staffOrders.length}</span>
              </div>
              <div className="h-2 rounded-full bg-brand-sand/70 overflow-hidden">
                <div className="h-full bg-brand-red rounded-full" style={{ width: `${completed.length ? (staffOrders.length / completed.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-brand-plum uppercase tracking-wide">Self-Ordered</span>
                <span className="text-brand-wine">{selfOrders.length}</span>
              </div>
              <div className="h-2 rounded-full bg-brand-sand/70 overflow-hidden">
                <div className="h-full bg-brand-plum rounded-full" style={{ width: `${completed.length ? (selfOrders.length / completed.length) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's Sales tab — always "today", ignores the period selector above
// ---------------------------------------------------------------------------

function TodaySalesTab({ orders, completed }: { orders: Order[]; completed: Order[] }) {
  const [search, setSearch] = useState('');

  const staffOrders = useMemo(() => completed.filter(o => o.source === 'waiter'), [completed]);
  const selfOrders = useMemo(() => completed.filter(o => o.source === 'customer'), [completed]);
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalItems = completed.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgOrderValue = completed.length ? totalRevenue / completed.length : 0;
  const topItems = useMemo(() => aggregateItems(completed).slice(0, 5), [completed]);

  const transactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...orders]
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter(o => !q || o.id.toLowerCase().includes(q) || orderLabel(o).toLowerCase().includes(q));
  }, [orders, search]);

  const stats: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string }[] = [
    { label: "Today's Revenue", value: fmt(totalRevenue), icon: DollarSign, color: 'text-brand-green', bg: 'bg-brand-green/10', hint: 'Completed today' },
    { label: "Today's Bills", value: String(completed.length), icon: Receipt, color: 'text-brand-wine', bg: 'bg-brand-wine/10', hint: 'Completed today' },
    { label: "Today's Items Sold", value: `${totalItems} pcs`, icon: Package, color: 'text-brand-plum', bg: 'bg-brand-plum/10', hint: 'Quantity sold today' },
    { label: "Today's Avg Order Value", value: fmt(avgOrderValue), icon: TrendingUp, color: 'text-brand-gold-dark', bg: 'bg-brand-gold/15', hint: 'Per invoice today' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <p className="font-black text-brand-wine">Today&apos;s Transactions</p>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search invoice or table..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-brand-gold/40 bg-white text-xs text-brand-ink placeholder:text-brand-wine/35 focus:outline-none focus:border-brand-red"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[560px]">
              <thead>
                <tr className="text-brand-wine/50 text-xs uppercase tracking-wide border-b border-brand-gold/25">
                  <th className="py-2.5 pr-4 font-bold">Invoice ID</th>
                  <th className="py-2.5 pr-4 font-bold">Table / Mode</th>
                  <th className="py-2.5 pr-4 font-bold">Source</th>
                  <th className="py-2.5 pr-4 font-bold">Items</th>
                  <th className="py-2.5 pr-4 font-bold text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(o => (
                  <tr key={o.id} className="border-b border-brand-gold/15 last:border-0">
                    <td className="py-2.5 pr-4 font-bold text-brand-red text-sm">{o.id}</td>
                    <td className="py-2.5 pr-4 text-sm text-brand-wine">{orderLabel(o)}</td>
                    <td className="py-2.5 pr-4 text-xs">
                      <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full font-bold ${o.source === 'customer' ? 'bg-brand-plum/10 text-brand-plum border border-brand-plum/25' : 'bg-brand-red/10 text-brand-red-dark border border-brand-red/25'}`}>
                        {o.source === 'customer' ? 'Self-Order' : 'Staff-Taken'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-brand-wine/60">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                    <td className="py-2.5 pr-4 text-sm font-bold text-right text-brand-wine">{fmt(o.total)}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-brand-wine/40 font-bold text-sm">No transactions found for today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
            <p className="font-black mb-5 text-brand-wine">Today&apos;s Channel Split</p>
            {completed.length === 0 ? (
              <p className="text-sm text-brand-wine/50">No sales today.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-brand-red uppercase tracking-wide">Staff-Taken</span>
                    <span className="text-brand-wine">{staffOrders.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-brand-sand/70 overflow-hidden">
                    <div className="h-full bg-brand-red rounded-full" style={{ width: `${(staffOrders.length / completed.length) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-brand-plum uppercase tracking-wide">Self-Ordered</span>
                    <span className="text-brand-wine">{selfOrders.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-brand-sand/70 overflow-hidden">
                    <div className="h-full bg-brand-plum rounded-full" style={{ width: `${(selfOrders.length / completed.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
            <p className="font-black mb-5 text-brand-wine">Today&apos;s Top Items</p>
            {topItems.length === 0 ? (
              <p className="text-sm text-brand-wine/50">No items sold today.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topItems.map((item, i) => (
                  <div key={item.name} className="flex justify-between items-baseline gap-2 text-sm">
                    <span className="font-bold flex items-center gap-2 min-w-0 text-brand-wine">
                      <span className="text-brand-gold-dark shrink-0">{i + 1}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="text-brand-red font-black shrink-0">{fmt(item.revenue)}</span>
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

// ---------------------------------------------------------------------------
// Products tab
// ---------------------------------------------------------------------------

function ProductsTab({ completed }: { completed: Order[] }) {
  const [search, setSearch] = useState('');
  const leaderboard = useMemo(() => aggregateItems(completed), [completed]);
  const totalRevenue = leaderboard.reduce((s, i) => s + i.revenue, 0) || 1;
  const filtered = leaderboard.filter(i => i.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <p className="text-lg font-black text-brand-wine">Product Sales Leaderboard</p>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink placeholder:text-brand-wine/35 focus:outline-none focus:border-brand-red"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="text-brand-wine/50 text-xs uppercase tracking-wide border-b border-brand-gold/25">
              <th className="py-3 pr-4 font-bold">Rank</th>
              <th className="py-3 pr-4 font-bold">Product Name</th>
              <th className="py-3 pr-4 font-bold text-right">Qty Sold</th>
              <th className="py-3 pr-4 font-bold text-right">Revenue</th>
              <th className="py-3 pr-4 font-bold">Market Share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.name} className="border-b border-brand-gold/15 last:border-0">
                <td className="py-3 pr-4 font-bold text-brand-gold-dark">{i + 1}</td>
                <td className="py-3 pr-4 font-bold text-brand-wine">{item.name}</td>
                <td className="py-3 pr-4 text-right text-brand-wine/70">{item.qty} pcs</td>
                <td className="py-3 pr-4 text-right font-bold text-brand-red">{fmt(item.revenue)}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <div className="flex-1 h-1.5 rounded-full bg-brand-sand/70 overflow-hidden">
                      <div className="h-full bg-brand-red rounded-full" style={{ width: `${(item.revenue / totalRevenue) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-brand-wine/60 w-10 text-right">{((item.revenue / totalRevenue) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-brand-wine/40 font-bold text-sm">No products sold in this period yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coupons tab — usage analytics; coupon *definitions* live in the top-level
// admin Coupons section (CouponsSection.tsx), not here.
// ---------------------------------------------------------------------------

function CouponsTab({ completed }: { completed: Order[] }) {
  const [search, setSearch] = useState('');
  const discounted = useMemo(() => completed.filter(o => (o.discount || 0) > 0), [completed]);
  const totalDiscount = discounted.reduce((s, o) => s + (o.discount || 0), 0);
  const avgDiscount = discounted.length ? totalDiscount / discounted.length : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discounted
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter(o => !q || o.id.toLowerCase().includes(q) || (o.couponCode || '').toLowerCase().includes(q) || String(o.total).includes(q));
  }, [discounted, search]);

  const stats: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string }[] = [
    { label: 'Total Discounts Given', value: fmt(totalDiscount), icon: Percent, color: 'text-brand-red', bg: 'bg-brand-red/10', hint: 'From completed orders' },
    { label: 'Discounted Orders', value: String(discounted.length), icon: CalendarClock, color: 'text-brand-wine', bg: 'bg-brand-wine/10', hint: 'Used a coupon code' },
    { label: 'Avg Discount per Order', value: fmt(avgDiscount), icon: TrendingUp, color: 'text-brand-gold-dark', bg: 'bg-brand-gold/15', hint: 'Per discounted order' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <p className="text-lg font-black text-brand-wine">Promo Campaign Performance</p>
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search code/table/amount..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink placeholder:text-brand-wine/35 focus:outline-none focus:border-brand-red"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="text-brand-wine/50 text-xs uppercase tracking-wide border-b border-brand-gold/25">
                <th className="py-3 pr-4 font-bold">Transaction ID</th>
                <th className="py-3 pr-4 font-bold">Table / Mode</th>
                <th className="py-3 pr-4 font-bold">Coupon</th>
                <th className="py-3 pr-4 font-bold text-right">Order Total</th>
                <th className="py-3 pr-4 font-bold text-right">Discount Applied</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-brand-gold/15 last:border-0">
                  <td className="py-3 pr-4 font-bold text-brand-red text-sm">{o.id}</td>
                  <td className="py-3 pr-4 text-sm text-brand-wine">{orderLabel(o)}</td>
                  <td className="py-3 pr-4 text-sm">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-gold/15 text-brand-gold-dark border border-brand-gold/40">{o.couponCode || '—'}</span>
                  </td>
                  <td className="py-3 pr-4 text-right text-sm text-brand-wine">{fmt(o.total)}</td>
                  <td className="py-3 pr-4 text-right text-sm font-bold text-brand-red">−{fmt(o.discount || 0)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-brand-wine/40 font-bold text-sm">No discounted orders in this period yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Each accent tells us which brand color the card leans on, so cards look
// distinct instead of the whole dashboard being one flat tone.
const CARD_ACCENTS: Record<string, { panel: string; iconBg: string; iconColor: string; ring: string; valueColor: string }> = {
  'text-brand-green':     { panel: 'linear-gradient(140deg, #e6f1dd 0%, #ffffff 70%)', iconBg: 'bg-brand-green/15', iconColor: 'text-brand-green',     ring: 'border-brand-green/30',    valueColor: 'text-brand-green' },
  'text-brand-wine':      { panel: 'linear-gradient(140deg, #efe6c9 0%, #fbf8ee 70%)', iconBg: 'bg-brand-wine/15',  iconColor: 'text-brand-wine',      ring: 'border-brand-gold/35',     valueColor: 'text-brand-wine' },
  'text-brand-red':       { panel: 'linear-gradient(140deg, #fce1e3 0%, #fff6f6 70%)', iconBg: 'bg-brand-red/15',   iconColor: 'text-brand-red',       ring: 'border-brand-red/30',      valueColor: 'text-brand-red' },
  'text-brand-plum':      { panel: 'linear-gradient(140deg, #f0d9e8 0%, #fff6fb 70%)', iconBg: 'bg-brand-plum/15',  iconColor: 'text-brand-plum',      ring: 'border-brand-plum/30',     valueColor: 'text-brand-plum' },
  'text-brand-gold-dark': { panel: 'linear-gradient(140deg, #f3e2b1 0%, #fdf6df 70%)', iconBg: 'bg-brand-gold/25',  iconColor: 'text-brand-gold-dark', ring: 'border-brand-gold/40',     valueColor: 'text-brand-gold-dark' },
};

function StatCard({ label, value, icon: Icon, color, hint, onOpen }: { label: string; value: string; icon: typeof DollarSign; color: string; bg: string; hint: string; onOpen?: () => void }) {
  const accent = CARD_ACCENTS[color] ?? CARD_ACCENTS['text-brand-wine'];
  const clickable = typeof onOpen === 'function';
  const Tag = clickable ? 'button' : 'div';
  return (
    <Tag
      {...(clickable ? { type: 'button' as const, onClick: onOpen } : {})}
      className={`text-left p-4 sm:p-5 rounded-2xl border ${accent.ring} shadow-[0_12px_30px_-24px_rgba(74,21,21,0.4)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_38px_-20px_rgba(74,21,21,0.55)] ${clickable ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-red/40' : ''}`}
      style={{ backgroundImage: accent.panel }}
    >
      <div className={`w-9 h-9 rounded-xl ${accent.iconBg} ${accent.iconColor} flex items-center justify-center mb-3 border border-current/20`}>
        <Icon size={18} />
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-wine/55">{label}</p>
      <p className={`text-lg sm:text-xl font-black mt-0.5 truncate ${accent.valueColor}`}>{value}</p>
      <p className="text-[11px] text-brand-wine/45 mt-0.5">{hint}</p>
    </Tag>
  );
}
