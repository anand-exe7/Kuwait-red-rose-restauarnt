"use client";
import React, { useState } from 'react';
import { ShoppingBag, ChevronRight, Star, Clock, Minus, Plus, CreditCard, ChevronLeft, MapPin } from 'lucide-react';

export default function CustomerDashboard() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);

  const menu = [
    { id: 'm1', name: 'Wagyu Steak', price: 85, category: 'Mains', desc: 'Premium A5 wagyu with truffle mash, seasonal vegetables and red wine jus.', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=800' },
    { id: 'm2', name: 'Truffle Pasta', price: 42, category: 'Mains', desc: 'Handmade linguine, black truffle shavings, aged parmesan.', image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&q=80&w=800' },
    { id: 'm3', name: 'Lobster Bisque', price: 28, category: 'Starters', desc: 'Rich and creamy Maine lobster soup with crème fraîche.', image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4859?auto=format&fit=crop&q=80&w=800' },
    { id: 'm4', name: 'Caesar Salad', price: 18, category: 'Starters', desc: 'Crisp romaine, parmesan, garlic croutons, house dressing.', image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=800' },
    { id: 'm5', name: 'Tiramisu', price: 14, category: 'Desserts', desc: 'Classic Italian espresso dessert with mascarpone.', image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=800' },
    { id: 'm6', name: 'Reserve Cabernet', price: 120, category: 'Drinks', desc: 'Napa Valley, 2018. Rich, bold, and perfectly balanced.', image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&q=80&w=800' },
  ];

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

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#111] font-sans pb-32">
      {/* Header */}
      <header className="fixed top-0 w-full z-40 bg-white/70 backdrop-blur-2xl border-b border-black/5 supports-[backdrop-filter]:bg-white/40">
        <div className="max-w-5xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter">Cenexa</h1>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-black/5 rounded-full text-xs font-bold text-black/70">
              <MapPin size={12} /> Table 12
            </div>
          </div>
          
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
      </header>

      {/* Hero Section */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-24 md:pt-32 mb-8 md:mb-12">
        <div className="relative w-full h-[250px] md:h-[400px] rounded-[2rem] md:rounded-[3rem] overflow-hidden shadow-2xl shadow-black/10 group">
          <img src="https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&q=80&w=1600" alt="Restaurant" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-6 md:p-12">
            <div className="flex items-center gap-2 mb-3 md:hidden">
              <div className="flex items-center gap-1.5 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-white">
                <MapPin size={12} /> Table 12
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
      <div className="sticky top-16 md:static z-30 bg-[#f8f9fa] md:bg-transparent py-4 md:py-0 border-b border-black/5 md:border-0 max-w-5xl mx-auto px-4 md:px-6 mb-8 md:mb-12 overflow-x-auto no-scrollbar -mx-4 md:mx-auto">
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
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <h3 className="text-2xl md:text-3xl font-black mb-6 md:mb-8 text-black/80">{activeCategory}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-8">
          {filteredMenu.map(item => (
            <div key={item.id} className="bg-white rounded-[1.5rem] md:rounded-[2rem] p-3 md:p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-black/5 hover:border-orange-500/20 hover:shadow-[0_8px_30px_rgb(249,115,22,0.08)] transition-all group flex gap-4 md:gap-6">
              <div className="w-28 h-28 md:w-40 md:h-40 rounded-2xl md:rounded-[1.5rem] overflow-hidden flex-shrink-0 relative shadow-inner">
                <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute top-2 left-2 px-2 py-1 md:px-3 md:py-1.5 bg-white/90 backdrop-blur-md rounded-lg text-xs md:text-sm font-black shadow-sm text-black">
                  ${item.price}
                </div>
              </div>
              <div className="flex flex-col justify-between py-1 md:py-2 flex-1">
                <div>
                  <h4 className="font-black text-lg md:text-xl mb-1 md:mb-2 text-black leading-tight">{item.name}</h4>
                  <p className="text-xs md:text-sm text-black/50 line-clamp-2 md:line-clamp-3 leading-relaxed font-medium">{item.desc}</p>
                </div>
                
                <div className="mt-4">
                  {cart[item.id] ? (
                    <div className="flex items-center gap-3 bg-black/5 self-start p-1 md:p-1.5 rounded-full border border-black/5 w-fit">
                      <button onClick={() => removeFromCart(item.id)} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white shadow-sm flex items-center justify-center hover:text-orange-500 transition-colors"><Minus size={18} className="md:w-5 md:h-5" /></button>
                      <span className="font-black w-4 md:w-6 text-center text-sm md:text-base">{cart[item.id]}</span>
                      <button onClick={() => addToCart(item.id)} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black text-white shadow-[0_4px_10px_rgba(0,0,0,0.2)] flex items-center justify-center hover:bg-orange-500 transition-colors"><Plus size={18} className="md:w-5 md:h-5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(item.id)} className="w-full md:w-auto px-5 py-2.5 md:px-6 md:py-3 bg-black text-white text-sm md:text-base font-bold rounded-full hover:bg-orange-500 transition-all shadow-[0_8px_20px_rgba(0,0,0,0.15)] active:scale-95">
                      Add to Order
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
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full md:w-[450px] h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 rounded-t-[2rem] md:rounded-l-[2rem] md:rounded-tr-none mt-16 md:mt-0">
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
                <button className="w-full py-4 md:py-5 bg-black text-white rounded-2xl font-black text-lg md:text-xl flex items-center justify-center gap-3 hover:bg-orange-500 transition-all shadow-[0_8px_25px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_25px_rgba(249,115,22,0.4)] active:scale-95">
                  <CreditCard size={24} /> Submit Order
                </button>
              </div>
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
