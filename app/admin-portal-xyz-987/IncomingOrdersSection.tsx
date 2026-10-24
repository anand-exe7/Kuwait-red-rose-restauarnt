"use client";

// Admin "Incoming Orders" queue — every customer order lands here with
// status='awaiting_admin'. Admin approves to release it to the kitchen, or
// rejects to drop it. Tagged by mode (dine-in / takeaway / delivery) and shows
// customer contact + delivery address when relevant.

import React from 'react';
import { Check, X, MapPin, Bike, PackageCheck, Phone, Clock } from 'lucide-react';
import { Order, approveOrder, rejectOrder } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';

interface Props {
  orders: Order[];
}

const MODE_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  table:    { label: 'Dine-in',  Icon: MapPin,        tone: 'bg-brand-wine/10 text-brand-wine' },
  standing: { label: 'Standing', Icon: MapPin,        tone: 'bg-brand-wine/10 text-brand-wine' },
  takeaway: { label: 'Takeaway', Icon: PackageCheck,  tone: 'bg-amber-500/10 text-amber-700' },
  delivery: { label: 'Delivery', Icon: Bike,          tone: 'bg-brand-red/10 text-brand-red' },
};

export default function IncomingOrdersSection({ orders }: Props) {
  const pending = orders
    .filter(o => o.status === 'awaiting_admin')
    .sort((a, b) => a.createdAt - b.createdAt); // oldest first — FIFO queue

  if (pending.length === 0) {
    return (
      <div className="rounded-3xl border border-black/5 bg-white p-16 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <Check size={28} />
        </div>
        <h3 className="font-display text-2xl text-brand-wine">All caught up</h3>
        <p className="mt-2 font-body text-sm text-black/50">
          No orders waiting on approval. New customer orders will appear here instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black">Incoming orders</h2>
          <p className="text-sm text-black/55">
            {pending.length} {pending.length === 1 ? 'order' : 'orders'} waiting on your approval.
            Approve to send to the kitchen.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {pending.map(o => {
          const meta = MODE_META[o.mode ?? 'table'];
          const minsAgo = Math.max(0, Math.floor((Date.now() - o.createdAt) / 60000));
          return (
            <div key={o.id} className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-body text-[10px] font-semibold uppercase tracking-[0.18em] ${meta.tone}`}>
                    <meta.Icon size={12} /> {meta.label}
                  </span>
                  <span className="font-mono text-xs text-black/50">#{o.id}</span>
                </div>
                <span className="inline-flex items-center gap-1 font-body text-xs text-black/50">
                  <Clock size={12} /> {minsAgo < 1 ? 'just now' : `${minsAgo} min ago`}
                </span>
              </div>

              {o.customer && (
                <div className="mt-3 rounded-2xl bg-brand-cream/50 px-4 py-3">
                  <p className="font-body text-sm font-semibold text-brand-wine">
                    {o.customer.name || 'Customer'}
                  </p>
                  {o.customer.phone && (
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-black/60">
                      <Phone size={11} /> {o.customer.phone}
                    </p>
                  )}
                </div>
              )}

              {o.mode === 'table' && (
                <p className="mt-3 font-body text-sm text-brand-wine/80">
                  Table <span className="font-bold text-brand-red">{o.table}</span>
                </p>
              )}

              {o.mode === 'delivery' && o.deliveryAddress && (
                <div className="mt-3 rounded-2xl border border-brand-red/15 bg-brand-red/5 px-4 py-3 font-body text-xs leading-relaxed text-brand-wine/80">
                  <p className="font-semibold text-brand-red">Delivery to:</p>
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
                  {o.deliveryAddress.landmark && (
                    <p className="mt-1 italic text-black/60">— {o.deliveryAddress.landmark}</p>
                  )}
                </div>
              )}

              <ul className="mt-3 divide-y divide-black/5 rounded-2xl bg-white">
                {o.items.map(i => (
                  <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      <span className="font-semibold text-brand-wine">{i.qty}×</span> {i.name}
                    </span>
                    <span className="font-mono text-black/60">{formatKWD(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-end justify-between border-t border-black/10 pt-3">
                <div className="text-xs text-black/55">
                  Subtotal {formatKWD(o.subtotal)} · Tax {formatKWD(o.tax)}
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/50">Total</div>
                  <div className="font-display text-2xl font-bold text-brand-red">{formatKWD(o.total)}</div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => rejectOrder(o.id)}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-black/70 transition-colors hover:border-brand-red hover:text-brand-red"
                >
                  <X size={16} /> Reject
                </button>
                <button
                  onClick={() => approveOrder(o.id)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-brand-red px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-red-dark"
                >
                  <Check size={16} /> Approve → Chef
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
