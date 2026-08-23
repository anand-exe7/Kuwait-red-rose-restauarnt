"use client";
import React, { useState, useSyncExternalStore } from 'react';
import { ShoppingBag, Clock, Minus, Plus, CreditCard, ChevronLeft, MapPin, CheckCircle2, Loader2, Bell, ShoppingCart, Tag, X, PackageCheck } from 'lucide-react';
import { addOrder, getActiveSessionId } from '../lib/orderStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu, MENU_CATEGORIES } from '../lib/menuStore';
import { callWaiter, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot, subscribeToWaiterCalls } from '../lib/waiterCallStore';
import { formatKWD } from '../lib/currency';
import { validateCoupon, incrementCouponUsage } from '../lib/couponStore';
import { BRAND } from '../lib/brand';

// In production each table's QR code links straight to /customer?table=N.
// Reading it via useSyncExternalStore (rather than state+effect) keeps server/client
// render output consistent and avoids a hydration flash.
const noopSubscribe = () => () => {};
const getTableParam = () => new URLSearchParams(window.location.search).get('table');
const getModeParam = () => {
  const q = new URLSearchParams(window.location.search).get('mode');
  if (q) return q;
  // The dedicated /takeaway route reuses this same experience in takeaway mode.
  if (window.location.pathname.startsWith('/takeaway')) return 'takeaway';
  return null;
};
const getParamServer = () => null;

export default function CustomerDashboard() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderState, setOrderState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; id: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [cartIsTakeaway, setCartIsTakeaway] = useState(false);

  const [standingLabelId] = useState(() => {
    if (typeof window === 'undefined') return 'QR Walk-in';
    const key = 'cenexa_standing_label';
    let label = sessionStorage.getItem(key);
    if (!label) {
      label = `QR Walk-in #${Math.floor(Math.random() * 9000 + 1000)}`;
      sessionStorage.setItem(key, label);
    }
    return label;
  });

  const tableParam = useSyncExternalStore(noopSubscribe, getTableParam, getParamServer);
  const modeParam = useSyncExternalStore(noopSubscribe, getModeParam, getParamServer);
  const isStandingQR = modeParam === 'standing';
  const isTakeaway = modeParam === 'takeaway';
  const isStandingDineIn = isStandingQR;
  const tableNumber = Number(tableParam) > 0 ? Number(tableParam) : 12;

  // Live menu managed by the admin's Inventory tab — same source of truth for every role
  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const menu = allMenuItems.filter(m => m.status === 'active');

  const waiterCalls = useSyncExternalStore(subscribeToWaiterCalls, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot);
  const activeWaiterCall = waiterCalls.find(c => c.table === tableNumber && !c.resolved);
  const handleCallWaiter = () => callWaiter(tableNumber);

  const categories = ['All', ...MENU_CATEGORIES];
  const filteredMenu = activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory);

  const addToCart = (id: string) => setCart(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromCart = (id: string) => setCart(prev => {
    const newCart = { ...prev };
    if (newCart[id] > 1) newCart[id]--;
    else delete newCart[id];
    return newCart;
  });

  const cartTotal = Object.entries(cart).reduce((acc, [id, qty]) => {
    const item = menu.find(m => m.id === id);
    return acc + (item?.price || 0) * qty;
  }, 0);

  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);

  // Coupon discount applies to the product subtotal only
  const discount = appliedCoupon ? (cartTotal * appliedCoupon.discountPercent) / 100 : 0;
  const taxable = Math.max(0, cartTotal - discount);
  const taxAmt = taxable * 0.1;
  const grandTotal = taxable + taxAmt;

  const applyCoupon = () => {
    const res = validateCoupon(couponInput, cartTotal);
    if (!res.ok || !res.coupon) {
      setCouponError(res.reason || 'Invalid coupon');
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code: res.coupon.code, discountPercent: res.coupon.discountPercent, id: res.coupon.id });
    setCouponError(null);
  };
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  const handleSubmitOrder = () => {
    if (cartItemCount === 0 || orderState === 'submitting') return;
    setOrderState('submitting');

    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menu.find(m => m.id === id)!;
      return { id: item.id, name: item.name, price: item.price, qty };
    });

    // Small delay so the "sending to kitchen" state is visible, not just an instant jump
    setTimeout(() => {
      const finalTakeaway = isTakeaway || cartIsTakeaway;
      const mode = finalTakeaway ? 'takeaway' as const : isStandingDineIn ? 'standing' as const : 'table' as const;
      const sessionId = mode === 'table' ? getActiveSessionId(tableNumber, 'table') : undefined;
      const order = addOrder({
        table: mode === 'standing' || mode === 'takeaway' ? 0 : tableNumber,
        items,
        priority: 'normal',
        subtotal: cartTotal,
        tax: taxAmt,
        total: grandTotal,
        source: 'customer',
        mode,
        discount: discount > 0 ? discount : undefined,
        couponCode: appliedCoupon?.code,
        sessionId: sessionId || undefined,
        standingLabel: isStandingDineIn ? standingLabelId : undefined,
      });
      if (appliedCoupon) incrementCouponUsage(appliedCoupon.id);
      setLastOrderId(order.id);
      setCart({});
      setAppliedCoupon(null);
      setCouponInput('');
      setOrderState('success');
    }, 700);
  };

  const startNewOrder = () => {
    setOrderState('idle');
    setLastOrderId(null);
    setIsCartOpen(false);
  };

  return (
    <div className="min-h-screen bg-brand-cream text-brand-ink font-sans pb-32">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-brand-cream/70 backdrop-blur-2xl border-b border-brand-gold/20 supports-[backdrop-filter]:bg-brand-cream/50">
        <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.logo} alt={BRAND.fullName} className="h-9 md:h-12 w-auto rounded-lg" />
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-brand-red/10 rounded-full text-xs font-bold text-brand-red">
              {isTakeaway ? <><ShoppingCart size={12} /> Takeaway</> : <><MapPin size={12} /> Table {tableNumber}</>}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {!isTakeaway && (
              <button
                onClick={handleCallWaiter}
                disabled={!!activeWaiterCall}
                className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 rounded-full font-bold text-[11px] md:text-sm whitespace-nowrap transition-all ${activeWaiterCall ? 'bg-brand-green/15 text-brand-green cursor-default' : 'bg-brand-ink/5 text-brand-ink/70 hover:bg-brand-ink/10 active:scale-95'}`}
              >
                <Bell size={16} className={`shrink-0 ${activeWaiterCall ? 'animate-pulse' : ''}`} />
                <span className="sm:hidden">{activeWaiterCall ? 'Coming' : 'Call'}</span>
                <span className="hidden sm:inline">{activeWaiterCall ? 'Waiter is on the way' : 'Call Waiter'}</span>
              </button>
            )}

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 md:p-3 bg-brand-red text-white rounded-full hover:bg-brand-red-dark hover:scale-105 transition-all shadow-lg shadow-brand-red/20"
            >
              <ShoppingBag size={20} className="md:w-6 md:h-6" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 md:w-6 md:h-6 bg-brand-gold text-brand-ink text-[10px] md:text-xs font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section — video plays when /redrose.webm is added; poster image shows until then */}
      <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 pt-24 md:pt-32 mb-8 md:mb-12">
        <div className="relative w-full h-[400px] md:h-[600px] rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-brand-red/10 group bg-brand-sand">
          <video
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            poster="https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=1600"
          >
            <source src="/redrose.webm" type="video/webm" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-12 pointer-events-none">
            <div className="flex items-center gap-2 mb-3 md:hidden">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-white">
                {isTakeaway ? <><ShoppingCart size={12} /> Takeaway</> : <><MapPin size={12} /> Table {tableNumber}</>}
              </div>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-white mb-2 md:mb-4 tracking-tight">{BRAND.fullName}</h2>
            <p className="text-white/80 font-medium flex items-center gap-2 text-sm md:text-lg">
              <Clock size={18} /> Freshly made, every day
            </p>
          </div>
        </div>
      </div>

      {/* Categories - Sticky on Mobile */}
      <div className="sticky top-16 md:static z-30 bg-brand-cream md:bg-transparent py-4 md:py-0 border-b border-brand-gold/20 md:border-0 max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 mb-8 md:mb-12 overflow-x-auto no-scrollbar -mx-4 md:mx-auto">
        <div className="flex gap-2 md:gap-3 px-4 md:px-0 min-w-max">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 md:px-8 md:py-3 rounded-full text-sm md:text-base font-bold transition-all ${activeCategory === cat ? 'bg-brand-red text-white shadow-lg shadow-brand-red/20' : 'bg-white text-brand-ink/60 hover:bg-brand-sand shadow-sm border border-brand-gold/20'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6">
        <h3 className="text-2xl md:text-3xl font-black mb-6 md:mb-8 text-brand-ink/80">{activeCategory}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredMenu.map(item => (
            <div key={item.id} className="bg-white rounded-[1.5rem] md:rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-brand-gold/15 hover:border-brand-red/30 hover:shadow-[0_8px_30px_rgba(176,30,40,0.08)] transition-all group flex flex-col">
              <div className="relative w-full aspect-[4/3] overflow-hidden flex-shrink-0 bg-brand-sand">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="flex flex-col flex-1 p-4 md:p-5">
                <h4 className="font-black text-lg md:text-xl mb-1.5 text-brand-ink leading-tight">{item.name}</h4>
                <p className="text-xs md:text-sm text-brand-ink/50 line-clamp-2 leading-relaxed font-medium mb-4 flex-1">{item.description}</p>

                <div className="flex items-center justify-between gap-3">
                  <div className="shrink-0">
                    <span className="text-lg md:text-xl font-black text-brand-red">{formatKWD(item.price)}</span>
                    {cart[item.id] > 0 && (
                      <p className="text-[11px] font-bold text-brand-ink/40 -mt-0.5">{formatKWD(item.price * cart[item.id])} total</p>
                    )}
                  </div>

                  {cart[item.id] ? (
                    <div className="flex items-center gap-2 md:gap-3 bg-brand-red/5 p-1 md:p-1.5 rounded-full border border-brand-red/20 shrink-0">
                      <button onClick={() => removeFromCart(item.id)} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-brand-red hover:bg-brand-red/10 transition-colors shrink-0"><Minus size={16} className="md:w-[18px] md:h-[18px]" /></button>
                      <span className="font-black text-center text-sm md:text-base text-brand-red w-4 md:w-5">{cart[item.id]}</span>
                      <button onClick={() => addToCart(item.id)} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-brand-red text-white shadow-lg shadow-brand-red/25 flex items-center justify-center hover:bg-brand-red-dark transition-all shrink-0"><Plus size={16} className="md:w-[18px] md:h-[18px]" /></button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(item.id)} className="px-4 md:px-5 py-3 bg-brand-red text-white text-sm md:text-base font-bold rounded-full hover:bg-brand-red-dark transition-all shadow-lg shadow-brand-red/25 active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                      <Plus size={16} /> Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => orderState !== 'success' && setIsCartOpen(false)} />
          <div className="relative w-full md:w-[450px] h-[calc(100%-4rem)] md:h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 rounded-t-[2rem] md:rounded-l-[2rem] md:rounded-tr-none mt-16 md:mt-0">

            {orderState === 'success' ? (
              /* Order Confirmation */
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-5">
                <div className="w-24 h-24 rounded-full bg-brand-green/15 flex items-center justify-center animate-in zoom-in duration-500">
                  <CheckCircle2 size={56} className="text-brand-green" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-brand-ink mb-2">Order Sent!</h2>
                  <p className="text-brand-ink/50 font-medium max-w-xs">
                    {(isTakeaway || cartIsTakeaway)
                      ? 'Your takeaway order has been sent to the kitchen. We’ll have it ready for pickup shortly.'
                      : `Your order has been sent straight to the kitchen for Table ${tableNumber}. We’ll get it to you shortly.`}
                  </p>
                </div>
                {lastOrderId && (
                  <div className="px-4 py-2 bg-brand-sand rounded-full text-sm font-bold text-brand-ink/60">
                    Order #{lastOrderId}
                  </div>
                )}
                <button
                  onClick={startNewOrder}
                  className="mt-4 w-full px-6 py-4 bg-brand-red text-white rounded-2xl font-black text-lg hover:bg-brand-red-dark transition-all shadow-lg shadow-brand-red/20 active:scale-95"
                >
                  Back to Menu
                </button>
              </div>
            ) : (
              <>
                <div className="p-6 md:p-8 border-b border-brand-gold/20 flex items-center gap-4">
                  <button onClick={() => setIsCartOpen(false)} className="p-2 md:p-3 bg-brand-ink/5 hover:bg-brand-ink/10 rounded-full transition-colors">
                    <ChevronLeft size={20} className="md:w-6 md:h-6" />
                  </button>
                  <h2 className="text-2xl md:text-3xl font-black flex-1 tracking-tight">Your Order</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6">
                  {cartItemCount === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-brand-ink/30 gap-4">
                      <ShoppingBag size={64} className="opacity-50" />
                      <p className="font-bold text-lg">Your order is empty</p>
                    </div>
                  ) : (
                    Object.entries(cart).map(([id, qty]) => {
                      const item = menu.find(m => m.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="flex gap-4 md:gap-6 items-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.image} alt={item.name} className="w-20 h-20 md:w-24 md:h-24 rounded-[1.25rem] object-cover shadow-sm bg-brand-sand" />
                          <div className="flex-1">
                            <h4 className="font-black text-base md:text-lg text-brand-ink leading-tight mb-1">{item.name}</h4>
                            <p className="text-brand-red font-black text-sm md:text-base">{formatKWD(item.price * qty)}</p>
                          </div>
                          <div className="flex items-center gap-2 bg-brand-ink/5 p-1 rounded-full border border-brand-gold/20">
                            <button onClick={() => removeFromCart(id)} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:text-brand-red"><Minus size={14} /></button>
                            <span className="font-black text-sm md:text-base w-5 text-center">{qty}</span>
                            <button onClick={() => addToCart(id)} className="w-8 h-8 rounded-full bg-brand-red text-white shadow-sm flex items-center justify-center hover:bg-brand-red-dark"><Plus size={14} /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {cartItemCount > 0 && (
                  <div className="p-6 md:p-8 bg-brand-cream border-t border-brand-gold/20 rounded-b-[2rem] md:rounded-bl-[2rem] md:rounded-br-none pb-8 md:pb-8">
                    {!isTakeaway && (
                      <div className="mb-4">
                        <label className="flex items-center gap-3 bg-white border border-brand-gold/20 p-3 rounded-xl cursor-pointer hover:border-brand-red/30 transition-colors">
                          <input
                            type="checkbox"
                            checked={cartIsTakeaway}
                            onChange={(e) => setCartIsTakeaway(e.target.checked)}
                            className="w-5 h-5 accent-brand-red rounded focus:ring-brand-red"
                          />
                          <div className="flex-1">
                            <span className="block font-bold text-sm">Make this a Takeaway order</span>
                            <span className="block text-xs text-brand-ink/50 mt-0.5">Pack everything in takeaway boxes</span>
                          </div>
                          <PackageCheck size={20} className={cartIsTakeaway ? 'text-brand-red' : 'text-brand-ink/30'} />
                        </label>
                      </div>
                    )}
                    
                    {/* Coupon */}
                    <div className="mb-4">
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between gap-2 bg-brand-green/10 border border-brand-green/30 rounded-xl px-3 py-2.5">
                          <span className="flex items-center gap-2 text-sm font-bold text-brand-green">
                            <Tag size={15} /> {appliedCoupon.code} · {appliedCoupon.discountPercent}% off
                          </span>
                          <button onClick={removeCoupon} className="text-brand-ink/40 hover:text-brand-red"><X size={16} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Tag size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-ink/30" />
                            <input
                              value={couponInput}
                              onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                              placeholder="Coupon code"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-brand-gold/30 bg-white text-sm font-bold uppercase tracking-wide focus:outline-none focus:border-brand-red"
                            />
                          </div>
                          <button
                            onClick={applyCoupon}
                            disabled={!couponInput.trim()}
                            className="px-4 py-2.5 rounded-xl bg-brand-ink text-white text-sm font-bold hover:bg-black disabled:opacity-40 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                      {couponError && <p className="text-xs font-semibold text-brand-red mt-1.5">{couponError}</p>}
                    </div>

                    <div className="flex justify-between mb-3 text-brand-ink/60 font-medium text-sm md:text-base">
                      <span>Subtotal</span>
                      <span className="font-bold text-brand-ink">{formatKWD(cartTotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between mb-3 text-brand-green font-medium text-sm md:text-base">
                        <span>Discount</span>
                        <span className="font-bold">− {formatKWD(discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between mb-6 text-brand-ink/60 font-medium text-sm md:text-base">
                      <span>Tax (10%)</span>
                      <span className="font-bold text-brand-ink">{formatKWD(taxAmt)}</span>
                    </div>
                    <div className="flex justify-between mb-8 text-2xl md:text-3xl font-black">
                      <span>Total</span>
                      <span className="text-brand-red">{formatKWD(grandTotal)}</span>
                    </div>
                    <button
                      onClick={handleSubmitOrder}
                      disabled={orderState === 'submitting'}
                      className="w-full py-4 md:py-5 bg-brand-red text-white rounded-2xl font-black text-lg md:text-xl flex items-center justify-center gap-3 hover:bg-brand-red-dark transition-all shadow-lg shadow-brand-red/25 active:scale-95 disabled:opacity-70 disabled:cursor-wait"
                    >
                      {orderState === 'submitting' ? (
                        <>
                          <Loader2 size={24} className="animate-spin" /> Sending to Kitchen...
                        </>
                      ) : (
                        <>
                          <CreditCard size={24} /> Submit Order
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Checkout Button for Mobile (when cart is closed but has items) */}
      {!isCartOpen && cartItemCount > 0 && (
        <div className="fixed bottom-6 left-0 right-0 px-4 md:hidden z-30 animate-in slide-in-from-bottom-10">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full py-4 bg-brand-red text-white rounded-2xl font-black text-lg flex items-center justify-between px-6 shadow-lg shadow-brand-red/30"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs">{cartItemCount}</span>
              <span>View Order</span>
            </div>
            <span>{formatKWD(grandTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
