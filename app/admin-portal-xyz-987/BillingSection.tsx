"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../lib/menuStore';
import { getCouponsSnapshot, getCouponsServerSnapshot, subscribeToCoupons, validateCoupon, isExpired, remainingUses } from '../lib/couponStore';
import { addOrder } from '../lib/orderStore';
import { formatKWD } from '../lib/currency';
import { BRAND } from '../lib/brand';
import { Page, PageHead, Card, Btn, Field, Pills, Modal, SearchBox, Icon, WaIcon, Empty, toast, inputCls, labelCls, cx } from './_ui/kit';
import { subscribeToTax, getTaxSnapshot, getTaxServerSnapshot, taxFrom, taxAmountFor } from '../lib/taxStore';

interface Line { key: string; name: string; price: number; qty: number }
const uid = () => Math.random().toString(36).slice(2, 9);

export default function BillingSection() {
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const coupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);

  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'upi'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [manualType, setManualType] = useState<'KD' | '%'>('KD');
  const [manualValue, setManualValue] = useState('');
  const [delivery, setDelivery] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);

  const activeCoupons = useMemo(
    () => coupons.filter(c => c.active && !isExpired(c) && (remainingUses(c) === null || (remainingUses(c) as number) > 0)),
    [coupons]
  );

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  const couponResult = couponCode ? validateCoupon(couponCode, subtotal, phone) : null;
  const couponDiscount = couponResult?.ok ? (couponResult.discount || 0) : 0;

  const manualNum = Number(manualValue) || 0;
  const manualDiscount = manualType === '%' ? (subtotal * manualNum) / 100 : manualNum;

  const totalDiscount = Math.min(subtotal, couponDiscount + Math.max(0, manualDiscount));
  const deliveryNum = Math.max(0, Number(delivery) || 0);
  const taxableBase = Math.max(0, subtotal - totalDiscount);
  const taxSettings = taxFrom(useSyncExternalStore(subscribeToTax, getTaxSnapshot, getTaxServerSnapshot));
  const taxAmt = taxAmountFor(taxableBase, taxSettings);
  // Inclusive tax is already inside the prices, so it doesn't change the total.
  const grandTotal = taxableBase + deliveryNum + (taxSettings.inclusive ? 0 : taxAmt);
  const received = Number(amountReceived) || 0;
  const change = received - grandTotal;

  const addCustom = () => setLines(ls => [...ls, { key: uid(), name: '', price: 0, qty: 1 }]);
  const addFromCatalog = (name: string, price: number, qty = 1) => {
    setLines(ls => {
      const existing = ls.find(l => l.name === name && l.price === price);
      if (existing) return ls.map(l => (l === existing ? { ...l, qty: l.qty + qty } : l));
      return [...ls, { key: uid(), name, price, qty }];
    });
  };
  const updateLine = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines(ls => ls.filter(l => l.key !== key));
  const clearOrder = () => {
    setLines([]); setCustomerName(''); setPhone(''); setCouponCode('');
    setManualValue(''); setDelivery(''); setAmountReceived('');
  };

  // Saves the bill as a completed order (shows up in Orders & Analytics).
  const saveBill = (sendWhatsApp: boolean) => {
    if (lines.length === 0 || itemCount === 0) { toast.error('Add at least one item first.'); return; }

    const order = addOrder({
      table: 0,
      mode: 'takeaway',
      source: 'waiter',
      status: 'served',
      priority: 'normal',
      items: lines.map(l => ({ id: l.key, name: l.name || 'Item', price: l.price, qty: l.qty })),
      subtotal,
      tax: taxAmt,
      total: grandTotal,
      discount: totalDiscount > 0 ? totalDiscount : undefined,
      couponCode: couponResult?.ok ? couponCode : undefined,
      billImmediately: true,
      paidMethod: payMethod,
      customer: (customerName.trim() || phone.trim())
        ? { name: customerName.trim() || undefined, phone: phone.trim() || undefined }
        : undefined,
    });

    // Shareable invoice page on our own site — the customer taps it to see the
    // itemised bill. Uses the live origin so it's the real domain in production.
    const invoiceUrl = order.sessionId && typeof window !== 'undefined'
      ? `${window.location.origin}/receipt/${order.sessionId}`
      : '';

    if (sendWhatsApp) {
      const lineText = lines.map(l => `• ${l.qty}× ${l.name || 'Item'} — ${formatKWD(l.price * l.qty)}`).join('%0A');
      const parts = [
        `*${BRAND.fullName}*`,
        customerName ? `Customer: ${customerName}` : '',
        `%0A${lineText}`,
        `%0ASubtotal: ${formatKWD(subtotal)}`,
        totalDiscount > 0 ? `Discount: -${formatKWD(totalDiscount)}` : '',
        taxAmt > 0 ? `${taxSettings.label} (${taxSettings.rate}%): ${formatKWD(taxAmt)}` : '',
        deliveryNum > 0 ? `Delivery: ${formatKWD(deliveryNum)}` : '',
        `*Total: ${formatKWD(grandTotal)}*`,
        `Paid by: ${payMethod.toUpperCase()}`,
        payMethod === 'cash' && received > 0 ? `Cash: ${formatKWD(received)} · Change: ${formatKWD(Math.max(0, change))}` : '',
        invoiceUrl ? `%0A🧾 View your invoice:%0A${invoiceUrl}` : '',
        `%0AThank you! 🌹`,
      ].filter(Boolean);
      const msg = parts.join('%0A');
      const digits = phone.replace(/\D/g, '');
      const withCc = digits.length && digits.length <= 8 ? `965${digits}` : digits;
      const url = withCc ? `https://wa.me/${withCc}?text=${msg}` : `https://wa.me/?text=${msg}`;
      window.open(url, '_blank');
      toast.success('Bill saved · WhatsApp draft opened');
    } else {
      toast.success('Bill saved locally — see Orders tab');
    }
    clearOrder();
  };

  return (
    <Page>
      <PageHead
        title="POS Billing"
        sub="Quick invoice generator & database-synced checkout."
        bar
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* LEFT: customer + items */}
        <div className="flex flex-col gap-5 lg:col-span-3">
          <Card title="Customer details">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Customer name">
                <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Enter name" className={inputCls} />
              </Field>
              <Field label="Mobile (WhatsApp)">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter 8-digit number" className={inputCls} />
              </Field>
            </div>
          </Card>

          <Card
            title="Order items"
            right={
              <div className="flex flex-wrap gap-2">
                <Btn kind="ghost" size="sm" onClick={clearOrder}>Clear</Btn>
                <Btn kind="ghost" size="sm" icon="list" onClick={() => setCatalogOpen(true)}>Catalog</Btn>
                <Btn kind="soft" size="sm" icon="plus" onClick={addCustom}>Custom item</Btn>
              </div>
            }
          >
            {lines.length === 0 ? (
              <Empty icon="cart" title="No items yet" >Add from the Catalog or a custom item.</Empty>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="hidden grid-cols-[1fr_110px_120px_44px] gap-3 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400 sm:grid">
                  <span>Item / Description</span><span>Price (KD)</span><span>Qty</span><span />
                </div>
                {lines.map(l => (
                  <div key={l.key} className="grid grid-cols-1 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2.5 sm:grid-cols-[1fr_110px_120px_44px] sm:gap-3">
                    <input value={l.name} onChange={e => updateLine(l.key, { name: e.target.value })} placeholder="Type product description…" className={cx(inputCls, 'bg-white')} />
                    <input value={l.price || ''} onChange={e => updateLine(l.key, { price: Number(e.target.value) || 0 })} type="number" min="0" step="0.001" placeholder="0.000" className={cx(inputCls, 'bg-white')} />
                    <div className="flex w-fit items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                      <button type="button" onClick={() => updateLine(l.key, { qty: Math.max(1, l.qty - 1) })} className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200"><Icon name="minus" size={14} /></button>
                      <span className="w-8 text-center text-sm font-black text-slate-800">{l.qty}</span>
                      <button type="button" onClick={() => updateLine(l.key, { qty: l.qty + 1 })} className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700"><Icon name="plus" size={14} /></button>
                    </div>
                    <button type="button" onClick={() => removeLine(l.key)} className="flex h-9 w-9 items-center justify-center justify-self-start rounded-lg bg-red-50 text-red-600 hover:bg-red-100 sm:justify-self-auto"><Icon name="trash" size={15} /></button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT: summary */}
        <Card className="h-fit lg:col-span-2 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-xs text-slate-500"><span>Customer</span><span className="font-bold text-slate-800">{customerName || '—'}</span></div>
            <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Phone</span><span className="font-bold text-slate-800">{phone || '—'}</span></div>
          </div>

          {/* Payment method */}
          <div className="mt-4">
            <span className={labelCls}>Payment method</span>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'upi'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={cx(
                    'rounded-xl border px-3 py-2.5 text-sm font-bold uppercase transition-colors',
                    payMethod === m ? 'border-red-600 bg-red-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <span className={labelCls}>Apply coupon</span>
            <select value={couponCode} onChange={e => setCouponCode(e.target.value)} className={inputCls}>
              <option value="">No coupon</option>
              {activeCoupons.map(c => (
                <option key={c.id} value={c.code}>{c.code} — {c.discountPercent}% (min KD {c.minOrder.toFixed(3)})</option>
              ))}
            </select>
            {couponCode && couponResult && !couponResult.ok && <p className="mt-1 text-xs font-semibold text-red-600">{couponResult.reason}</p>}
          </div>

          <div className="mt-4">
            <span className={labelCls}>Manual discount</span>
            <div className="flex gap-2">
              <select value={manualType} onChange={e => setManualType(e.target.value as 'KD' | '%')} className={cx(inputCls, 'w-20')}>
                <option value="KD">KD</option>
                <option value="%">%</option>
              </select>
              <input value={manualValue} onChange={e => setManualValue(e.target.value)} type="number" min="0" step="0.001" placeholder="0" className={inputCls} />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal ({itemCount} items)</span><span className="adm-num font-bold text-slate-800">{formatKWD(subtotal)}</span></div>
            {totalDiscount > 0 && <div className="flex justify-between text-emerald-600"><span>Discount</span><span className="adm-num font-bold">− {formatKWD(totalDiscount)}</span></div>}
            {taxAmt > 0 && <div className="flex justify-between text-slate-500"><span>{taxSettings.label} ({taxSettings.rate}%){taxSettings.inclusive ? ' incl.' : ''}</span><span className="adm-num font-bold text-slate-800">{formatKWD(taxAmt)}</span></div>}
            <div className="flex items-center justify-between text-slate-500">
              <span>Delivery</span>
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">KD</span>
                <input value={delivery} onChange={e => setDelivery(e.target.value)} type="number" min="0" step="0.001" placeholder="0.000" className={cx(inputCls, 'h-9 pl-8 pr-2.5 text-right text-[13px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-lg font-black text-slate-800">GRAND TOTAL</span>
            <span className="adm-num text-2xl font-black text-red-600">{formatKWD(grandTotal)}</span>
          </div>

          {payMethod === 'cash' && (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Cash payment</p>
              <Field label="Amount received (KD)">
                <input value={amountReceived} onChange={e => setAmountReceived(e.target.value)} type="number" min="0" step="0.001" placeholder="0.000" className={cx(inputCls, 'bg-white')} />
              </Field>
              {received > 0 && (
                <p className={cx('mt-2 text-sm font-bold', change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {change >= 0 ? `Change due: ${formatKWD(change)}` : `Short by ${formatKWD(Math.abs(change))}`}
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2">
            <Btn kind="green" size="lg" className="w-full" onClick={() => saveBill(true)}>
              <WaIcon size={18} /> Send via WhatsApp
            </Btn>
            <Btn kind="dark" className="w-full" onClick={() => saveBill(false)}>Save locally (no WhatsApp)</Btn>
          </div>
        </Card>
      </div>

      {catalogOpen && (
        <CatalogModal
          items={menu.filter(m => m.status === 'active')}
          onPick={(name, price, qty) => addFromCatalog(name, price, qty)}
          onClose={() => setCatalogOpen(false)}
        />
      )}
    </Page>
  );
}

function CatalogModal({ items, onPick, onClose }: { items: { id: string; name: string; price: number; category: string; image: string }[]; onPick: (n: string, p: number, qty: number) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');
  const [qty, setQty] = useState<Record<string, number>>({});

  const categories = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => s.add(i.category));
    return ['All', ...Array.from(s)];
  }, [items]);

  const filtered = items.filter(i => {
    const nameHit = i.name.toLowerCase().includes(q.toLowerCase());
    const catHit = cat === 'All' || i.category === cat;
    return nameHit && catHit;
  });

  const getQty = (id: string) => qty[id] ?? 1;
  const bump = (id: string, delta: number) => setQty(prev => ({ ...prev, [id]: Math.max(1, Math.min(99, (prev[id] ?? 1) + delta)) }));

  const pick = (i: { id: string; name: string; price: number }) => {
    const count = getQty(i.id);
    onPick(i.name, i.price, count);
    toast.success(`Added ${count} × ${i.name}`);
    setQty(prev => ({ ...prev, [i.id]: 1 }));
  };

  return (
    <Modal open onClose={onClose} title="Catalog" wide>
      <div className="flex flex-col gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Search menu…" />
        <Pills value={cat} onChange={setCat} options={categories.map(c => ({ v: c, t: c }))} />
      </div>
      <div className="adm-scroll mt-3 flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
        {filtered.map(i => (
          <div key={i.id} className="flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={i.image} alt={i.name} className="h-11 w-11 rounded-lg border border-slate-100 object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-800">{i.name}</p>
              <p className="text-xs text-slate-400">{i.category}</p>
            </div>
            <span className="adm-num text-sm font-black text-red-600">{formatKWD(i.price)}</span>
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
              <button type="button" onClick={() => bump(i.id, -1)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><Icon name="minus" size={12} /></button>
              <span className="w-6 text-center text-xs font-black text-slate-800">{getQty(i.id)}</span>
              <button type="button" onClick={() => bump(i.id, 1)} className="flex h-6 w-6 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><Icon name="plus" size={12} /></button>
            </div>
            <Btn kind="red" size="sm" onClick={() => pick(i)}>Add</Btn>
          </div>
        ))}
        {filtered.length === 0 && <p className="py-8 text-center text-sm font-bold text-slate-400">No items found.</p>}
      </div>
    </Modal>
  );
}
