"use client";

// Admin "Incoming Orders" queue — every customer order lands here with
// status='awaiting_admin'. Admin approves to release it to the kitchen, or
// rejects to drop it. Tagged by mode (dine-in / takeaway / delivery) and shows
// customer contact + delivery address when relevant.

import React from 'react';
import { Phone } from 'lucide-react';
import { Order, approveOrder, rejectOrder } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { Page, PageHead, Card, Btn, Badge, Icon, Empty, ago, type IconName, type BadgeTone } from './_ui/kit';

interface Props {
  orders: Order[];
}

const MODE_META: Record<string, { label: string; icon: IconName; tone: BadgeTone }> = {
  table:    { label: 'Dine-in',  icon: 'tables',   tone: 'slate' },
  standing: { label: 'Standing', icon: 'tables',   tone: 'slate' },
  takeaway: { label: 'Takeaway', icon: 'bag',      tone: 'amber' },
  delivery: { label: 'Delivery', icon: 'cart',     tone: 'red' },
};

export default function IncomingOrdersSection({ orders }: Props) {
  const pending = orders
    .filter(o => o.status === 'awaiting_admin')
    .sort((a, b) => a.createdAt - b.createdAt); // oldest first — FIFO queue

  return (
    <Page>
      <PageHead
        title="Incoming orders"
        bar
        sub={pending.length === 0
          ? 'New customer orders will appear here instantly.'
          : `${pending.length} ${pending.length === 1 ? 'order' : 'orders'} waiting on your approval — approve to send to the kitchen.`}
      />

      {pending.length === 0 ? (
        <Card>
          <Empty icon="check" title="All caught up">
            No orders waiting on approval. New customer orders will appear here instantly.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map(o => {
            const meta = MODE_META[o.mode ?? 'table'];
            return (
              <Card key={o.id} className="adm-in">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone}>
                      <Icon name={meta.icon} size={12} /> {meta.label}
                    </Badge>
                    <span className="adm-num text-xs font-bold text-slate-500">#{o.id}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-500">
                    <Icon name="clock" size={12} /> {ago(o.createdAt)}
                  </span>
                </div>

                {o.customer && (
                  <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">{o.customer.name || 'Customer'}</p>
                    {o.customer.phone && (
                      <p className="adm-num mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <Phone size={11} /> {o.customer.phone}
                      </p>
                    )}
                  </div>
                )}

                {o.mode === 'table' && (
                  <p className="mt-3 text-sm text-slate-600">
                    Table <span className="font-bold text-red-600">{o.table}</span>
                  </p>
                )}

                {o.mode === 'delivery' && o.deliveryAddress && (
                  <div className="mt-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                    <p className="font-semibold text-red-600">Delivery to:</p>
                    <p className="mt-1">
                      {[
                        o.deliveryAddress.governorate,
                        o.deliveryAddress.area,
                        o.deliveryAddress.street && `St ${o.deliveryAddress.street}`,
                        o.deliveryAddress.avenue && `Ave ${o.deliveryAddress.avenue}`,
                        o.deliveryAddress.building && `Bldg ${o.deliveryAddress.building}`,
                        o.deliveryAddress.floor && `Fl ${o.deliveryAddress.floor}`,
                        o.deliveryAddress.apartment && `Apt ${o.deliveryAddress.apartment}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    {o.deliveryAddress.landmark && <p className="mt-1 italic text-slate-500">— {o.deliveryAddress.landmark}</p>}
                  </div>
                )}

                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white px-3">
                  {o.items.map(i => (
                    <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        <span className="font-semibold text-slate-800">{i.qty}×</span> {i.name}
                      </span>
                      <span className="adm-num text-slate-500">{formatKWD(i.price * i.qty)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-end justify-between border-t border-slate-100 pt-3">
                  <div className="text-xs text-slate-500">Subtotal {formatKWD(o.subtotal)}</div>
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Total</div>
                    <div className="adm-num text-2xl font-extrabold text-red-600">{formatKWD(o.total)}</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Btn kind="ghost" icon="x" onClick={() => rejectOrder(o.id)} className="h-11">Reject</Btn>
                  <Btn kind="red" icon="check" onClick={() => approveOrder(o.id)} className="h-11">Approve → Chef</Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
