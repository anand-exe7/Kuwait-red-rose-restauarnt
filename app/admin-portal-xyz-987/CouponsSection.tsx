"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import {
  Coupon,
  getCouponsSnapshot,
  getCouponsServerSnapshot,
  subscribeToCoupons,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  recordCouponSent,
  codeExists,
  isExpired,
  remainingUses,
} from '../lib/couponStore';
import { BRAND } from '../lib/brand';
import { Page, PageHead, Card, Btn, Badge, SearchBox, Empty, Field, Modal, WaIcon, inputCls, cx } from './_ui/kit';

function randomCode(len = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** A compact on/off switch. */
function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', on ? 'bg-emerald-500' : 'bg-slate-300')}
    >
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

const blankForm = { code: '', discountPercent: '', minOrder: '', expiry: '', usageLimit: '', active: true, targetedOnly: false };

export default function CouponsSection() {
  const coupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof blankForm>(blankForm);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState<Coupon | null>(null);

  const sorted = useMemo(
    () => [...coupons].sort((a, b) => b.createdAt - a.createdAt).filter(c => c.code.toLowerCase().includes(search.trim().toLowerCase())),
    [coupons, search]
  );

  const pager = usePagination(sorted, 6, search);

  const resetForm = () => { setForm(blankForm); setEditingId(null); setError(null); };

  const startEdit = (c: Coupon) => {
    setEditingId(c.id);
    setError(null);
    setForm({
      code: c.code,
      discountPercent: String(c.discountPercent),
      minOrder: String(c.minOrder),
      expiry: c.expiry,
      usageLimit: String(c.usageLimit || ''),
      active: c.active,
      targetedOnly: c.targetedOnly,
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const pct = Number(form.discountPercent);
    if (!code) { setError('Coupon code is required.'); return; }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) { setError('Discount % must be between 1 and 100.'); return; }
    if (codeExists(code, editingId ?? undefined)) { setError(`Code “${code}” already exists.`); return; }
    const payload = {
      code,
      discountPercent: pct,
      minOrder: Math.max(0, Number(form.minOrder) || 0),
      expiry: form.expiry,
      usageLimit: Math.max(0, Number(form.usageLimit) || 0),
      active: form.active,
      targetedOnly: form.targetedOnly,
    };
    if (editingId) updateCoupon(editingId, payload);
    else addCoupon(payload);
    resetForm();
  };

  return (
    <Page>
      <PageHead title="Coupons" sub="Discount applies to product subtotal only — not delivery charge or tax." bar />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Form */}
        <Card title={editingId ? 'Edit coupon' : 'New coupon'} right={editingId && <Btn kind="plain" size="sm" onClick={resetForm}>Cancel edit</Btn>}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Coupon code *">
              <div className="flex gap-2">
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="E.G. SUMMER20"
                  className={cx(inputCls, 'font-bold uppercase tracking-wide')}
                />
                <Btn kind="red" icon="zap" onClick={() => setForm(f => ({ ...f, code: randomCode() }))}>Generate</Btn>
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Discount % *">
                <input value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))} type="number" min="1" max="100" placeholder="e.g. 15" className={inputCls} />
              </Field>
              <Field label="Min order (KD)">
                <input value={form.minOrder} onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))} type="number" min="0" step="0.001" placeholder="e.g. 5" className={inputCls} />
              </Field>
              <Field label="Expiry date">
                <input value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} type="date" className={inputCls} />
              </Field>
              <Field label="Usage limit">
                <input value={form.usageLimit} onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))} type="number" min="0" placeholder="0 = ∞" className={inputCls} />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-red-600" /> Active
            </label>

            {/* Targeting toggle */}
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">Only for customers it&apos;s sent to</p>
                <p className="mt-0.5 text-xs text-slate-500">Works only for the mobile numbers you send it to from this page.</p>
              </div>
              <Switch on={form.targetedOnly} onChange={v => setForm(f => ({ ...f, targetedOnly: v }))} />
            </div>

            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            <Btn kind="red" size="lg" className="w-full" onClick={() => { const f = (document.activeElement as HTMLElement)?.closest('form') as HTMLFormElement | null; f?.requestSubmit(); }}>
              {editingId ? 'Save changes' : 'Create coupon'}
            </Btn>
          </form>
        </Card>

        {/* List */}
        <Card title={`All coupons (${coupons.length})`}>
          <SearchBox value={search} onChange={setSearch} placeholder="Search coupons by code…" className="mb-4" />
          <div className="adm-scroll flex max-h-[560px] flex-col gap-3 overflow-y-auto pr-1">
            {sorted.length === 0 ? (
              <Empty icon="coupon" title="No coupons found." />
            ) : (
              pager.items.map(c => {
                const expired = isExpired(c);
                const rem = remainingUses(c);
                return (
                  <div key={c.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-black tracking-wide text-slate-900">{c.code}</p>
                          {c.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Inactive</Badge>}
                          {c.targetedOnly && <Badge tone="amber">Only {c.sentPhones.length} {c.sentPhones.length === 1 ? 'phone' : 'phones'}</Badge>}
                          {expired && <Badge tone="red">Expired</Badge>}
                        </div>
                        <p className="mt-1 text-sm font-bold text-emerald-600">{c.discountPercent}% off · min KD {c.minOrder.toFixed(3)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Used {c.usedCount} {c.usageLimit ? `of ${c.usageLimit}` : 'times'}
                          {c.expiry ? ` · expires ${new Date(c.expiry).toLocaleDateString()}` : ' · no expiry'}
                          {c.sentPhones.length > 0 ? ` · sent ${c.sentPhones.length}×` : ''}
                          {rem !== null && rem <= 0 ? ' · limit reached' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Btn kind="green" size="sm" onClick={() => setSending(c)}><WaIcon size={14} /> Send</Btn>
                      <Btn kind={c.active ? 'red' : 'soft'} size="sm" onClick={() => updateCoupon(c.id, { active: !c.active })}>
                        {c.active ? 'Active' : 'Inactive'}
                      </Btn>
                      <Btn kind="plain" size="sm" icon="edit" onClick={() => startEdit(c)} />
                      <Btn kind="plain" size="sm" icon="trash" className="text-red-600" onClick={() => { if (editingId === c.id) resetForm(); deleteCoupon(c.id); }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Pagination p={pager} label="coupons" />
        </Card>
      </div>

      {sending && <SendModal coupon={sending} onClose={() => setSending(null)} />}
    </Page>
  );
}

function SendModal({ coupon, onClose }: { coupon: Coupon; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [onlyThis, setOnlyThis] = useState(coupon.targetedOnly);
  const [err, setErr] = useState<string | null>(null);

  const send = () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) { setErr('Enter a valid WhatsApp number.'); return; }
    // Record the recipient (and flip to targeted if asked), then open WhatsApp.
    recordCouponSent(coupon.id, phone, onlyThis);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const parts = [
      `*${BRAND.fullName}* — a coupon just for you! 🌹`,
      name ? `Hi ${name},` : '',
      '',
      `Use code *${coupon.code}* for *${coupon.discountPercent}% OFF*${coupon.minOrder > 0 ? ` on orders over KD ${coupon.minOrder.toFixed(3)}` : ''}.`,
      coupon.expiry ? `Valid until ${new Date(coupon.expiry).toLocaleDateString()}.` : '',
      '',
      origin ? `Order here: ${origin}/menu` : '',
    ].filter(Boolean);
    const msg = parts.join('%0A');
    const withCc = digits.length <= 8 ? `965${digits}` : digits;
    window.open(`https://wa.me/${withCc}?text=${msg}`, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Send coupon · ${coupon.code}`}>
      <p className="text-sm text-slate-500">
        The coupon goes to the customer&apos;s WhatsApp with its code and a link to order. It&apos;s recorded against their number here.
      </p>

      <div className="mt-4 flex flex-col gap-4">
        <Field label="Customer phone (WhatsApp) *">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Enter WhatsApp number" inputMode="tel" className={inputCls} />
        </Field>
        <Field label="Customer name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional" className={inputCls} />
        </Field>

        <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">Only for this customer</p>
            <p className="mt-0.5 text-xs text-slate-500">Restrict the coupon to the numbers it was sent to.</p>
          </div>
          <Switch on={onlyThis} onChange={setOnlyThis} />
        </div>

        {onlyThis && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
            This coupon will only work for the phones it was sent to ({coupon.sentPhones.length} so far). Use a dedicated coupon for this.
          </p>
        )}

        {err && <p className="text-sm font-semibold text-red-600">{err}</p>}

        <div className="flex gap-2">
          <Btn kind="plain" className="flex-1" onClick={onClose}>Cancel</Btn>
          <Btn kind="green" className="flex-1" onClick={send}><WaIcon size={16} /> Send on WhatsApp</Btn>
        </div>
      </div>
    </Modal>
  );
}
