"use client";
import React, { useState } from 'react';
import { ChefHat, CheckCircle, Clock, Flame, Utensils, AlertTriangle, ArrowRight, CircleDashed } from 'lucide-react';

export default function ChefDashboard() {
  const [orders, setOrders] = useState([
    {
      id: '101',
      table: 4,
      status: 'pending',
      time: '12:30 PM',
      wait: '12 min',
      priority: 'high',
      items: [
        { name: 'Wagyu Steak', qty: 2, notes: 'Medium Rare' },
        { name: 'Truffle Pasta', qty: 1, notes: 'Extra cheese' }
      ]
    },
    {
      id: '102',
      table: 7,
      status: 'cooking',
      time: '12:35 PM',
      wait: '5 min',
      priority: 'normal',
      items: [
        { name: 'Caesar Salad', qty: 1, notes: 'No croutons' },
        { name: 'Lobster Bisque', qty: 2, notes: '' }
      ]
    },
    {
      id: '103',
      table: 2,
      status: 'pending',
      time: '12:40 PM',
      wait: '2 min',
      priority: 'normal',
      items: [
        { name: 'Tiramisu', qty: 3, notes: '' }
      ]
    }
  ]);

  const updateStatus = (id: string, newStatus: string) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status: newStatus } : o));
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'pending': return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'cooking': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'ready': return 'bg-green-500/10 text-green-500 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4 md:p-6 font-sans">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-6 h-[calc(100vh-3rem)]">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between bg-[#111] p-6 rounded-[2rem] border border-white/5 relative overflow-hidden shrink-0 gap-4">
          <div className="absolute top-0 right-1/4 w-[30%] h-full bg-orange-500/10 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="flex items-center gap-6 relative z-10 w-full md:w-auto">
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-tr from-red-600 to-orange-500 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.3)] shrink-0">
              <ChefHat size={32} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">Active Orders</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1.5 text-sm font-bold text-gray-400"><CircleDashed size={14} className="text-gray-400" /> {orders.filter(o => o.status === 'pending').length} Pending</span>
                <span className="flex items-center gap-1.5 text-sm font-bold text-orange-500"><Flame size={14} /> {orders.filter(o => o.status === 'cooking').length} Cooking</span>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-auto relative z-10 bg-[#1a1a1a] p-1.5 rounded-xl border border-white/5 flex gap-2">
            <button className="flex-1 md:flex-none px-6 py-2 bg-white text-black rounded-lg text-sm font-black shadow-sm">All Orders</button>
            <button className="flex-1 md:flex-none px-6 py-2 text-gray-400 hover:text-white rounded-lg text-sm font-bold transition-colors">History</button>
          </div>
        </header>

        {/* Single Feed Grid */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {orders.filter(o => o.status !== 'ready').sort((a, b) => {
              if (a.priority === 'high' && b.priority !== 'high') return -1;
              if (a.priority !== 'high' && b.priority === 'high') return 1;
              return 0; // maintain order otherwise, could parse time for real sort
            }).map(order => (
              <div key={order.id} className={`bg-[#111] rounded-[2rem] p-5 md:p-6 border relative overflow-hidden transition-all ${order.status === 'cooking' ? 'border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : 'border-white/5'}`}>
                
                {/* Priority Indicator */}
                {order.priority === 'high' && (
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)]" />
                )}
                
                {/* Top Row: Table and Meta */}
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center font-black text-2xl shadow-inner ${order.status === 'cooking' ? 'bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]' : order.priority === 'high' ? 'bg-red-500/20 text-red-500' : 'bg-[#222] text-white'}`}>
                      <span className="text-[10px] uppercase tracking-widest opacity-70 mb-0.5 leading-none">Table</span>
                      <span className="leading-none">{order.table}</span>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">Ticket #{order.id}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="flex items-center gap-1 text-xs font-bold text-gray-400 bg-white/5 px-2 py-1 rounded-md">
                          <Clock size={12} /> {order.wait} wait
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${order.status === 'cooking' ? 'bg-orange-500/20 text-orange-500' : 'bg-gray-500/20 text-gray-400'}`}>
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
                      <div className="w-8 h-8 rounded-lg bg-[#222] flex items-center justify-center font-black text-orange-500 shrink-0 border border-white/5">
                        {item.qty}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-black text-white md:text-lg leading-tight">{item.name}</p>
                        {item.notes && (
                          <div className="flex items-start gap-1.5 mt-1.5 text-amber-400 bg-amber-400/10 p-2 rounded-lg border border-amber-400/20">
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
                      className="flex-1 py-4 md:py-5 rounded-xl bg-[#222] hover:bg-orange-500 text-white font-black text-base flex items-center justify-center gap-2 transition-all active:scale-95 group border border-white/5 hover:border-orange-500"
                    >
                      <Flame size={20} className="group-hover:animate-pulse" /> Start Cooking
                    </button>
                  )}
                  {order.status === 'cooking' && (
                    <button 
                      onClick={() => updateStatus(order.id, 'ready')}
                      className="flex-1 py-4 md:py-5 rounded-xl bg-orange-500 hover:bg-green-500 text-white font-black text-base flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(249,115,22,0.4)] active:scale-95"
                    >
                      <CheckCircle size={20} /> Mark as Ready
                    </button>
                  )}
                </div>
              </div>
            ))}

            {orders.filter(o => o.status !== 'ready').length === 0 && (
               <div className="col-span-1 md:col-span-2 flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                 <CheckCircle size={64} className="opacity-20" />
                 <h2 className="text-2xl font-black text-white/50">All caught up!</h2>
                 <p className="font-bold">No active orders right now.</p>
               </div>
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #555; }
      `}} />
    </div>
  );
}
