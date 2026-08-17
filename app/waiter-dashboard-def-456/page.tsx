"use client";

import React, { useState, useMemo, useSyncExternalStore } from 'react';
import {
  Plus,
  Minus,
  Send,
  Clock,
  CheckCircle2,
  User,
  Hash,
  Coffee,
  Utensils,
  Bell,
  Search,
  X,
  Flame,
  Sparkles,
  ChevronRight,
  Check,
  Trash2,
  Receipt,
  FileText
} from 'lucide-react';
import { addOrder, updateOrderStatus, getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders } from '../lib/orderStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../lib/menuStore';
import { WaiterCall, resolveWaiterCall, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot, subscribeToWaiterCalls } from '../lib/waiterCallStore';

const TABLE_LIST = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function WaiterDashboard() {
  // State
  const [activeTable, setActiveTable] = useState<number>(1);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'ticket'>('menu');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isPriorityRush, setIsPriorityRush] = useState<boolean>(false);
  const [tableFilter, setTableFilter] = useState<'all' | 'occupied' | 'available'>('all');
  const [editingNoteFor, setEditingNoteFor] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Live orders, shared with the customer & chef pages (synced via localStorage across tabs)
  const placedOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);

  // Tables actively calling for a waiter (customer tapped "Call Waiter")
  const waiterCalls = useSyncExternalStore(subscribeToWaiterCalls, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot);
  const activeWaiterCalls = useMemo(() => waiterCalls.filter((c: WaiterCall) => !c.resolved), [waiterCalls]);
  const calledTables = useMemo(() => new Set(activeWaiterCalls.map(c => c.table)), [activeWaiterCalls]);

  // Live menu managed by the admin's Inventory tab — same source of truth for every role
  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const menu = useMemo(() => allMenuItems.filter(m => m.status === 'active'), [allMenuItems]);

  // Table occupancy derived from real active orders, not a hardcoded guess
  const tablesStatus = useMemo(() => {
    const status: Record<number, 'available' | 'occupied'> = {};
    for (const t of TABLE_LIST) status[t] = 'available';
    for (const o of placedOrders) {
      if (o.status !== 'served') status[o.table] = 'occupied';
    }
    return status;
  }, [placedOrders]);

  // Orders currently active for the table the waiter has selected
  const activeOrdersForActiveTable = useMemo(() => {
    return placedOrders.filter(o => o.table === activeTable && o.status !== 'served');
  }, [placedOrders, activeTable]);

  // Trigger Toast Notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Handlers for Order Modifiers
  const addToOrder = (id: string) => {
    setOrder(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  const removeFromOrder = (id: string) => {
    setOrder(prev => {
      const copy = { ...prev };
      if (copy[id] > 1) {
        copy[id]--;
      } else {
        delete copy[id];
        // Also remove note if quantity hits zero
        const noteCopy = { ...itemNotes };
        delete noteCopy[id];
        setItemNotes(noteCopy);
      }
      return copy;
    });
  };

  const clearOrder = () => {
    setOrder({});
    setItemNotes({});
    setIsPriorityRush(false);
    triggerToast(`Cleared order for Table ${activeTable}`);
  };

  // Submit Order — goes straight into the shared store, so it appears live on the chef's screen
  const submitOrder = () => {
    if (Object.keys(order).length === 0) return;

    const itemsList = Object.entries(order).map(([id, qty]) => {
      const item = menu.find(m => m.id === id);
      const note = itemNotes[id];
      return { id, name: item?.name || 'Item', price: item?.price || 0, qty, notes: note || undefined };
    });

    addOrder({
      table: activeTable,
      items: itemsList,
      priority: isPriorityRush ? 'high' : 'normal',
      subtotal,
      tax: tax + serviceCharge,
      total: orderTotal,
      source: 'waiter',
    });

    setOrder({});
    setItemNotes({});
    setIsPriorityRush(false);
    triggerToast(`⚡ Order sent to Kitchen for Table ${activeTable}!`);
    setActiveTab('tables'); // Switch view to track status
  };

  // Waiter can only serve orders once the kitchen marks them ready — cooking status is the chef's call
  const serveOrder = (ticketId: string) => {
    updateOrderStatus(ticketId, 'served');
    triggerToast(`Ticket ${ticketId} served — table cleared`);
  };

  // Filtered Menu Items
  const filteredMenu = useMemo(() => {
    return menu.filter(item => {
      const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, activeCategory, searchQuery]);

  // Order Totals
  const subtotal = Object.entries(order).reduce((acc, [id, qty]) => {
    const item = menu.find(m => m.id === id);
    return acc + (item?.price || 0) * qty;
  }, 0);

  const tax = subtotal * 0.10;
  const serviceCharge = subtotal * 0.05;
  const orderTotal = subtotal + tax + serviceCharge;

  const orderItemCount = useMemo(() => {
    return Object.values(order).reduce((a, b) => a + b, 0);
  }, [order]);

  return (
    <div className="min-h-screen bg-[#070709] text-gray-100 font-sans selection:bg-orange-500 selection:text-white pb-24 lg:pb-6">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-full font-bold shadow-[0_10px_30px_rgba(249,115,22,0.4)] flex items-center gap-2 animate-bounce">
          <Sparkles size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-[1700px] mx-auto p-3 sm:p-5 lg:p-6 lg:h-screen flex flex-col gap-4 lg:gap-6">

        {/* Waiter Call Alerts */}
        {activeWaiterCalls.length > 0 && (
          <div className="shrink-0 flex flex-col gap-2">
            {activeWaiterCalls.map(call => (
              <div key={call.id} className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/40 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
                    <Bell size={16} />
                  </div>
                  <div>
                    <p className="font-black text-white text-sm">Table {call.table} needs a waiter</p>
                    <p className="text-xs text-gray-400">{new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <button
                  onClick={() => resolveWaiterCall(call.id)}
                  className="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-black hover:bg-gray-200 transition-colors shrink-0"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Top Navbar */}
        <header className="bg-[#121216] border border-white/10 rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl shrink-0">
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.4)]">
                <Utensils size={24} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  QWAIT <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30">WAITER PRO</span>
                </h1>
                <p className="text-xs text-gray-400 font-medium">Floor Manager Mode • Station 2</p>
              </div>
            </div>

            {/* Mobile Shift Tag */}
            <div className="md:hidden flex items-center gap-2 bg-[#1a1a20] px-3 py-1.5 rounded-xl border border-white/5">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-gray-300">Tbl {activeTable}</span>
            </div>
          </div>

          {/* Quick Search & Waiter Stats Bar */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dishes, drinks..."
                className="w-full bg-[#18181f] text-sm text-white placeholder-gray-500 rounded-xl pl-10 pr-9 py-2.5 border border-white/10 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-3 bg-[#18181f] p-1.5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg">
                <User size={16} className="text-orange-400" />
                <span className="text-xs font-bold text-gray-200">Alex W.</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-emerald-400 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live Sync
              </div>
            </div>
          </div>
        </header>

        {/* Main Dashboard Layout */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 lg:gap-6 min-h-0 overflow-hidden">
          
          {/* ================= LEFT SIDEBAR: TABLES & ACTIVE TICKETS ================= */}
          <aside className={`w-full lg:w-80 flex flex-col gap-4 lg:gap-6 overflow-y-auto lg:overflow-hidden ${activeTab !== 'tables' ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Table Selection Box */}
            <div className="bg-[#121216] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 shadow-xl flex flex-col shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Hash size={14} className="text-orange-400" /> Floor Tables
                </h3>
                
                {/* Table Filter Tabs */}
                <div className="flex gap-1 bg-[#18181f] p-1 rounded-lg border border-white/5">
                  <button 
                    onClick={() => setTableFilter('all')} 
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${tableFilter === 'all' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    All
                  </button>
                  <button 
                    onClick={() => setTableFilter('occupied')} 
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${tableFilter === 'occupied' ? 'bg-orange-500 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    Occupied
                  </button>
                </div>
              </div>

              {/* Table Grid */}
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2.5 max-h-56 lg:max-h-none overflow-y-auto pr-1">
                {TABLE_LIST
                  .filter(t => {
                    if (tableFilter === 'occupied') return tablesStatus[t] === 'occupied';
                    return true;
                  })
                  .map(t => {
                    const status = tablesStatus[t] || 'available';
                    const isSelected = activeTable === t;
                    const activeCount = placedOrders.filter(o => o.table === t && o.status !== 'served').length;
                    const hasReady = placedOrders.some(o => o.table === t && o.status === 'ready');
                    const isCalling = calledTables.has(t);

                    return (
                      <button
                        key={t}
                        onClick={() => {
                          setActiveTable(t);
                          setActiveTab('menu');
                          triggerToast(`Switched to Table ${t}`);
                        }}
                        className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-200 font-black text-sm relative group border ${
                          isSelected
                            ? 'bg-gradient-to-b from-orange-500 to-amber-600 text-white border-orange-400 shadow-[0_0_20px_rgba(249,115,22,0.5)] scale-105 z-10'
                            : isCalling
                            ? 'bg-[#241416] text-red-200 border-red-500/50 hover:border-red-500/70 animate-pulse'
                            : hasReady
                            ? 'bg-[#122019] text-emerald-200 border-emerald-500/40 hover:border-emerald-500/70'
                            : status === 'occupied'
                            ? 'bg-[#1e1b18] text-orange-200 border-orange-500/30 hover:border-orange-500/60'
                            : 'bg-[#18181f] text-gray-300 border-white/5 hover:bg-[#22222a] hover:border-white/20'
                        }`}
                      >
                        <span className="text-xs font-bold text-white/70">TBL</span>
                        <span className="text-lg leading-none">{t}</span>

                        {isCalling && (
                          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center border border-white/20">
                            <Bell size={11} />
                          </span>
                        )}

                        {activeCount > 0 && (
                          <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-black text-white text-[10px] font-black flex items-center justify-center border border-white/20">
                            {activeCount}
                          </span>
                        )}

                        {/* Status Pill Indicator */}
                        <span className={`w-2 h-2 rounded-full absolute top-2 right-2 ${
                          isSelected ? 'bg-white shadow-[0_0_8px_white]' :
                          hasReady ? 'bg-emerald-400 animate-pulse' :
                          status === 'occupied' ? 'bg-orange-500' : 'bg-emerald-500'
                        }`} />
                      </button>
                    );
                })}
              </div>
            </div>

            {/* Active Tickets Feed */}
            <div className="bg-[#121216] rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-white/10 shadow-xl flex-1 flex flex-col overflow-hidden min-h-[300px]">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-orange-400 animate-bounce" />
                  <h3 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Kitchen Live Feed</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[11px] font-black border border-orange-500/20">
                  {placedOrders.filter(o => o.status !== 'served').length} Active
                </span>
              </div>

              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
                {placedOrders.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-6 text-center">
                    <Coffee size={40} className="opacity-30 mb-2" />
                    <p className="text-xs font-semibold">No active kitchen tickets</p>
                  </div>
                ) : (
                  placedOrders.map((ticket) => (
                    <div
                      key={ticket.id}
                      className={`p-3.5 rounded-2xl bg-[#18181f] border transition-all duration-200 ${
                        ticket.status === 'ready'
                          ? 'border-emerald-500/50 bg-emerald-950/10 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                          : ticket.status === 'served'
                          ? 'border-white/5 opacity-50'
                          : 'border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-white text-base">Table {ticket.table}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-gray-400 font-mono">{ticket.id}</span>
                            {ticket.source === 'customer' && (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">Self-order</span>
                            )}
                          </div>
                          <span className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock size={12} /> {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {ticket.priority === 'high' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                            <Flame size={10} /> RUSH
                          </span>
                        )}
                      </div>

                      {/* Items list summary */}
                      <div className="text-xs text-gray-300 space-y-1 mb-3 bg-[#121216] p-2 rounded-xl border border-white/5">
                        {ticket.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span className="truncate font-medium">{item.name}{item.notes ? ` (${item.notes})` : ''}</span>
                            <span className="font-bold text-orange-400 ml-2">x{item.qty}</span>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons on ticket */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          ticket.status === 'ready'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : ticket.status === 'served'
                            ? 'bg-gray-500/20 text-gray-400 border border-gray-500/20'
                            : ticket.status === 'cooking'
                            ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            : 'bg-white/5 text-gray-400 border border-white/10'
                        }`}>
                          {ticket.status === 'ready' ? <CheckCircle2 size={12} /> : <Coffee size={12} />}
                          {ticket.status === 'pending' ? 'waiting on kitchen' : ticket.status}
                        </span>

                        {ticket.status === 'ready' && (
                          <button
                            onClick={() => serveOrder(ticket.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1 shadow-lg hover:bg-emerald-600"
                          >
                            <Check size={12} /> Serve Now
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* ================= MIDDLE PANEL: INTERACTIVE MENU & DISHES ================= */}
          <main className={`flex-1 bg-[#121216] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/10 flex flex-col relative overflow-hidden shadow-xl ${activeTab !== 'menu' ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Category Pills Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6 pb-3 border-b border-white/5 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Menu Selection</h2>
                <span className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-400 font-bold">
                  Table {activeTable}
                </span>
                {activeOrdersForActiveTable.length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-bold flex items-center gap-1.5">
                    <Bell size={12} />
                    {activeOrdersForActiveTable.length} order{activeOrdersForActiveTable.length > 1 ? 's' : ''} already in •
                    ${activeOrdersForActiveTable.reduce((sum, o) => sum + o.total, 0).toFixed(2)}
                  </span>
                )}
              </div>

              {/* Functional Category Filter Buttons */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                {['All', 'Starters', 'Mains', 'Desserts', 'Drinks'].map((cat) => {
                  const isActive = activeCategory === cat;
                  const count = cat === 'All' ? menu.length : menu.filter(m => m.category === cat).length;

                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap flex items-center gap-2 border ${
                        isActive 
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-400 shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-105' 
                          : 'bg-[#18181f] text-gray-400 hover:text-white hover:bg-[#22222a] border-white/5'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${isActive ? 'bg-white/30 text-white' : 'bg-white/5 text-gray-500'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Menu Dish Cards Grid */}
            <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
              {filteredMenu.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-500 py-12">
                  <Search size={48} className="opacity-20 mb-3" />
                  <p className="font-bold text-sm">No menu items found</p>
                  <p className="text-xs text-gray-600 mt-1">Try clearing your search query or switching categories</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
                  {filteredMenu.map((item) => {
                    const currentQty = order[item.id] || 0;

                    return (
                      <div 
                        key={item.id} 
                        className={`bg-[#18181f] rounded-2xl sm:rounded-3xl p-3.5 border transition-all duration-300 flex flex-col justify-between group hover:shadow-[0_10px_25px_rgba(0,0,0,0.5)] ${
                          currentQty > 0 
                            ? 'border-orange-500/50 bg-[#1c1a17]' 
                            : 'border-white/5 hover:border-orange-500/30'
                        }`}
                      >
                        <div>
                          {/* Dish Image Container */}
                          <div className="w-full h-36 sm:h-40 rounded-2xl overflow-hidden relative mb-3 bg-[#22222a]">
                            <img 
                              src={item.image} 
                              alt={item.name} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              onError={(e) => {
                                // Fallback image handling
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                            {/* Dark Gradient Overlay for readability */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                            {/* Price Tag Badge */}
                            <div className="absolute top-2.5 left-2.5 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 font-black text-xs text-amber-400">
                              ${item.price}
                            </div>

                            {/* Prep Time Badge */}
                            <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-bold text-gray-300 flex items-center gap-1">
                              <Clock size={10} /> {item.prepTime}
                            </div>

                            {/* Item Attribute Badges */}
                            <div className="absolute bottom-2 left-2.5 flex items-center gap-1.5">
                              {item.isChefSpecial && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-500/80 backdrop-blur-md text-[9px] font-black text-black uppercase tracking-wider">
                                  Chef Special
                                </span>
                              )}
                              {item.isPopular && (
                                <span className="px-2 py-0.5 rounded-md bg-orange-500/80 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-wider">
                                  Popular
                                </span>
                              )}
                              {item.isSpicy && (
                                <span className="px-2 py-0.5 rounded-md bg-red-500/80 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-wider">
                                  Spicy 🔥
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Dish Info */}
                          <div className="mb-3 px-1">
                            <h4 className="font-bold text-white text-base sm:text-lg leading-snug group-hover:text-orange-400 transition-colors">
                              {item.name}
                            </h4>
                            <p className="text-xs text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        {/* Action Buttons Area - Responsive Stepper */}
                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-400">
                            {currentQty > 0 ? `${currentQty} selected` : 'Not in order'}
                          </span>

                          {currentQty > 0 ? (
                            <div className="flex items-center gap-2 bg-[#121216] p-1 rounded-full border border-orange-500/40">
                              <button 
                                onClick={() => removeFromOrder(item.id)}
                                className="w-8 h-8 rounded-full bg-[#22222a] hover:bg-red-500/20 text-gray-300 hover:text-red-400 flex items-center justify-center transition-all active:scale-95"
                                aria-label="Decrease quantity"
                              >
                                <Minus size={16} />
                              </button>
                              <span className="font-black text-sm w-6 text-center text-orange-400">
                                {currentQty}
                              </span>
                              <button 
                                onClick={() => addToOrder(item.id)}
                                className="w-8 h-8 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-md"
                                aria-label="Increase quantity"
                              >
                                <Plus size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToOrder(item.id)}
                              className="px-4 py-2 rounded-xl bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white font-bold text-xs sm:text-sm flex items-center gap-2 border border-orange-500/30 transition-all duration-200 active:scale-95 shadow-sm"
                            >
                              <Plus size={16} /> Add to Ticket
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

          {/* ================= RIGHT SIDEBAR: CURRENT ORDER TICKET ================= */}
          <aside className={`w-full lg:w-96 bg-[#121216] rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/10 flex flex-col relative overflow-hidden shadow-xl ${activeTab !== 'ticket' ? 'hidden lg:flex' : 'flex'}`}>
            
            {/* Header info */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center border border-orange-500/30">
                  <Receipt size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-white">Live Ticket</h2>
                  <p className="text-xs text-gray-400">Station 2 Waiter Desk</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full text-xs font-black shadow-md">
                  Table {activeTable}
                </span>
                {orderItemCount > 0 && (
                  <button 
                    onClick={clearOrder}
                    title="Clear Order"
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Selected Items Scroll List */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar min-h-[220px]">
              {Object.keys(order).length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center border-2 border-dashed border-white/5 rounded-2xl">
                  <Utensils size={44} className="opacity-20 mb-3" />
                  <p className="font-bold text-sm text-gray-400">No items in ticket</p>
                  <p className="text-xs text-gray-600 mt-1 max-w-[200px]">Tap &quot;+ Add to Ticket&quot; on any dish from the menu panel</p>
                </div>
              ) : (
                Object.entries(order).map(([id, qty]) => {
                  const item = menu.find(m => m.id === id);
                  if (!item) return null;

                  const hasNote = Boolean(itemNotes[id]);

                  return (
                    <div key={id} className="bg-[#18181f] p-3 rounded-2xl border border-white/5 flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          className="w-12 h-12 rounded-xl object-cover shrink-0 bg-[#22222a]"
                          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                        />

                        <div className="flex-1 min-w-0">
                          <h5 className="font-bold text-sm text-white truncate">{item.name}</h5>
                          <p className="text-orange-400 font-black text-xs mt-0.5">
                            ${(item.price * qty).toFixed(2)} 
                            <span className="text-gray-500 font-normal text-[11px] ml-1">(${item.price} each)</span>
                          </p>
                        </div>

                        {/* Touch-Friendly Stepper Buttons */}
                        <div className="flex items-center gap-1.5 bg-[#121216] p-1 rounded-xl border border-white/10 shrink-0">
                          <button 
                            onClick={() => removeFromOrder(id)}
                            className="w-7 h-7 rounded-lg bg-[#22222a] hover:bg-red-500/20 text-gray-300 hover:text-red-400 flex items-center justify-center transition-all active:scale-95"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="font-black text-xs w-5 text-center text-white">{qty}</span>
                          <button 
                            onClick={() => addToOrder(id)}
                            className="w-7 h-7 rounded-lg bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-all active:scale-95"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Custom Kitchen Note Input Trigger */}
                      <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                        {editingNoteFor === id ? (
                          <div className="flex items-center gap-1.5 w-full">
                            <input 
                              type="text"
                              placeholder="e.g. Extra sauce, no onions..."
                              value={itemNotes[id] || ''}
                              onChange={(e) => setItemNotes({ ...itemNotes, [id]: e.target.value })}
                              className="flex-1 bg-[#121216] text-white text-xs px-2 py-1 rounded border border-orange-500/50 focus:outline-none"
                              autoFocus
                            />
                            <button 
                              onClick={() => setEditingNoteFor(null)} 
                              className="px-2 py-1 bg-orange-500 text-white font-bold rounded text-[10px]"
                            >
                              Done
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="text-gray-400 truncate max-w-[200px]">
                              {hasNote ? `Note: "${itemNotes[id]}"` : 'No custom note'}
                            </span>
                            <button 
                              onClick={() => setEditingNoteFor(id)}
                              className="text-orange-400 hover:underline font-semibold text-[10px] flex items-center gap-0.5"
                            >
                              <FileText size={10} /> {hasNote ? 'Edit note' : '+ Add note'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Bill Breakdown & Submit Button */}
            <div className="mt-4 pt-4 border-t border-white/10 shrink-0">
              
              {/* Priority Toggle */}
              {orderItemCount > 0 && (
                <div className="mb-4 flex items-center justify-between bg-[#18181f] p-2.5 rounded-xl border border-white/5">
                  <div className="flex items-center gap-2">
                    <Flame size={16} className={isPriorityRush ? 'text-red-400 animate-pulse' : 'text-gray-500'} />
                    <span className="text-xs font-bold text-gray-300">Rush Order Priority</span>
                  </div>
                  <button
                    onClick={() => setIsPriorityRush(!isPriorityRush)}
                    className={`w-11 h-6 rounded-full transition-colors relative p-1 ${isPriorityRush ? 'bg-red-500' : 'bg-gray-700'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isPriorityRush ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              )}

              {/* Price Calculations */}
              <div className="space-y-2 mb-4 text-xs font-medium text-gray-400">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="text-gray-200">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax (10%)</span>
                  <span className="text-gray-200">${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service Fee (5%)</span>
                  <span className="text-gray-200">${serviceCharge.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/10 text-base">
                  <span className="font-black text-white">Total</span>
                  <span className="font-black text-xl text-orange-400">${orderTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Submit Button */}
              <button 
                onClick={submitOrder}
                disabled={orderItemCount === 0}
                className="w-full py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-base sm:text-lg flex items-center justify-center gap-2.5 hover:from-orange-600 hover:to-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_25px_rgba(249,115,22,0.4)] active:scale-[0.98]"
              >
                <Send size={20} />
                <span>Fire Order to Kitchen ({orderItemCount})</span>
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Mobile Bottom Quick Drawer (When in Menu tab with items selected) */}
      {orderItemCount > 0 && activeTab === 'menu' && (
        <div className="lg:hidden fixed bottom-16 left-3 right-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl p-3.5 shadow-[0_10px_30px_rgba(249,115,22,0.5)] flex items-center justify-between z-40 animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-black/20 flex items-center justify-center font-black">
              {orderItemCount}
            </div>
            <div>
              <p className="text-xs font-bold opacity-90">Table {activeTable} Order</p>
              <p className="text-base font-black">${orderTotal.toFixed(2)}</p>
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('ticket')}
            className="px-4 py-2 bg-black/80 hover:bg-black text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all"
          >
            Review Ticket <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Mobile/Tablet Bottom Navigation Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0e0e12]/95 backdrop-blur-2xl border-t border-white/10 flex items-center justify-around p-2.5 z-50 shadow-2xl">
        <button 
          onClick={() => setActiveTab('tables')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all ${
            activeTab === 'tables' ? 'text-orange-400 bg-orange-500/10 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Hash size={20} />
          <span className="text-[10px] uppercase tracking-wider font-semibold">Tables</span>
        </button>

        <button 
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all ${
            activeTab === 'menu' ? 'text-orange-400 bg-orange-500/10 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Utensils size={20} />
          <span className="text-[10px] uppercase tracking-wider font-semibold">Menu</span>
        </button>

        <button 
          onClick={() => setActiveTab('ticket')}
          className={`flex flex-col items-center gap-1 px-4 py-1.5 rounded-xl transition-all relative ${
            activeTab === 'ticket' ? 'text-orange-400 bg-orange-500/10 font-bold' : 'text-gray-400 hover:text-white'
          }`}
        >
          <Receipt size={20} />
          <span className="text-[10px] uppercase tracking-wider font-semibold">Ticket</span>
          {orderItemCount > 0 && (
            <span className="absolute -top-1 right-2 w-4 h-4 bg-orange-500 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-pulse">
              {orderItemCount}
            </span>
          )}
        </button>
      </nav>

      {/* Custom Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; height: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #262630; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f50; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
