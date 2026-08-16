"use client";
import React from 'react';
import { LayoutDashboard, TrendingUp, Users, DollarSign, Activity, PieChart, ArrowUpRight, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminDashboard() {
  const stats = [
    { label: 'Total Revenue', value: '$4,289.00', change: '+12.5%', icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Active Orders', value: '24', change: '+3.2%', icon: Activity, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: 'Customers Today', value: '142', change: '-2.4%', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Avg. Prep Time', value: '14m', change: '-1.5m', icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ];

  const recentOrders = [
    { id: '#1045', table: 4, items: 3, total: '$145.00', status: 'completed', time: '2 mins ago' },
    { id: '#1046', table: 2, items: 2, total: '$85.00', status: 'preparing', time: '5 mins ago' },
    { id: '#1047', table: 7, items: 5, total: '$320.00', status: 'ready', time: '12 mins ago' },
    { id: '#1048', table: 1, items: 1, total: '$42.00', status: 'pending', time: '15 mins ago' },
  ];

  const topItems = [
    { name: 'Wagyu Steak', sales: 45, revenue: '$3,825' },
    { name: 'Truffle Pasta', sales: 38, revenue: '$1,596' },
    { name: 'Lobster Bisque', sales: 24, revenue: '$672' },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6 font-sans">
      {/* Sidebar Navigation */}
      <div className="fixed left-0 top-0 h-full w-20 md:w-64 bg-[#141414] border-r border-white/5 flex flex-col p-4 z-50 transition-all">
        <div className="flex items-center gap-3 mb-10 pl-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <LayoutDashboard size={20} className="text-white" />
          </div>
          <span className="font-bold text-xl hidden md:block">RestoAdmin</span>
        </div>
        
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { icon: LayoutDashboard, label: 'Dashboard', active: true },
            { icon: Activity, label: 'Live Orders', active: false },
            { icon: Users, label: 'Staff', active: false },
            { icon: PieChart, label: 'Analytics', active: false },
          ].map((item, i) => (
            <button key={i} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${item.active ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
              <item.icon size={20} />
              <span className="font-medium hidden md:block">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto p-4 flex items-center gap-3">
          <img src="https://i.pravatar.cc/150?img=11" alt="Admin" className="w-10 h-10 rounded-full border border-white/10" />
          <div className="hidden md:block">
            <p className="text-sm font-bold">Sarah Admin</p>
            <p className="text-xs text-gray-500">Manager</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="ml-20 md:ml-64 p-4 md:p-8">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-bold mb-1">Overview</h1>
            <p className="text-gray-400">Welcome back, here's what's happening today.</p>
          </div>
          <div className="flex gap-4">
            <button className="px-4 py-2 bg-[#1a1a1a] rounded-xl text-sm font-medium border border-white/5 hover:border-white/10 transition-colors">Export Report</button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {stats.map((stat, i) => (
            <div key={i} className="bg-[#141414] p-6 rounded-3xl border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-2xl ${stat.bg} ${stat.color}`}>
                  <stat.icon size={24} />
                </div>
                <span className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${stat.change.startsWith('+') ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                  {stat.change} <ArrowUpRight size={12} className={stat.change.startsWith('-') ? 'rotate-90' : ''} />
                </span>
              </div>
              <h3 className="text-gray-400 text-sm font-medium mb-1">{stat.label}</h3>
              <p className="text-3xl font-bold text-white">{stat.value}</p>
              
              {/* Decorative gradient */}
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-colors" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Orders List */}
          <div className="lg:col-span-2 bg-[#141414] rounded-3xl p-6 border border-white/5">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Live Orders</h2>
              <button className="text-blue-500 text-sm font-medium hover:text-blue-400">View All</button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-gray-500 text-sm border-b border-white/5">
                    <th className="pb-4 font-medium">Order ID</th>
                    <th className="pb-4 font-medium">Table</th>
                    <th className="pb-4 font-medium">Items</th>
                    <th className="pb-4 font-medium">Total</th>
                    <th className="pb-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-[#1a1a1a] transition-colors">
                      <td className="py-4 font-medium">{order.id}</td>
                      <td className="py-4 text-gray-300">Table {order.table}</td>
                      <td className="py-4 text-gray-300">{order.items} items</td>
                      <td className="py-4 font-bold">{order.total}</td>
                      <td className="py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize
                          ${order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                            order.status === 'preparing' ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' : 
                            order.status === 'ready' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
                            'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'}`}>
                          {order.status === 'completed' && <CheckCircle2 size={12} />}
                          {order.status === 'pending' && <AlertCircle size={12} />}
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Items */}
          <div className="bg-[#141414] rounded-3xl p-6 border border-white/5 flex flex-col">
            <h2 className="text-xl font-bold mb-6">Top Selling Items</h2>
            <div className="flex flex-col gap-4 flex-1">
              {topItems.map((item, i) => (
                <div key={i} className="flex items-center gap-4 bg-[#1a1a1a] p-4 rounded-2xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm">
                    {i + 1}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">{item.name}</h4>
                    <p className="text-xs text-gray-400">{item.sales} orders</p>
                  </div>
                  <div className="font-bold text-emerald-400">
                    {item.revenue}
                  </div>
                </div>
              ))}
            </div>
            
            <button className="w-full mt-6 py-3 rounded-xl bg-[#1a1a1a] text-white text-sm font-bold hover:bg-[#222] transition-colors border border-white/5">
              Full Menu Analysis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
