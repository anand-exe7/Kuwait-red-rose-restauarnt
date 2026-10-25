"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Plus, Minus, Trash2, X, ListPlus, MessageCircle, ShoppingCart, Search, Save } from 'lucide-react';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../lib/menuStore';
import { getCouponsSnapshot, getCouponsServerSnapshot, subscribeToCoupons, validateCoupon, isExpired, remainingUses } from '../lib/couponStore';
import { addOrder } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { BRAND } from '../lib/brand';

interface Line { key: string; name: string; price: number; qty: number }
const uid = () => Math.random().toString(36).slice(2, 9);

export default function BillingSection() {
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const coupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);

  const [source, setSource] = useState<'offline' | 'online'>('offline');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [manualType, setManualType] = useState<'KD' | '%'>('KD');
  const [manualValue, setManualValue] = useState('');
  const [delivery, setDelivery] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const activeCoupons = useMemo(
    () => coupons.filter(c => c.active && !isExpired(c) && (remainingUses(c) === null || (remainingUses(c) as number) > 0)),
    [coupons]
  );

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  const couponResult = couponCode ? validateCoupon(couponCode, subtotal) : null;
  const couponDiscount = couponResult?.ok ? (couponResult.discount || 0) : 0;

  const manualNum = Number(manualValue) || 0;
  const manualDiscount = manualType === '%' ? (subtotal * manualNum) / 100 : manualNum;

  const totalDiscount = Math.min(subtotal, couponDiscount + Math.max(0, manualDiscount));
  const deliveryNum = Math.max(0, Number(delivery) || 0);
  const grandTotal = Math.max(0, subtotal - totalDiscount) + deliveryNum;
  const received = Number(amountReceived) || 0;
  const change = received - grandTotal;

  const addCustom = () => setLines(ls => [...ls, { key: uid(), name: '', price: 0, qty: 1 }]);
  const addFromCatalog = (name: string, price: number) => {
    setLines(ls => {
      const existing = ls.find(l => l.name === name && l.price === price);
      if (existing) return ls.map(l => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, { key: uid(), name, price, qty: 1 }];
    });
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines(ls => ls.filter(l => l.key !== key));
  const clearOrder = () => {
    setLines([]); setCustomerName(''); setPhone(''); setCouponCode('');
    setManualValue(''); setDelivery(''); setAmountReceived('');
  };

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  // Saves the bill as a completed order (shows up in Orders & Analytics).
  // If `sendWhatsApp` is true, also opens a pre-filled WhatsApp draft.
  const saveBill = (sendWhatsApp: boolean) => {
    if (lines.length === 0 || itemCount === 0) { flash('Add at least one item first.'); return; }

    addOrder({
      table: 0,
      mode: 'takeaway',
      source: 'waiter',
      status: 'served',
      priority: 'normal',
      items: lines.map(l => ({ id: l.key, name: l.name || 'Item', price: l.price, qty: l.qty })),
      subtotal,
      tax: 0,
      total: grandTotal,
      discount: totalDiscount > 0 ? totalDiscount : undefined,
      couponCode: couponResult?.ok ? couponCode : undefined,
      billImmediately: true,
      customer: (customerName.trim() || phone.trim())
        ? { name: customerName.trim() || undefined, phone: phone.trim() || undefined }
        : undefined,
    });

    if (sendWhatsApp) {
      const lineText = lines.map(l => `• ${l.qty}× ${l.name || 'Item'} — ${formatKWD(l.price * l.qty)}`).join('%0A');
      const parts = [
        `*${BRAND.fullName}*`,
        customerName ? `Customer: ${customerName}` : '',
        `%0A${lineText}`,
        `%0ASubtotal: ${formatKWD(subtotal)}`,
        totalDiscount > 0 ? `Discount: -${formatKWD(totalDiscount)}` : '',
        deliveryNum > 0 ? `Delivery: ${formatKWD(deliveryNum)}` : '',
        `*Total: ${formatKWD(grandTotal)}*`,
        source === 'offline' && received > 0 ? `Cash: ${formatKWD(received)} · Change: ${formatKWD(Math.max(0, change))}` : '',
        `%0AThank you! 🌹`,
      ].filter(Boolean);
      const msg = parts.join('%0A');
      const digits = phone.replace(/\D/g, '');
      const withCc = digits.length && digits.length <= 8 ? `965${digits}` : digits;
      const url = withCc ? `https://wa.me/${withCc}?text=${msg}` : `https://wa.me/?text=${msg}`;
      window.open(url, '_blank');
      flash('Bill saved · WhatsApp draft opened');
    } else {
      flash('Bill saved locally — see Orders tab');
    }
    clearOrder();
  };

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink placeholder:text-brand-wine/40 focus:outline-none focus:border-brand-red';
  const panelCls = 'bg-brand-cream rounded-3xl border border-brand-gold/30 shadow-[0_18px_40px_-24px_rgba(74,21,21,0.35)]';

  return (
    <div className="flex flex-col gap-6">
      {toast && (
        <div className="fixed top-20 right-6 z-50 bg-brand-wine text-brand-gold-light px-4 py-2.5 rounded-xl text-sm font-bold shadow-xl border border-brand-gold/40">{toast}</div>
      )}

      {/* Header + source toggle */}
      <div className={`${panelCls} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}>
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-8 rounded-full bg-brand-red" />
          <div>
            <h2 className="text-xl font-black text-brand-wine">POS Billing Panel</h2>
            <p className="text-xs text-brand-wine/60">Quick invoice generator &amp; database-synced checkout</p>
          </div>
        </div>
        <div className="flex bg-brand-sand/70 rounded-full p-1 self-start border border-brand-gold/30">
          <button onClick={() => setSource('offline')} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${source === 'offline' ? 'bg-brand-red text-white shadow' : 'text-brand-wine/70 hover:text-brand-wine'}`}>
            ● OFFLINE (POS)
          </button>
          <button onClick={() => setSource('online')} className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${source === 'online' ? 'bg-brand-green text-white shadow' : 'text-brand-wine/70 hover:text-brand-wine'}`}>
            ● ONLINE ORDER
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: customer + items */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className={`${panelCls} p-5 sm:p-6`}>
            <h3 className="text-sm font-black uppercase tracking-wide text-brand-wine/70 mb-4">Customer Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase">Customer Name</label>
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Enter name" className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block uppercase">Mobile (WhatsApp)</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter 8-digit number" className={inputCls} />
              </div>
            </div>
          </div>

          <div className={`${panelCls} p-5 sm:p-6`}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-black uppercase tracking-wide text-brand-wine/70">Order Items</h3>
              <div className="flex gap-2 flex-wrap">
                <button onClick={clearOrder} className="px-3 py-2 rounded-lg bg-brand-sand/70 hover:bg-brand-sand text-brand-wine text-xs font-bold">Clear Order</button>
                <button onClick={() => setCatalogOpen(true)} className="px-3 py-2 rounded-lg bg-brand-sand/70 hover:bg-brand-sand text-brand-wine text-xs font-bold flex items-center gap-1.5"><ListPlus size={14} /> Catalog</button>
                <button onClick={addCustom} className="px-3 py-2 rounded-lg bg-brand-red/10 text-brand-red hover:bg-brand-red/20 text-xs font-bold flex items-center gap-1.5"><Plus size={14} /> Add Custom Item</button>
              </div>
            </div>

            {lines.length === 0 ? (
              <div className="py-10 text-center text-brand-wine/50 font-bold text-sm">No items yet — add from Catalog or a custom item.</div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="hidden sm:grid grid-cols-[1fr_110px_120px_44px] gap-3 px-1 text-[11px] font-bold uppercase tracking-wide text-brand-wine/60">
                  <span>Item / Description</span><span>Price (KD)</span><span>Qty</span><span />
                </div>
                {lines.map(l => (
                  <div key={l.key} className="grid grid-cols-1 sm:grid-cols-[1fr_110px_120px_44px] gap-2 sm:gap-3 items-center bg-brand-sand/50 rounded-xl p-2.5 border border-brand-gold/25">
                    <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} placeholder="Type product description…" className="px-3 py-2 rounded-lg border border-brand-gold/40 text-sm text-brand-ink focus:outline-none focus:border-brand-red bg-white" />
                    <input value={l.price || ''} onChange={e => updateLine(l.key, { price: Number(e.target.value) || 0 })} type="number" min="0" step="0.001" placeholder="0.000" className="px-3 py-2 rounded-lg border border-brand-gold/40 text-sm text-brand-ink focus:outline-none focus:border-brand-red bg-white" />
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-brand-gold/40 p-1 w-fit">
                      <button onClick={() => updateLine(l.key, { qty: Math.max(1, l.qty - 1) })} className="w-8 h-8 rounded-md bg-brand-sand hover:bg-brand-gold/20 text-brand-wine flex items-center justify-center"><Minus size={14} /></button>
                      <span className="w-8 text-center font-black text-sm text-brand-wine">{l.qty}</span>
                      <button onClick={() => updateLine(l.key, { qty: l.qty + 1 })} className="w-8 h-8 rounded-md bg-brand-red text-white hover:bg-brand-red-dark flex items-center justify-center"><Plus size={14} /></button>
                    </div>
                    <button onClick={() => removeLine(l.key)} className="w-9 h-9 rounded-lg bg-brand-red/10 text-brand-red hover:bg-brand-red/20 flex items-center justify-center justify-self-start sm:justify-self-auto"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: summary */}
        <div className={`${panelCls} p-5 sm:p-6 flex flex-col gap-4 h-fit lg:sticky lg:top-20`}>
          <div className="rounded-2xl bg-brand-sand/60 border border-brand-gold/30 p-4 text-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-brand-wine/60">Source</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded ${source === 'offline' ? 'bg-brand-red/10 text-brand-red' : 'bg-brand-green/10 text-brand-green'}`}>{source === 'offline' ? 'OFFLINE' : 'ONLINE'}</span>
            </div>
            <div className="flex justify-between text-xs text-brand-wine/70"><span>Customer</span><span className="font-bold text-brand-wine">{customerName || '—'}</span></div>
            <div className="flex justify-between text-xs text-brand-wine/70 mt-1"><span>Phone</span><span className="font-bold text-brand-wine">{phone || '—'}</span></div>
          </div>

          {/* Coupon */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-brand-wine/60 mb-1.5 block">Apply Coupon</label>
            <select value={couponCode} onChange={e => setCouponCode(e.target.value)} className={inputCls}>
              <option value="">No Coupon</option>
              {activeCoupons.map(c => (
                <option key={c.id} value={c.code}>{c.code} — {c.discountPercent}% (min KD {c.minOrder.toFixed(3)})</option>
              ))}
            </select>
            {couponCode && couponResult && !couponResult.ok && (
              <p className="text-xs font-semibold text-brand-red mt-1">{couponResult.reason}</p>
            )}
          </div>

          {/* Manual discount */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-brand-wine/60 mb-1.5 block">Manual Discount</label>
            <div className="flex gap-2">
              <select value={manualType} onChange={e => setManualType(e.target.value as 'KD' | '%')} className="px-3 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-sm text-brand-ink focus:outline-none focus:border-brand-red">
                <option value="KD">KD</option>
                <option value="%">%</option>
              </select>
              <input value={manualValue} onChange={e => setManualValue(e.target.value)} type="number" min="0" step="0.001" placeholder="0" className={inputCls} />
            </div>
          </div>

          <div className="border-t border-brand-gold/30 pt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between text-brand-wine/70"><span>Subtotal ({itemCount} items)</span><span className="font-bold text-brand-wine">{formatKWD(subtotal)}</span></div>
            {totalDiscount > 0 && <div className="flex justify-between text-brand-green"><span>Discount</span><span className="font-bold">− {formatKWD(totalDiscount)}</span></div>}
            <div className="flex justify-between items-center text-brand-wine/70">
              <span>Delivery</span>
              <input value={delivery} onChange={e => setDelivery(e.target.value)} type="number" min="0" step="0.001" placeholder="0" className="w-24 px-2 py-1 rounded-lg border border-brand-gold/40 bg-white text-brand-ink text-sm text-right focus:outline-none focus:border-brand-red" />
            </div>
          </div>

          <div className="flex justify-between items-center border-t border-brand-gold/30 pt-4">
            <span className="text-lg font-black text-brand-wine">GRAND TOTAL</span>
            <span className="text-2xl font-black text-brand-red">{formatKWD(grandTotal)}</span>
          </div>

          {source === 'offline' && (
            <div className="rounded-2xl bg-brand-sand/60 border border-brand-gold/30 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-wine/60 mb-2">Cash Payment</p>
              <label className="text-xs font-bold text-brand-wine/60 mb-1.5 block">Amount Received (KD)</label>
              <input value={amountReceived} onChange={e => setAmountReceived(e.target.value)} type="number" min="0" step="0.001" placeholder="0.000" className={inputCls} />
              {received > 0 && (
                <p className={`text-sm font-bold mt-2 ${change >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                  {change >= 0 ? `Change due: ${formatKWD(change)}` : `Short by ${formatKWD(Math.abs(change))}`}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={() => saveBill(true)}
              className="w-full py-4 rounded-2xl bg-brand-green text-white font-black text-base flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg"
            >
              <MessageCircle size={20} /> SEND VIA WHATSAPP
            </button>
            <button
              onClick={() => saveBill(false)}
              className="w-full py-3.5 rounded-2xl bg-brand-wine text-brand-gold-light font-black text-sm flex items-center justify-center gap-2 hover:brightness-110 transition-all border border-brand-gold/40"
            >
              <Save size={18} /> SAVE LOCALLY (no WhatsApp)
            </button>
          </div>
        </div>
      </div>

      {catalogOpen && (
        <CatalogModal
          items={menu.filter(m => m.status === 'active')}
          onPick={(name, price) => addFromCatalog(name, price)}
          onClose={() => setCatalogOpen(false)}
        />
      )}
    </div>
  );
}

function CatalogModal({ items, onPick, onClose }: { items: { id: string; name: string; price: number; category: string; image: string }[]; onPick: (n: string, p: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const filtered = items.filter(i => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#2a0a0a]/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-brand-cream rounded-3xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-brand-gold/30 shadow-[0_30px_60px_-20px_rgba(30,0,4,0.55)]" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-brand-gold/25 flex items-center justify-between">
          <h3 className="text-lg font-black flex items-center gap-2 text-brand-wine"><ShoppingCart size={18} /> Catalog</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-brand-sand text-brand-wine"><X size={18} /></button>
        </div>
        <div className="p-4 border-b border-brand-gold/25">
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Search menu…" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-gold/40 bg-white text-brand-ink text-sm focus:outline-none focus:border-brand-red" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          {filtered.map(i => (
            <button key={i.id} onClick={() => onPick(i.name, i.price)} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-brand-sand/60 text-left transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.image} alt={i.name} className="w-11 h-11 rounded-lg object-cover bg-brand-sand" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate text-brand-wine">{i.name}</p>
                <p className="text-xs text-brand-wine/60">{i.category}</p>
              </div>
              <span className="font-black text-sm text-brand-red">{formatKWD(i.price)}</span>
              <Plus size={16} className="text-brand-wine/40" />
            </button>
          ))}
          {filtered.length === 0 && <p className="text-center text-brand-wine/50 font-bold py-8 text-sm">No items found.</p>}
        </div>
      </div>
    </div>
  );
}
