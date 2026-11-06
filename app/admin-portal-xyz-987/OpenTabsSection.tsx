"use client";

// Admin "Open Tabs" — one card per open dine-in session. Shows every order on
// the tab (approved + still queued), total so far, and a Close Bill action
// which runs billSession() → every device sees the tab close in real-time,
// including the customer's /customer?table=N page.
//
// A single-item "Add item" quick-picker lets the admin append a dine-in order
// from the floor without needing the kitchen to re-enter it.

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Order, addOrder, billSession,
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders,
} from '../lib/orderStore';
import {
  Session, getSessionsSnapshot, getSessionsServerSnapshot, subscribeToSessions,
} from '../lib/sessionStore';
import {
  MenuItem, getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu,
} from '../lib/menuStore';
import { formatKWD } from '../lib/currency';
import { getTaxSettings, taxAmountFor } from '../lib/taxStore';
import { Page, PageHead, Card, Btn, Badge, Icon, Empty, Modal, SearchBox, ago, type BadgeTone } from './_ui/kit';

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

  return (
    <Page>
      <PageHead
        title="Open dine-in tabs"
        bar
        sub={openTabs.length === 0
          ? 'When a dine-in order comes in, its table opens a tab here.'
          : `${openTabs.length} ${openTabs.length === 1 ? 'table has' : 'tables have'} an open tab — close the bill when the guests pay.`}
      />

      {openTabs.length === 0 ? (
        <Card>
          <Empty icon="users" title="No open tabs">When a dine-in order comes in, its table opens a tab here.</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {openTabs.map(s => (
            <TabCard key={s.id} session={s} orders={orders} menu={menu} />
          ))}
        </div>
      )}
    </Page>
  );
}

function TabCard({ session, orders, menu }: { session: Session; orders: Order[]; menu: MenuItem[] }) {
  const [adding, setAdding] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const tabOrders = orders.filter(o => o.sessionId === session.id);
  const subtotal = tabOrders.reduce((s, o) => s + o.subtotal, 0);
  const total = tabOrders.reduce((s, o) => s + o.total, 0);
  const anyPending = tabOrders.some(o => o.status === 'awaiting_admin' || o.status === 'pending' || o.status === 'cooking');

  const handleAdd = (item: MenuItem, qty: number) => {
    const sub = item.price * qty;
    const taxCfg = getTaxSettings();
    const tax = taxAmountFor(sub, taxCfg);
    // Carry the tab's customer identity onto the admin-added order so it folds
    // into the one invoice and shows up in that customer's profile/history.
    const cust = tabOrders.find(o => o.customer)?.customer
      ?? (session.customerName || session.customerPhone
        ? { name: session.customerName ?? undefined, phone: session.customerPhone ?? undefined }
        : undefined);
    addOrder({
      table: session.tableNumber ?? 0,
      items: [{ id: item.id, name: item.name, price: item.price, qty }],
      priority: 'normal',
      subtotal: sub,
      tax,
      total: sub + (taxCfg.inclusive ? 0 : tax),
      source: 'waiter', // admin-added → skips approval queue
      mode: 'table',
      sessionId: session.id,
      customer: cust,
    });
    setAdding(false);
  };

  const handleClose = () => {
    billSession(session.id);
    setConfirmClose(false);
  };

  return (
    <Card className="adm-in">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 flex-col items-center justify-center rounded-2xl bg-slate-900 leading-none text-amber-200">
            <span className="text-[8px] font-medium uppercase tracking-[0.2em] opacity-75">Tbl</span>
            <span className="adm-num text-xl font-bold">{session.tableNumber}</span>
          </span>
          <div>
            <h3 className="adm-title text-xl text-slate-900">
              Table {session.tableNumber}
              {(session.customerName || tabOrders[0]?.customer?.name) && (
                <span className="ml-2 align-middle text-sm font-medium text-slate-500">
                  · {session.customerName || tabOrders[0]?.customer?.name}
                </span>
              )}
            </h3>
            <p className="flex items-center gap-1 text-xs text-slate-500">
              <Icon name="clock" size={11} /> open {ago(session.openedAt)} · {tabOrders.length} {tabOrders.length === 1 ? 'order' : 'orders'}
              {session.billRequestedAt ? <span className="ml-1 font-semibold text-red-600">· bill requested</span> : null}
            </p>
          </div>
        </div>
        {anyPending && <Badge tone="amber">Still cooking</Badge>}
      </div>

      <ul className="adm-scroll mt-4 max-h-56 space-y-2 overflow-y-auto">
        {tabOrders.length === 0 ? (
          <li className="rounded-xl bg-slate-50 p-3 text-center text-xs text-slate-500">No items yet.</li>
        ) : (
          tabOrders.flatMap(o => o.items.map(i => (
            <li key={`${o.id}-${i.id}`} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="truncate">
                <span className="font-semibold text-slate-800">{i.qty}×</span> {i.name}
                <span className="ml-2 align-middle">
                  <Badge tone={statusTone(o.status)}>{o.status === 'awaiting_admin' ? 'queued' : o.status}</Badge>
                </span>
              </span>
              <span className="adm-num text-xs text-slate-500">{formatKWD(i.price * i.qty)}</span>
            </li>
          )))
        )}
      </ul>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex items-end justify-between">
          <div className="text-xs text-slate-500">Subtotal {formatKWD(subtotal)}</div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total</div>
            <div className="adm-num text-2xl font-extrabold text-red-600">{formatKWD(total)}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn kind="ghost" icon="plus" className="h-11" onClick={() => setAdding(true)}>Add item</Btn>
        {confirmClose ? (
          <Btn kind="green" icon="check" className="h-11" onClick={handleClose}>Confirm — close</Btn>
        ) : (
          <Btn kind="dark" icon="billing" className="h-11" disabled={tabOrders.length === 0} onClick={() => setConfirmClose(true)}>Close bill</Btn>
        )}
      </div>
      {confirmClose && (
        <button type="button" onClick={() => setConfirmClose(false)} className="mt-2 w-full text-center text-[11px] uppercase tracking-[0.2em] text-slate-400 hover:text-red-600">
          Cancel
        </button>
      )}

      {adding && <AddItemModal menu={menu} onCancel={() => setAdding(false)} onAdd={handleAdd} />}
    </Card>
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
  const filtered = q ? active.filter(m => m.name.toLowerCase().includes(q.toLowerCase())) : active;

  return (
    <Modal open onClose={onCancel} title="Add item to tab">
      {!picked ? (
        <>
          <SearchBox value={q} onChange={setQ} placeholder="Search menu…" />
          <ul className="adm-scroll mt-3 max-h-72 overflow-y-auto">
            {filtered.map(m => (
              <li key={m.id}>
                <button type="button" onClick={() => setPicked(m)} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                  <span className="truncate text-slate-800">{m.name}</span>
                  <span className="adm-num text-xs text-slate-500">{formatKWD(m.price)}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">No matching item.</li>}
          </ul>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
            <div>
              <p className="adm-title text-lg text-slate-900">{picked.name}</p>
              <p className="adm-num text-xs text-slate-500">{formatKWD(picked.price)} each</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1">
              <button type="button" onClick={() => setQty(v => Math.max(1, v - 1))} className="h-8 w-8 rounded-full hover:bg-slate-100">−</button>
              <span className="w-6 text-center font-bold">{qty}</span>
              <button type="button" onClick={() => setQty(v => v + 1)} className="h-8 w-8 rounded-full bg-red-600 font-bold text-white hover:bg-red-700">+</button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Btn kind="ghost" className="h-11" onClick={() => setPicked(null)}>Back</Btn>
            <Btn kind="red" className="h-11" onClick={() => onAdd(picked, qty)}>Add · {formatKWD(picked.price * qty)}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
}

function statusTone(s: Order['status']): BadgeTone {
  switch (s) {
    case 'awaiting_admin': return 'amber';
    case 'pending': return 'slate';
    case 'cooking': return 'red';
    case 'ready': return 'sky';
    case 'served': return 'green';
  }
}
