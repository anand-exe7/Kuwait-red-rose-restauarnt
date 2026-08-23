"use client";
import React, { useMemo, useState } from 'react';
import { DollarSign, Activity, Users, TrendingUp, Star, CheckCircle2, Package, Search, Percent, Receipt, CalendarClock } from 'lucide-react';
import { Order, orderLabel } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { Period, isInPeriod } from './analyticsHelpers';

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

        <div className="flex flex-wrap gap-1.5 border-b border-black/5">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-black uppercase tracking-wide border-b-2 -mb-px transition-colors ${
                tab === t.key ? 'border-brand-red text-brand-red' : 'border-transparent text-black/40 hover:text-black'
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

        <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6 h-fit">
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
    { label: "Today's Revenue", value: fmt(totalRevenue), icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10', hint: 'Completed today' },
    { label: "Today's Bills", value: String(completed.length), icon: Receipt, color: 'text-blue-500', bg: 'bg-blue-500/10', hint: 'Completed today' },
    { label: "Today's Items Sold", value: `${totalItems} pcs`, icon: Package, color: 'text-purple-500', bg: 'bg-purple-500/10', hint: 'Quantity sold today' },
    { label: "Today's Avg Order Value", value: fmt(avgOrderValue), icon: TrendingUp, color: 'text-brand-gold', bg: 'bg-brand-gold/10', hint: 'Per invoice today' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <p className="font-black">Today's Transactions</p>
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search invoice or table..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-black/10 text-xs focus:outline-none focus:border-brand-red"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[560px]">
              <thead>
                <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                  <th className="py-2.5 pr-4 font-bold">Invoice ID</th>
                  <th className="py-2.5 pr-4 font-bold">Table / Mode</th>
                  <th className="py-2.5 pr-4 font-bold">Source</th>
                  <th className="py-2.5 pr-4 font-bold">Items</th>
                  <th className="py-2.5 pr-4 font-bold text-right">Grand Total</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(o => (
                  <tr key={o.id} className="border-b border-black/5 last:border-0">
                    <td className="py-2.5 pr-4 font-bold text-brand-red text-sm">{o.id}</td>
                    <td className="py-2.5 pr-4 text-sm">{orderLabel(o)}</td>
                    <td className="py-2.5 pr-4 text-xs">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${o.source === 'customer' ? 'bg-purple-500/10 text-purple-600' : 'bg-brand-red/10 text-brand-red-dark'}`}>
                        {o.source === 'customer' ? 'Self-Order' : 'Staff-Taken'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-black/60">{o.items.reduce((s, i) => s + i.qty, 0)}</td>
                    <td className="py-2.5 pr-4 text-sm font-bold text-right">{fmt(o.total)}</td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-black/30 font-bold text-sm">No transactions found for today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="font-black mb-5">Today's Channel Split</p>
            {completed.length === 0 ? (
              <p className="text-sm text-black/40">No sales today.</p>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-brand-red uppercase tracking-wide">Staff-Taken</span>
                    <span>{staffOrders.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                    <div className="h-full bg-brand-red rounded-full" style={{ width: `${(staffOrders.length / completed.length) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs font-bold mb-1.5">
                    <span className="text-purple-500 uppercase tracking-wide">Self-Ordered</span>
                    <span>{selfOrders.length}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(selfOrders.length / completed.length) * 100}%` }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
            <p className="font-black mb-5">Today's Top Items</p>
            {topItems.length === 0 ? (
              <p className="text-sm text-black/40">No items sold today.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topItems.map((item, i) => (
                  <div key={item.name} className="flex justify-between items-baseline gap-2 text-sm">
                    <span className="font-bold flex items-center gap-2 min-w-0">
                      <span className="text-black/30 shrink-0">{i + 1}</span>
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
    <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <p className="text-lg font-black">Product Sales Leaderboard</p>
        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search product..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left min-w-[640px]">
          <thead>
            <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
              <th className="py-3 pr-4 font-bold">Rank</th>
              <th className="py-3 pr-4 font-bold">Product Name</th>
              <th className="py-3 pr-4 font-bold text-right">Qty Sold</th>
              <th className="py-3 pr-4 font-bold text-right">Revenue</th>
              <th className="py-3 pr-4 font-bold">Market Share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.name} className="border-b border-black/5 last:border-0">
                <td className="py-3 pr-4 font-bold text-black/40">{i + 1}</td>
                <td className="py-3 pr-4 font-bold">{item.name}</td>
                <td className="py-3 pr-4 text-right">{item.qty} pcs</td>
                <td className="py-3 pr-4 text-right font-bold text-brand-red">{fmt(item.revenue)}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2 min-w-[140px]">
                    <div className="flex-1 h-1.5 rounded-full bg-black/5 overflow-hidden">
                      <div className="h-full bg-brand-red rounded-full" style={{ width: `${(item.revenue / totalRevenue) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold text-black/50 w-10 text-right">{((item.revenue / totalRevenue) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-black/30 font-bold text-sm">No products sold in this period yet.</td>
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
    { label: 'Discounted Orders', value: String(discounted.length), icon: CalendarClock, color: 'text-blue-500', bg: 'bg-blue-500/10', hint: 'Used a coupon code' },
    { label: 'Avg Discount per Order', value: fmt(avgDiscount), icon: TrendingUp, color: 'text-brand-gold', bg: 'bg-brand-gold/10', hint: 'Per discounted order' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <StatCard key={i} {...s} />
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <p className="text-lg font-black">Promo Campaign Performance</p>
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search code/table/amount..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr className="text-black/40 text-xs uppercase tracking-wide border-b border-black/5">
                <th className="py-3 pr-4 font-bold">Transaction ID</th>
                <th className="py-3 pr-4 font-bold">Table / Mode</th>
                <th className="py-3 pr-4 font-bold">Coupon</th>
                <th className="py-3 pr-4 font-bold text-right">Order Total</th>
                <th className="py-3 pr-4 font-bold text-right">Discount Applied</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-black/5 last:border-0">
                  <td className="py-3 pr-4 font-bold text-brand-red text-sm">{o.id}</td>
                  <td className="py-3 pr-4 text-sm">{orderLabel(o)}</td>
                  <td className="py-3 pr-4 text-sm">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-gold/10 text-brand-gold-dark border border-brand-gold/20">{o.couponCode || '—'}</span>
                  </td>
                  <td className="py-3 pr-4 text-right text-sm">{fmt(o.total)}</td>
                  <td className="py-3 pr-4 text-right text-sm font-bold text-brand-red">−{fmt(o.discount || 0)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-black/30 font-bold text-sm">No discounted orders in this period yet.</td>
                </tr>
              )}
            </tbody>
          </table>
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
