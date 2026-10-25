"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import { RefreshCw, Search, Sparkles, Info } from 'lucide-react';
import {
  Coupon,
  getCouponsSnapshot,
  getCouponsServerSnapshot,
  subscribeToCoupons,
  addCoupon,
  updateCoupon,
  deleteCoupon,
  codeExists,
  isExpired,
  remainingUses,
} from '../lib/couponStore';

function randomCode(len = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const blankForm = { code: '', discountPercent: '', minOrder: '', expiry: '', usageLimit: '', active: true };

export default function CouponsSection() {
  const coupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof blankForm>(blankForm);
  const [error, setError] = useState<string | null>(null);

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
    };
    if (editingId) updateCoupon(editingId, payload);
    else addCoupon(payload);
    resetForm();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-wine px-4 py-3 text-sm font-semibold text-brand-gold-light shadow-[0_12px_30px_-20px_rgba(74,21,21,0.55)] flex items-center gap-2">
        <Info size={16} className="text-brand-gold" /> Coupon discount applies to product subtotal only — not delivery charge.
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black">Coupon Management</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black">{editingId ? 'Edit Coupon' : '+ New Coupon'}</h3>
            {editingId && (
              <button onClick={resetForm} className="text-xs font-bold text-brand-wine/70 hover:text-brand-wine">Cancel edit</button>
            )}
          </div>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold text-brand-wine/70 mb-1.5 block uppercase tracking-wide">Coupon Code *</label>
              <div className="flex gap-2">
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="E.G. SUMMER20"
                  className="flex-1 px-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm font-bold uppercase tracking-wide focus:outline-none focus:border-brand-red"
                />
                <button type="button" onClick={() => setForm(f => ({ ...f, code: randomCode() }))} className="px-4 py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold hover:bg-brand-red-dark flex items-center gap-1.5">
                  <Sparkles size={14} /> Generate
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-wine/70 mb-1.5 block uppercase tracking-wide">Discount % *</label>
                <input value={form.discountPercent} onChange={e => setForm(f => ({ ...f, discountPercent: e.target.value }))} type="number" min="1" max="100" placeholder="e.g. 15" className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-wine/70 mb-1.5 block uppercase tracking-wide">Min Order (KD)</label>
                <input value={form.minOrder} onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))} type="number" min="0" step="0.001" placeholder="e.g. 5" className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-wine/70 mb-1.5 block uppercase tracking-wide">Expiry Date</label>
                <input value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} type="date" className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red" />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-wine/70 mb-1.5 block uppercase tracking-wide">Usage Limit</label>
                <input value={form.usageLimit} onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))} type="number" min="0" placeholder="e.g. 50 (0 = ∞)" className="w-full px-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="accent-brand-red" /> Active
            </label>
            {error && <p className="text-sm font-semibold text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-lg px-3 py-2">{error}</p>}
            <button type="submit" className="w-full py-3.5 bg-brand-red hover:bg-brand-red-dark text-white rounded-xl font-black text-sm transition-colors">
              {editingId ? 'Save Changes' : 'Create Coupon'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="bg-brand-cream rounded-3xl border border-brand-gold/25 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black">All Coupons ({coupons.length})</h3>
            <button onClick={() => { /* store is live; this is a visual refresh affordance */ setSearch(s => s); }} className="flex items-center gap-1.5 text-sm font-bold text-brand-wine/70 hover:text-brand-wine">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-wine/55" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search coupons by code…" className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-gold/40 text-sm focus:outline-none focus:border-brand-red" />
          </div>
          <div className="flex flex-col gap-3 max-h-[520px] overflow-y-auto pr-1">
            {sorted.length === 0 ? (
              <p className="text-sm text-brand-wine/60 font-bold py-8 text-center">No coupons found.</p>
            ) : (
              pager.items.map(c => {
                const expired = isExpired(c);
                const rem = remainingUses(c);
                return (
                  <div key={c.id} className="bg-brand-sand/60 rounded-2xl border border-brand-gold/25 p-4">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-black tracking-wide">{c.code}</p>
                        <p className="text-sm font-bold text-emerald-600">{c.discountPercent}% off · min KD {c.minOrder.toFixed(3)}</p>
                        <p className="text-xs text-brand-wine/60 mt-0.5">
                          {rem === null ? 'Unlimited uses' : `${rem} remaining`}
                          {c.expiry ? ` · expires ${new Date(c.expiry).toLocaleDateString()}` : ' · no expiry'}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {!c.active && <span className="text-[10px] font-bold text-brand-wine/70 bg-brand-sand rounded px-1.5 py-0.5 uppercase">Inactive</span>}
                          {expired && <span className="text-[11px] font-bold text-brand-red">Expired</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-bold shrink-0">
                        <button onClick={() => startEdit(c)} className="text-blue-500 hover:underline">EDIT</button>
                        <button onClick={() => { if (editingId === c.id) resetForm(); deleteCoupon(c.id); }} className="text-brand-red hover:underline">DEL</button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <Pagination p={pager} label="coupons" />
        </div>
      </div>
    </div>
  );
}
