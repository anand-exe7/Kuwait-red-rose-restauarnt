"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } from 'react';
import { ChefHat, CheckCircle, Clock, Flame, AlertTriangle, CircleDashed, Sparkles, PackageCheck, Volume2, VolumeX } from 'lucide-react';
import { getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, updateOrderStatus, orderLabel, type Order } from '../lib/orderStore';
import { resolveOrderNo } from '../lib/invoice';
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
  /* A home order looks different on the pass, because it IS different: nobody
     is sitting at a table waiting for it, it gets packed, and a delivery has a
     driver to catch. Violet = delivery, blue = takeaway, cream = eat-in. */
  const modeSkin = (mode: Order['mode']) =>
    mode === 'delivery'
      ? { card: 'bg-[#f0e8fb] border-[#a78bda]', ribbon: 'bg-[#6d44b8]', label: 'Delivery' }
      : mode === 'takeaway'
        ? { card: 'bg-[#e6f1fb] border-[#7fb0dd]', ribbon: 'bg-[#1c6ca8]', label: 'Takeaway' }
        : { card: 'bg-brand-cream border-brand-gold/40', ribbon: '', label: '' };
  const waitColor = (mins: number) => (mins >= 20 ? 'text-brand-red' : mins >= 10 ? 'text-brand-gold-dark' : 'text-brand-ink/55');

  return (
    <div className={`landing ${landingFonts} relative min-h-screen overflow-x-clip bg-brand-red p-2.5 font-body text-white sm:p-4 md:p-6`}>
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
        <div className="btn btn-gold fixed left-1/2 top-4 z-50 max-w-[calc(100vw-24px)] -translate-x-1/2 animate-bounce px-4 py-3 text-[10px] sm:top-5 sm:px-6 sm:py-4 sm:text-[11px]">
          <Sparkles size={14} className="shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      <div className="relative z-10 mx-auto flex max-w-[1400px] flex-col gap-4 sm:gap-6">

        {/* Header — the landing nav island */}
        <header className="flex shrink-0 flex-col gap-3 rounded-[1.75rem] border border-brand-gold/25 bg-[#4f070c]/90 p-3 shadow-[0_18px_44px_-12px_rgba(35,0,4,0.6)] backdrop-blur-md sm:gap-4 sm:p-4 md:flex-row md:items-center md:justify-between md:rounded-full md:py-3 md:pl-4 md:pr-3">
          <div className="flex w-full items-center gap-3 md:w-auto md:gap-6">
            <BrandMark sub="Chef Station" />
            <div className="hidden h-9 w-px bg-brand-gold/30 md:block" />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 font-display text-lg font-medium leading-none text-white sm:text-2xl md:text-3xl">
                <ChefHat size={18} className="shrink-0 text-brand-gold-light sm:hidden" />
                <ChefHat size={22} className="hidden shrink-0 text-brand-gold-light sm:inline" />
                <span>Active <em className="font-normal text-brand-gold-light">orders</em></span>
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[9.5px] font-medium uppercase tracking-[0.18em] sm:mt-2 sm:gap-x-4 sm:text-[10px] sm:tracking-[0.2em]">
                <span className="flex items-center gap-1.5 text-white/70"><CircleDashed size={12} /> {orders.filter(o => o.status === 'pending').length} Pending</span>
                <span className="flex items-center gap-1.5 text-brand-gold-light"><Flame size={12} /> {orders.filter(o => o.status === 'cooking').length} Cooking</span>
                <span className="flex items-center gap-1.5 text-green-300"><PackageCheck size={12} /> {readyOrders.length} Ready</span>
              </div>
            </div>
          </div>

          <div className="flex w-full min-w-0 items-center gap-2 md:w-auto">
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Sound alerts off — tap to enable' : 'Sound alerts on — tap to mute'}
              aria-label={muted ? 'Enable sound' : 'Mute sound'}
              className={`btn h-12 w-12 shrink-0 p-0 min-h-[48px] min-w-[48px] ${muted ? 'text-white/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] hover:text-white' : 'btn-outline-light'}`}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div className="flex min-w-0 flex-1 gap-1 rounded-full border border-brand-gold/30 p-1 md:flex-initial">
              <button
                onClick={() => setView('active')}
                className={`btn min-w-0 flex-1 min-h-[44px] px-3 py-3 text-[10px] sm:px-6 md:flex-initial ${view === 'active' ? 'btn-gold' : 'text-white/70 hover:text-white'}`}
              >
                <span className="hidden sm:inline">All Orders</span>
                <span className="sm:hidden">Active</span>
              </button>
              <button
                onClick={() => setView('history')}
                className={`btn min-w-0 flex-1 min-h-[44px] px-3 py-3 text-[10px] sm:px-6 md:flex-initial ${view === 'history' ? 'btn-gold' : 'text-white/70 hover:text-white'}`}
              >
                History
              </button>
            </div>
          </div>
        </header>

        {/* Ready for Pickup strip */}
        {view === 'active' && readyOrders.length > 0 && (
          <div className="no-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto rounded-full border border-brand-gold/30 bg-[#4f070c]/60 p-2 backdrop-blur-sm sm:gap-3 sm:p-2.5">
            <span className="flex shrink-0 items-center gap-1.5 pl-2 font-body text-[9px] font-medium uppercase tracking-[0.2em] text-brand-gold-light sm:gap-2 sm:pl-3 sm:text-[10px] sm:tracking-[0.24em]">
              <PackageCheck size={13} /> <span className="hidden sm:inline">Waiting on waiter</span><span className="sm:hidden">Ready</span>
            </span>
            {readyOrders.map(o => (
              <span key={o.id} className="shrink-0 whitespace-nowrap rounded-full bg-brand-cream px-3 py-1.5 font-body text-[11px] font-medium text-brand-wine sm:px-4 sm:py-2 sm:text-xs">
                {orderLabel(o)} · #{o.id.split('-')[1]}
              </span>
            ))}
          </div>
        )}

        {/* History Feed */}
        {view === 'history' && (
          <div className="pb-6">
            {servedOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 px-4 py-16 text-center text-white/70 sm:py-20">
                <Clock size={48} strokeWidth={1.2} className="opacity-50 sm:hidden" />
                <Clock size={56} strokeWidth={1.2} className="hidden opacity-50 sm:block" />
                <h2 className="font-display text-3xl font-medium italic text-white sm:text-4xl">No served orders yet</h2>
                <p className="max-w-sm font-body text-sm font-light">Completed tickets will show up here once the waiter serves them.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {historyPager.items.map(order => (
                  <div key={order.id} className="flex items-center gap-3 rounded-[1.25rem] border border-brand-gold/40 bg-brand-cream p-3 text-brand-ink shadow-[0_18px_40px_-28px_rgba(30,0,4,0.6)] sm:gap-4 sm:rounded-[1.5rem] sm:p-4">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-brand-wine px-1 text-center leading-none text-brand-gold-light ring-1 ring-brand-gold/60 sm:h-14 sm:w-14">
                      {order.mode === 'standing' ? (
                        <span className="font-body text-[9px] font-medium uppercase tracking-[0.14em] sm:text-[10px]">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="font-body text-[9px] font-medium uppercase tracking-[0.14em] sm:text-[10px]">To-go</span>
                      ) : order.mode === 'delivery' ? (
                        <span className="font-body text-[9px] font-medium uppercase tracking-[0.14em] sm:text-[10px]">Deliv</span>
                      ) : (
                        <>
                          <span className="mb-0.5 font-body text-[7.5px] font-medium uppercase tracking-[0.2em] opacity-70 sm:text-[8px]">Tbl</span>
                          <span className="font-display text-xl font-semibold sm:text-2xl">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-display text-base font-semibold text-brand-wine sm:text-lg">#{order.id.split('-')[1]}</span>
                        {order.source === 'customer' && (
                          <span className="rounded-full bg-brand-plum/10 px-2 py-0.5 font-body text-[8.5px] font-medium uppercase tracking-[0.16em] text-brand-plum sm:text-[9px]">Self</span>
                        )}
                        <span className="flex items-center gap-1 rounded-full bg-brand-green/10 px-2 py-0.5 font-body text-[8.5px] font-medium uppercase tracking-[0.16em] text-brand-green sm:text-[9px]">
                          <CheckCircle size={10} /> Served
                        </span>
                      </div>
                      <p className="mt-1 truncate font-body text-xs font-light text-brand-ink/65 sm:text-sm">
                        {order.items.map(i => `${i.qty}x ${i.name}`).join(', ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-semibold text-brand-red sm:text-xl">{formatKWD(order.total)}</p>
                      <p className="whitespace-nowrap font-body text-[10px] font-light text-brand-ink/50 sm:text-xs">{new Date(order.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
                <div className="col-span-1 md:col-span-2 xl:col-span-3">
                  <Pagination p={historyPager} label="served orders" dark />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Single Feed Grid */}
        {view === 'active' && (
        <div className="pb-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-3 xl:gap-5">
            {activeOrders.map(order => {
              const mins = waitMinutes(order.createdAt);
              return (
              <div key={order.id} className={`relative flex flex-col overflow-hidden rounded-[1.5rem] border-2 p-4 text-brand-ink shadow-[0_28px_56px_-30px_rgba(30,0,4,0.75)] transition-all sm:rounded-[1.75rem] sm:p-5 md:p-5 xl:rounded-[2rem] xl:p-6 ${modeSkin(order.mode).card} ${order.status === 'cooking' ? 'ring-2 ring-brand-gold/70' : ''}`}>

                {/* Home orders get a coloured band across the top so the pass can
                    sort eat-in from pack-up at a glance across the kitchen. */}
                {modeSkin(order.mode).ribbon && (
                  <div className={`absolute left-0 top-0 flex h-6 w-full items-center justify-center font-body text-[9.5px] font-bold uppercase tracking-[0.24em] text-white ${modeSkin(order.mode).ribbon}`}>
                    {modeSkin(order.mode).label} · pack it up
                  </div>
                )}

                {/* Priority Indicator */}
                {order.priority === 'high' && (
                  <div className={`absolute left-0 h-1.5 w-full bg-gradient-to-r from-brand-red via-brand-gold to-brand-red ${modeSkin(order.mode).ribbon ? 'top-6' : 'top-0'}`} />
                )}

                {/* Top Row: Table and Meta */}
                <div className={`mb-4 flex items-start justify-between sm:mb-5 ${modeSkin(order.mode).ribbon ? 'mt-5' : ''}`}>
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full px-1 text-center leading-none ring-1 ring-brand-gold/60 sm:h-16 sm:w-16 md:h-[64px] md:w-[64px] xl:h-[72px] xl:w-[72px] ${order.status === 'cooking' ? 'bg-brand-red text-white' : 'bg-brand-wine text-brand-gold-light'}`}>
                      {order.mode === 'standing' ? (
                        <span className="font-body text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs">Stand</span>
                      ) : order.mode === 'takeaway' ? (
                        <span className="font-body text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs">To-go</span>
                      ) : order.mode === 'delivery' ? (
                        <span className="font-body text-[11px] font-medium uppercase tracking-[0.14em] sm:text-xs">Deliv</span>
                      ) : (
                        <>
                          <span className="mb-0.5 font-body text-[8px] font-medium uppercase tracking-[0.2em] opacity-75 sm:text-[9px]">Table</span>
                          <span className="font-display text-2xl font-semibold sm:text-3xl">{order.table}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xl font-semibold leading-none text-brand-wine sm:text-2xl">
                        Ticket #{order.id.split('-')[1]}
                        {(order.mode === 'takeaway' || order.mode === 'delivery') && (
                          <span className="rounded-full bg-brand-wine px-2.5 py-1 font-body text-[11px] font-bold tracking-[0.1em] text-brand-gold-light">
                            Order #{resolveOrderNo({ sessionId: order.sessionId, id: order.id, createdAt: order.createdAt })}
                          </span>
                        )}
                        {order.source === 'customer' && (
                          <span className="rounded-full bg-brand-plum/10 px-2 py-0.5 font-body text-[9px] font-medium uppercase tracking-[0.18em] text-brand-plum sm:px-2.5 sm:py-1">Self-order</span>
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-2 sm:gap-2">
                        <span className={`flex items-center gap-1 rounded-full bg-white px-2 py-0.5 font-body text-[10.5px] font-medium sm:px-2.5 sm:py-1 sm:text-[11px] ${waitColor(mins)}`}>
                          <Clock size={11} /> {mins < 1 ? 'just now' : `${mins} min wait`}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 font-body text-[8.5px] font-medium uppercase tracking-[0.18em] sm:px-2.5 sm:py-1 sm:text-[9px] sm:tracking-[0.2em] ${order.status === 'cooking' ? 'bg-brand-red/10 text-brand-red' : 'bg-brand-ink/5 text-brand-ink/55'}`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* The customer's remark for the whole order — the one thing a
                    chef must read before they start. */}
                {order.note && (
                  <div className="mb-3 flex items-start gap-2 rounded-[1.25rem] border-2 border-brand-red/50 bg-brand-red/5 p-3 sm:mb-4 sm:p-4">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brand-red" />
                    <div className="min-w-0">
                      <p className="font-body text-[9px] font-bold uppercase tracking-[0.2em] text-brand-red">Customer&rsquo;s remark</p>
                      <p className="break-words font-body text-sm font-semibold leading-snug text-brand-wine sm:text-base">{order.note}</p>
                    </div>
                  </div>
                )}

                {/* Items List */}
                <div className="mb-4 flex-1 space-y-2.5 rounded-[1.25rem] border border-brand-gold/25 bg-white p-3 sm:mb-5 sm:space-y-3 sm:rounded-[1.5rem] sm:p-4 md:p-5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 border-b border-brand-gold/20 pb-2.5 last:border-0 last:pb-0 sm:gap-4 sm:pb-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brand-gold/50 bg-brand-cream font-display text-lg font-semibold text-brand-red sm:h-10 sm:w-10 sm:text-xl">
                        {item.qty}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5 sm:pt-1">
                        <p className="break-words font-display text-lg font-medium leading-tight text-brand-wine sm:text-xl md:text-2xl">{item.name}</p>
                        {item.notes && (
                          <div className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-brand-gold/40 bg-brand-gold-light/30 p-2 text-brand-wine">
                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                            <p className="break-words font-body text-xs font-medium">{item.notes}</p>
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
                      className="btn btn-wine group flex-1 min-h-[52px] py-4 text-[11px] sm:min-h-[56px] sm:py-5"
                    >
                      <Flame size={17} className="group-hover:animate-pulse" /> Start Cooking
                    </button>
                  )}
                  {order.status === 'cooking' && (
                    confirmReadyId === order.id ? (
                      <button
                        onClick={() => { updateStatus(order.id, 'ready'); setConfirmReadyId(null); }}
                        className="btn flex-1 min-h-[52px] animate-pulse bg-brand-green py-4 text-[11px] text-white shadow-[0_14px_30px_-12px_rgba(63,143,58,0.7)] hover:brightness-110 sm:min-h-[56px] sm:py-5"
                      >
                        <AlertTriangle size={17} /> Are you sure? Send to waiter
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmReadyId(order.id)}
                        className="btn btn-red flex-1 min-h-[52px] py-4 text-[11px] sm:min-h-[56px] sm:py-5"
                      >
                        <CheckCircle size={17} /> Mark as Ready
                      </button>
                    )
                  )}
                </div>
              </div>
            );})}

            {activeOrders.length === 0 && (
               <div className="col-span-1 flex flex-col items-center justify-center gap-4 px-4 py-16 text-center text-white/70 md:col-span-2 md:py-20 xl:col-span-3">
                 <CheckCircle size={48} strokeWidth={1.2} className="opacity-50 sm:hidden" />
                 <CheckCircle size={56} strokeWidth={1.2} className="hidden opacity-50 sm:block" />
                 <h2 className="font-display text-3xl font-medium italic text-white sm:text-4xl md:text-5xl">All caught up!</h2>
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
