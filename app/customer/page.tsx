"use client";
import React, { useState, useSyncExternalStore } from 'react';
import { ShoppingBag, Clock, Minus, Plus, CreditCard, ChevronLeft, MapPin, CheckCircle2, Loader2, Bell } from 'lucide-react';
import { addOrder } from '../lib/orderStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../lib/menuStore';
import { callWaiter, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot, subscribeToWaiterCalls } from '../lib/waiterCallStore';

// In production each table's QR code would link straight to /customer?table=N.
// Reading it via useSyncExternalStore (rather than state+effect) keeps server/client
// render output consistent and avoids a hydration flash.
const noopSubscribe = () => () => {};
const getTableParam = () => new URLSearchParams(window.location.search).get('table');
const getTableParamServer = () => null;

export default function CustomerDashboard() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderState, setOrderState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  const tableParam = useSyncExternalStore(noopSubscribe, getTableParam, getTableParamServer);
  const tableNumber = Number(tableParam) > 0 ? Number(tableParam) : 12;

  // Live menu managed by the admin's Inventory tab — same source of truth for every role
  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const menu = allMenuItems.filter(m => m.status === 'active');

  const waiterCalls = useSyncExternalStore(subscribeToWaiterCalls, getWaiterCallsSnapshot, getWaiterCallsServerSnapshot);
  const activeWaiterCall = waiterCalls.find(c => c.table === tableNumber && !c.resolved);
  const handleCallWaiter = () => callWaiter(tableNumber);

  const categories = ['All', 'Starters', 'Mains', 'Desserts', 'Drinks'];
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

  const handleSubmitOrder = () => {
    if (cartItemCount === 0 || orderState === 'submitting') return;
    setOrderState('submitting');

    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menu.find(m => m.id === id)!;
      return { id: item.id, name: item.name, price: item.price, qty };
    });

    // Small delay so the "sending to kitchen" state is visible, not just an instant jump
    setTimeout(() => {
      const order = addOrder({
        table: tableNumber,
        items,
        priority: 'normal',
        subtotal: cartTotal,
        tax: cartTotal * 0.1,
        total: cartTotal * 1.1,
        source: 'customer',
      });
      setLastOrderId(order.id);
      setCart({});
      setOrderState('success');
    }, 700);
  };

  const startNewOrder = () => {
    setOrderState('idle');
    setLastOrderId(null);
    setIsCartOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#111] font-sans pb-32">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-white/70 backdrop-blur-2xl border-b border-black/5 supports-[backdrop-filter]:bg-white/40">
        <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter">QWAIT</h1>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-black/5 rounded-full text-xs font-bold text-black/70">
              <MapPin size={12} /> Table {tableNumber}
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={handleCallWaiter}
              disabled={!!activeWaiterCall}
              className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2.5 md:py-3 rounded-full font-bold text-[11px] md:text-sm whitespace-nowrap transition-all ${activeWaiterCall ? 'bg-emerald-100 text-emerald-700 cursor-default' : 'bg-black/5 text-black/70 hover:bg-black/10 active:scale-95'}`}
            >
              <Bell size={16} className={`shrink-0 ${activeWaiterCall ? 'animate-pulse' : ''}`} />
              <span className="sm:hidden">{activeWaiterCall ? 'Coming' : 'Call Waiter'}</span>
              <span className="hidden sm:inline">{activeWaiterCall ? 'Waiter is on the way' : 'Call Waiter'}</span>
            </button>

            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 md:p-3 bg-black text-white rounded-full hover:scale-105 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.2)]"
            >
              <ShoppingBag size={20} className="md:w-6 md:h-6" />
              {cartItemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 md:w-6 md:h-6 bg-orange-500 text-white text-[10px] md:text-xs font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 pt-24 md:pt-32 mb-8 md:mb-12">
        <div className="relative w-full h-[250px] md:h-[400px] rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-black/10 group">
          <img src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=1600" alt="Restaurant" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-12">
            <div className="flex items-center gap-2 mb-3 md:hidden">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-white">
                <MapPin size={12} /> Table {tableNumber}
              </div>
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-white mb-2 md:mb-4 tracking-tight">The Menu.</h2>
            <p className="text-white/80 font-medium flex items-center gap-2 text-sm md:text-lg">
              <Clock size={18} /> Experience culinary excellence
            </p>
          </div>
        </div>
      </div>

      {/* Categories - Sticky on Mobile */}
      <div className="sticky top-16 md:static z-30 bg-[#f8f9fa] md:bg-transparent py-4 md:py-0 border-b border-black/5 md:border-0 max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6 mb-8 md:mb-12 overflow-x-auto no-scrollbar -mx-4 md:mx-auto">
        <div className="flex gap-2 md:gap-3 px-4 md:px-0 min-w-max">
          {categories.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2 md:px-8 md:py-3 rounded-full text-sm md:text-base font-bold transition-all ${activeCategory === cat ? 'bg-black text-white shadow-[0_8px_20px_rgba(0,0,0,0.15)]' : 'bg-white text-black/60 hover:bg-black/5 shadow-sm border border-black/5'}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      <div className="max-w-5xl xl:max-w-6xl mx-auto px-4 md:px-6">
        <h3 className="text-2xl md:text-3xl font-black mb-6 md:mb-8 text-black/80">{activeCategory}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredMenu.map(item => (
            <div key={item.id} className="bg-white rounded-[1.5rem] md:rounded-[2rem] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-black/5 hover:border-orange-500/20 hover:shadow-[0_8px_30px_rgb(249,115,22,0.08)] transition-all group flex flex-col">
              <div className="relative w-full aspect-[4/3] overflow-hidden flex-shrink-0">
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
              </div>
              <div className="flex flex-col flex-1 p-4 md:p-5">
                <h4 className="font-black text-lg md:text-xl mb-1.5 text-black leading-tight">{item.name}</h4>
                <p className="text-xs md:text-sm text-black/50 line-clamp-2 leading-relaxed font-medium mb-4 flex-1">{item.description}</p>

                <div className="flex items-center justify-between gap-3">
                  <div className="shrink-0">
                    <span className="text-xl md:text-2xl font-black text-orange-600">${item.price}</span>
                    {cart[item.id] > 0 && (
                      <p className="text-[11px] font-bold text-black/40 -mt-0.5">${(item.price * cart[item.id]).toFixed(2)} total</p>
                    )}
                  </div>

                  {cart[item.id] ? (
                    <div className="flex items-center gap-2 md:gap-3 bg-orange-50 p-1 md:p-1.5 rounded-full border border-orange-200 shrink-0">
                      <button onClick={() => removeFromCart(item.id)} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-orange-600 hover:bg-orange-100 transition-colors shrink-0"><Minus size={16} className="md:w-[18px] md:h-[18px]" /></button>
                      <span className="font-black text-center text-sm md:text-base text-orange-700 w-4 md:w-5">{cart[item.id]}</span>
                      <button onClick={() => addToCart(item.id)} className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white shadow-[0_4px_10px_rgba(249,115,22,0.35)] flex items-center justify-center hover:brightness-110 transition-all shrink-0"><Plus size={16} className="md:w-[18px] md:h-[18px]" /></button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(item.id)} className="px-4 md:px-5 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm md:text-base font-bold rounded-full hover:brightness-110 transition-all shadow-[0_8px_20px_rgba(249,115,22,0.3)] active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap shrink-0">
                      <Plus size={16} /> Add to Order
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
                <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-in zoom-in duration-500">
                  <CheckCircle2 size={56} className="text-green-500" strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-black mb-2">Order Sent!</h2>
                  <p className="text-black/50 font-medium max-w-xs">
                    Your order has been sent straight to the kitchen for Table {tableNumber}. We&apos;ll get it to you shortly.
                  </p>
                </div>
                {lastOrderId && (
                  <div className="px-4 py-2 bg-black/5 rounded-full text-sm font-bold text-black/60">
                    Order #{lastOrderId}
                  </div>
                )}
                <button
                  onClick={startNewOrder}
                  className="mt-4 w-full px-6 py-4 bg-black text-white rounded-2xl font-black text-lg hover:bg-orange-500 transition-all shadow-[0_8px_25px_rgba(0,0,0,0.2)] active:scale-95"
                >
                  Back to Menu
                </button>
              </div>
            ) : (
              <>
                <div className="p-6 md:p-8 border-b border-black/5 flex items-center gap-4">
                  <button onClick={() => setIsCartOpen(false)} className="p-2 md:p-3 bg-black/5 hover:bg-black/10 rounded-full transition-colors">
                    <ChevronLeft size={20} className="md:w-6 md:h-6" />
                  </button>
                  <h2 className="text-2xl md:text-3xl font-black flex-1 tracking-tight">Your Order</h2>
                </div>

                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6">
                  {cartItemCount === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-black/30 gap-4">
                      <ShoppingBag size={64} className="opacity-50" />
                      <p className="font-bold text-lg">Your order is empty</p>
                    </div>
                  ) : (
                    Object.entries(cart).map(([id, qty]) => {
                      const item = menu.find(m => m.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="flex gap-4 md:gap-6 items-center">
                          <img src={item.image} alt={item.name} className="w-20 h-20 md:w-24 md:h-24 rounded-[1.25rem] object-cover shadow-sm" />
                          <div className="flex-1">
                            <h4 className="font-black text-base md:text-lg text-black leading-tight mb-1">{item.name}</h4>
                            <p className="text-orange-500 font-black text-sm md:text-base">${item.price * qty}</p>
                          </div>
                          <div className="flex items-center gap-2 bg-black/5 p-1 rounded-full border border-black/5">
                            <button onClick={() => removeFromCart(id)} className="w-8 h-8 rounded-full bg-white shadow-sm flex items-center justify-center hover:text-red-500"><Minus size={14} /></button>
                            <span className="font-black text-sm md:text-base w-5 text-center">{qty}</span>
                            <button onClick={() => addToCart(id)} className="w-8 h-8 rounded-full bg-black text-white shadow-sm flex items-center justify-center hover:bg-orange-500"><Plus size={14} /></button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {cartItemCount > 0 && (
                  <div className="p-6 md:p-8 bg-[#f8f9fa] border-t border-black/5 rounded-b-[2rem] md:rounded-bl-[2rem] md:rounded-br-none pb-8 md:pb-8">
                    <div className="flex justify-between mb-3 text-black/60 font-medium text-sm md:text-base">
                      <span>Subtotal</span>
                      <span className="font-bold text-black">${cartTotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between mb-6 text-black/60 font-medium text-sm md:text-base">
                      <span>Tax (10%)</span>
                      <span className="font-bold text-black">${(cartTotal * 0.1).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between mb-8 text-2xl md:text-3xl font-black">
                      <span>Total</span>
                      <span>${(cartTotal * 1.1).toFixed(2)}</span>
                    </div>
                    <button
                      onClick={handleSubmitOrder}
                      disabled={orderState === 'submitting'}
                      className="w-full py-4 md:py-5 bg-black text-white rounded-2xl font-black text-lg md:text-xl flex items-center justify-center gap-3 hover:bg-orange-500 transition-all shadow-[0_8px_25px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_25px_rgba(249,115,22,0.4)] active:scale-95 disabled:opacity-70 disabled:cursor-wait"
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
            className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black text-lg flex items-center justify-between px-6 shadow-[0_8px_25px_rgba(249,115,22,0.4)]"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs">{cartItemCount}</span>
              <span>View Order</span>
            </div>
            <span>${(cartTotal * 1.1).toFixed(2)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
