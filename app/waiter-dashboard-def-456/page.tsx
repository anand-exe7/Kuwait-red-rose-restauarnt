"use client";
import React, { useState } from 'react';
import { Plus, Minus, Send, Clock, CheckCircle2, User, Hash, Coffee, Utensils, Bell, Menu as MenuIcon } from 'lucide-react';

export default function WaiterDashboard() {
  const [activeTable, setActiveTable] = useState(1);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'tables' | 'menu' | 'ticket'>('menu');
  const [placedOrders, setPlacedOrders] = useState<any[]>([
    { id: '101', table: 2, status: 'preparing', items: ['Truffle Pasta', 'Garlic Bread'], time: '12:30 PM', priority: 'high' },
    { id: '102', table: 4, status: 'ready', items: ['Wagyu Steak', 'Red Wine'], time: '12:15 PM', priority: 'normal' }
  ]);

  const menu = [
    { id: 'm1', name: 'Wagyu Steak', price: 85, category: 'Mains', image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=200' },
    { id: 'm2', name: 'Truffle Pasta', price: 42, category: 'Mains', image: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&q=80&w=200' },
    { id: 'm3', name: 'Lobster Bisque', price: 28, category: 'Starters', image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4859?auto=format&fit=crop&q=80&w=200' },
    { id: 'm4', name: 'Caesar Salad', price: 18, category: 'Starters', image: 'https://images.unsplash.com/photo-1550304943-4f24f54ddde9?auto=format&fit=crop&q=80&w=200' },
    { id: 'm5', name: 'Tiramisu', price: 14, category: 'Desserts', image: 'https://images.unsplash.com/photo-1571115177098-24ec42ed204d?auto=format&fit=crop&q=80&w=200' },
    { id: 'm6', name: 'Red Wine', price: 120, category: 'Drinks', image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&q=80&w=200' },
  ];

  const tables = [1, 2, 3, 4, 5, 6, 7, 8];

  const addToOrder = (id: string) => setOrder(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  const removeFromOrder = (id: string) => setOrder(prev => {
    const newOrder = { ...prev };
    if (newOrder[id] > 1) newOrder[id]--;
    else delete newOrder[id];
    return newOrder;
  });

  const submitOrder = () => {
    if (Object.keys(order).length === 0) return;
    const newOrder = {
      id: Math.random().toString(36).substr(2, 5),
      table: activeTable,
      status: 'preparing',
      priority: 'normal',
      items: Object.entries(order).map(([id, qty]) => {
        const item = menu.find(m => m.id === id);
        return `${qty}x ${item?.name}`;
      }),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setPlacedOrders([newOrder, ...placedOrders]);
    setOrder({});
    setActiveTab('tables'); // Switch to tables to see the active ticket
  };

  const total = Object.entries(order).reduce((acc, [id, qty]) => {
    const item = menu.find(m => m.id === id);
    return acc + (item?.price || 0) * qty;
  }, 0);

  const orderItemCount = Object.values(order).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-6 font-sans pb-24 md:pb-6">
      <div className="max-w-[1600px] mx-auto md:h-[calc(100vh-3rem)] flex flex-col md:flex-row gap-6">
        
        {/* Left Sidebar - Tables & Status */}
        <div className={`w-full md:w-80 flex flex-col gap-6 ${activeTab !== 'tables' ? 'hidden md:flex' : 'flex'}`}>
          <div className="bg-[#111] rounded-[2rem] p-6 border border-white/5 relative overflow-hidden group shadow-lg">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-500 to-amber-400" />
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-orange-500 to-amber-400 flex items-center justify-center shadow-[0_0_20px_rgba(249,115,22,0.3)]">
                <User size={28} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight">Alex Walker</h2>
                <p className="text-sm text-gray-400 font-medium">Floor Manager</p>
              </div>
            </div>
            
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Select Table</h3>
            <div className="grid grid-cols-4 gap-3">
              {tables.map(t => (
                <button
                  key={t}
                  onClick={() => { setActiveTable(t); setActiveTab('menu'); }}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all duration-300 font-bold ${activeTable === t ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)] scale-105' : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#222] hover:text-white border border-white/5'}`}
                >
                  <Hash size={16} className={activeTable === t ? 'text-white' : 'text-gray-500'} />
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#111] rounded-[2rem] p-6 border border-white/5 flex-1 flex flex-col overflow-hidden shadow-lg min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active Tickets</h3>
              <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500 relative">
                <Bell size={16} />
                <span className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar">
              {placedOrders.map((po, i) => (
                <div key={i} className="p-4 rounded-2xl bg-[#1a1a1a] border border-white/5 relative group hover:border-white/10 transition-colors">
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 rounded-r-full ${po.status === 'ready' ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]'}`} />
                  <div className="pl-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-white text-lg">Tbl {po.table}</span>
                      <span className="text-xs font-bold text-gray-500">{po.time}</span>
                    </div>
                    <div className="text-sm text-gray-400 leading-tight">
                      {po.items.join(', ')}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${po.status === 'ready' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                        {po.status === 'ready' ? <CheckCircle2 size={10} /> : <Coffee size={10} />}
                        {po.status}
                      </span>
                      {po.priority === 'high' && (
                         <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
                           Rush
                         </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Middle - Menu */}
        <div className={`flex-1 bg-[#111] rounded-[2rem] p-4 md:p-8 border border-white/5 flex flex-col relative overflow-hidden shadow-lg ${activeTab !== 'menu' ? 'hidden md:flex' : 'flex'}`}>
          {/* subtle background glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-orange-500/5 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 relative z-10 gap-4">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight">Menu</h1>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
              {['All', 'Mains', 'Starters', 'Drinks'].map(cat => (
                <button key={cat} className={`px-5 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap border border-white/5 ${cat === 'All' ? 'bg-white text-black shadow-lg' : 'bg-[#1a1a1a] text-gray-400 hover:text-white hover:bg-white/10'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 md:pr-4 custom-scrollbar relative z-10 -mx-2 px-2 md:mx-0 md:px-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
              {menu.map(item => (
                <div key={item.id} className="bg-[#1a1a1a] rounded-[1.5rem] p-3 border border-white/5 hover:border-orange-500/30 transition-all group flex items-center gap-4 hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden relative shrink-0">
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-base md:text-lg mb-1 leading-tight truncate">{item.name}</h4>
                    <p className="text-orange-500 font-black">${item.price}</p>
                  </div>
                  
                  {order[item.id] ? (
                     <div className="flex flex-col items-center gap-1 bg-[#222] p-1 rounded-full border border-white/5 shrink-0">
                        <button onClick={() => addToOrder(item.id)} className="w-8 h-8 rounded-full bg-[#111] hover:bg-orange-500 hover:text-white flex items-center justify-center transition-colors"><Plus size={14} /></button>
                        <span className="font-bold text-sm w-8 text-center">{order[item.id]}</span>
                        <button onClick={() => removeFromOrder(item.id)} className="w-8 h-8 rounded-full bg-[#111] hover:bg-white hover:text-black flex items-center justify-center transition-colors"><Minus size={14} /></button>
                     </div>
                  ) : (
                    <button 
                      onClick={() => addToOrder(item.id)}
                      className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/5 text-white flex items-center justify-center hover:bg-orange-500 hover:text-white transition-colors hover:shadow-[0_0_15px_rgba(249,115,22,0.5)] shrink-0"
                    >
                      <Plus size={20} className="md:w-6 md:h-6" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Current Order */}
        <div className={`w-full md:w-96 bg-[#111] rounded-[2rem] p-4 md:p-6 border border-white/5 flex flex-col relative overflow-hidden shadow-lg ${activeTab !== 'ticket' ? 'hidden md:flex' : 'flex'}`}>
          <div className="absolute top-0 right-0 w-full h-32 bg-gradient-to-b from-orange-500/10 to-transparent pointer-events-none" />
          
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-500 flex items-center justify-center">
                <Utensils size={20} />
              </div>
              <h2 className="text-2xl font-black">Ticket</h2>
            </div>
            <span className="px-4 py-1.5 bg-orange-500 text-white rounded-full text-sm font-black shadow-[0_0_15px_rgba(249,115,22,0.4)]">
              Table {activeTable}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar relative z-10 min-h-[300px]">
            {Object.keys(order).length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4 py-12">
                <Coffee size={64} className="opacity-20" />
                <p className="font-bold">No items added</p>
              </div>
            ) : (
              Object.entries(order).map(([id, qty]) => {
                const item = menu.find(m => m.id === id);
                if (!item) return null;
                return (
                  <div key={id} className="flex gap-4 bg-[#1a1a1a] p-3 rounded-2xl border border-white/5 items-center">
                    <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover" />
                    <div className="flex-1">
                      <h5 className="font-bold text-sm leading-tight mb-1">{item.name}</h5>
                      <p className="text-orange-500 font-black text-sm">${item.price * qty}</p>
                    </div>
                    <div className="flex flex-col items-center gap-1 bg-[#222] p-1 rounded-full border border-white/10 shrink-0">
                      <button onClick={() => addToOrder(id)} className="w-7 h-7 rounded-full bg-[#111] hover:bg-orange-500 hover:text-white flex items-center justify-center transition-colors"><Plus size={14} /></button>
                      <span className="font-bold text-sm w-7 text-center">{qty}</span>
                      <button onClick={() => removeFromOrder(id)} className="w-7 h-7 rounded-full bg-[#111] hover:bg-white hover:text-black flex items-center justify-center transition-colors"><Minus size={14} /></button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 pt-6 border-t border-white/10 relative z-10">
            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between text-gray-400 font-medium">
                <span>Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-gray-400 font-medium">
                <span>Tax (10%)</span>
                <span>${(total * 0.1).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-black">Total</span>
                <span className="text-3xl font-black text-white">${(total * 1.1).toFixed(2)}</span>
              </div>
            </div>

            <button 
              onClick={submitOrder}
              disabled={Object.keys(order).length === 0}
              className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-lg flex items-center justify-center gap-3 hover:bg-orange-600 disabled:opacity-50 disabled:hover:bg-orange-500 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] hover:shadow-[0_0_30px_rgba(249,115,22,0.6)] active:scale-95"
            >
              <Send size={20} />
              Fire Order
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111]/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-around p-3 z-50">
        <button 
          onClick={() => setActiveTab('tables')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeTab === 'tables' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
        >
          <Hash size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Tables</span>
        </button>
        <button 
          onClick={() => setActiveTab('menu')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors ${activeTab === 'menu' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
        >
          <MenuIcon size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Menu</span>
        </button>
        <button 
          onClick={() => setActiveTab('ticket')}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors relative ${activeTab === 'ticket' ? 'text-orange-500' : 'text-gray-500 hover:text-white'}`}
        >
          <Utensils size={24} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Ticket</span>
          {orderItemCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-orange-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {orderItemCount}
            </span>
          )}
        </button>
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
