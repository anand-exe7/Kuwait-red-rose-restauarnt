"use client";

// Admin "Open Tabs" — one card per open dine-in session. Shows every order on
// the tab (approved + still queued), total so far, and a Close Bill action
// which runs billSession() → every device sees the tab close in real-time,
// including the customer's /customer?table=N page.
//
// A single-item "Add item" quick-picker lets the admin append a dine-in order
// from the floor without needing the kitchen to re-enter it.

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Receipt, Plus, X, Users, Clock, CheckCircle2 } from 'lucide-react';
import {
  Order, OrderItem, addOrder, billSession,
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders,
} from '../lib/orderStore';
import {
  Session, getSessionsSnapshot, getSessionsServerSnapshot, subscribeToSessions,
} from '../lib/sessionStore';
import {
  MenuItem, getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu,
} from '../lib/menuStore';
import { formatKWD } from '../lib/currency';

export default function OpenTabsSection() {
  const sessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const orders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);

  const openTabs = useMemo(
    () => sessions
      .filter(s => s.status === 'open' && s.mode === 'table')
      .sort((a, b) => a.openedAt - b.openedAt),
    [sessions]
  );

  if (openTabs.length === 0) {
    return (
      <div className="rounded-3xl border border-brand-gold/30 bg-brand-cream p-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold-dark">
          <Users size={28} />
        </div>
        <h3 className="font-display text-2xl text-brand-wine">No open tabs</h3>
        <p className="mt-2 font-body text-sm text-brand-wine/70">
          When a dine-in order comes in, its table opens a tab here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black">Open dine-in tabs</h2>
          <p className="text-sm text-brand-wine/70">
            {openTabs.length} {openTabs.length === 1 ? 'table has' : 'tables have'} an open tab.
            Close the bill when the guests pay.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {openTabs.map(s => (
          <TabCard key={s.id} session={s} orders={orders} menu={menu} />
        ))}
      </div>
    </div>
  );
}

function TabCard({ session, orders, menu }: { session: Session; orders: Order[]; menu: MenuItem[] }) {
  const [adding, setAdding] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const tabOrders = orders.filter(o => o.sessionId === session.id);
  const subtotal = tabOrders.reduce((s, o) => s + o.subtotal, 0);
  const tax = tabOrders.reduce((s, o) => s + o.tax, 0);
  const total = tabOrders.reduce((s, o) => s + o.total, 0);
  const openMins = Math.max(0, Math.floor((Date.now() - session.openedAt) / 60000));

  const anyPending = tabOrders.some(o => o.status === 'awaiting_admin' || o.status === 'pending' || o.status === 'cooking');

  const handleAdd = (item: MenuItem, qty: number) => {
    const subtotal = item.price * qty;
    const tax = subtotal * 0.1;
    addOrder({
      table: session.tableNumber ?? 0,
      items: [{ id: item.id, name: item.name, price: item.price, qty }],
      priority: 'normal',
      subtotal,
      tax,
      total: subtotal + tax,
      source: 'waiter', // admin-added → skips approval queue
      mode: 'table',
      sessionId: session.id,
    });
    setAdding(false);
  };

  const handleClose = () => {
    billSession(session.id);
    setConfirmClose(false);
  };

  return (
    <div className="rounded-3xl border border-brand-gold/30 bg-brand-cream p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-brand-wine text-brand-gold-light leading-none">
              <span className="text-[8px] font-medium uppercase tracking-[0.2em] opacity-75">Tbl</span>
              <span className="font-display text-xl font-bold">{session.tableNumber}</span>
            </span>
            <div>
              <h3 className="font-display text-xl font-bold text-brand-wine">Table {session.tableNumber}</h3>
              <p className="flex items-center gap-1 font-body text-xs text-brand-wine/70">
                <Clock size={11} /> open {openMins} min · {tabOrders.length} {tabOrders.length === 1 ? 'order' : 'orders'}
              </p>
            </div>
          </div>
        </div>
        {anyPending && (
          <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Still cooking
          </span>
        )}
      </div>

      <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">
        {tabOrders.length === 0 ? (
          <li className="rounded-xl bg-brand-cream/50 p-3 text-center text-xs text-brand-wine/70">
            No items yet.
          </li>
        ) : (
          tabOrders.flatMap(o => o.items.map(i => (
            <li key={`${o.id}-${i.id}`} className="flex items-center justify-between rounded-xl bg-brand-cream/50 px-3 py-2 text-sm">
              <span className="truncate">
                <span className="font-semibold text-brand-wine">{i.qty}×</span> {i.name}
                <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${statusTone(o.status)}`}>
                  {o.status === 'awaiting_admin' ? 'queued' : o.status}
                </span>
              </span>
              <span className="font-mono text-xs text-brand-wine/75">{formatKWD(i.price * i.qty)}</span>
            </li>
          )))
        )}
      </ul>

      <div className="mt-3 border-t border-brand-gold/40 pt-3">
        <div className="flex items-end justify-between">
          <div className="text-xs text-brand-wine/70">
            Subtotal {formatKWD(subtotal)}
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-wine/70">Total</div>
            <div className="font-display text-2xl font-bold text-brand-red">{formatKWD(total)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-2 rounded-2xl border border-brand-gold/40 bg-white px-4 py-3 text-sm font-semibold text-brand-wine/80 transition-colors hover:border-brand-red hover:text-brand-red"
        >
          <Plus size={16} /> Add item
        </button>
        {confirmClose ? (
          <button
            onClick={handleClose}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <CheckCircle2 size={16} /> Confirm — close bill
          </button>
        ) : (
          <button
            onClick={() => setConfirmClose(true)}
            disabled={tabOrders.length === 0}
            className="flex items-center justify-center gap-2 rounded-2xl bg-brand-wine px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-wine/85 disabled:opacity-40"
          >
            <Receipt size={16} /> Close bill
          </button>
        )}
      </div>
      {confirmClose && (
        <button
          onClick={() => setConfirmClose(false)}
          className="mt-2 w-full text-center font-body text-[11px] uppercase tracking-[0.2em] text-brand-wine/60 hover:text-brand-red"
        >
          Cancel
        </button>
      )}

      {adding && (
        <AddItemModal menu={menu} onCancel={() => setAdding(false)} onAdd={handleAdd} />
      )}
    </div>
  );
}

function AddItemModal({ menu, onCancel, onAdd }: {
  menu: MenuItem[];
  onCancel: () => void;
  onAdd: (item: MenuItem, qty: number) => void;
}) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const active = menu.filter(m => m.status === 'active');
  const filtered = q
    ? active.filter(m => m.name.toLowerCase().includes(q.toLowerCase()))
    : active;

  // Lock the background from scrolling while the modal is open — otherwise
  // the admin page beneath the backdrop scrolls on wheel / touch.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#2a0a0a]/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
      onWheel={e => e.stopPropagation()}
      onTouchMove={e => e.stopPropagation()}
    >
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <button onClick={onCancel} aria-label="Close" className="absolute right-4 top-4 rounded-full p-2 text-brand-wine/60 hover:bg-brand-sand/70">
          <X size={16} />
        </button>
        <h3 className="font-display text-xl font-bold text-brand-wine">Add item to tab</h3>

        {!picked ? (
          <>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search menu…"
              className="mt-4 w-full rounded-2xl border border-brand-gold/40 bg-brand-cream/50 px-4 py-3 text-sm focus:border-brand-red focus:outline-none"
            />
            <ul className="mt-3 max-h-72 overflow-y-auto">
              {filtered.map(m => (
                <li key={m.id}>
                  <button
                    onClick={() => setPicked(m)}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-brand-cream/60"
                  >
                    <span className="truncate text-brand-wine">{m.name}</span>
                    <span className="font-mono text-xs text-brand-wine/75">{formatKWD(m.price)}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-xs text-brand-wine/65">No matching item.</li>
              )}
            </ul>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-brand-cream/50 p-3">
              <div>
                <p className="font-display text-lg font-semibold text-brand-wine">{picked.name}</p>
                <p className="font-mono text-xs text-brand-wine/70">{formatKWD(picked.price)} each</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-brand-gold/40 bg-white p-1">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="h-8 w-8 rounded-full hover:bg-brand-sand/70">−</button>
                <span className="w-6 text-center font-bold">{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="h-8 w-8 rounded-full bg-brand-red font-bold text-white hover:bg-brand-red-dark">+</button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setPicked(null)} className="rounded-2xl border border-brand-gold/40 bg-white px-4 py-3 text-sm font-semibold text-brand-wine/75 hover:border-brand-wine">
                Back
              </button>
              <button onClick={() => onAdd(picked, qty)} className="rounded-2xl bg-brand-red px-4 py-3 text-sm font-semibold text-white hover:bg-brand-red-dark">
                Add · {formatKWD(picked.price * qty)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function statusTone(s: Order['status']): string {
  switch (s) {
    case 'awaiting_admin': return 'bg-amber-500/15 text-amber-700';
    case 'pending': return 'bg-gray-500/15 text-gray-700';
    case 'cooking': return 'bg-brand-red/15 text-brand-red-dark';
    case 'ready': return 'bg-blue-500/15 text-blue-700';
    case 'served': return 'bg-brand-green/15 text-brand-green';
  }
}
