"use client";

// Waiter station.
//
// The whole screen is built around one idea: a waiter taps the thing in front
// of them (a table, a walk-in, a takeaway bag) and sees exactly what that guest
// ordered, with two buttons — add more, or close the bill. Everything else is
// out of the way.
//
// Three tabs, and no more — one per kind of guest:
//   Tables   — the floor plan, plus walk-ins. Tap a table, see what they
//              ordered, add more, close the bill.
//   Takeaway — bags the admin has accepted, waiting to be handed over.
//   Delivery — orders the admin has accepted, waiting to go out.
//
// Alerts and the kitchen feed are NOT tabs. They are one drawer behind the
// bell in the header, reachable from any tab, because a waiter needs them
// while they are looking at something else — not instead of it.
//
// A takeaway or delivery order only appears here once the ADMIN has accepted
// it (Admin → Online orders). Before that it is not the shop's problem yet.
// Items CAN be added to one — the customer rings back, or asks for one more
// while they wait — and the extra goes to the kitchen as another ticket on the
// SAME session, so it lands on the same bill and the same invoice number. What
// the waiter still cannot do is close it: the admin settles every home order.
//
// Tables, open tabs and their items all come from the same Supabase-backed
// stores the admin portal reads (tableStore / sessionStore / orderStore), so
// what a waiter sees here and what the admin sees under Open Tabs cannot drift
// apart.

import React, { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import {
  Plus, Minus, Send, Clock, Hash, Coffee, Bell, BellRing, Search, X, Flame, Check,
  Trash2, Receipt, Volume2, VolumeX, PackageCheck, PersonStanding, Banknote, ShoppingBag,
  Truck, ChevronLeft, ChevronDown, Utensils, CircleAlert, Info, UserRound,
} from 'lucide-react';
import type { Order, OrderMode, OrderItem } from '../lib/orderStore';
import { variantLabel, variantName } from '../lib/menuStore';
import {
  addOrder, updateOrderStatus, orderLabel, markHandedOver, isHomeMode,
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders,
} from '../lib/orderStore';
import type { MenuItem } from '../lib/menuStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../lib/menuStore';
import {
  WaiterCall, resolveWaiterCall,
  getWaiterCallsSnapshot, getWaiterCallsServerSnapshot, subscribeToWaiterCalls,
} from '../lib/waiterCallStore';
import { getTablesSnapshot, getTablesServerSnapshot, subscribeToTables } from '../lib/tableStore';
import {
  getSessionsSnapshot, getSessionsServerSnapshot, subscribeToSessions, requestBill, type Session,
} from '../lib/sessionStore';
import { formatKWD, round3 } from '../lib/currency';
import { resolveOrderNo } from '../lib/invoice';
import { landingFonts } from '../fonts';
import BrandMark from '../components/BrandMark';
import { playChime, primeAudioOnFirstInteraction } from '../lib/sound';

type Lane = 'tables' | 'takeaway' | 'delivery';

/** What the detail panel / item picker is currently pointed at. */
interface Target {
  /** Open session, when the guest already has one. */
  sessionId?: string;
  /** Dine-in table number; null for standing / takeaway. */
  table: number | null;
  mode: OrderMode;
  standingLabel?: string;
  title: string;
  subtitle?: string;
  /** Takeaway and delivery are settled by the admin, never by the waiter —
   *  but the waiter CAN still put more items on them (the customer rings back,
   *  or asks for one more at the counter). So the panel hides "Close bill"
   *  without hiding "Add items". */
  billedByAdmin?: boolean;
}

/** One open tab: a session plus the orders sitting on it. */
interface Tab {
  sessionId: string;
  session?: Session;
  mode: OrderMode;
  table: number | null;
  standingLabel?: string;
  title: string;
  guest?: string;
  guestPhone?: string;
  orders: Order[];
  itemCount: number;
  total: number;
  openedAt: number;
  billRequested: boolean;
  hasReady: boolean;
  hasCooking: boolean;
  waitingApproval: boolean;
  /** The 5 digits the customer quotes — and the tail of their invoice. */
  orderNo: string;
  /** Every ticket is cooked. */
  allReady: boolean;
  /** Takeaway or delivery — the customer never sat down. */
  home: boolean;
  /** The admin has closed the bill and the invoice has gone out. */
  billed: boolean;
  /** Cooked AND billed: this is the moment it leaves the shop. */
  readyToHandOver: boolean;
  /** The remark the customer typed at checkout. */
  note?: string;
  /** Discount the guest already has (a coupon they used), and the coupon code.
   *  The waiter is the one standing at the table being asked "do I get my
   *  discount?", so they can see it. */
  discount: number;
  couponCode?: string;
  /** Delivery charge on this order. */
  deliveryFee: number;
}

const card = 'rounded-3xl border border-brand-gold/25 bg-white shadow-[0_22px_48px_-34px_rgba(74,21,21,0.45)]';
const sectionTitle = 'flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-brand-gold-dark';

/** Merge the items of several orders into one list, keeping notes apart. */
function mergeItems(orders: Order[]): (OrderItem & { lineTotal: number; byStaff: boolean; addedBy: Order['source'] })[] {
  const map = new Map<string, OrderItem & { lineTotal: number; byStaff: boolean; addedBy: Order['source'] }>();
  for (const o of orders) {
    const addedBy = o.source;
    const byStaff = addedBy === 'waiter' || addedBy === 'admin';
    // Keyed by who put it on, so "added by admin" can't be absorbed into a
    // line the customer ordered themselves.
    for (const it of o.items) {
      const key = `${it.name}@@${it.price}@@${it.notes ?? ''}@@${addedBy}`;
      const cur = map.get(key);
      if (cur) { cur.qty += it.qty; cur.lineTotal += it.price * it.qty; }
      else map.set(key, { ...it, lineTotal: it.price * it.qty, byStaff, addedBy });
    }
  }
  return [...map.values()];
}

const timeOf = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function sinceLabel(from: number, now: number): string {
  const mins = Math.max(0, Math.round((now - from) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export default function WaiterDashboard() {
  const [lane, setLane] = useState<Lane>('tables');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [billingFor, setBillingFor] = useState<Tab | null>(null);
  const [muted, setMuted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ── Live data — the same stores the admin portal reads ────────────────────
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const sessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const allTables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const allMenu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const waiterCalls = useSyncExternalStore(subscribeToWaiterCalls, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot);

  const menu = useMemo(() => allMenu.filter(m => m.status === 'active'), [allMenu]);
  const tables = useMemo(
    () => allTables.filter(t => t.active).sort((a, b) => a.number - b.number),
    [allTables]
  );
  const openCalls = useMemo(() => waiterCalls.filter((c: WaiterCall) => !c.resolved), [waiterCalls]);
  const callingTables = useMemo(() => new Set(openCalls.map(c => c.table)), [openCalls]);

  // Ticks the "open for 12 min" labels without re-rendering on every state change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(cur => (cur === msg ? null : cur)), 2600);
  }, []);

  // ── Open tabs, grouped the way the admin's Open Tabs page groups them ─────
  const tabs = useMemo<Tab[]>(() => {
    const byId = new Map<string, Tab>();

    const blank = (sessionId: string, session?: Session): Tab => ({
      sessionId,
      session,
      mode: session?.mode ?? 'table',
      table: session?.tableNumber ?? null,
      standingLabel: session?.standingLabel ?? undefined,
      title: '',
      guest: session?.customerName || undefined,
      guestPhone: session?.customerPhone || undefined,
      orders: [],
      itemCount: 0,
      total: 0,
      openedAt: session?.openedAt ?? 0,
      billRequested: !!session?.billRequestedAt,
      hasReady: false,
      hasCooking: false,
      waitingApproval: false,
      orderNo: '',
      allReady: false,
      home: false,
      billed: false,
      readyToHandOver: false,
      discount: 0,
      deliveryFee: 0,
    });

    // Start from the open sessions the admin sees…
    const allSessions = new Map(sessions.map(x => [x.id, x]));
    for (const s of sessions) {
      if (s.status !== 'open') continue;
      byId.set(s.id, blank(s.id, s));
    }

    // …then hang the un-billed orders off them. An order whose session row
    // hasn't arrived yet still gets a card, so nothing goes invisible while
    // Realtime catches up.
    for (const o of orders) {
      if (!o.sessionId) continue;
      // A billed takeaway/delivery is NOT finished for the waiter: it still has
      // to be handed over. It stays on the board until
      // somebody marks that, and only then disappears.
      if (o.status === 'cancelled') continue;
      const isHome = isHomeMode(o.mode);
      // 'served' on a home order means it was handed over, so it is finished
      // either way — which also keeps hand-over working before the
      // handed_over_at migration is applied.
      const awaitingHandover = isHome && o.billed && !o.handedOverAt && o.status !== 'served';
      if (o.billed && !awaitingHandover) continue;
      if (o.status === 'served' && !awaitingHandover && !byId.has(o.sessionId)) continue;
      // A tab the admin has closed is finished, whatever state its tickets were
      // left in. Showing it here is how the waiter ended up with three tabs
      // while the admin had one. (A session we simply haven't received yet is
      // different — that one still gets a card, so nothing goes invisible while
      // Realtime catches up.)
      const sess = allSessions.get(o.sessionId);
      if (sess && sess.status !== 'open' && !awaitingHandover) continue;
      let tab = byId.get(o.sessionId);
      if (!tab) {
        tab = blank(o.sessionId);
        tab.mode = o.mode ?? 'table';
        tab.table = (o.mode ?? 'table') === 'table' ? o.table : null;
        tab.standingLabel = o.standingLabel;
        tab.openedAt = o.createdAt;
        byId.set(o.sessionId, tab);
      }
      tab.orders.push(o);
      tab.itemCount += o.items.reduce((a, i) => a + i.qty, 0);
      tab.total += o.total;
      tab.openedAt = tab.openedAt ? Math.min(tab.openedAt, o.createdAt) : o.createdAt;
      if (o.status === 'ready') tab.hasReady = true;
      if (o.status === 'cooking' || o.status === 'pending') tab.hasCooking = true;
      if (o.status === 'awaiting_admin') tab.waitingApproval = true;
      // The ORDER's mode is the truth. Sessions opened before delivery got its
      // own mode were all filed as 'takeaway', so trusting the session row
      // would list a delivery under Takeaway here while the admin shows it
      // under Delivery.
      if (o.mode) {
        tab.mode = o.mode;
        if (o.mode === 'table' && tab.table == null) tab.table = o.table;
      }
      if (o.billed) tab.billed = true;
      tab.discount += o.discount ?? 0;
      tab.deliveryFee += o.deliveryFee ?? 0;
      if (!tab.couponCode && o.couponCode) tab.couponCode = o.couponCode;
      if (!tab.note && o.note) tab.note = o.note;
      if (!tab.guest) tab.guest = o.customer?.name || undefined;
      if (!tab.guestPhone) tab.guestPhone = o.customer?.phone || undefined;
      if (!tab.standingLabel) tab.standingLabel = o.standingLabel;
      if (tab.mode === 'table' && tab.table == null) tab.table = o.table;
    }

    const out: Tab[] = [];
    for (const tab of byId.values()) {
      // An open session with nothing on it is noise on the floor plan — the
      // table button already shows it as free.
      if (tab.orders.length === 0) continue;
      // A home order the admin has not accepted yet belongs to the admin's
      // Online orders queue, not to the floor. It appears here the moment it
      // is accepted and becomes a kitchen ticket.
      const home = tab.mode === 'takeaway' || tab.mode === 'delivery';
      if (home && tab.waitingApproval) continue;
      tab.home = home;
      tab.orders.sort((a, b) => a.createdAt - b.createdAt);
      tab.total = round3(tab.total);
      tab.discount = round3(tab.discount);
      tab.deliveryFee = round3(tab.deliveryFee);
      tab.allReady = tab.orders.every(o => o.status === 'ready' || o.status === 'served');
      // Cooked is not the hand-over moment: the admin has to close the bill and
      // send the invoice first. Only then does this one leave the shop.
      tab.readyToHandOver = home && tab.billed;
      // Home orders are known by the number the customer was given, so a
      // waiter calling "order 48213" is saying the same thing the guest is.
      tab.orderNo = resolveOrderNo({ sessionId: tab.sessionId, id: tab.orders[0].id, createdAt: tab.orders[0].createdAt });
      tab.title =
        tab.mode === 'standing' ? (tab.standingLabel ? `Walk-in · ${tab.standingLabel}` : 'Walk-in')
        : tab.mode === 'takeaway' ? `Takeaway #${tab.orderNo}`
        : tab.mode === 'delivery' ? `Delivery #${tab.orderNo}`
        : `Table ${tab.table ?? '—'}`;
      out.push(tab);
    }
    return out.sort((a, b) => a.openedAt - b.openedAt);
  }, [orders, sessions]);

  const tabsBySession = useMemo(() => new Map(tabs.map(t => [t.sessionId, t])), [tabs]);
  const dineInTabs = useMemo(() => tabs.filter(t => t.mode === 'table'), [tabs]);
  const standingTabs = useMemo(() => tabs.filter(t => t.mode === 'standing'), [tabs]);
  const takeawayTabs = useMemo(() => tabs.filter(t => t.mode === 'takeaway'), [tabs]);
  const deliveryTabs = useMemo(() => tabs.filter(t => t.mode === 'delivery'), [tabs]);

  /** sessionId of the open tab sitting on each table number. */
  const tabByTable = useMemo(() => {
    const m = new Map<number, Tab>();
    for (const t of dineInTabs) if (t.table != null) m.set(t.table, t);
    return m;
  }, [dineInTabs]);

  // ── Alerts: only the two things that need a waiter on their feet ──────────
  // Dine-in and walk-ins: cooked food waiting to be carried out.
  const readyOrders = useMemo(
    () => orders
      .filter(o => o.status === 'ready' && !o.billed && o.mode !== 'takeaway' && o.mode !== 'delivery')
      .sort((a, b) => a.createdAt - b.createdAt),
    [orders]
  );
  // Takeaway and delivery: billed and paid for, so it can go out of the door.
  // Before the admin bills it there is nothing for the waiter to do but wait.
  const handoverOrders = useMemo(
    () => orders
      // 'served' on a home order IS the hand-over. Without this the card stayed
      // on the board after the waiter tapped it whenever the handed_over_at
      // column is missing — the write falls back to status only.
      .filter(o => (o.mode === 'takeaway' || o.mode === 'delivery') && o.billed && !o.handedOverAt && o.status !== 'served')
      .sort((a, b) => a.createdAt - b.createdAt),
    [orders]
  );
  /* Guests who have asked to pay. The waiter can't take the money, but they
     are the one at the table — they should know before the guest has to ask
     twice. */
  const billRequests = useMemo(
    () => tabs.filter(t => t.billRequested && !t.billed).sort((a, b) => (a.session?.billRequestedAt ?? 0) - (b.session?.billRequestedAt ?? 0)),
    [tabs]
  );
  const alertCount = openCalls.length + readyOrders.length + handoverOrders.length + billRequests.length;

  // Standing sessions are keyed by their label, so two unnamed walk-ins would
  // merge onto one tab. Number them instead.
  const standingEverCount = useMemo(
    () => new Set(orders.filter(o => o.mode === 'standing').map(o => o.sessionId ?? o.id)).size,
    [orders]
  );

  const kitchenTickets = useMemo(
    () => orders.filter(o => !o.billed && (o.status === 'pending' || o.status === 'cooking' || o.status === 'ready'))
      .sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0) || a.createdAt - b.createdAt),
    [orders]
  );

  // ── Chimes ────────────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chime = useCallback(() => playChime(audioCtxRef, muted), [muted]);
  useEffect(() => primeAudioOnFirstInteraction(audioCtxRef), []);
  useChimeOnNew(readyOrders.map(o => o.id), chime);
  useChimeOnNew(handoverOrders.map(o => o.id), chime);
  useChimeOnNew(openCalls.map(c => c.id), chime);
  useChimeOnNew(billRequests.map(t => t.sessionId), chime);

  // ── The live tab for whatever the panel is pointed at ─────────────────────
  const activeTab = target?.sessionId ? tabsBySession.get(target.sessionId) ?? null : null;

  // Once a tab is billed its session disappears from the store, so the panel
  // has nothing left to show. Derived rather than closed from an effect, so
  // there's no extra render pass and no stale frame.
  const panel = target && (!target.sessionId || tabsBySession.has(target.sessionId)) ? target : null;

  const openTable = (tableNumber: number) => {
    const tab = tabByTable.get(tableNumber);
    setTarget({
      sessionId: tab?.sessionId,
      table: tableNumber,
      mode: 'table',
      title: `Table ${tableNumber}`,
      subtitle: tab ? `Open ${sinceLabel(tab.openedAt, now)}` : 'Free — no orders yet',
    });
  };

  const openTab = (tab: Tab) => {
    setTarget({
      sessionId: tab.sessionId,
      table: tab.table,
      mode: tab.mode,
      standingLabel: tab.standingLabel,
      title: tab.title,
      subtitle: `Open ${sinceLabel(tab.openedAt, now)}`,
      // Takeaway and delivery are settled by the admin — the waiter adds to
      // them and hands them over, but never closes the bill.
      billedByAdmin: tab.mode === 'delivery' || tab.mode === 'takeaway',
    });
  };

  const startWalkIn = () => {
    setTarget({ table: null, mode: 'standing', title: 'New walk-in', subtitle: 'No table — eats standing' });
    setPickerOpen(true);
  };

  const fireOrder = (items: OrderItem[], rush: boolean, standingLabel?: string) => {
    if (!target || items.length === 0) return;
    const subtotal = round3(items.reduce((a, i) => a + i.price * i.qty, 0));
    // Adding to a takeaway or a delivery writes another ticket on the SAME
    // session, which is what keeps it on one bill and one invoice number. It
    // has to carry the customer and the address of the original, or the chef
    // prints a delivery with nowhere to send it. The delivery charge is NOT
    // repeated — that was paid on the first ticket.
    const origin = activeTab?.orders[0];
    const placed = addOrder({
      table: target.table ?? 0,
      mode: target.mode,
      items,
      priority: rush ? 'high' : 'normal',
      subtotal,
      tax: 0, // the shop prices tax-inclusive
      total: subtotal,
      source: 'waiter',
      standingLabel: target.mode === 'standing'
        ? (standingLabel?.trim() || target.standingLabel || `Walk-in #${standingEverCount + 1}`)
        : undefined,
      sessionId: target.sessionId,
      customer: isHomeMode(target.mode) ? origin?.customer : undefined,
      deliveryAddress: target.mode === 'delivery' ? origin?.deliveryAddress : undefined,
    });
    setPickerOpen(false);
    // Stay on the tab we just added to, so the waiter sees the new lines land.
    setTarget(t => (t ? {
      ...t,
      sessionId: t.sessionId ?? placed.sessionId,
      standingLabel: placed.standingLabel ?? t.standingLabel,
      title: t.mode === 'standing' && placed.standingLabel ? `Walk-in · ${placed.standingLabel}` : t.title,
    } : t));
    showToast(`Sent to kitchen · ${target.title}`);
  };

  const serve = (id: string) => {
    updateOrderStatus(id, 'served');
    showToast('Marked as served');
  };

  /** Takeaway or delivery handed over at the counter. It leaves
   *  the board for good, on every device. */
  const handOver = (tab: Tab) => {
    markHandedOver(tab.sessionId);
    setTarget(null);
    showToast(`#${tab.orderNo} — handed over`);
  };

  const handOverOrder = (o: Order) => {
    if (!o.sessionId) return;
    markHandedOver(o.sessionId);
    showToast('Handed over');
  };

  /* The waiter never takes the money. They tell the admin the table is ready
     to pay; the admin raises the bill, takes payment and sends the invoice. */
  const askAdminToBill = (tab: Tab) => {
    requestBill(tab.sessionId);
    setBillingFor(null);
    setTarget(null);
    showToast(`${tab.title} — admin asked to bill`);
  };

  return (
    <div className={`landing ${landingFonts} flex min-h-[100dvh] flex-col bg-brand-cream pb-[88px] font-body text-brand-ink`}>
      {toast && (
        <div className="fixed left-1/2 top-3 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-wine px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-white shadow-xl">
          <Check size={15} className="text-brand-gold-light" /> {toast}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-brand-gold/20 bg-[#4f070c] px-3 py-2.5 sm:px-5">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <BrandMark sub="Waiter" compact />
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-brand-gold/30 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-green-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" /> Live
            </span>
            <button
              onClick={() => setAlertsOpen(true)}
              aria-label={`Alerts and kitchen feed${alertCount ? ` — ${alertCount} need you` : ''}`}
              className={`relative grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                alertCount ? 'border-brand-red bg-brand-red text-white' : 'border-brand-gold/50 text-brand-gold-light'
              }`}
            >
              {alertCount ? <BellRing size={16} /> : <Bell size={16} />}
              {alertCount > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#4f070c] bg-white px-1 text-[10px] font-bold leading-none text-brand-red">
                  {alertCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setMuted(m => !m)}
              aria-label={muted ? 'Turn sound alerts on' : 'Turn sound alerts off'}
              className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
                muted ? 'border-white/20 text-white/50' : 'border-brand-gold/50 text-brand-gold-light'
              }`}
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 py-4 sm:px-5">
        {lane === 'tables' && (
          <TablesLane
            tables={tables}
            tabByTable={tabByTable}
            callingTables={callingTables}
            standingTabs={standingTabs}
            now={now}
            onOpenTable={openTable}
            onOpenTab={openTab}
            onStartWalkIn={startWalkIn}
          />
        )}

        {lane === 'takeaway' && (
          <HomeLane mode="takeaway" tabs={takeawayTabs} now={now} onOpen={openTab} onHandOver={handOver} />
        )}

        {lane === 'delivery' && (
          <HomeLane mode="delivery" tabs={deliveryTabs} now={now} onOpen={openTab} onHandOver={handOver} />
        )}
      </main>

      {/* ── Detail panel ───────────────────────────────────────────────────── */}
      {panel && !pickerOpen && (
        <TabDetail
          target={panel}
          tab={activeTab}
          now={now}
          onClose={() => setTarget(null)}
          onAddItems={() => setPickerOpen(true)}
          onServe={serve}
          onHandOver={handOver}
          onBill={() => activeTab && setBillingFor(activeTab)}
        />
      )}

      {/* ── Item picker ────────────────────────────────────────────────────── */}
      {panel && pickerOpen && (
        <ItemPicker
          menu={menu}
          target={panel}
          onCancel={() => setPickerOpen(false)}
          onFire={fireOrder}
        />
      )}

      {billingFor && (
        <BillSheet tab={billingFor} onClose={() => setBillingFor(null)} onConfirm={() => askAdminToBill(billingFor)} />
      )}

      {/* ── Alerts + kitchen feed, one drawer, reachable from every tab ───── */}
      {alertsOpen && (
        <AlertsSheet
          calls={openCalls}
          ready={readyOrders}
          handover={handoverOrders}
          billRequests={billRequests}
          tickets={kitchenTickets}
          onClose={() => setAlertsOpen(false)}
          onResolve={(id) => { resolveWaiterCall(id); showToast('Call cleared'); }}
          onServe={serve}
          onHandOver={handOverOrder}
          onOpenTab={(t) => { setAlertsOpen(false); setLane(t.mode === 'delivery' ? 'delivery' : t.mode === 'takeaway' ? 'takeaway' : 'tables'); openTab(t); }}
        />
      )}

      {/* ── Bottom nav ─────────────────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-brand-gold/25 bg-[#4f070c]/97 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-stretch">
          {([
            { key: 'tables', icon: Hash, label: 'Tables', badge: dineInTabs.length + standingTabs.length, urgent: false },
            { key: 'takeaway', icon: ShoppingBag, label: 'Takeaway', badge: takeawayTabs.length, urgent: takeawayTabs.some(t => t.readyToHandOver) },
            { key: 'delivery', icon: Truck, label: 'Delivery', badge: deliveryTabs.length, urgent: deliveryTabs.some(t => t.readyToHandOver) },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => { setLane(t.key); setTarget(null); }}
              aria-current={lane === t.key}
              className={`relative flex flex-1 flex-col items-center gap-1 py-3 transition-colors ${
                lane === t.key ? 'text-brand-gold-light' : 'text-white/55'
              }`}
            >
              <t.icon size={20} />
              <span className="text-[9.5px] font-bold uppercase tracking-[0.18em]">{t.label}</span>
              {t.badge > 0 && (
                <span className={`absolute right-[22%] top-1.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold leading-[18px] ${
                  t.urgent ? 'bg-brand-green text-white' : 'bg-brand-gold text-brand-wine'
                }`}>
                  {t.badge}
                </span>
              )}
              {lane === t.key && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-brand-gold" />}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Tables lane — the floor plan and every open tab
   ════════════════════════════════════════════════════════════════════════ */

function TablesLane({
  tables, tabByTable, callingTables, standingTabs,
  now, onOpenTable, onOpenTab, onStartWalkIn,
}: {
  tables: { id: string; number: number; label: string; seats: number; zone: string }[];
  tabByTable: Map<number, Tab>;
  callingTables: Set<number>;
  standingTabs: Tab[];
  now: number;
  onOpenTable: (n: number) => void;
  onOpenTab: (t: Tab) => void;
  onStartWalkIn: () => void;
}) {
  const busy = tables.filter(t => tabByTable.has(t.number)).length;

  return (
    <div className="flex flex-col gap-5">
      <Hint>Tap a table to see what they ordered, add more items, or close their bill. Takeaway and delivery have their own tabs below.</Hint>

      <section className={`${card} p-4 sm:p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}><Hash size={14} className="text-brand-red" /> Floor plan</h2>
          <span className="rounded-full bg-brand-sand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-wine">
            {busy} of {tables.length} busy
          </span>
        </div>

        {tables.length === 0 ? (
          <Empty icon={Hash} text="No tables yet. The admin adds them under Table Management." />
        ) : (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {tables.map(t => {
              const tab = tabByTable.get(t.number);
              const calling = callingTables.has(t.number);
              const tone = calling
                ? 'border-brand-red bg-brand-red text-white'
                : tab?.hasReady
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                : tab?.billRequested
                ? 'border-brand-gold bg-brand-gold/20 text-brand-wine'
                : tab
                ? 'border-brand-wine/40 bg-brand-sand text-brand-wine'
                : 'border-brand-gold/25 bg-white text-brand-ink/55';
              return (
                <button
                  key={t.id}
                  onClick={() => onOpenTable(t.number)}
                  className={`relative flex min-h-[96px] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 p-2 transition-transform active:scale-[0.97] ${tone}`}
                >
                  <span className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-60">
                    {t.label?.trim() ? t.label : 'Table'}
                  </span>
                  <span className="font-wordmark text-[30px] leading-none">{t.number}</span>
                  <span className="text-[10px] font-bold">
                    {tab ? formatKWD(tab.total) : 'Free'}
                  </span>
                  {calling && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-brand-red text-white">
                      <Bell size={11} />
                    </span>
                  )}
                  {!calling && tab?.hasReady && (
                    <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-emerald-500 text-white">
                      <PackageCheck size={11} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Legend />
      </section>

      <TabGroup
        title="Walk-ins (standing)"
        icon={PersonStanding}
        tabs={standingTabs}
        now={now}
        onOpen={onOpenTab}
        empty="No walk-in guests right now."
        action={{ label: 'New walk-in', onClick: onStartWalkIn }}
      />

    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Takeaway / Delivery lane — orders the admin has accepted, nothing to edit
   ════════════════════════════════════════════════════════════════════════ */

function HomeLane({
  mode, tabs, now, onOpen, onHandOver,
}: {
  mode: 'takeaway' | 'delivery';
  tabs: Tab[];
  now: number;
  onOpen: (t: Tab) => void;
  onHandOver: (t: Tab) => void;
}) {
  const isDelivery = mode === 'delivery';
  const LaneIcon = isDelivery ? Truck : ShoppingBag;
  // Billed and ready to leave first, then cooked and waiting for the bill,
  // then the rest — oldest first inside each group.
  const sorted = useMemo(
    () =>
      [...tabs].sort(
        (a, b) =>
          Number(b.readyToHandOver) - Number(a.readyToHandOver) ||
          Number(b.allReady) - Number(a.allReady) ||
          a.openedAt - b.openedAt,
      ),
    [tabs]
  );
  const goingOut = sorted.filter(t => t.readyToHandOver);
  const waitingForBill = sorted.filter(t => !t.readyToHandOver && t.allReady);

  return (
    <div className="flex flex-col gap-4">
      <Hint>
        {isDelivery
          ? 'Deliveries the admin has accepted. Green means the admin has billed it and it can go out.'
          : 'Takeaway bags the admin has accepted. Green means the admin has billed it and the customer can take it.'}
        {' '}You can&rsquo;t add items to these, and the admin closes the bill.
      </Hint>

      {goingOut.length > 0 && (
        <section className="rounded-3xl border-2 border-emerald-400 bg-emerald-50 p-4 sm:p-5">
          <h2 className={`${sectionTitle} mb-3 !text-emerald-800`}>
            <BellRing size={14} /> {isDelivery ? 'Billed — ready to go out' : 'Billed — ready to hand over'} · {goingOut.length}
          </h2>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {goingOut.map(tab => (
              <div key={tab.sessionId} className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-white px-4 py-3.5">
                <button onClick={() => onOpen(tab)} className="min-w-0 flex-1 text-left">
                  {/* You call out a name at the counter, not a number. */}
                  <p className="truncate font-display text-[17px] font-semibold leading-tight text-brand-wine">
                    {tab.guest || 'Guest'}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[12px] font-bold text-brand-ink/60">
                    {tab.guestPhone || 'no number'}
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-brand-ink/50">
                    #{tab.orderNo} · {tab.itemCount} item{tab.itemCount === 1 ? '' : 's'} · {formatKWD(tab.total)}
                  </p>
                  {tab.note && (
                    <p className="mt-1 truncate text-[11.5px] font-semibold italic text-brand-gold-dark">“{tab.note}”</p>
                  )}
                </button>
                <button
                  onClick={() => onHandOver(tab)}
                  className="btn shrink-0 bg-brand-green px-4 py-3 text-[10px] text-white"
                >
                  <Check size={14} /> Handed over
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {waitingForBill.length > 0 && (
        <section className="rounded-3xl border-2 border-brand-gold bg-brand-gold/10 p-4 sm:p-5">
          <h2 className={`${sectionTitle} mb-1.5`}>
            <Receipt size={14} /> Cooked — waiting for the bill · {waitingForBill.length}
          </h2>
          <p className="mb-3 text-[11.5px] font-medium text-brand-ink/60">
            The kitchen is done. Nothing for you to do yet: the admin bills it and sends the invoice, then it turns green here.
          </p>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {waitingForBill.map(tab => (
              <button
                key={tab.sessionId}
                onClick={() => onOpen(tab)}
                className="flex items-center justify-between gap-3 rounded-2xl border border-brand-gold/50 bg-white px-4 py-3.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <p className="font-wordmark text-2xl uppercase leading-none text-brand-wine">#{tab.orderNo}</p>
                  <p className="mt-1 truncate text-[11.5px] text-brand-ink/55">
                    {tab.guest || 'Guest'} · {tab.itemCount} item{tab.itemCount === 1 ? '' : 's'}
                  </p>
                </span>
                <Pill tone="gold"><Clock size={10} /> Not billed</Pill>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={`${card} p-4 sm:p-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className={sectionTitle}><LaneIcon size={14} className="text-brand-red" /> {isDelivery ? 'All deliveries' : 'All takeaway orders'}</h2>
          <span className="rounded-full bg-brand-sand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-wine">{sorted.length}</span>
        </div>

        {sorted.length === 0 ? (
          <Empty
            icon={LaneIcon}
            text={isDelivery
              ? 'No deliveries right now. Accepted ones appear here the moment the admin lets them through.'
              : 'No takeaway orders right now. Accepted ones appear here the moment the admin lets them through.'}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map(tab => (
              <button
                key={tab.sessionId}
                onClick={() => onOpen(tab)}
                className={`flex items-start justify-between gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors active:scale-[0.99] ${
                  tab.readyToHandOver ? 'border-emerald-400 bg-emerald-50'
                  : tab.allReady ? 'border-brand-gold bg-brand-gold/10'
                  : tab.hasCooking ? 'border-brand-gold/50 bg-brand-gold/5'
                  : 'border-brand-gold/25 bg-white'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-[16px] font-semibold leading-tight text-brand-wine">{tab.guest || 'Guest'}</p>
                  <p className="mt-0.5 truncate font-mono text-[11.5px] font-bold text-brand-ink/55">
                    #{tab.orderNo}{tab.guestPhone ? ` · ${tab.guestPhone}` : ''}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-brand-ink/50">
                    {tab.itemCount} item{tab.itemCount === 1 ? '' : 's'} · {sinceLabel(tab.openedAt, now)} ago
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tab.readyToHandOver
                      ? <Pill tone="green"><PackageCheck size={10} /> Ready to hand over</Pill>
                      : tab.allReady
                        ? <Pill tone="gold"><Receipt size={10} /> Cooked · not billed</Pill>
                        : tab.hasCooking
                          ? <Pill tone="red"><Flame size={10} /> In the kitchen</Pill>
                          : <Pill tone="grey"><Clock size={10} /> Waiting</Pill>}
                  </div>
                </div>
                <span className="shrink-0 font-wordmark text-2xl text-brand-red">{formatKWD(tab.total)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Legend() {
  const dots: [string, string][] = [
    ['bg-white border-brand-gold/40', 'Free'],
    ['bg-brand-sand border-brand-wine/40', 'Has orders'],
    ['bg-emerald-50 border-emerald-400', 'Food ready'],
    ['bg-brand-gold/20 border-brand-gold', 'Asked for bill'],
    ['bg-brand-red border-brand-red', 'Ringing for you'],
  ];
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-brand-gold/20 pt-3">
      {dots.map(([cls, label]) => (
        <span key={label} className="flex items-center gap-1.5 text-[10.5px] font-semibold text-brand-ink/55">
          <span className={`h-3 w-3 rounded-[5px] border-2 ${cls}`} /> {label}
        </span>
      ))}
    </div>
  );
}

function TabGroup({
  title, icon: Icon, tabs, now, onOpen, empty, action,
}: {
  title: string;
  icon: typeof Bell;
  tabs: Tab[];
  now: number;
  onOpen: (t: Tab) => void;
  empty: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={sectionTitle}><Icon size={14} className="text-brand-red" /> {title}</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-brand-sand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-wine">{tabs.length}</span>
          {action && (
            <button onClick={action.onClick} className="btn btn-outline h-9 px-3.5 text-[10px]">
              <Plus size={14} /> {action.label}
            </button>
          )}
        </div>
      </div>
      {tabs.length === 0 ? (
        <Empty icon={Icon} text={empty} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {tabs.map(t => (
            <button
              key={t.sessionId}
              onClick={() => onOpen(t)}
              className="flex items-center justify-between gap-3 rounded-2xl border border-brand-gold/30 bg-brand-cream/60 p-3.5 text-left transition-colors hover:border-brand-red/40 active:scale-[0.99]"
            >
              <div className="min-w-0">
                <p className="truncate font-wordmark text-xl uppercase leading-none text-brand-wine">{t.title}</p>
                <p className="mt-1 text-[11.5px] font-medium text-brand-ink/55">
                  {t.itemCount} item{t.itemCount === 1 ? '' : 's'} · open {sinceLabel(t.openedAt, now)}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {t.hasReady && <Pill tone="green"><PackageCheck size={10} /> Ready</Pill>}
                  {t.billRequested && <Pill tone="gold"><Receipt size={10} /> Wants bill</Pill>}
                  {t.waitingApproval && <Pill tone="grey"><Clock size={10} /> Awaiting admin</Pill>}
                </div>
              </div>
              <span className="shrink-0 font-wordmark text-2xl text-brand-red">{formatKWD(t.total)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Detail panel — what this guest ordered, and the two things you can do
   ════════════════════════════════════════════════════════════════════════ */

function TabDetail({
  target, tab, now, onClose, onAddItems, onServe, onHandOver, onBill,
}: {
  target: Target;
  tab: Tab | null;
  now: number;
  onClose: () => void;
  onAddItems: () => void;
  onServe: (id: string) => void;
  onHandOver: (t: Tab) => void;
  onBill: () => void;
}) {
  const lines = useMemo(() => (tab ? mergeItems(tab.orders) : []), [tab]);
  const home = !!tab?.home;
  const ready = (home ? [] : tab?.orders.filter(o => o.status === 'ready')) ?? [];
  /* Takeaway and delivery take extra items right up until the admin closes
     the bill: the customer rings back for one more box, or asks at the
     counter while they wait. The new line is a fresh kitchen ticket on the
     SAME tab, so it is cooked straight away and settled on the same invoice.
     After the bill is closed the invoice has already gone to the customer —
     nothing more can go on it. A guest who has asked to pay is closed off for
     the same reason. */
  const canAdd = !tab?.billRequested && !(home && !!tab?.billed);

  return (
    <Sheet onClose={onClose} title={target.title} subtitle={tab ? `Open ${sinceLabel(tab.openedAt, now)}` : target.subtitle}>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-5">
        {(tab?.guest || tab?.guestPhone) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-sand px-3 py-1.5 text-[11px] font-bold text-brand-wine">
              <UserRound size={12} /> {tab.guest || 'Guest'}
            </span>
            {tab.guestPhone && (
              <a
                href={`tel:${tab.guestPhone}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/40 px-3 py-1.5 font-mono text-[11px] font-bold text-brand-wine"
              >
                {tab.guestPhone}
              </a>
            )}
          </div>
        )}

        {tab?.note && (
          <div className="mb-4 rounded-2xl border border-brand-gold/50 bg-brand-gold/10 px-3.5 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold-dark">Customer&rsquo;s remark</p>
            <p className="mt-1 text-[12.5px] font-medium text-brand-ink/80">{tab.note}</p>
          </div>
        )}

        {home && tab && tab.readyToHandOver && (
          <div className="mb-4 rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">
              <BellRing size={13} /> Billed — ready to hand over
            </p>
            <p className="mt-1 text-[11.5px] font-medium text-brand-ink/60">
              The invoice has gone to the customer. Give it out and tap below — it then leaves every screen.
            </p>
            <button onClick={() => onHandOver(tab)} className="btn mt-2.5 w-full bg-brand-green py-3.5 text-[11px] text-white">
              <Check size={15} /> Handed over
            </button>
          </div>
        )}

        {home && tab && !tab.readyToHandOver && tab.allReady && (
          <div className="mb-4 rounded-2xl border border-brand-gold bg-brand-gold/10 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold-dark">
              <Receipt size={13} /> Cooked — waiting for the bill
            </p>
            <p className="mt-1 text-[11.5px] font-medium text-brand-ink/65">
              The kitchen is done. The admin closes the bill and sends the invoice; this turns green the moment that happens.
            </p>
          </div>
        )}

        {ready.length > 0 && (
          <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800">
              <BellRing size={13} />
              {target.mode === 'table' ? 'Ready to take over' : 'Ready to hand over'}
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              {ready.map(o => (
                <div key={o.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                  <span className="min-w-0 truncate text-[12.5px] text-brand-ink/75">
                    {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                  </span>
                  <button onClick={() => onServe(o.id)} className="btn shrink-0 bg-brand-green px-4 py-2.5 text-[10px] text-white">
                    <Check size={13} /> {target.mode === 'table' ? 'Served' : 'Handed over'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 className={`${sectionTitle} mb-2.5`}><Utensils size={13} className="text-brand-red" /> What they ordered</h3>

        {lines.length === 0 ? (
          <Empty icon={Utensils} text="Nothing ordered yet. Tap “Add items” to start this tab." />
        ) : (
          <ul className="divide-y divide-brand-gold/20 overflow-hidden rounded-2xl border border-brand-gold/25 bg-white">
            {lines.map((l, i) => (
              <li key={`${l.name}-${i}`} className="flex items-start gap-3 px-3.5 py-3">
                <span className="mt-0.5 grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-brand-red/10 px-1.5 text-[12px] font-bold text-brand-red">
                  {l.qty}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-tight text-brand-wine">{l.name}</p>
                  {l.notes && <p className="mt-0.5 text-[11.5px] italic text-brand-ink/55">{l.notes}</p>}
                  {l.addedBy !== 'customer' && (
                    <span
                      className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${
                        l.addedBy === 'admin' ? 'bg-brand-red/10 text-brand-red' : 'bg-brand-gold/15 text-brand-gold-dark'
                      }`}
                    >
                      Added by {l.addedBy}
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-[13px] font-bold text-brand-ink/70">{formatKWD(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
        )}

        {tab && tab.orders.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-brand-sand/60 p-4">
            <div className="flex items-center justify-between text-[12px] font-semibold text-brand-ink/60">
              <span>{tab.itemCount} item{tab.itemCount === 1 ? '' : 's'} · {tab.orders.length} ticket{tab.orders.length === 1 ? '' : 's'}</span>
              <span>{timeOf(tab.openedAt)}</span>
            </div>
            {tab.discount > 0 && (
              <div className="flex items-center justify-between text-[12.5px] font-bold text-brand-green">
                <span>Discount{tab.couponCode ? ` · ${tab.couponCode}` : ''}</span>
                <span>−{formatKWD(tab.discount)}</span>
              </div>
            )}
            {tab.deliveryFee > 0 && (
              <div className="flex items-center justify-between text-[12.5px] font-bold text-brand-wine/70">
                <span>Delivery charge</span>
                <span>{formatKWD(tab.deliveryFee)}</span>
              </div>
            )}
            <div className="flex items-end justify-between border-t border-brand-wine/15 pt-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-wine">Total</span>
              <span className="font-wordmark text-[34px] leading-none text-brand-red">{formatKWD(tab.total)}</span>
            </div>
          </div>
        )}

        {target.billedByAdmin && (
          <p className="mt-3 flex items-start gap-2 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-3 text-[12px] font-medium text-brand-wine">
            <Info size={14} className="mt-0.5 shrink-0" />
            {canAdd
              ? `Anything you add is cooked on this same order and goes on the same invoice — no second bill. ${
                  target.mode === 'delivery' ? 'The admin closes the bill before it goes out.' : 'The admin closes the bill and sends the invoice.'
                }`
              : 'Billed and on its way out — nothing more can go on this one.'}
          </p>
        )}
      </div>

      {(canAdd || tab?.billRequested) && (
        <div className="shrink-0 border-t border-brand-gold/25 bg-white p-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:p-4">
          {/* Once the guest has asked for the bill, nothing else goes on the
              tab — not from their phone, not from here. */}
          {tab?.billRequested ? (
            <div className="flex items-center justify-center gap-2 rounded-full border-2 border-brand-gold bg-brand-gold/10 py-4 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-wine">
              <Receipt size={16} /> Bill requested — the admin is settling it
            </div>
          ) : (
            <div className="flex gap-2.5">
              <button onClick={onAddItems} className="btn btn-outline flex-1 py-4 text-[11px]">
                <Plus size={16} /> Add items
              </button>
              {/* The waiter never takes the money on a takeaway or a delivery
                  — the admin closes those and sends the invoice. */}
              {!target.billedByAdmin && (
                <button
                  onClick={onBill}
                  disabled={!tab}
                  className="btn btn-wine flex-1 py-4 text-[11px] disabled:opacity-40"
                >
                  <Banknote size={16} /> Close bill
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Item picker — pick from the inventory and fire to the kitchen
   ════════════════════════════════════════════════════════════════════════ */

function ItemPicker({
  menu, target, onCancel, onFire,
}: {
  menu: MenuItem[];
  target: Target;
  onCancel: () => void;
  onFire: (items: OrderItem[], rush: boolean, standingLabel?: string) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [rush, setRush] = useState(false);
  const [walkInName, setWalkInName] = useState(target.standingLabel ?? '');
  const [reviewing, setReviewing] = useState(false);
  /** Products whose sizes are open in the picker. */
  const [openSizes, setOpenSizes] = useState<Set<string>>(() => new Set());
  const toggleSizes = (id: string) =>
    setOpenSizes(cur => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(menu.map(m => m.category).filter(Boolean)))],
    [menu]
  );

  /* A product sold in sizes is several things the waiter can ring up, not
     one: the 500 g and the 1 kg have their own price and their own shelf. The
     list is built from sizes so the ticket always carries a weight. */
  const sellable = useMemo(() => {
    const out: { id: string; name: string; price: number; stock: number | null; lowStockThreshold: number | null; category: string; description: string; image: string }[] = [];
    for (const m of menu) {
      const variants = m.variants ?? [];
      if (variants.length === 0) {
        out.push({
          id: m.id, name: m.name, price: m.price,
          stock: m.stock ?? null, lowStockThreshold: m.lowStockThreshold ?? null,
          category: m.category, description: m.description ?? '', image: m.image ?? '',
        });
        continue;
      }
      for (const v of variants) {
        out.push({
          id: `${m.id}::${v.id}`, name: variantName(m.name, v), price: v.price,
          stock: v.stock ?? null, lowStockThreshold: m.lowStockThreshold ?? null,
          category: m.category, description: m.description ?? '', image: m.image ?? '',
        });
      }
    }
    return out;
  }, [menu]);

  /* The picker shows PRODUCTS, not every size as its own card: a shop with
     four products in three sizes each was showing twelve near-identical
     tiles. Tapping a product opens its sizes, and the quantity buttons live
     on the size — which is what actually gets rung up. */
  const groups = useMemo(
    () =>
      menu.map(m => {
        const variants = m.variants ?? [];
        return {
          id: m.id,
          name: m.name,
          category: m.category,
          description: m.description ?? '',
          image: m.image ?? '',
          lowStockThreshold: m.lowStockThreshold ?? null,
          /* No sizes → the product itself is the sellable line. */
          base: variants.length === 0
            ? { id: m.id, price: m.price, stock: m.stock ?? null }
            : null,
          sizes: variants.map(v => ({
            id: `${m.id}::${v.id}`,
            label: variantLabel(v),
            price: v.price,
            stock: v.stock ?? null,
          })),
        };
      }),
    [menu]
  );

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter(g => {
      if (cat !== 'All' && g.category !== cat) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q) ||
        g.sizes.some(v => v.label.toLowerCase().includes(q))
      );
    });
  }, [groups, cat, query]);


  const chosen = useMemo(
    () => Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => {
        const m = sellable.find(x => x.id === id);
        return m ? { id, name: m.name, price: m.price, qty: n, notes: notes[id]?.trim() || undefined } : null;
      })
      .filter(Boolean) as OrderItem[],
    [qty, notes, sellable]
  );

  const count = chosen.reduce((a, i) => a + i.qty, 0);
  const total = round3(chosen.reduce((a, i) => a + i.price * i.qty, 0));

  const bump = (id: string, by: number) =>
    setQty(cur => {
      const next = Math.max(0, (cur[id] ?? 0) + by);
      const copy = { ...cur };
      if (next === 0) { delete copy[id]; setNotes(n => { const c = { ...n }; delete c[id]; return c; }); }
      else copy[id] = next;
      return copy;
    });

  /** Out of stock means out of stock — don't let the kitchen get a ticket for
   *  it. For a sized product this is the count for THAT size. */
  const soldOut = (m: { stock: number | null }) => m.stock != null && m.stock <= 0;

  return (
    <Sheet
      onClose={onCancel}
      title={reviewing ? 'Check the order' : 'Add items'}
      subtitle={target.title}
      onBack={reviewing ? () => setReviewing(false) : undefined}
    >
      {reviewing ? (
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-5">
          {target.mode === 'standing' && !target.sessionId && (
            <label className="mb-4 block">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.2em] text-brand-ink/55">
                Name this walk-in (optional)
              </span>
              <input
                value={walkInName}
                onChange={e => setWalkInName(e.target.value)}
                placeholder="e.g. Ahmed, family of 4"
                className="w-full rounded-2xl border border-brand-gold/35 bg-white px-4 py-3 text-[14px] outline-none focus:border-brand-red"
              />
            </label>
          )}

          <ul className="divide-y divide-brand-gold/20 overflow-hidden rounded-2xl border border-brand-gold/25 bg-white">
            {chosen.map(i => (
              <li key={i.id} className="px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-brand-wine">{i.name}</p>
                    <p className="text-[11.5px] text-brand-ink/50">{formatKWD(i.price)} each</p>
                  </div>
                  <Stepper qty={i.qty} onMinus={() => bump(i.id, -1)} onPlus={() => bump(i.id, 1)} />
                  <span className="w-[72px] shrink-0 text-right text-[13px] font-bold text-brand-red">
                    {formatKWD(i.price * i.qty)}
                  </span>
                </div>
                {noteFor === i.id ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      autoFocus
                      value={notes[i.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [i.id]: e.target.value }))}
                      placeholder="e.g. no nuts, extra syrup"
                      className="flex-1 rounded-xl border border-brand-red/40 bg-white px-3 py-2 text-[12.5px] outline-none"
                    />
                    <button onClick={() => setNoteFor(null)} className="btn btn-wine h-9 px-4 text-[10px]">Done</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setNoteFor(i.id)}
                    className="mt-1.5 text-[11px] font-bold text-brand-red"
                  >
                    {notes[i.id] ? `Note: ${notes[i.id]} · edit` : '+ Note for the kitchen'}
                  </button>
                )}
              </li>
            ))}
          </ul>

          <button
            onClick={() => setRush(r => !r)}
            className={`mt-4 flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition-colors ${
              rush ? 'border-brand-red bg-brand-red/10' : 'border-brand-gold/30 bg-white'
            }`}
          >
            <Flame size={20} className={rush ? 'text-brand-red' : 'text-brand-ink/35'} />
            <span className="flex-1">
              <span className="block text-[13px] font-bold text-brand-wine">Rush this order</span>
              <span className="block text-[11.5px] text-brand-ink/50">The kitchen puts it at the front</span>
            </span>
            <span className={`h-6 w-11 rounded-full p-0.5 transition-colors ${rush ? 'bg-brand-red' : 'bg-brand-ink/15'}`}>
              <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${rush ? 'translate-x-5' : ''}`} />
            </span>
          </button>
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2.5 border-b border-brand-gold/20 bg-white px-4 pb-3 pt-3 sm:px-5">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-ink/35" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search the inventory…"
                className="w-full rounded-full border border-brand-gold/35 bg-brand-cream/60 py-3 pl-10 pr-10 text-[14px] outline-none focus:border-brand-red"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-brand-ink/40">
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 no-scrollbar">
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors ${
                    cat === c ? 'border-brand-wine bg-brand-wine text-brand-gold-light' : 'border-brand-gold/30 bg-white text-brand-ink/60'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 sm:px-5">
            {visibleGroups.length === 0 ? (
              <Empty icon={Search} text="Nothing matches that search." />
            ) : (
              // One column on purpose: this grid lives inside a ~600px drawer,
              // and Tailwind's breakpoints measure the VIEWPORT, so `md:` would
              // split the drawer in two and chop every dish name in half.
              <div className="flex flex-col gap-2">
                {visibleGroups.map(g => {
                  const expanded = openSizes.has(g.id);
                  const rows = g.base ? [{ id: g.base.id, label: '', price: g.base.price, stock: g.base.stock }] : g.sizes;
                  const picked = rows.reduce((a, r) => a + (qty[r.id] ?? 0), 0);
                  const allOut = rows.every(r => soldOut({ stock: r.stock }));
                  const prices = rows.map(r => r.price);
                  const from = Math.min(...prices);
                  const to = Math.max(...prices);

                  const Thumb = (
                    <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-brand-sand">
                      {g.image ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={g.image}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
                        />
                      ) : (
                        <span aria-hidden className="font-wordmark text-[20px] text-brand-gold-dark/60">
                          {g.name.trim().charAt(0).toUpperCase() || '\u2022'}
                        </span>
                      )}
                    </div>
                  );

                  /* One price, one shelf — ring it up straight from the card. */
                  if (g.base) {
                    const r = rows[0];
                    const n = qty[r.id] ?? 0;
                    const out = soldOut({ stock: r.stock });
                    const low = !out && r.stock != null && g.lowStockThreshold != null && r.stock <= g.lowStockThreshold;
                    return (
                      <div
                        key={g.id}
                        className={`flex items-center gap-3 rounded-2xl border p-2.5 transition-colors ${
                          out ? 'border-brand-gold/20 bg-brand-sand/30 opacity-60'
                          : n > 0 ? 'border-brand-red/50 bg-brand-red/[0.05]'
                          : 'border-brand-gold/25 bg-white'
                        }`}
                      >
                        {Thumb}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold leading-tight text-brand-wine">{g.name}</p>
                          <p className="text-[13px] font-bold text-brand-red">{formatKWD(r.price)}</p>
                          {out && <span className="text-[10.5px] font-bold uppercase tracking-wide text-brand-ink/50">Out of stock</span>}
                          {low && <span className="text-[10.5px] font-bold uppercase tracking-wide text-brand-gold-dark">Only {r.stock} left</span>}
                        </div>
                        {out ? (
                          <span className="shrink-0 px-2 text-brand-ink/30"><CircleAlert size={18} /></span>
                        ) : n > 0 ? (
                          <Stepper qty={n} onMinus={() => bump(r.id, -1)} onPlus={() => bump(r.id, 1)} />
                        ) : (
                          <button onClick={() => bump(r.id, 1)} className="btn btn-wine h-10 shrink-0 px-4 text-[10px]">
                            <Plus size={14} /> Add
                          </button>
                        )}
                      </div>
                    );
                  }

                  /* Sold in sizes — the card opens, and each size is rung up. */
                  return (
                    <div
                      key={g.id}
                      className={`overflow-hidden rounded-2xl border transition-colors ${
                        allOut ? 'border-brand-gold/20 bg-brand-sand/30 opacity-60'
                        : picked > 0 ? 'border-brand-red/50 bg-brand-red/[0.05]'
                        : 'border-brand-gold/25 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSizes(g.id)}
                        aria-expanded={expanded}
                        className="flex w-full items-center gap-3 p-2.5 text-left"
                      >
                        {Thumb}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold leading-tight text-brand-wine">{g.name}</p>
                          <p className="text-[13px] font-bold text-brand-red">
                            {from === to ? formatKWD(from) : `${formatKWD(from)} – ${formatKWD(to)}`}
                          </p>
                          <span className="text-[10.5px] font-bold uppercase tracking-wide text-brand-ink/50">
                            {allOut ? 'Out of stock' : `${g.sizes.length} size${g.sizes.length === 1 ? '' : 's'}`}
                          </span>
                        </div>
                        {picked > 0 && (
                          <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-full bg-brand-red px-2 text-[12px] font-bold text-white">
                            {picked}
                          </span>
                        )}
                        <ChevronDown
                          size={18}
                          className={`shrink-0 text-brand-ink/40 transition-transform ${expanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {expanded && (
                        <ul className="border-t border-brand-gold/20">
                          {g.sizes.map(v => {
                            const n = qty[v.id] ?? 0;
                            const out = soldOut({ stock: v.stock });
                            const low = !out && v.stock != null && g.lowStockThreshold != null && v.stock <= g.lowStockThreshold;
                            return (
                              <li
                                key={v.id}
                                className={`flex items-center gap-3 border-b border-brand-gold/15 px-2.5 py-2 last:border-b-0 ${out ? 'opacity-60' : ''}`}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[13px] font-bold text-brand-wine">{v.label}</p>
                                  <p className="text-[12.5px] font-bold text-brand-red">{formatKWD(v.price)}</p>
                                  {out && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-ink/50">Out of stock</span>}
                                  {low && <span className="text-[10px] font-bold uppercase tracking-wide text-brand-gold-dark">Only {v.stock} left</span>}
                                </div>
                                {out ? (
                                  <span className="shrink-0 px-2 text-brand-ink/30"><CircleAlert size={16} /></span>
                                ) : n > 0 ? (
                                  <Stepper qty={n} onMinus={() => bump(v.id, -1)} onPlus={() => bump(v.id, 1)} />
                                ) : (
                                  <button onClick={() => bump(v.id, 1)} className="btn btn-wine h-9 shrink-0 px-3.5 text-[10px]">
                                    <Plus size={13} /> Add
                                  </button>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Sticky footer — the running ticket, always visible */}
      <div className="shrink-0 border-t border-brand-gold/25 bg-white p-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:p-4">
        {count === 0 ? (
          <p className="py-1.5 text-center text-[12px] font-medium text-brand-ink/45">
            Pick the dishes the guest asked for — they appear here.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-ink/50">
                {count} item{count === 1 ? '' : 's'}
              </p>
              <p className="font-wordmark text-[26px] leading-none text-brand-red">{formatKWD(total)}</p>
            </div>
            {reviewing ? (
              <>
                <button onClick={() => setQty({})} aria-label="Clear" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-brand-gold/35 text-brand-ink/50">
                  <Trash2 size={17} />
                </button>
                <button
                  onClick={() => onFire(chosen, rush, walkInName)}
                  className="btn btn-wine shrink-0 px-6 py-4 text-[11px]"
                >
                  <Send size={16} /> Send to kitchen
                </button>
              </>
            ) : (
              <button onClick={() => setReviewing(true)} className="btn btn-wine shrink-0 px-6 py-4 text-[11px]">
                Review <Receipt size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Alerts drawer — what needs a waiter now, and what the kitchen is doing.
   One drawer instead of two tabs: a waiter opens it while looking at a table,
   deals with it, and is back where they were.
   ════════════════════════════════════════════════════════════════════════ */

function AlertsSheet({
  calls, ready, handover, billRequests, tickets, onClose, onResolve, onServe, onHandOver, onOpenTab,
}: {
  calls: WaiterCall[];
  ready: Order[];
  handover: Order[];
  billRequests: Tab[];
  tickets: Order[];
  onClose: () => void;
  onResolve: (id: string) => void;
  onServe: (id: string) => void;
  onHandOver: (o: Order) => void;
  onOpenTab: (t: Tab) => void;
}) {
  const [view, setView] = useState<'alerts' | 'kitchen'>('alerts');
  const nothing = calls.length === 0 && ready.length === 0 && handover.length === 0 && billRequests.length === 0;

  return (
    <Sheet onClose={onClose} title="Alerts" subtitle="Tables ringing, food ready, and the kitchen feed">
      <div className="shrink-0 border-b border-brand-gold/25 bg-brand-sand/50 px-4 py-2.5 sm:px-5">
        <div className="flex gap-1.5 rounded-full border border-brand-gold/30 bg-white p-1">
          {([
            { key: 'alerts', label: 'Needs you', n: calls.length + ready.length + handover.length + billRequests.length },
            { key: 'kitchen', label: 'Kitchen feed', n: tickets.length },
          ] as const).map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] transition-colors ${
                view === v.key ? 'bg-brand-wine text-white' : 'text-brand-ink/55'
              }`}
            >
              {v.label}
              {v.n > 0 && (
                <span className={`min-w-[18px] rounded-full px-1 text-[10px] leading-[18px] ${view === v.key ? 'bg-brand-gold text-brand-wine' : 'bg-brand-sand text-brand-wine'}`}>
                  {v.n}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-5">
        {view === 'alerts' ? (
          nothing ? (
            <div className="py-10"><Empty icon={Check} text="All clear. Nothing needs you right now." /></div>
          ) : (
            <div className="flex flex-col gap-5">
              {billRequests.length > 0 && (
                <section>
                  <h2 className={`${sectionTitle} mb-2.5`}><Receipt size={14} className="text-brand-gold-dark" /> Asking for the bill</h2>
                  <div className="flex flex-col gap-2.5">
                    {billRequests.map(t => (
                      <button
                        key={t.sessionId}
                        onClick={() => onOpenTab(t)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-brand-gold bg-brand-gold/10 px-4 py-3.5 text-left"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-wordmark text-xl uppercase leading-none text-brand-wine">{t.title}</p>
                          <p className="mt-1 truncate text-[11.5px] text-brand-ink/60">
                            {t.guest || 'Guest'}{t.guestPhone ? ` · ${t.guestPhone}` : ''} · {formatKWD(t.total)}
                          </p>
                          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-gold-dark">
                            The admin has been told — go and take the order to them
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-brand-wine px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                          Open tab
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {calls.length > 0 && (
                <section>
                  <h2 className={`${sectionTitle} mb-2.5`}><Bell size={14} className="text-brand-red" /> Tables ringing for you</h2>
                  <div className="flex flex-col gap-2.5">
                    {calls.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-brand-red/40 bg-brand-red/5 px-4 py-3.5">
                        <div>
                          <p className="font-wordmark text-2xl uppercase leading-none text-brand-wine">Table {c.table}</p>
                          <p className="mt-1 text-[11.5px] text-brand-ink/55">Rang at {timeOf(c.createdAt)}</p>
                        </div>
                        <button onClick={() => onResolve(c.id)} className="btn shrink-0 bg-brand-green px-5 py-3 text-[10px] text-white">
                          <Check size={14} /> Handled
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {handover.length > 0 && (
                <section>
                  <h2 className={`${sectionTitle} mb-2.5`}><PackageCheck size={14} className="text-brand-green" /> Billed — ready to go out</h2>
                  <div className="flex flex-col gap-2.5">
                    {handover.map(o => (
                      <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-4 py-3.5">
                        <div className="min-w-0">
                          {/* You hand it to a person, so their name comes first
                              and the order number second. */}
                          <p className="truncate font-wordmark text-xl uppercase leading-none text-brand-wine">
                            {o.customer?.name || 'Guest'}
                          </p>
                          <p className="mt-0.5 text-[11.5px] font-bold text-brand-ink/70">
                            {o.mode === 'delivery' ? 'Delivery' : 'Takeaway'} #
                            {resolveOrderNo({ sessionId: o.sessionId, id: o.id, createdAt: o.createdAt })}
                            {o.customer?.phone ? ` · ${o.customer.phone}` : ''}
                          </p>
                          <p className="mt-1 truncate text-[11.5px] text-brand-ink/55">
                            {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                          </p>
                          {o.note && <p className="mt-0.5 truncate text-[11px] italic text-brand-gold-dark">{o.note}</p>}
                        </div>
                        <button onClick={() => onHandOver(o)} className="btn shrink-0 bg-brand-green px-5 py-3 text-[10px] text-white">
                          <Check size={14} /> Handed over
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {ready.length > 0 && (
                <section>
                  <h2 className={`${sectionTitle} mb-2.5`}><BellRing size={14} className="text-brand-red" /> Cooked — carry it out</h2>
                  <div className="flex flex-col gap-2.5">
                    {ready.map(o => (
                      <div key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3.5">
                        <div className="min-w-0">
                          <p className="truncate font-wordmark text-xl uppercase leading-none text-brand-wine">
                            {o.mode === 'takeaway' || o.mode === 'delivery'
                              ? `${o.mode === 'delivery' ? 'Delivery' : 'Takeaway'} #${resolveOrderNo({ sessionId: o.sessionId, id: o.id, createdAt: o.createdAt })}`
                              : orderLabel(o)}
                          </p>
                          <p className="mt-1 truncate text-[11.5px] text-brand-ink/55">
                            {o.items.map(i => `${i.qty}× ${i.name}`).join(', ')}
                          </p>
                        </div>
                        <button onClick={() => onServe(o.id)} className="btn shrink-0 bg-brand-green px-5 py-3 text-[10px] text-white">
                          <Check size={14} /> {o.mode === 'table' ? 'Served' : 'Handed over'}
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )
        ) : tickets.length === 0 ? (
          <div className="py-10"><Empty icon={Coffee} text="Kitchen is clear — no active tickets." /></div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {tickets.map(t => (
              <article
                key={t.id}
                className={`rounded-2xl border-2 p-3.5 ${
                  t.status === 'ready' ? 'border-emerald-400 bg-emerald-50'
                  : t.mode === 'delivery' ? 'border-violet-300 bg-violet-50'
                  : t.mode === 'takeaway' ? 'border-sky-300 bg-sky-50'
                  : t.priority === 'high' ? 'border-brand-red/50 bg-brand-red/5'
                  : 'border-brand-gold/25 bg-white'
                }`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-wordmark text-xl uppercase leading-none text-brand-wine">{orderLabel(t)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-brand-ink/50">
                      <Clock size={11} /> {timeOf(t.createdAt)}
                      <span className="font-mono opacity-60">#{resolveOrderNo({ sessionId: t.sessionId, id: t.id, createdAt: t.createdAt })}</span>
                    </p>
                  </div>
                  {t.priority === 'high' && <Pill tone="red"><Flame size={10} /> Rush</Pill>}
                </div>

                <ul className="mb-3 space-y-1">
                  {t.items.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-2 text-[13px] text-brand-ink/75">
                      <span className="truncate">{i.name}{i.notes ? ` · ${i.notes}` : ''}</span>
                      <span className="shrink-0 font-bold text-brand-red">×{i.qty}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between gap-2">
                  <Pill tone={t.status === 'ready' ? 'green' : t.status === 'cooking' ? 'red' : 'grey'}>
                    {t.status === 'ready' ? <PackageCheck size={10} /> : <Coffee size={10} />}
                    {t.status === 'pending' ? 'Waiting' : t.status === 'cooking' ? 'Cooking' : 'Ready'}
                  </Pill>
                  {t.status === 'ready' && (
                    t.mode === 'delivery' || t.mode === 'takeaway' ? (
                      <Pill tone="gold"><Receipt size={10} /> Admin bills it</Pill>
                    ) : (
                      <button onClick={() => onServe(t.id)} className="btn bg-brand-green px-4 py-2.5 text-[10px] text-white">
                        <Check size={13} /> Served
                      </button>
                    )
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Bill sheet
   ════════════════════════════════════════════════════════════════════════ */

/* The waiter cannot take money. This sheet shows the table what they owe and
   sends the admin a "ready to pay" alert — the admin raises the bill, takes the
   payment and sends the invoice. That is the only way an order completes. */
function BillSheet({ tab, onClose, onConfirm }: { tab: Tab; onClose: () => void; onConfirm: () => void }) {
  const lines = useMemo(() => mergeItems(tab.orders), [tab.orders]);
  const subtotal = round3(tab.orders.reduce((s, o) => s + o.subtotal, 0));
  const discount = round3(tab.orders.reduce((s, o) => s + (o.discount ?? 0), 0));
  const already = tab.billRequested;

  return (
    <Sheet onClose={onClose} title="Ready to pay" subtitle={tab.title}>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 sm:px-5">
        <ul className="divide-y divide-brand-gold/20 overflow-hidden rounded-2xl border border-brand-gold/25 bg-white">
          {lines.map((l, i) => (
            <li key={`${l.name}-${i}`} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[13px]">
              <span className="min-w-0 truncate text-brand-ink/75"><b>{l.qty}×</b> {l.name}</span>
              <span className="shrink-0 font-bold text-brand-ink/70">{formatKWD(l.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1.5 rounded-2xl bg-brand-sand/60 p-4 text-[13px]">
          <div className="flex justify-between text-brand-ink/60"><span>Subtotal</span><span className="font-bold text-brand-ink">{formatKWD(subtotal)}</span></div>
          {discount > 0 && (
            <div className="flex justify-between text-brand-red">
              <span className="font-bold">Discount{tab.couponCode ? ` · ${tab.couponCode}` : ''}</span>
              <span className="font-bold">−{formatKWD(discount)}</span>
            </div>
          )}
          {tab.deliveryFee > 0 && (
            <div className="flex justify-between text-brand-ink/60"><span className="font-bold">Delivery charge</span><span className="font-bold">{formatKWD(tab.deliveryFee)}</span></div>
          )}
          <div className="flex items-end justify-between border-t border-brand-wine/15 pt-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-wine">Running total</span>
            <span className="font-wordmark text-[36px] leading-none text-brand-red">{formatKWD(tab.total)}</span>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-3 text-[12px] font-medium text-brand-wine">
          <Info size={14} className="mt-0.5 shrink-0" />
          {already
            ? 'The admin already knows this table wants to pay. They take the payment and send the invoice — nothing else for you to do here.'
            : 'This tells the admin the table is ready to pay. The admin takes the money and sends the invoice; the discount and the final amount are theirs to set.'}
        </p>
      </div>

      <div className="shrink-0 border-t border-brand-gold/25 bg-white p-3.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:p-4">
        <button
          onClick={onConfirm}
          disabled={already}
          className="btn w-full bg-brand-wine py-5 text-[12px] text-white disabled:opacity-45"
        >
          <Receipt size={18} /> {already ? 'Admin already told' : 'Tell the admin — ready to pay'}
        </button>
      </div>
    </Sheet>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Shared bits
   ════════════════════════════════════════════════════════════════════════ */

/** Full-screen on a phone, right-hand drawer from tablet up. */
function Sheet({
  title, subtitle, onClose, onBack, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  // Escape closes, and the page behind must not scroll while this is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex bg-[#2a0a0a]/45 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        className="ml-auto flex h-full w-full flex-col bg-brand-cream shadow-2xl sm:max-w-xl sm:border-l sm:border-brand-gold/30 lg:max-w-2xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-brand-gold/25 bg-white px-3.5 py-3 sm:px-5">
          <button
            onClick={onBack ?? onClose}
            aria-label={onBack ? 'Back' : 'Close'}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand-gold/30 text-brand-wine"
          >
            {onBack ? <ChevronLeft size={18} /> : <X size={18} />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-wordmark text-2xl uppercase leading-none text-brand-wine">{title}</p>
            {subtitle && <p className="mt-0.5 truncate text-[11.5px] font-medium text-brand-ink/50">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Stepper({ qty, onMinus, onPlus }: { qty: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-brand-gold/40 bg-white p-1">
      <button onClick={onMinus} aria-label="Remove one" className="grid h-9 w-9 place-items-center rounded-full bg-brand-cream text-brand-red active:scale-95">
        <Minus size={15} />
      </button>
      <span className="w-6 text-center font-wordmark text-lg text-brand-wine">{qty}</span>
      <button onClick={onPlus} aria-label="Add one" className="grid h-9 w-9 place-items-center rounded-full bg-brand-wine text-brand-gold-light active:scale-95">
        <Plus size={15} />
      </button>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'green' | 'red' | 'gold' | 'grey'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-100 text-emerald-700',
    red: 'bg-brand-red text-white',
    gold: 'bg-brand-gold/20 text-brand-gold-dark',
    grey: 'bg-brand-ink/8 text-brand-ink/55',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Empty({ icon: Icon, text }: { icon: typeof Bell; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-brand-ink/35">
      <Icon size={30} className="opacity-50" />
      <p className="max-w-xs text-[12.5px] font-semibold">{text}</p>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-brand-gold/30 bg-brand-sand/50 px-3.5 py-2.5 text-[12px] font-medium text-brand-wine/80">
      <Info size={14} className="mt-0.5 shrink-0 text-brand-gold-dark" />
      {children}
    </p>
  );
}

/** Chime once when an id appears that wasn't in the list before. */
function useChimeOnNew(ids: string[], chime: () => void) {
  const known = useRef<Set<string> | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    const current = new Set(ids);
    if (known.current === null) { known.current = current; return; }
    let fresh = false;
    current.forEach(id => { if (!known.current!.has(id)) fresh = true; });
    known.current = current;
    if (fresh) chime();
    // `key` is the stable stringified id list — `ids` is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, chime]);
}
