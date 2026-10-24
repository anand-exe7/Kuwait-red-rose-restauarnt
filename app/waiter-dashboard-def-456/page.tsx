"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import {
  Plus,
  Minus,
  Send,
  Clock,
  User,
  Hash,
  Coffee,
  Utensils,
  Bell,
  BellRing,
  Search,
  X,
  Flame,
  Check,
  Trash2,
  Receipt,
  FileText,
  Volume2,
  VolumeX,
  PackageCheck,
  PersonStanding,
  ChevronRight,
  Banknote,
  Users,
  ShoppingBag,
} from 'lucide-react';
import type { Order } from '../lib/orderStore';
import { addOrder, updateOrderStatus, orderLabel, getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, getActiveStandingSessions, getSessionOrders, billSession } from '../lib/orderStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu, MENU_CATEGORIES } from '../lib/menuStore';
import { WaiterCall, resolveWaiterCall, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot, subscribeToWaiterCalls } from '../lib/waiterCallStore';
import { getTablesSnapshot, getTablesServerSnapshot, subscribeToTables } from '../lib/tableStore';
import { formatKWD, round3 } from '../lib/currency';
import { landingFonts } from '../fonts';
import BrandMark from '../components/BrandMark';
import { playChime, primeAudioOnFirstInteraction } from '../lib/sound';

type TableSel = number | 'standing';

export default function WaiterDashboard() {
  // State
  const [activeTable, setActiveTable] = useState<TableSel>(1);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'ticket' | 'alerts'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPriorityRush, setIsPriorityRush] = useState<boolean>(false);
  const [tableFilter, setTableFilter] = useState<'all' | 'occupied'>('all');
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [standingLabel, setStandingLabel] = useState<string>('');
  const [billingSessionId, setBillingSessionId] = useState<string | null>(null);

  const activeLabel = activeTable === 'standing' ? 'Standing' : `Table ${activeTable}`;

  // Live shared stores (synced across tabs/devices via localStorage today)
  const placedOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const waiterCalls = useSyncExternalStore(subscribeToWaiterCalls, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot);
  const activeWaiterCalls = useMemo(() => waiterCalls.filter((c: WaiterCall) => !c.resolved), [waiterCalls]);
  const calledTables = useMemo(() => new Set(activeWaiterCalls.map(c => c.table)), [activeWaiterCalls]);

  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const menu = useMemo(() => allMenuItems.filter(m => m.status === 'active'), [allMenuItems]);

  // Tables come from the admin's Table Management (active tables only)
  const allTables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const tableNumbers = useMemo(
    () => allTables.filter(t => t.active).map(t => t.number).sort((a, b) => a - b),
    [allTables]
  );

  // Table occupancy from real active orders
  const tablesStatus = useMemo(() => {
    const status: Record<number, 'available' | 'occupied'> = {};
    for (const t of tableNumbers) status[t] = 'available';
    for (const o of placedOrders) {
      if (o.status !== 'served' && o.mode !== 'standing' && o.mode !== 'takeaway' && o.mode !== 'delivery') {
        status[o.table] = 'occupied';
      }
    }
    return status;
  }, [placedOrders, tableNumbers]);

  // Orders active for the current selection (table N, or all standing)
  const activeOrdersForActiveTable = useMemo(() => {
    return placedOrders.filter(o => {
      if (o.status === 'served') return false;
      if (activeTable === 'standing') return o.mode === 'standing';
      return o.table === activeTable && o.mode !== 'standing' && o.mode !== 'takeaway';
    });
  }, [placedOrders, activeTable]);

  const standingActiveCount = useMemo(
    () => placedOrders.filter(o => o.mode === 'standing' && o.status !== 'served').length,
    [placedOrders]
  );
  const standingEverCount = useMemo(() => placedOrders.filter(o => o.mode === 'standing').length, [placedOrders]);

  const activeStandingSessions = useMemo(() => getActiveStandingSessions(placedOrders), [placedOrders]);

  const activeTableSessions = useMemo(() => {
    const sessions = new Map<string, { table: number; count: number; total: number }>();
    for (const o of placedOrders) {
      if ((o.mode === 'table' || !o.mode) && !o.billed && o.sessionId) {
        const cur = sessions.get(o.sessionId);
        if (cur) { cur.count++; cur.total += o.total; }
        else sessions.set(o.sessionId, { table: o.table, count: 1, total: o.total });
      }
    }
    return Array.from(sessions.entries()).map(([sessionId, v]) => ({ sessionId, table: v.table, orderCount: v.count, total: v.total }));
  }, [placedOrders]);

  const activeTakeawaySessions = useMemo(() => {
    const sessions = new Map<string, { count: number; total: number; id: string }>();
    for (const o of placedOrders) {
      if (o.mode === 'takeaway' && !o.billed && o.sessionId) {
        const cur = sessions.get(o.sessionId);
        if (cur) { cur.count++; cur.total += o.total; }
        else sessions.set(o.sessionId, { count: 1, total: o.total, id: o.id.split('-')[1] });
      }
    }
    return Array.from(sessions.entries()).map(([sessionId, v]) => ({ sessionId, orderCount: v.count, total: v.total, id: v.id }));
  }, [placedOrders]);

  // Delivery orders waiting to go out — one order per card (deliveries don't
  // reuse sessions). Only shows admin-approved ones so the waiter never hands
  // out a ticket the admin hasn't released.
  const activeDeliveryOrders = useMemo(
    () => placedOrders
      .filter(o => o.mode === 'delivery' && !o.billed && (o.status === 'pending' || o.status === 'cooking' || o.status === 'ready'))
      .sort((a, b) => a.createdAt - b.createdAt),
    [placedOrders]
  );

  const currentSessionId = useMemo(() => {
    if (activeTable === 'standing') return undefined;
    const tableOrders = placedOrders.filter(o => o.table === activeTable && !o.billed && o.sessionId && (o.mode || 'table') === 'table');
    return tableOrders[0]?.sessionId;
  }, [placedOrders, activeTable]);

  const sessionOrders = useMemo(() => {
    const sid = billingSessionId || currentSessionId;
    if (!sid) return [];
    return getSessionOrders(placedOrders, sid);
  }, [placedOrders, billingSessionId, currentSessionId]);

  const canBill = useMemo(() => {
    if (activeTable === 'standing') return false;
    return placedOrders.some(o => o.table === activeTable && !o.billed && o.sessionId && (o.mode || 'table') === 'table');
  }, [placedOrders, activeTable]);

  // ── Ready-order alert (sound + visual) ─────────────────────────────────────
  const readyOrders = useMemo(
    // Delivery orders are collected by drivers (see Admin -> Deliveries), not served by waiters.
    () => placedOrders.filter(o => o.status === 'ready' && o.mode !== 'delivery').sort((a, b) => a.createdAt - b.createdAt),
    [placedOrders]
  );
  const audioCtxRef = useRef<AudioContext | null>(null);
  const knownReadyRef = useRef<Set<string>>(new Set());
  const readyInitializedRef = useRef(false);
  const knownCallsRef = useRef<Set<string>>(new Set());
  const callsInitializedRef = useRef(false);

  const chime = useCallback(() => playChime(audioCtxRef, muted), [muted]);

  // Prime/resume audio on first interaction (browser autoplay policy)
  useEffect(() => primeAudioOnFirstInteraction(audioCtxRef), []);

  // Chime once when a brand-new ready ticket appears (event-driven only — no repeat timer)
  useEffect(() => {
    const currentReady = new Set(readyOrders.map(o => o.id));
    if (!readyInitializedRef.current) {
      knownReadyRef.current = currentReady;
      readyInitializedRef.current = true;
      return;
    }
    let hasNew = false;
    currentReady.forEach(id => { if (!knownReadyRef.current.has(id)) hasNew = true; });
    knownReadyRef.current = currentReady;
    if (hasNew) chime();
  }, [readyOrders, chime]);

  // Chime once when a table calls for a waiter
  useEffect(() => {
    const currentCalls = new Set(activeWaiterCalls.map(c => c.id));
    if (!callsInitializedRef.current) {
      knownCallsRef.current = currentCalls;
      callsInitializedRef.current = true;
      return;
    }
    let hasNew = false;
    currentCalls.forEach(id => { if (!knownCallsRef.current.has(id)) hasNew = true; });
    knownCallsRef.current = currentCalls;
    if (hasNew) chime();
  }, [activeWaiterCalls, chime]);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2600);
  };

  // Order builders
  const addToOrder = (id: string) => setOrder(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromOrder = (id: string) => {
    setOrder(prev => {
      const copy = { ...prev };
      if (copy[id] > 1) copy[id]--;
      else {
        delete copy[id];
        setItemNotes(n => { const c = { ...n }; delete c[id]; return c; });
      }
      return copy;
    });
  };

  const clearOrder = () => {
    setOrder({});
    setItemNotes({});
    setIsPriorityRush(false);
    setStandingLabel('');
    triggerToast(`Cleared ticket for ${activeLabel}`);
  };

  // Totals
  const subtotal = Object.entries(order).reduce((acc, [id, qty]) => {
    const item = menu.find(m => m.id === id);
    return acc + (item?.price || 0) * qty;
  }, 0);
  const tax = round3(subtotal * 0.1);
  const orderTotal = round3(subtotal + tax);
  const orderItemCount = useMemo(() => Object.values(order).reduce((a, b) => a + b, 0), [order]);

  const submitOrder = () => {
    if (Object.keys(order).length === 0) return;
    const itemsList = Object.entries(order).map(([id, qty]) => {
      const item = menu.find(m => m.id === id);
      return { id, name: item?.name || 'Item', price: item?.price || 0, qty, notes: itemNotes[id] || undefined };
    });
    const isStanding = activeTable === 'standing';
    addOrder({
      table: isStanding ? 0 : activeTable,
      mode: isStanding ? 'standing' : 'table',
      items: itemsList,
      priority: isPriorityRush ? 'high' : 'normal',
      subtotal,
      tax,
      total: orderTotal,
      source: 'waiter',
      standingLabel: isStanding ? (standingLabel.trim() || `Walk-in #${standingEverCount + 1}`) : undefined,
    });
    setOrder({});
    setItemNotes({});
    setIsPriorityRush(false);
    setStandingLabel('');
    triggerToast(`Order fired to kitchen · ${activeLabel}`);
    setActiveTab('tables');
  };

  const serveOrder = (ticketId: string) => {
    updateOrderStatus(ticketId, 'served');
    triggerToast(`Ticket ${ticketId} served`);
  };

  const filteredMenu = useMemo(() => {
    return menu.filter(item => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const q = searchQuery.toLowerCase();
      const matchesSearch = item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [menu, activeCategory, searchQuery]);

  const selectTable = (t: TableSel) => {
    setActiveTable(t);
    setActiveTab('menu');
    if (t !== 'standing') setStandingLabel('');
    triggerToast(t === 'standing' ? 'Standing / walk-in order' : `Switched to Table ${t}`);
  };

  const cardBase = 'bg-white rounded-[1.75rem] border border-brand-gold/25 shadow-[0_24px_50px_-34px_rgba(74,21,21,0.45)]';

  return (
    <div className={`landing ${landingFonts} h-[100dvh] flex flex-col bg-brand-cream text-brand-ink font-body pb-[70px] lg:pb-24 selection:bg-brand-red selection:text-white`}>
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] bg-brand-wine text-white px-6 py-3 rounded-full font-body font-medium text-[11px] uppercase tracking-[0.18em] border border-brand-gold/40 shadow-xl flex items-center gap-2 animate-in slide-in-from-top-4">
          <Check size={16} className="text-brand-gold" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 w-full max-w-[1700px] mx-auto p-3 sm:p-5 lg:p-6 flex flex-col gap-3 sm:gap-4">

        {/* ============ TOP BAR ============ */}
        <header className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-[2rem] md:rounded-full border border-brand-gold/25 bg-[#4f070c] p-3 md:py-2.5 md:pl-4 md:pr-3 shadow-[0_18px_44px_-14px_rgba(35,0,4,0.55)]">
          <div className="flex items-center justify-between w-full md:w-auto gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <BrandMark sub="Waiter Station" />
              <p className="hidden sm:block text-[10px] font-medium uppercase tracking-[0.24em] text-brand-gold-light/80 truncate">Floor service · Station 2</p>
            </div>
            <div className="md:hidden flex items-center gap-2 rounded-full border border-brand-gold/30 px-3.5 py-2 shrink-0 text-brand-gold-light">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em]">{activeLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-gold-light/70" size={16} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dishes, drinks…"
                className="w-full rounded-full border border-white/20 bg-white/[0.07] py-3 pl-11 pr-10 text-sm font-light text-white placeholder-white/45 transition-all focus:border-brand-gold-light/70 focus:outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>

            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Sound alerts off — tap to enable' : 'Sound alerts on — tap to mute'}
              className={`btn shrink-0 relative h-11 w-11 p-0 ${muted ? 'text-white/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] hover:text-white' : 'btn-outline-light'}`}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              {!muted && readyOrders.length > 0 && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-gold animate-ping" />
              )}
            </button>

            <div className="hidden lg:flex items-center gap-3 rounded-full border border-brand-gold/30 py-1.5 pl-4 pr-4 shrink-0 text-brand-gold-light">
              <span className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.2em]">
                <User size={14} /> Alex W.
              </span>
              <span className="h-4 w-px bg-brand-gold/30" />
              <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-green-300">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" /> Live
              </span>
            </div>
          </div>
        </header>

        {/* ============ ALERTS PAGE (ready pickups + waiter calls) ============ */}
        {activeTab === 'alerts' ? (
          <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto custom-scrollbar">
            <AlertsSection
              title="Ready to serve — pick up now"
              icon={BellRing}
              emptyText="No tickets waiting for pickup."
              items={readyOrders.map(o => ({
                id: o.id,
                title: orderLabel(o),
                subtitle: `#${o.id.split('-')[1]} · ${o.items.reduce((s, i) => s + i.qty, 0)} items · ${new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                actionLabel: 'Serve',
                actionIcon: Check,
                onAction: () => serveOrder(o.id),
              }))}
            />
            <AlertsSection
              title="Tables calling a waiter"
              icon={Bell}
              emptyText="No active waiter calls."
              items={activeWaiterCalls.map(call => ({
                id: call.id,
                title: `Table ${call.table}`,
                subtitle: new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                actionLabel: 'Resolve',
                onAction: () => resolveWaiterCall(call.id),
              }))}
            />
          </div>
        ) : (
        <>
        {/* ============ MAIN LAYOUT — menu+ticket side by side on desktop ============ */}
        <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'menu' ? 'lg:flex-row' : ''} gap-4`}>

          {/* LEFT: tables + kitchen feed */}
          <aside className={`w-full gap-4 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4 lg:pb-0 lg:overflow-hidden ${activeTab !== 'tables' ? 'hidden' : 'flex flex-col lg:grid lg:grid-cols-2'}`}>
            {/* Tables */}
            <div className={`${cardBase} p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[10.5px] font-medium text-brand-gold-dark uppercase tracking-[0.24em] flex items-center gap-1.5">
                  <Hash size={14} className="text-brand-red" /> Floor Tables
                </h3>
                <div className="flex gap-1 bg-brand-sand p-1 rounded-full">
                  {(['all', 'occupied'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setTableFilter(f)}
                      className={`px-3 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.14em] transition-colors ${tableFilter === f ? 'bg-brand-wine text-brand-gold-light' : 'text-brand-ink/50 hover:text-brand-ink'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                {tableNumbers
                  .filter(t => (tableFilter === 'occupied' ? tablesStatus[t] === 'occupied' : true))
                  .map(t => {
                    const status = tablesStatus[t] || 'available';
                    const isSelected = activeTable === t;
                    const activeCount = placedOrders.filter(o => o.table === t && o.mode !== 'standing' && o.mode !== 'takeaway' && o.status !== 'served').length;
                    const hasReady = placedOrders.some(o => o.table === t && o.mode !== 'standing' && o.status === 'ready');
                    const isCalling = calledTables.has(t);
                    return (
                      <button
                        key={t}
                        onClick={() => selectTable(t)}
                        className={`aspect-square rounded-full flex flex-col items-center justify-center gap-0.5 transition-all font-semibold relative border ${
                          isSelected
                            ? 'bg-brand-wine text-brand-gold-light border-brand-gold shadow-md scale-[1.03]'
                            : isCalling
                            ? 'bg-red-50 text-brand-red border-red-300 animate-pulse'
                            : hasReady
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : status === 'occupied'
                            ? 'bg-brand-sand text-brand-ink border-brand-gold/40'
                            : 'bg-white text-brand-ink/70 border-brand-gold/20 hover:border-brand-red/40'
                        }`}
                      >
                        <span className={`text-[9px] font-bold ${isSelected ? 'text-brand-gold-light/80' : 'text-brand-ink/40'}`}>TBL</span>
                        <span className="font-display text-2xl font-semibold leading-none">{t}</span>
                        {isCalling && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-red text-white flex items-center justify-center border-2 border-white">
                            <Bell size={10} />
                          </span>
                        )}
                        {activeCount > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-brand-ink text-white text-[10px] font-semibold flex items-center justify-center border-2 border-white">
                            {activeCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>

              {/* Standing / walk-in */}
              <button
                onClick={() => selectTable('standing')}
                className={`mt-3 w-full rounded-full border px-5 py-3 flex items-center gap-2.5 font-medium text-sm transition-all ${
                  activeTable === 'standing'
                    ? 'bg-brand-wine text-brand-gold-light border-brand-gold shadow-md'
                    : 'bg-white text-brand-ink border-dashed border-brand-gold/50 hover:border-brand-red/50'
                }`}
              >
                <PersonStanding size={18} className={activeTable === 'standing' ? 'text-white' : 'text-brand-red'} />
                <span className="flex-1 text-left leading-tight">
                  Standing / Walk-in
                  <span className={`block text-[10px] font-medium ${activeTable === 'standing' ? 'text-brand-gold-light/80' : 'text-brand-ink/45'}`}>
                    No table — customer stands & eats
                  </span>
                </span>
                {standingActiveCount > 0 && (
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${activeTable === 'standing' ? 'bg-white/20' : 'bg-brand-red/10 text-brand-red'}`}>
                    {standingActiveCount}
                  </span>
                )}
              </button>

              {canBill && activeTable !== 'standing' && (
                <div className="mt-4">
                  <p className="text-[10px] font-medium text-brand-gold-dark uppercase tracking-[0.2em] mb-2 flex items-center gap-1"><Hash size={11} /> Table {activeTable} Actions</p>
                  <div className="w-full rounded-2xl border border-brand-red/30 bg-brand-red/[0.03] p-3.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-display text-xl font-semibold leading-none text-brand-wine truncate">Table {activeTable}</h4>
                        <p className="text-[11px] font-medium text-brand-ink/50 mt-0.5">{activeOrdersForActiveTable.length} order{activeOrdersForActiveTable.length !== 1 ? 's' : ''} · <span className="font-bold text-brand-red">{formatKWD(activeOrdersForActiveTable.reduce((s, o) => s + o.total, 0))}</span></p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        onClick={() => setActiveTab('menu')}
                        className="btn btn-outline flex-1 px-3 py-3 text-[10px]"
                      >
                        <Plus size={14} /> Add Items
                      </button>
                      <button
                        onClick={() => setBillingSessionId(currentSessionId || null)}
                        className="btn btn-wine flex-1 px-3 py-3 text-[10px]"
                      >
                        <Banknote size={14} /> Bill
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeStandingSessions.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-medium text-brand-gold-dark uppercase tracking-[0.2em] mb-2 flex items-center gap-1"><Users size={11} /> Active Standing Sessions</p>
                  <div className="flex flex-col gap-1.5">
                    {activeStandingSessions.map(s => (
                      <div key={s.sessionId} className="w-full rounded-2xl border border-brand-gold/30 bg-brand-cream/50 p-3.5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-xl font-semibold leading-none text-brand-wine truncate">{s.label}</h4>
                            <p className="text-[11px] font-medium text-brand-ink/50 mt-0.5">{s.orderCount} order{s.orderCount > 1 ? 's' : ''} · <span className="font-bold text-brand-red">{formatKWD(s.total)}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => { setActiveTable('standing'); setStandingLabel(s.label); setActiveTab('menu'); triggerToast(`Resumed: ${s.label}`); }}
                            className="btn btn-outline flex-1 px-3 py-3 text-[10px]"
                          >
                            <Plus size={14} /> Add Items
                          </button>
                          <button
                            onClick={() => setBillingSessionId(s.sessionId)}
                            className="btn btn-wine flex-1 px-3 py-3 text-[10px]"
                          >
                            <Banknote size={14} /> Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTableSessions.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-medium text-brand-gold-dark uppercase tracking-[0.2em] mb-2 flex items-center gap-1"><Hash size={11} /> Active Floor Tables</p>
                  <div className="flex flex-col gap-1.5">
                    {activeTableSessions.map(s => (
                      <div key={s.sessionId} className="w-full rounded-2xl border border-brand-gold/30 bg-brand-cream/50 p-3.5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-xl font-semibold leading-none text-brand-wine truncate">Table {s.table}</h4>
                            <p className="text-[11px] font-medium text-brand-ink/50 mt-0.5">{s.orderCount} order{s.orderCount !== 1 ? 's' : ''} · <span className="font-bold text-brand-red">{formatKWD(s.total)}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => { setActiveTable(s.table); setActiveTab('menu'); }}
                            className="btn btn-outline flex-1 px-3 py-3 text-[10px]"
                          >
                            <Plus size={14} /> Add Items
                          </button>
                          <button
                            onClick={() => setBillingSessionId(s.sessionId)}
                            className="btn btn-wine flex-1 px-3 py-3 text-[10px]"
                          >
                            <Banknote size={14} /> Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTakeawaySessions.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-medium text-brand-gold-dark uppercase tracking-[0.2em] mb-2 flex items-center gap-1"><ShoppingBag size={11} /> Active Takeaway Orders</p>
                  <div className="flex flex-col gap-1.5">
                    {activeTakeawaySessions.map(s => (
                      <div key={s.sessionId} className="w-full rounded-2xl border border-brand-gold/30 bg-brand-cream/50 p-3.5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-xl font-semibold leading-none text-brand-wine truncate">Takeaway #{s.id}</h4>
                            <p className="text-[11px] font-medium text-brand-ink/50 mt-0.5">{s.orderCount} order{s.orderCount !== 1 ? 's' : ''} · <span className="font-bold text-brand-red">{formatKWD(s.total)}</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            onClick={() => setBillingSessionId(s.sessionId)}
                            className="btn btn-wine flex-1 px-3 py-3 text-[10px]"
                          >
                            <Banknote size={14} /> Bill
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delivery queue — admin-approved orders waiting for the
                  driver / pickup handoff. One card per order (no sessions). */}
              {activeDeliveryOrders.length > 0 && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-medium text-brand-red uppercase tracking-[0.2em] mb-2 flex items-center gap-1">
                    <ShoppingBag size={11} /> Deliveries Out
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {activeDeliveryOrders.map(o => (
                      <div key={o.id} className="w-full rounded-2xl border border-brand-red/30 bg-brand-red/5 p-3.5 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-xl font-semibold leading-none text-brand-wine truncate">
                              Delivery · {o.customer?.name || `#${o.id.split('-')[1]}`}
                            </h4>
                            <p className="text-[11px] font-medium text-brand-ink/50 mt-0.5">
                              {o.customer?.phone ? `${o.customer.phone} · ` : ''}
                              <span className="font-bold text-brand-red">{formatKWD(o.total)}</span>
                            </p>
                            {o.deliveryAddress && (
                              <p className="text-[11px] text-brand-ink/55 mt-1 leading-relaxed">
                                {[
                                  o.deliveryAddress.governorate,
                                  o.deliveryAddress.area,
                                  o.deliveryAddress.street && `St ${o.deliveryAddress.street}`,
                                  o.deliveryAddress.building && `Bldg ${o.deliveryAddress.building}`,
                                ].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] ${
                            o.status === 'ready' ? 'bg-emerald-500/15 text-emerald-700' :
                            o.status === 'cooking' ? 'bg-brand-red/15 text-brand-red' :
                            'bg-gray-500/15 text-gray-700'
                          }`}>
                            {o.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Kitchen live feed */}
            <div className={`${cardBase} p-4 flex-1 flex flex-col overflow-hidden min-h-[240px]`}>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-brand-gold/20">
                <h3 className="text-[10.5px] font-medium text-brand-gold-dark uppercase tracking-[0.24em] flex items-center gap-1.5">
                  <Coffee size={14} className="text-brand-red" /> Kitchen Feed
                </h3>
                <span className="px-3 py-1 rounded-full bg-brand-red/10 text-brand-red text-[10px] font-medium uppercase tracking-[0.16em]">
                  {placedOrders.filter(o => o.status !== 'served').length} active
                </span>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-3">
                {placedOrders.filter(o => o.status !== 'served').length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-brand-ink/30 p-6 text-center">
                    <Coffee size={36} className="mb-2 opacity-40" />
                    <p className="text-xs font-bold">No active tickets</p>
                  </div>
                ) : (
                  placedOrders.filter(o => o.status !== 'served').map(ticket => (
                    <div
                      key={ticket.id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        ticket.priority === 'high'
                          ? 'border-brand-red/40 bg-brand-red/5'
                          : ticket.status === 'ready'
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-brand-gold/20 bg-brand-cream/40'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-display text-xl font-semibold text-brand-wine">{orderLabel(ticket)}</span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-brand-ink/5 text-brand-ink/50 font-mono">#{ticket.id.split('-')[1]}</span>
                            {ticket.source === 'customer' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-plum/10 text-brand-plum font-bold uppercase">Self</span>
                            )}
                          </div>
                          <span className="text-xs text-brand-ink/45 flex items-center gap-1 mt-0.5">
                            <Clock size={12} /> {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {ticket.priority === 'high' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.16em] bg-brand-red text-white shrink-0">
                            <Flame size={11} /> Rush
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-brand-ink/70 space-y-1 mb-2.5">
                        {ticket.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-2">
                            <span className="truncate">{item.name}{item.notes ? ` · ${item.notes}` : ''}</span>
                            <span className="font-bold text-brand-red">×{item.qty}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-medium uppercase tracking-[0.16em] ${
                          ticket.status === 'ready' ? 'bg-emerald-100 text-emerald-700'
                          : ticket.status === 'cooking' ? 'bg-brand-red/10 text-brand-red'
                          : 'bg-brand-ink/5 text-brand-ink/50'
                        }`}>
                          {ticket.status === 'ready' ? <PackageCheck size={12} /> : <Coffee size={12} />}
                          {ticket.status === 'pending' ? 'waiting' : ticket.status}
                        </span>
                        {ticket.status === 'ready' && (
                          <button
                            onClick={() => serveOrder(ticket.id)}
                            className="btn bg-brand-green text-white px-4 py-2.5 text-[10px] hover:brightness-110"
                          >
                            <Check size={13} /> Serve
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* CENTER: menu */}
          <main className={`flex-1 ${cardBase} p-4 sm:p-5 flex-col overflow-hidden ${activeTab !== 'menu' ? 'hidden' : 'flex'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-brand-gold/20 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-3xl font-medium leading-none text-brand-wine">Menu</h2>
                <span className="text-[10px] px-3 py-1.5 rounded-full bg-brand-sand text-brand-wine font-medium uppercase tracking-[0.16em] flex items-center gap-1">
                  {activeTable === 'standing' ? <PersonStanding size={12} /> : <Hash size={12} />} {activeLabel}
                </span>
                {activeOrdersForActiveTable.length > 0 && (
                  <span className="text-[10px] px-3 py-1.5 rounded-full bg-brand-red/10 text-brand-red font-medium uppercase tracking-[0.16em]">
                    {activeOrdersForActiveTable.length} in · {formatKWD(activeOrdersForActiveTable.reduce((s, o) => s + o.total, 0))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
                {['All', ...MENU_CATEGORIES].map(cat => {
                  const isActive = activeCategory === cat;
                  const count = cat === 'All' ? menu.length : menu.filter(m => m.category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-2 rounded-full text-[10px] font-medium uppercase tracking-[0.18em] whitespace-nowrap flex items-center gap-1.5 border transition-all ${
                        isActive
                          ? 'bg-brand-wine text-brand-gold-light border-brand-wine shadow-sm'
                          : 'bg-white text-brand-ink/60 hover:text-brand-ink border-brand-gold/25'
                      }`}
                    >
                      {cat}
                      <span className={`text-[10px] px-1.5 rounded-full font-semibold ${isActive ? 'bg-white/20' : 'bg-brand-sand text-brand-ink/50'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              {filteredMenu.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-brand-ink/30 py-12">
                  <Search size={44} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm">No items found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {filteredMenu.map(item => {
                    const currentQty = order[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-[1.5rem] p-3 border flex flex-col justify-between transition-all ${
                          currentQty > 0 ? 'border-brand-red/50 bg-brand-red/[0.03]' : 'border-brand-gold/20 bg-white hover:border-brand-red/30'
                        }`}
                      >
                        <div>
                          <div className="w-full aspect-[4/3] rounded-xl overflow-hidden relative mb-2.5 bg-brand-sand">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                            <div className="absolute top-2 left-2 px-3 py-1 rounded-full bg-white/90 backdrop-blur font-display font-semibold text-base leading-none text-brand-red shadow-sm">
                              {formatKWD(item.price)}
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1">
                              {item.isChefSpecial && <span className="px-1.5 py-0.5 rounded bg-brand-gold text-brand-ink text-[9px] font-semibold uppercase">Chef</span>}
                              {item.isSpicy && <span className="px-1.5 py-0.5 rounded bg-brand-red text-white text-[9px] font-semibold uppercase">Spicy</span>}
                            </div>
                          </div>
                          <h4 className="font-display text-xl font-medium leading-tight text-brand-wine">{item.name}</h4>
                          <p className="text-xs font-light text-brand-ink/60 line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                        </div>
                        <div className="pt-2.5 mt-2.5 border-t border-brand-gold/15 flex items-center justify-between">
                          <span className="text-xs font-bold text-brand-ink/45">{currentQty > 0 ? `${currentQty} in ticket` : `${item.prepTime}`}</span>
                          {currentQty > 0 ? (
                            <div className="flex items-center gap-1.5 bg-brand-cream p-1 rounded-full border border-brand-gold/50">
                              <button onClick={() => removeFromOrder(item.id)} className="w-8 h-8 rounded-full bg-white text-brand-red flex items-center justify-center hover:bg-brand-red/10 active:scale-95"><Minus size={15} /></button>
                              <span className="font-display text-lg font-semibold w-5 text-center text-brand-wine">{currentQty}</span>
                              <button onClick={() => addToOrder(item.id)} className="btn btn-wine h-8 w-8 p-0"><Plus size={15} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToOrder(item.id)}
                              className="btn btn-wine px-5 py-3 text-[10px]"
                            >
                              <Plus size={15} /> Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* RIGHT: current ticket — visible alongside menu on desktop */}
          <aside className={`w-full ${activeTab === 'menu' ? 'lg:w-[25%] lg:min-w-[320px] lg:shrink-0' : 'max-w-2xl mx-auto'} ${cardBase} p-4 sm:p-5 flex-col overflow-hidden ${activeTab === 'ticket' ? 'flex' : activeTab === 'menu' ? 'hidden lg:flex' : 'hidden'}`}>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-brand-gold/20 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-medium leading-none text-brand-wine">Current Ticket</h2>
                  <p className="text-xs text-brand-ink/50 flex items-center gap-1">
                    {activeTable === 'standing' ? <PersonStanding size={12} /> : <Hash size={12} />} {activeLabel}
                  </p>
                </div>
              </div>
              {orderItemCount > 0 && (
                <button onClick={clearOrder} title="Clear ticket" className="p-2 text-brand-ink/40 hover:text-brand-red hover:bg-brand-red/10 rounded-lg transition-colors">
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {activeTable === 'standing' && (
              <div className="mb-3 shrink-0">
                <label className="text-[11px] font-bold text-brand-ink/50 mb-1 block">Walk-in name/tag (optional)</label>
                <input
                  type="text"
                  value={standingLabel}
                  onChange={(e) => setStandingLabel(e.target.value)}
                  placeholder={`e.g. Ahmed, Family of 4 — defaults to "Walk-in #${standingEverCount + 1}"`}
                  className="w-full bg-brand-cream/60 text-sm px-4 py-2.5 rounded-full border border-brand-gold/30 focus:outline-none focus:border-brand-red transition-all"
                />
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col gap-2.5 min-h-[180px]">
              {Object.keys(order).length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-brand-ink/35 p-8 text-center border-2 border-dashed border-brand-gold/30 rounded-2xl">
                  <Utensils size={40} className="mb-3 opacity-40" />
                  <p className="font-bold text-sm text-brand-ink/50">No items yet</p>
                  <p className="text-xs text-brand-ink/40 mt-1">Tap “Add” on any dish</p>
                </div>
              ) : (
                Object.entries(order).map(([id, qty]) => {
                  const item = menu.find(m => m.id === id);
                  if (!item) return null;
                  const hasNote = Boolean(itemNotes[id]);
                  return (
                    <div key={id} className="bg-brand-cream/50 p-2.5 rounded-2xl border border-brand-gold/25 flex flex-col gap-2">
                      <div className="flex items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image} alt={item.name} className="w-11 h-11 rounded-lg object-cover shrink-0 bg-brand-sand" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <div className="flex-1 min-w-0">
                          <h5 className="font-display text-lg font-medium leading-tight text-brand-wine truncate">{item.name}</h5>
                          <p className="font-display text-base font-semibold text-brand-red">{formatKWD(item.price * qty)}</p>
                        </div>
                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-brand-gold/25 shrink-0">
                          <button onClick={() => removeFromOrder(id)} className="w-7 h-7 rounded-md bg-brand-cream text-brand-red flex items-center justify-center hover:bg-brand-red/10 active:scale-95"><Minus size={13} /></button>
                          <span className="font-semibold text-xs w-5 text-center">{qty}</span>
                          <button onClick={() => addToOrder(id)} className="btn btn-wine h-7 w-7 p-0"><Plus size={13} /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-brand-gold/15">
                        {editingNoteFor === id ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input
                              type="text"
                              placeholder="e.g. extra sauce, no nuts…"
                              value={itemNotes[id] || ''}
                              onChange={(e) => setItemNotes({ ...itemNotes, [id]: e.target.value })}
                              className="flex-1 bg-white text-xs px-2 py-1 rounded border border-brand-red/40 focus:outline-none"
                              autoFocus
                            />
                            <button onClick={() => setEditingNoteFor(null)} className="px-3 py-1 bg-brand-wine text-white font-medium rounded-full text-[10px] uppercase tracking-[0.14em]">Done</button>
                          </div>
                        ) : (
                          <>
                            <span className="text-brand-ink/50 truncate max-w-[180px]">{hasNote ? `Note: ${itemNotes[id]}` : 'No note'}</span>
                            <button onClick={() => setEditingNoteFor(id)} className="text-brand-red font-bold text-[10px] flex items-center gap-0.5 shrink-0">
                              <FileText size={10} /> {hasNote ? 'Edit' : 'Add note'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-brand-gold/20 shrink-0">
              {orderItemCount > 0 && (
                <div className="mb-3 flex items-center justify-between bg-brand-cream/60 p-2.5 rounded-xl border border-brand-gold/20">
                  <div className="flex items-center gap-2">
                    <Flame size={16} className={isPriorityRush ? 'text-brand-red' : 'text-brand-ink/40'} />
                    <span className="text-xs font-bold">Rush priority</span>
                  </div>
                  <button
                    onClick={() => setIsPriorityRush(!isPriorityRush)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-1 ${isPriorityRush ? 'bg-brand-wine' : 'bg-brand-ink/20'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isPriorityRush ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              )}
              <div className="space-y-1.5 mb-3 text-xs font-medium text-brand-ink/60">
                <div className="flex justify-between"><span>Subtotal</span><span className="text-brand-ink font-bold">{formatKWD(subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax (10%)</span><span className="text-brand-ink font-bold">{formatKWD(tax)}</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-brand-gold/20 text-base">
                  <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-brand-wine">Total</span>
                  <span className="font-display text-3xl font-semibold leading-none text-brand-red">{formatKWD(orderTotal)}</span>
                </div>
              </div>
              <button
                onClick={submitOrder}
                disabled={orderItemCount === 0}
                className="btn btn-wine w-full py-5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={18} /> Fire to Kitchen ({orderItemCount})
              </button>
              {canBill && activeTable !== 'standing' && (
                <button
                  onClick={() => setBillingSessionId(currentSessionId || null)}
                  className="btn btn-outline w-full mt-2 py-4"
                >
                  <Banknote size={18} /> Close Bill · Table {activeTable}
                </button>
              )}
            </div>
          </aside>
        </div>
        </>
        )}
      </div>

      {/* Mobile quick bar (menu tab, items selected) */}
      {orderItemCount > 0 && activeTab === 'menu' && (
        <div className="lg:hidden fixed bottom-20 left-3 right-3 bg-brand-wine text-white rounded-full border border-brand-gold/40 p-2.5 pl-3 shadow-xl shadow-black/30 flex items-center justify-between z-40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-gold-light/25 flex items-center justify-center font-display text-lg font-semibold">{orderItemCount}</div>
            <div>
              <p className="text-xs font-bold opacity-90">{activeLabel}</p>
              <p className="font-display text-xl font-semibold text-brand-gold-light leading-none">{formatKWD(orderTotal)}</p>
            </div>
          </div>
          <button onClick={() => setActiveTab('ticket')} className="btn btn-gold px-5 py-3 text-[10px]">
            Review <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* Billing modal */}
      {billingSessionId && (
        <BillingModal
          sessionOrders={sessionOrders}
          sessionId={billingSessionId}
          onClose={() => setBillingSessionId(null)}
          onConfirm={() => {
            billSession(billingSessionId);
            setBillingSessionId(null);
            triggerToast('Bill closed — table is now free');
            setActiveTab('tables');
          }}
        />
      )}

      {/* Section nav — floating on desktop, fixed bottom on mobile */}
      <nav className="fixed bottom-0 left-0 right-0 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:bottom-4 lg:rounded-full lg:shadow-xl lg:border lg:px-3 bg-[#4f070c]/95 backdrop-blur-md border-t border-brand-gold/30 lg:border-brand-gold/30 flex items-center justify-around lg:justify-center lg:gap-1 p-2.5 z-50 shadow-[0_-6px_24px_rgba(35,0,4,0.3)]">
        {([
          { key: 'tables', icon: Hash, label: 'Tables', badge: 0 },
          { key: 'menu', icon: Utensils, label: 'Menu', badge: 0 },
          { key: 'ticket', icon: Receipt, label: 'Ticket', badge: orderItemCount },
          { key: 'alerts', icon: Bell, label: 'Alerts', badge: activeWaiterCalls.length + readyOrders.length },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-full transition-all ${
              tab.key === 'ticket' ? 'lg:hidden ' : ''
            }${
              activeTab === tab.key ? 'text-brand-gold-light bg-white/10' : 'text-white/55 hover:text-white'
            }`}
          >
            <tab.icon size={20} />
            <span className="text-[9px] uppercase tracking-[0.2em] font-medium">{tab.label}</span>
            {tab.badge > 0 && (
              <span className="absolute -top-0.5 right-3 w-4 h-4 bg-brand-gold text-brand-wine text-[10px] font-semibold rounded-full flex items-center justify-center animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

function AlertsSection({
  title,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  icon: typeof Bell;
  emptyText: string;
  items: { id: string; title: string; subtitle: string; actionLabel: string; actionIcon?: typeof Check; onAction: () => void }[];
}) {
  return (
    <div className="bg-white rounded-[1.75rem] border border-brand-gold/25 shadow-[0_24px_50px_-34px_rgba(74,21,21,0.45)] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={20} className="text-brand-red" />
        <h3 className="font-display text-2xl font-medium leading-none text-brand-wine">{title}</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-[0.16em] bg-brand-red/10 text-brand-red rounded-full px-3 py-1.5">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-brand-ink/40 font-medium py-6 text-center">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 bg-brand-cream border border-brand-gold/40 rounded-2xl px-4 py-3.5">
              <div className="min-w-0">
                <p className="font-display text-xl font-semibold leading-tight text-brand-wine truncate">{item.title}</p>
                <p className="text-xs text-brand-ink/50 mt-0.5">{item.subtitle}</p>
              </div>
              <button
                onClick={item.onAction}
                className="btn shrink-0 bg-brand-green text-white px-5 py-3 text-[10px] hover:brightness-110"
              >
                {item.actionIcon ? <item.actionIcon size={15} /> : null} {item.actionLabel}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillingModal({
  sessionOrders,
  sessionId,
  onClose,
  onConfirm,
}: {
  sessionOrders: Order[];
  sessionId: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const grandTotal = sessionOrders.reduce((s, o) => s + o.total, 0);
  const grandSubtotal = sessionOrders.reduce((s, o) => s + o.subtotal, 0);
  const grandTax = sessionOrders.reduce((s, o) => s + o.tax, 0);
  const grandDiscount = sessionOrders.reduce((s, o) => s + (o.discount || 0), 0);
  const label = sessionOrders[0] ? orderLabel(sessionOrders[0]) : 'Session';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#2a0a0a]/45 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-brand-cream rounded-[2rem] border border-brand-gold/30 w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center"><Banknote size={20} /></div>
            <div>
              <h2 className="font-display text-3xl font-medium leading-none text-brand-wine">Close Bill</h2>
              <p className="text-xs text-brand-ink/50">{label} · {sessionOrders.length} ticket{sessionOrders.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-black/5"><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3 mb-5">
          {sessionOrders.map(o => (
            <div key={o.id} className="bg-white border border-brand-gold/25 rounded-2xl p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-brand-ink/50">#{o.id}</span>
                <span className="text-xs text-brand-ink/40">{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              {o.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm py-0.5">
                  <span className="truncate">{item.qty}× {item.name}</span>
                  <span className="font-bold shrink-0 ml-2">{formatKWD(item.price * item.qty)}</span>
                </div>
              ))}
              <div className="flex justify-between mt-1.5 pt-1.5 border-t border-brand-gold/15 text-sm font-bold">
                <span>Ticket total</span>
                <span className="text-brand-red">{formatKWD(o.total)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-brand-sand/60 rounded-2xl p-4 space-y-2 mb-5">
          <div className="flex justify-between text-sm"><span className="text-brand-ink/50">Subtotal</span><span className="font-bold">{formatKWD(grandSubtotal)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-brand-ink/50">Tax (10%)</span><span className="font-bold">{formatKWD(grandTax)}</span></div>
          {grandDiscount > 0 && (
            <div className="flex justify-between text-sm"><span className="text-brand-red font-bold">Discount</span><span className="text-brand-red font-semibold">−{formatKWD(grandDiscount)}</span></div>
          )}
          <div className="flex justify-between items-center pt-2 mt-1 border-t-2 border-black/10">
            <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-brand-wine">Grand Total</span>
            <span className="font-display text-4xl font-semibold leading-none text-brand-red">{formatKWD(grandTotal)}</span>
          </div>
        </div>

        <button
          onClick={onConfirm}
          className="btn w-full py-5 bg-brand-green text-white shadow-[0_14px_30px_-12px_rgba(63,143,58,0.7)] hover:brightness-110"
        >
          <Check size={20} /> Confirm Payment & Close
        </button>
      </div>
    </div>
  );
}
