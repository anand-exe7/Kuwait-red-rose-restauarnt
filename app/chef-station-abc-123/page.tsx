"use client";
import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ChefHat, CheckCircle, Clock, Flame, AlertTriangle, CircleDashed, Sparkles, PackageCheck } from 'lucide-react';
import { getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, updateOrderStatus, orderLabel } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';

export default function ChefDashboard() {
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'active' | 'history'>('active');
  // Two-step confirm before a ticket is sent to the waiter (marked ready).
  const [confirmReadyId, setConfirmReadyId] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());

  // Auto-cancel the "Are you sure?" prompt if the chef doesn't confirm quickly.
  useEffect(() => {
    if (!confirmReadyId) return;
    const t = setTimeout(() => setConfirmReadyId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmReadyId]);

  // Flash a toast whenever a brand new ticket lands, so the kitchen notices it without staring at the screen
  useEffect(() => {
    const freshTicket = orders.find(o => o.status === 'pending' && !knownIds.current.has(o.id));
    if (freshTicket && knownIds.current.size > 0) {
      setToastMessage(`New ticket — ${orderLabel(freshTicket)}`);
      const dismiss = setTimeout(() => setToastMessage(null), 3500);
      knownIds.current = new Set(orders.map(o => o.id));
      return () => clearTimeout(dismiss);
    }
    knownIds.current = new Set(orders.map(o => o.id));
  }, [orders]);

  // Keeps the "waiting X min" badges live without needing a full re-fetch
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = (id: string, newStatus: 'cooking' | 'ready') => {
    updateOrderStatus(id, newStatus);
  };

  const activeOrders = useMemo(() => {
    return orders
      .filter(o => o.status === 'pending' || o.status === 'cooking')
      .sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (a.priority !== 'high' && b.priority === 'high') return 1;
        return a.createdAt - b.createdAt;
      });
  }, [orders]);

  const readyOrders = useMemo(() => orders.filter(o => o.status === 'ready'), [orders]);
  const servedOrders = useMemo(
    () => orders.filter(o => o.status === 'served').sort((a, b) => b.createdAt - a.createdAt),
    [orders]
  );

  const waitMinutes = (createdAt: number) => Math.max(0, Math.floor((now - createdAt) / 60000));
  const waitColor = (mins: number) => (mins >= 20 ? 'text-red-400' : mins >= 10 ? 'text-brand-gold' : 'text-gray-400');

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-6 font-sans">
      {/* New Ticket Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-red-500 to-brand-red text-white px-6 py-3 rounded-full font-bold shadow-[0_10px_30px_rgba(239,68,68,0.4)] flex items-center gap-2 animate-bounce">
          <Sparkles size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="max-w-[1200px] mx-auto flex flex-col gap-4 sm:gap-6 lg:h-[calc(100vh-3rem)]">

        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between bg-[#111] p-4 sm:p-6 rounded-3xl sm:rounded-[2rem] border border-white/5 relative overflow-hidden shrink-0 gap-4">
          <div className="absolute top-0 right-1/4 w-[30%] h-full bg-brand-red/10 rounded-full blur-[100px] pointer-events-none" />

          <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-tr from-red-600 to-brand-red flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.3)] shrink-0">
              <ChefHat size={32} className="text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight">Active Orders</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-gray-400"><CircleDashed size={14} className="text-gray-400" /> {orders.filter(o => o.status === 'pending').length} Pending</span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-brand-red"><Flame size={14} /> {orders.filter(o => o.status === 'cooking').length} Cooking</span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-500"><PackageCheck size={14} /> {readyOrders.length} Ready for pickup</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto relative z-10 bg-[#1a1a1a] p-1.5 rounded-xl border border-white/5 flex gap-2">
            <button
              onClick={() => setView('active')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-black transition-colors ${view === 'active' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              All Orders
            </button>
            <button
              onClick={() => setView('history')}
              className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-bold transition-colors ${view === 'history' ? 'bg-white text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
            >
              History
            </button>
          </div>
        </header>

        {/* Ready for Pickup strip */}
        {view === 'active' && readyOrders.length > 0 && (
          <div className="shrink-0 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl p-3 flex items-center gap-3 overflow-x-auto no-scrollbar">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400 shrink-0 pl-2 flex items-center gap-1.5">
              <PackageCheck size={14} /> Waiting on waiter
            </span>
            {readyOrders.map(o => (
              <span key={o.id} className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold whitespace-nowrap">
                {orderLabel(o)} · #{o.id.split('-')[1]}
              </span>
            ))}
          </div>
        )}

        {/* History Feed */}
        {view === 'history' && (
          <div className="lg:flex-1 lg:overflow-y-auto custom-scrollbar lg:pr-2 pb-12">
            {servedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                <Clock size={64} className="opacity-20" />
                <h2 className="text-2xl font-black text-white/50">No served orders yet</h2>
                <p className="font-bold">Completed tickets will show up here once the waiter serves them.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {servedOrders.map(order => (
                  <div key={order.id} className="bg-[#111] rounded-2xl p-4 md:p-5 border border-white/5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-[#1a1a1a] flex flex-col items-center justify-center font-black text-sm shrink-0 border border-white/5 text-center leading-none px-1">
                      {order.mode === 'standing' ? (
                        <span className="text-[10px] uppercase tracking-wide">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="text-[10px] uppercase tracking-wide">To-go</span>
                      ) : (
                        <>
                          <span className="text-[9px] uppercase tracking-widest opacity-60 mb-0.5">Tbl</span>
                          <span className="text-lg">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white">Ticket #{order.id.split('-')[1]}</span>
                        {order.source === 'customer' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">Self-order</span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle size={10} /> Served
                        </span>
                      </div>
                      <p className="text-sm text-gray-400 mt-1 truncate">
                        {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-white">{formatKWD(order.total)}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Single Feed Grid */}
        {view === 'active' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
            {activeOrders.map(order => {
              const mins = waitMinutes(order.createdAt);
              return (
              <div key={order.id} className={`bg-[#111] rounded-[2rem] p-5 md:p-6 border relative overflow-hidden transition-all ${order.status === 'cooking' ? 'border-brand-red/30 shadow-[0_0_30px_rgba(176,30,40,0.1)]' : 'border-white/5'}`}>

                {/* Priority Indicator */}
                {order.priority === 'high' && (
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                )}

                {/* Top Row: Table and Meta */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center font-black shadow-inner text-center leading-none px-1 ${order.status === 'cooking' ? 'bg-brand-red text-white shadow-[0_0_15px_rgba(176,30,40,0.4)]' : order.priority === 'high' ? 'bg-red-500/20 text-red-500' : 'bg-[#222] text-white'}`}>
                      {order.mode === 'standing' ? (
                        <span className="text-xs uppercase tracking-wide">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="text-xs uppercase tracking-wide">To-go</span>
                      ) : (
                        <>
                          <span className="text-[10px] uppercase tracking-widest opacity-70 mb-0.5">Table</span>
                          <span className="text-2xl">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white flex items-center gap-2 flex-wrap">
                        Ticket #{order.id.split('-')[1]}
                        {order.source === 'customer' && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold uppercase tracking-wider">Self-order</span>
                        )}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`flex items-center gap-1 text-xs font-bold bg-white/5 px-2 py-1 rounded-md ${waitColor(mins)}`}>
                          <Clock size={12} /> {mins < 1 ? 'just now' : `${mins} min wait`}
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${order.status === 'cooking' ? 'bg-brand-red/20 text-brand-red' : 'bg-gray-500/20 text-gray-400'}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-3 mb-6 bg-[#1a1a1a] p-4 md:p-5 rounded-2xl border border-white/5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex gap-4 items-start border-b border-white/5 last:border-0 pb-3 last:pb-0">
                      <div className="w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center font-black text-brand-red shrink-0 border border-white/5">
                        {item.qty}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-black text-white md:text-lg leading-tight">{item.name}</p>
                        {item.notes && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-brand-gold bg-brand-gold/10 p-2 rounded-lg border border-brand-gold/20">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <p className="text-xs font-bold">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <div className="flex gap-3 mt-auto">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(order.id, 'cooking')}
                      className="flex-1 py-4 md:py-5 rounded-xl bg-[#222] hover:bg-brand-red text-white font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95 group border border-white/5 hover:border-brand-red"
                    >
                      <Flame size={20} className="group-hover:animate-pulse" /> Start Cooking
                    </button>
                  )}
                  {order.status === 'cooking' && (
                    confirmReadyId === order.id ? (
                      <button
                        onClick={() => { updateStatus(order.id, 'ready'); setConfirmReadyId(null); }}
                        className="flex-1 py-4 md:py-5 rounded-xl bg-green-600 hover:bg-green-500 text-white font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95 ring-2 ring-white/50 animate-pulse"
                      >
                        <AlertTriangle size={20} /> Are you sure? Send to waiter
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmReadyId(order.id)}
                        className="flex-1 py-4 md:py-5 rounded-xl bg-brand-red hover:bg-brand-red-dark text-white font-black text-base flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(176,30,40,0.4)] active:scale-95"
                      >
                        <CheckCircle size={20} /> Mark as Ready
                      </button>
                    )
                  )}
                </div>
              </div>
            );})}

            {activeOrders.length === 0 && (
               <div className="col-span-1 sm:col-span-2 xl:col-span-3 flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                 <CheckCircle size={64} className="opacity-20" />
                 <h2 className="text-2xl font-black text-white/50">All caught up!</h2>
                 <p className="font-bold">No active orders right now. New tickets from the customer or waiter app will show up here automatically.</p>
               </div>
            )}
          </div>
        </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
