"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { ChefHat, CheckCircle, Clock, Flame, AlertTriangle, CircleDashed, Sparkles, PackageCheck, Volume2, VolumeX } from 'lucide-react';
import { getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, updateOrderStatus, orderLabel } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { Pagination, usePagination } from '../components/Pagination';
import { landingFonts } from '../fonts';
import BrandMark from '../components/BrandMark';
import { playChime, primeAudioOnFirstInteraction } from '../lib/sound';

export default function ChefDashboard() {
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'active' | 'history'>('active');
  const [muted, setMuted] = useState<boolean>(false);
  // Two-step confirm before a ticket is sent to the waiter (marked ready).
  const [confirmReadyId, setConfirmReadyId] = useState<string | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  const chime = useCallback(() => playChime(audioCtxRef, muted), [muted]);
  useEffect(() => primeAudioOnFirstInteraction(audioCtxRef), []);

  // Auto-cancel the "Are you sure?" prompt if the chef doesn't confirm quickly.
  useEffect(() => {
    if (!confirmReadyId) return;
    const t = setTimeout(() => setConfirmReadyId(null), 4000);
    return () => clearTimeout(t);
  }, [confirmReadyId]);

  // Flash a toast + chime whenever a brand new ticket lands, so the kitchen notices it without staring at the screen
  useEffect(() => {
    const freshTicket = orders.find(o => o.status === 'pending' && !knownIds.current.has(o.id));
    if (freshTicket && knownIds.current.size > 0) {
      setToastMessage(`New ticket — ${orderLabel(freshTicket)}`);
      chime();
      const dismiss = setTimeout(() => setToastMessage(null), 3500);
      knownIds.current = new Set(orders.map(o => o.id));
      return () => clearTimeout(dismiss);
    }
    knownIds.current = new Set(orders.map(o => o.id));
  }, [orders, chime]);

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

  const historyPager = usePagination(servedOrders, 15);

  const waitMinutes = (createdAt: number) => Math.max(0, Math.floor((now - createdAt) / 60000));
  const waitColor = (mins: number) => (mins >= 20 ? 'text-brand-red' : mins >= 10 ? 'text-brand-gold-dark' : 'text-brand-ink/55');

  return (
    <div className={`landing ${landingFonts} relative min-h-screen overflow-x-clip bg-brand-red p-3 font-body text-white sm:p-5 md:p-6`}>
      {/* The landing page's red stage, fixed behind the tickets */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ backgroundImage: 'linear-gradient(172deg, #b81a27 0%, #9d1420 28%, #7c0e19 64%, #5f070f 100%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ background: 'radial-gradient(70% 45% at 50% 0%, rgba(255,120,132,0.28) 0%, transparent 70%)' }}
      />
      <div aria-hidden className="grain pointer-events-none fixed inset-0 opacity-[0.055] mix-blend-overlay" />


      {/* New Ticket Toast */}
      {toastMessage && (
        <div className="btn btn-gold fixed left-1/2 top-5 z-50 -translate-x-1/2 animate-bounce">
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-4 sm:gap-6">

        {/* Header — the landing nav island */}
        <header className="flex shrink-0 flex-col items-center justify-between gap-4 rounded-[2rem] border border-brand-gold/25 bg-[#4f070c]/90 p-3 shadow-[0_18px_44px_-12px_rgba(35,0,4,0.6)] backdrop-blur-md sm:p-4 md:flex-row md:rounded-full md:py-3 md:pl-4 md:pr-3">
          <div className="flex w-full items-center gap-4 md:w-auto md:gap-6">
            <BrandMark sub="Chef Station" />
            <div className="hidden h-9 w-px bg-brand-gold/30 md:block" />
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 font-display text-2xl font-medium leading-none text-white sm:text-3xl">
                <ChefHat size={20} className="text-brand-gold-light" /> Active <em className="font-normal text-brand-gold-light">orders</em>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-[10px] font-medium uppercase tracking-[0.2em]">
                <span className="flex items-center gap-1.5 text-white/70"><CircleDashed size={13} /> {orders.filter(o => o.status === 'pending').length} Pending</span>
                <span className="flex items-center gap-1.5 text-brand-gold-light"><Flame size={13} /> {orders.filter(o => o.status === 'cooking').length} Cooking</span>
                <span className="flex items-center gap-1.5 text-green-300"><PackageCheck size={13} /> {readyOrders.length} Ready</span>
              </div>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 md:w-auto">
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Sound alerts off — tap to enable' : 'Sound alerts on — tap to mute'}
              className={`btn h-11 w-11 shrink-0 p-0 ${muted ? 'text-white/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] hover:text-white' : 'btn-outline-light'}`}
            >
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <div className="flex flex-1 gap-1 rounded-full border border-brand-gold/30 p-1 md:flex-none">
              <button
                onClick={() => setView('active')}
                className={`btn flex-1 px-6 py-3 text-[10px] md:flex-none ${view === 'active' ? 'btn-gold' : 'text-white/70 hover:text-white'}`}
              >
                All Orders
              </button>
              <button
                onClick={() => setView('history')}
                className={`btn flex-1 px-6 py-3 text-[10px] md:flex-none ${view === 'history' ? 'btn-gold' : 'text-white/70 hover:text-white'}`}
              >
                History
              </button>
            </div>
          </div>
        </header>

        {/* Ready for Pickup strip */}
        {view === 'active' && readyOrders.length > 0 && (
          <div className="no-scrollbar flex shrink-0 items-center gap-3 overflow-x-auto rounded-full border border-brand-gold/30 bg-[#4f070c]/60 p-2.5 backdrop-blur-sm">
            <span className="flex shrink-0 items-center gap-2 pl-3 font-body text-[10px] font-medium uppercase tracking-[0.24em] text-brand-gold-light">
              <PackageCheck size={14} /> Waiting on waiter
            </span>
            {readyOrders.map(o => (
              <span key={o.id} className="shrink-0 whitespace-nowrap rounded-full bg-brand-cream px-4 py-2 font-body text-xs font-medium text-brand-wine">
                {orderLabel(o)} · #{o.id.split('-')[1]}
              </span>
            ))}
          </div>
        )}

        {/* History Feed */}
        {view === 'history' && (
          <div className="pb-6">
            {servedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-white/70">
                <Clock size={56} strokeWidth={1.2} className="opacity-50" />
                <h2 className="font-display text-4xl font-medium italic text-white">No served orders yet</h2>
                <p className="font-body text-sm font-light">Completed tickets will show up here once the waiter serves them.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {historyPager.items.map(order => (
                  <div key={order.id} className="flex flex-col gap-4 rounded-[1.75rem] border border-brand-gold/40 bg-brand-cream p-4 text-brand-ink shadow-[0_24px_50px_-32px_rgba(30,0,4,0.7)] sm:flex-row sm:items-center md:p-5">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-brand-wine px-1 text-center leading-none text-brand-gold-light ring-1 ring-brand-gold/60">
                      {order.mode === 'standing' ? (
                        <span className="font-body text-[10px] font-medium uppercase tracking-[0.14em]">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="font-body text-[10px] font-medium uppercase tracking-[0.14em]">To-go</span>
                      ) : order.mode === 'delivery' ? (
                        <span className="font-body text-[10px] font-medium uppercase tracking-[0.14em]">Deliv</span>
                      ) : (
                        <>
                          <span className="mb-0.5 font-body text-[8px] font-medium uppercase tracking-[0.2em] opacity-70">Tbl</span>
                          <span className="font-display text-2xl font-semibold">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-xl font-semibold text-brand-wine">Ticket #{order.id.split('-')[1]}</span>
                        {order.source === 'customer' && (
                          <span className="rounded-full bg-brand-plum/10 px-2.5 py-1 font-body text-[9px] font-medium uppercase tracking-[0.18em] text-brand-plum">Self-order</span>
                        )}
                        <span className="flex items-center gap-1 rounded-full bg-brand-green/10 px-2.5 py-1 font-body text-[9px] font-medium uppercase tracking-[0.18em] text-brand-green">
                          <CheckCircle size={10} /> Served
                        </span>
                        {order.mode === 'standing' && order.standingLabel && (
                          <span className="font-body text-xs font-medium text-brand-gold-dark">{orderLabel(order)}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate font-body text-sm font-light text-brand-ink/65">
                        {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-2xl font-semibold text-brand-red">{formatKWD(order.total)}</p>
                      <p className="font-body text-xs font-light text-brand-ink/50">{new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
                <Pagination p={historyPager} label="served orders" dark />
              </div>
            )}
          </div>
        )}

        {/* Single Feed Grid */}
        {view === 'active' && (
        <div className="pb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {activeOrders.map(order => {
              const mins = waitMinutes(order.createdAt);
              return (
              <div key={order.id} className={`relative flex flex-col overflow-hidden rounded-[2rem] border bg-brand-cream p-5 text-brand-ink shadow-[0_28px_56px_-30px_rgba(30,0,4,0.75)] transition-all md:p-6 ${order.status === 'cooking' ? 'border-brand-gold ring-1 ring-brand-gold/70' : 'border-brand-gold/40'}`}>

                {/* Priority Indicator */}
                {order.priority === 'high' && (
                  <div className="absolute left-0 top-0 h-1.5 w-full bg-gradient-to-r from-brand-red via-brand-gold to-brand-red" />
                )}

                {/* Top Row: Table and Meta */}
                <div className="mb-5 flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full px-1 text-center leading-none ring-1 ring-brand-gold/60 md:h-[72px] md:w-[72px] ${order.status === 'cooking' ? 'bg-brand-red text-white' : 'bg-brand-wine text-brand-gold-light'}`}>
                      {order.mode === 'standing' ? (
                        <span className="font-body text-xs font-medium uppercase tracking-[0.14em]">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="font-body text-xs font-medium uppercase tracking-[0.14em]">To-go</span>
                      ) : order.mode === 'delivery' ? (
                        <span className="font-body text-xs font-medium uppercase tracking-[0.14em]">Deliv</span>
                      ) : (
                        <>
                          <span className="mb-0.5 font-body text-[9px] font-medium uppercase tracking-[0.2em] opacity-75">Table</span>
                          <span className="font-display text-3xl font-semibold">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold leading-none text-brand-wine">
                        Ticket #{order.id.split('-')[1]}
                        {order.source === 'customer' && (
                          <span className="rounded-full bg-brand-plum/10 px-2.5 py-1 font-body text-[9px] font-medium uppercase tracking-[0.18em] text-brand-plum">Self-order</span>
                        )}
                      </h3>
                      {order.mode === 'standing' && order.standingLabel && (
                        <p className="mt-1 font-body text-sm font-medium text-brand-gold-dark">{orderLabel(order)}</p>
                      )}
                      {(order.mode === 'delivery' || order.mode === 'takeaway') && order.customer && (
                        <p className="mt-1 font-body text-sm font-medium text-brand-gold-dark">
                          {order.customer.name || 'Customer'}{order.customer.phone ? ` · ${order.customer.phone}` : ''}
                        </p>
                      )}
                      {order.mode === 'delivery' && order.deliveryAddress && (
                        <p className="mt-0.5 font-body text-xs leading-relaxed text-brand-ink/60">
                          {[
                            order.deliveryAddress.governorate,
                            order.deliveryAddress.area,
                            order.deliveryAddress.street && `St ${order.deliveryAddress.street}`,
                            order.deliveryAddress.building && `Bldg ${order.deliveryAddress.building}`,
                            order.deliveryAddress.floor && `Fl ${order.deliveryAddress.floor}`,
                            order.deliveryAddress.apartment && `Apt ${order.deliveryAddress.apartment}`,
                          ].filter(Boolean).join(' · ')}
                          {order.deliveryAddress.landmark && <> — <em className="not-italic text-brand-ink/50">{order.deliveryAddress.landmark}</em></>}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`flex items-center gap-1 rounded-full bg-white px-2.5 py-1 font-body text-[11px] font-medium ${waitColor(mins)}`}>
                          <Clock size={12} /> {mins < 1 ? 'just now' : `${mins} min wait`}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 font-body text-[9px] font-medium uppercase tracking-[0.2em] ${order.status === 'cooking' ? 'bg-brand-red/10 text-brand-red' : 'bg-brand-ink/5 text-brand-ink/55'}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="mb-5 flex-1 space-y-3 rounded-[1.5rem] border border-brand-gold/25 bg-white p-4 md:p-5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-4 border-b border-brand-gold/20 pb-3 last:border-0 last:pb-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-gold/50 bg-brand-cream font-display text-xl font-semibold text-brand-red">
                        {item.qty}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-display text-xl font-medium leading-tight text-brand-wine md:text-2xl">{item.name}</p>
                        {item.notes && (
                          <div className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-brand-gold/40 bg-brand-gold-light/30 p-2 text-brand-wine">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <p className="font-body text-xs font-medium">{item.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Button */}
                <div className="mt-auto flex gap-3">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => updateStatus(order.id, 'cooking')}
                      className="btn btn-wine group flex-1 py-5"
                    >
                      <Flame size={17} className="group-hover:animate-pulse" /> Start Cooking
                    </button>
                  )}
                  {order.status === 'cooking' && (
                    confirmReadyId === order.id ? (
                      <button
                        onClick={() => { updateStatus(order.id, 'ready'); setConfirmReadyId(null); }}
                        className="btn flex-1 animate-pulse bg-brand-green py-5 text-white shadow-[0_14px_30px_-12px_rgba(63,143,58,0.7)] hover:brightness-110"
                      >
                        <AlertTriangle size={17} /> Are you sure? Send to waiter
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmReadyId(order.id)}
                        className="btn btn-red flex-1 py-5"
                      >
                        <CheckCircle size={17} /> Mark as Ready
                      </button>
                    )
                  )}
                </div>
              </div>
            );})}

            {activeOrders.length === 0 && (
               <div className="col-span-1 flex flex-col items-center justify-center gap-4 py-20 text-center text-white/70 sm:col-span-2 xl:col-span-3">
                 <CheckCircle size={56} strokeWidth={1.2} className="opacity-50" />
                 <h2 className="font-display text-4xl font-medium italic text-white md:text-5xl">All caught up!</h2>
                 <p className="max-w-md font-body text-sm font-light">No active orders right now. New tickets from the customer or waiter app will show up here automatically.</p>
               </div>
            )}
          </div>
        </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
