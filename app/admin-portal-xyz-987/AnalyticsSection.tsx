"use client";
import React, { useMemo, useState } from 'react';
import { Order, orderLabel } from '../lib/orderStore';
import { invoiceNumber } from '../lib/invoice';
import { formatKWD } from '../lib/currency';
import { Period, isInPeriod, groupOrdersIntoInvoices } from './analyticsHelpers';
import { Page, PageHead, Card, Kpi, Badge, Tabs, Pills, SearchBox, Empty, Icon, inputCls, cx, type IconName, type Tone } from './_ui/kit';

const fmt = (n: number) => formatKWD(n);

type AnalyticsTab = 'revenue' | 'today' | 'products' | 'coupons';

const PERIODS: { v: Period; t: string }[] = [
  { v: 'all', t: 'All Time' },
  { v: 'today', t: 'Today' },
  { v: 'week', t: 'Week' },
  { v: 'month', t: 'Month' },
  { v: 'year', t: 'Year' },
  { v: 'custom', t: 'Custom' },
];

const TABS: { v: AnalyticsTab; t: string }[] = [
  { v: 'revenue', t: 'Revenue' },
  { v: 'today', t: "Today's Sales" },
  { v: 'products', t: 'Products' },
  { v: 'coupons', t: 'Coupons' },
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

/** Renders the drill-down a Kpi shows in its modal. */
function Drill({ orders, topItems }: { orders?: Order[]; topItems?: { name: string; qty: number; revenue: number }[] }) {
  if ((!orders || orders.length === 0) && (!topItems || topItems.length === 0)) {
    return <p className="py-6 text-center text-sm text-slate-400">No records in this slice yet.</p>;
  }
  return (
    <div className="space-y-5">
      {topItems && topItems.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-black text-slate-800">Top items</p>
          <div className="flex flex-col gap-2">
            {topItems.map((it, i) => (
              <div key={it.name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-800">
                  <span className="w-5 shrink-0 text-amber-600">{i + 1}</span>
                  <span className="truncate">{it.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-sm">
                  <span className="text-slate-500">{it.qty} pcs</span>
                  <span className="adm-num font-black text-red-600">{fmt(it.revenue)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {orders && orders.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-black text-slate-800">Orders ({orders.length})</p>
          <div className="flex flex-col gap-2">
            {orders.slice(0, 25).map(o => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-bold text-red-600">{invoiceNumber(o.sessionId ?? o.id, o.createdAt)}</p>
                  <p className="text-xs text-slate-500">{orderLabel(o)} · {new Date(o.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="adm-num shrink-0 font-black text-slate-800">{fmt(o.total)}</span>
              </div>
            ))}
            {orders.length > 25 && <p className="pt-2 text-center text-xs text-slate-400">Showing first 25 of {orders.length}</p>}
          </div>
        </div>
      )}
    </div>
  );
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
    <Page>
      <PageHead
        title="Analytics"
        sub="Real-time revenue & order channel insights."
        bar
        right={<Pills label="Period" value={period} onChange={setPeriod} options={PERIODS} />}
      />

      {period === 'custom' && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={cx(inputCls, 'h-9 w-auto')} />
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">To</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={cx(inputCls, 'h-9 w-auto')} />
          </div>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} options={TABS} />

      {tab === 'revenue' && <RevenueTab completed={completed} />}
      {tab === 'today' && <TodaySalesTab orders={todayOrders} completed={todayCompleted} />}
      {tab === 'products' && <ProductsTab completed={completed} />}
      {tab === 'coupons' && <CouponsTab completed={completed} />}
    </Page>
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
  const topItemsAll = useMemo(() => aggregateItems(completed).slice(0, 10), [completed]);

  const year = new Date().getFullYear();
  const monthLabels = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const monthly = useMemo(
    () => Array.from({ length: 12 }, (_, m) =>
      completed.filter(o => { const d = new Date(o.createdAt); return d.getFullYear() === year && d.getMonth() === m; }).reduce((s, o) => s + o.total, 0)),
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
    () => Array.from({ length: 7 }, (_, i) => {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      return completed.filter(o => new Date(o.createdAt).toDateString() === day.toDateString()).reduce((s, o) => s + o.total, 0);
    }),
    [completed, startOfWeek]
  );
  const maxWeekly = Math.max(1, ...weekly);
  const weekTotal = weekly.reduce((a, b) => a + b, 0);
  const weekNumber = Math.ceil(((startOfWeek.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7);

  type Stat = { label: string; value: string; icon: IconName; tone: Tone; hint: string; details: React.ReactNode };
  const stats: Stat[] = [
    { label: 'Total Revenue', value: fmt(totalRevenue), icon: 'billing', tone: 'emerald', hint: 'From served orders', details: <Drill orders={completed} topItems={topItemsAll} /> },
    { label: 'Completed Orders', value: String(completed.length), icon: 'check', tone: 'slate', hint: 'Fully served bills', details: <Drill orders={completed} /> },
    { label: 'Staff-Taken Revenue', value: fmt(staffRevenue), icon: 'users', tone: 'red', hint: 'Waiter-placed orders', details: <Drill orders={staffOrders} topItems={aggregateItems(staffOrders).slice(0, 10)} /> },
    { label: 'Self-Ordered Revenue', value: fmt(selfRevenue), icon: 'zap', tone: 'violet', hint: 'Customer QR orders', details: <Drill orders={selfOrders} topItems={aggregateItems(selfOrders).slice(0, 10)} /> },
  ];
  const stats2: Stat[] = [
    { label: 'Total Staff Orders', value: String(staffOrders.length), icon: 'users', tone: 'red', hint: 'Waiter-taken bills', details: <Drill orders={staffOrders} /> },
    { label: 'Total Self-Orders', value: String(selfOrders.length), icon: 'zap', tone: 'violet', hint: 'Customer self-ordered', details: <Drill orders={selfOrders} /> },
    { label: 'Total Items Sold', value: String(totalItemsSold), icon: 'box', tone: 'slate', hint: 'From completed bills', details: <Drill topItems={topItemsAll} /> },
    { label: 'Avg Order Value', value: fmt(avgOrderValue), icon: 'chart', tone: 'amber', hint: 'Per completed order', details: <Drill orders={completed} /> },
    { label: 'Top Item', value: topItem ? topItem.name : '—', icon: 'star', tone: 'amber', hint: 'Most sold item', details: <Drill topItems={topItemsAll} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s, i) => <Kpi key={i} label={s.label} value={s.value} hint={s.hint} icon={s.icon} tone={s.tone} details={s.details} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {stats2.map((s, i) => <Kpi key={i} label={s.label} value={s.value} hint={s.hint} icon={s.icon} tone={s.tone} small details={s.details} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          <Card>
            <p className="text-sm font-bold text-slate-500">Revenue trend this year <span className="text-red-600">{year}</span></p>
            <p className="adm-num mt-1 text-2xl font-black text-slate-900 sm:text-3xl">{fmt(monthly.reduce((a, b) => a + b, 0))}</p>
            <div className="mt-8 flex h-56 items-stretch justify-between gap-0.5 sm:gap-2">
              {monthly.map((v, i) => (
                <div key={i} className="group relative flex min-w-0 flex-1 flex-col items-center">
                  {hoveredMonth === i && (
                    <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-amber-100 shadow-lg">{fmt(v)}</div>
                  )}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      onMouseEnter={() => setHoveredMonth(i)}
                      onMouseLeave={() => setHoveredMonth(null)}
                      className={cx('adm-bar w-full cursor-pointer rounded-md transition-all hover:brightness-110', v > 0 ? 'bg-red-600' : 'bg-slate-100')}
                      style={{ height: v > 0 ? `${Math.max(6, (v / maxMonthly) * 100)}%` : '6%' }}
                    />
                  </div>
                  <span className="mt-2 w-full truncate text-center text-[7px] font-bold text-slate-400 sm:text-[10px]">{monthLabels[i]}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-bold text-slate-500">Revenue this week <span className="text-red-600">(Week {weekNumber} of {year})</span></p>
            <p className="adm-num mt-1 text-xs text-slate-400">{fmt(weekTotal)} total</p>
            <div className="mt-8 flex h-48 items-stretch justify-between gap-1 sm:gap-2">
              {weekly.map((v, i) => (
                <div key={i} className="group relative flex min-w-0 flex-1 flex-col items-center">
                  {hoveredDay === i && (
                    <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-amber-100 shadow-lg">{fmt(v)}</div>
                  )}
                  <div className="flex w-full flex-1 items-end">
                    <div
                      onMouseEnter={() => setHoveredDay(i)}
                      onMouseLeave={() => setHoveredDay(null)}
                      className={cx('adm-bar w-full cursor-pointer rounded-md transition-all hover:brightness-110', v > 0 ? 'bg-amber-400' : 'bg-slate-100')}
                      style={{ height: v > 0 ? `${Math.max(6, (v / maxWeekly) * 100)}%` : '6%' }}
                    />
                  </div>
                  <span className="mt-2 w-full truncate text-center text-[8px] font-bold text-slate-400 sm:text-[10px]">{weekDayLabels[i]}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="h-fit" title="Order source">
          <SourceSplit staff={staffOrders.length} self={selfOrders.length} total={completed.length} />
        </Card>
      </div>
    </div>
  );
}

function SourceSplit({ staff, self, total }: { staff: number; self: number; total: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Bar label="Staff-Taken" color="bg-red-600" labelColor="text-red-600" count={staff} total={total} />
      <Bar label="Self-Ordered" color="bg-violet-500" labelColor="text-violet-600" count={self} total={total} />
    </div>
  );
}

function Bar({ label, color, labelColor, count, total }: { label: string; color: string; labelColor: string; count: number; total: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-xs font-bold">
        <span className={cx('uppercase tracking-wide', labelColor)}>{label}</span>
        <span className="text-slate-700">{count}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cx('adm-fill h-full rounded-full', color)} style={{ width: `${total ? (count / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today's Sales tab
// ---------------------------------------------------------------------------

function TodaySalesTab({ orders, completed }: { orders: Order[]; completed: Order[] }) {
  const [search, setSearch] = useState('');

  const staffOrders = useMemo(() => completed.filter(o => o.source === 'waiter'), [completed]);
  const selfOrders = useMemo(() => completed.filter(o => o.source === 'customer'), [completed]);
  // Group completed orders into bills: a dine-in tab with several orders is ONE
  // invoice, not one per order.
  const completedInvoices = useMemo(() => groupOrdersIntoInvoices(completed), [completed]);
  const staffInvoices = useMemo(() => groupOrdersIntoInvoices(staffOrders), [staffOrders]);
  const selfInvoices = useMemo(() => groupOrdersIntoInvoices(selfOrders), [selfOrders]);
  const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
  const totalItems = completed.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const avgOrderValue = completedInvoices.length ? totalRevenue / completedInvoices.length : 0;
  const topItems = useMemo(() => aggregateItems(completed).slice(0, 5), [completed]);

  // The transactions list shows every bill today (one row per table tab).
  const transactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groupOrdersIntoInvoices(orders).filter(inv =>
      !q || orderLabel(inv).toLowerCase().includes(q) || inv.orders.some(o => o.id.toLowerCase().includes(q))
    );
  }, [orders, search]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Today's Revenue" value={fmt(totalRevenue)} hint="Completed today" icon="billing" tone="emerald" />
        <Kpi label="Today's Bills" value={completedInvoices.length} hint="One per table tab" icon="billing" tone="slate" small />
        <Kpi label="Items Sold" value={`${totalItems} pcs`} hint="Quantity sold today" icon="box" tone="violet" small />
        <Kpi label="Avg Bill Value" value={fmt(avgOrderValue)} hint="Per invoice today" icon="chart" tone="amber" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Today's bills" right={<SearchBox value={search} onChange={setSearch} placeholder="Search table or ticket…" className="w-full sm:w-64" />}>
          <div className="adm-scroll overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pr-4 font-bold">Invoice</th>
                  <th className="py-2.5 pr-4 font-bold">Table / Mode</th>
                  <th className="py-2.5 pr-4 font-bold">Source</th>
                  <th className="py-2.5 pr-4 font-bold">Items</th>
                  <th className="py-2.5 pr-4 text-right font-bold">Total</th>
                  <th className="py-2.5 pr-4 text-right font-bold">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(inv => (
                  <tr key={inv.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 text-sm font-bold text-red-600">
                      {invoiceNumber(inv.sessionId ?? inv.key, inv.createdAt)}
                      {inv.orders.length > 1 && <span className="ml-1 text-[11px] font-semibold text-slate-400">+{inv.orders.length - 1}</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-sm text-slate-700">{orderLabel(inv)}</td>
                    <td className="py-2.5 pr-4"><Badge tone={inv.source === 'customer' ? 'violet' : 'red'}>{inv.source === 'customer' ? 'Self' : 'Staff'}</Badge></td>
                    <td className="py-2.5 pr-4 text-sm text-slate-500">{inv.itemCount}</td>
                    <td className="adm-num py-2.5 pr-4 text-right text-sm font-bold text-slate-800">{fmt(inv.total)}</td>
                    <td className="py-2.5 pr-4 text-right">
                      {inv.sessionId ? (
                        <a href={`/receipt/${inv.sessionId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700">
                          <Icon name="billing" size={12} /> View
                        </a>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {transactions.length === 0 && <Empty icon="billing" title="No transactions today." />}
          </div>
        </Card>

        <div className="flex flex-col gap-5">
          <Card title="Channel split">
            {completedInvoices.length === 0 ? (
              <p className="text-sm text-slate-400">No sales today.</p>
            ) : (
              <SourceSplit staff={staffInvoices.length} self={selfInvoices.length} total={completedInvoices.length} />
            )}
          </Card>
          <Card title="Top items today">
            {topItems.length === 0 ? (
              <p className="text-sm text-slate-400">No items sold today.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {topItems.map((item, i) => (
                  <div key={item.name} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2 font-bold text-slate-800">
                      <span className="shrink-0 text-amber-600">{i + 1}</span>
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="adm-num shrink-0 font-black text-red-600">{fmt(item.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
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
    <Card title="Product sales leaderboard" right={<SearchBox value={search} onChange={setSearch} placeholder="Search product…" className="w-full sm:w-72" />}>
      <div className="adm-scroll overflow-x-auto">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-3 pr-4 font-bold">Rank</th>
              <th className="py-3 pr-4 font-bold">Product</th>
              <th className="py-3 pr-4 text-right font-bold">Qty</th>
              <th className="py-3 pr-4 text-right font-bold">Revenue</th>
              <th className="py-3 pr-4 font-bold">Market share</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => (
              <tr key={item.name} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4 font-bold text-amber-600">{i + 1}</td>
                <td className="py-3 pr-4 font-bold text-slate-800">{item.name}</td>
                <td className="py-3 pr-4 text-right text-slate-500">{item.qty} pcs</td>
                <td className="adm-num py-3 pr-4 text-right font-bold text-red-600">{fmt(item.revenue)}</td>
                <td className="py-3 pr-4">
                  <div className="flex min-w-[140px] items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-red-600" style={{ width: `${(item.revenue / totalRevenue) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right text-xs font-bold text-slate-500">{((item.revenue / totalRevenue) * 100).toFixed(1)}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <Empty icon="box" title="No products sold in this period yet." />}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Coupons tab
// ---------------------------------------------------------------------------

function CouponsTab({ completed }: { completed: Order[] }) {
  const [search, setSearch] = useState('');
  const discounted = useMemo(() => completed.filter(o => (o.discount || 0) > 0), [completed]);
  const totalDiscount = discounted.reduce((s, o) => s + (o.discount || 0), 0);
  const avgDiscount = discounted.length ? totalDiscount / discounted.length : 0;

  const q = search.trim().toLowerCase();
  const filtered = [...discounted]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter(o => !q || o.id.toLowerCase().includes(q) || (o.couponCode || '').toLowerCase().includes(q) || String(o.total).includes(q));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Total Discounts Given" value={fmt(totalDiscount)} hint="From completed orders" icon="percent" tone="red" />
        <Kpi label="Discounted Orders" value={discounted.length} hint="Used a coupon code" icon="calendar" tone="slate" small />
        <Kpi label="Avg Discount / Order" value={fmt(avgDiscount)} hint="Per discounted order" icon="chart" tone="amber" />
      </div>

      <Card title="Promo campaign performance" right={<SearchBox value={search} onChange={setSearch} placeholder="Search code / amount…" className="w-full sm:w-72" />}>
        <div className="adm-scroll overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="py-3 pr-4 font-bold">Transaction</th>
                <th className="py-3 pr-4 font-bold">Table / Mode</th>
                <th className="py-3 pr-4 font-bold">Coupon</th>
                <th className="py-3 pr-4 text-right font-bold">Total</th>
                <th className="py-3 pr-4 text-right font-bold">Discount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 text-sm font-bold text-red-600">{invoiceNumber(o.sessionId ?? o.id, o.createdAt)}</td>
                  <td className="py-3 pr-4 text-sm text-slate-700">{orderLabel(o)}</td>
                  <td className="py-3 pr-4"><Badge tone="amber">{o.couponCode || '—'}</Badge></td>
                  <td className="adm-num py-3 pr-4 text-right text-sm text-slate-700">{fmt(o.total)}</td>
                  <td className="adm-num py-3 pr-4 text-right text-sm font-bold text-red-600">−{fmt(o.discount || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <Empty icon="percent" title="No discounted orders in this period yet." />}
        </div>
      </Card>
    </div>
  );
}
