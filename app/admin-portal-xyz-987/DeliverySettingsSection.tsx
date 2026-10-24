"use client";
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { staffCall } from './staffApi';
import AreasPanel from './AreasPanel';
import { DAY_NAMES, DEFAULT_SETTINGS, type DeliverySettings, type FeeTier } from '../lib/delivery/shared';

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red bg-white';
const card = 'bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6';
const label = 'text-[11px] font-bold uppercase tracking-wide text-black/40 mb-1 block';

function Toggle({ on, onChange, text, hint }: { on: boolean; onChange: (v: boolean) => void; text: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center gap-3 text-left">
      <span className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 ${on ? 'bg-emerald-500' : 'bg-black/20'}`}>
        <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} />
      </span>
      <span><b className="text-sm block">{text}</b>{hint && <span className="text-xs text-black/50">{hint}</span>}</span>
    </button>
  );
}

export default function DeliverySettingsSection() {
  const [s, setS] = useState<DeliverySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    staffCall<{ settings: DeliverySettings }>('settings.get')
      .then((r) => { if (alive) setS(r.settings); })
      .catch((e: Error) => { if (alive) { setS(DEFAULT_SETTINGS); setMsg({ ok: false, text: e.message }); } });
    return () => { alive = false; };
  }, []);

  if (!s) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-red" /></div>;

  const set = <K extends keyof DeliverySettings>(k: K, v: DeliverySettings[K]) => setS({ ...s, [k]: v });
  const numField = (k: keyof DeliverySettings) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never);

  const save = async (next: DeliverySettings = s, okText = 'Settings saved.') => {
    setSaving(true); setMsg(null);
    try { const r = await staffCall<{ settings: DeliverySettings }>('settings.save', { settings: next }); setS(r.settings); setMsg({ ok: true, text: okText }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setSaving(false);
  };

  const setTier = (i: number, patch: Partial<FeeTier>) => set('feeTiers', s.feeTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  return (
    <div className="flex flex-col gap-6">
      <div className={`${card} flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${s.busy ? 'border-amber-300 bg-amber-50' : ''}`}>
        <div>
          <h2 className="text-xl font-black">Delivery settings</h2>
          <p className="text-xs text-black/50">Changes apply to the next customer immediately.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Toggle on={s.enabled} onChange={(v) => save({ ...s, enabled: v }, v ? 'Delivery is ON.' : 'Delivery is OFF.')} text="Accept delivery orders" />
          <Toggle on={s.busy} onChange={(v) => save({ ...s, busy: v }, v ? 'Busy mode ON: no new deliveries.' : 'Busy mode OFF.')} text="Busy - no deliveries right now" hint="Customers see a polite message and can choose takeaway." />
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black mb-1">How is the delivery fee decided?</h3>
        <p className="text-xs text-black/50 mb-3">Delivery areas needs no maps: you list the areas and a fee for each. Distance uses the customer&apos;s map pin and Google.</p>
        <select className={`${inputCls} max-w-sm`} value={s.pricingMode} onChange={(e) => set('pricingMode', e.target.value as DeliverySettings['pricingMode'])}>
          <option value="areas">By delivery area (no maps)</option>
          <option value="distance">By distance (map pin)</option>
        </select>
        <p className="text-xs text-black/50 mt-2">Press &quot;Save settings&quot; at the bottom after changing this.</p>
      </div>

      {s.pricingMode === 'areas' && (
        <div className={card}>
          <h3 className="font-black mb-1">Delivery areas and fees</h3>
          <p className="text-xs text-black/50 mb-4">The customer picks one of these at checkout and is charged its fee. Each row saves on its own.</p>
          <AreasPanel />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-black/5 pt-4">
            <div><span className={label}>General minimum order (KD)</span><input type="number" step="0.5" min="0" className={inputCls} value={s.minOrder} onChange={numField('minOrder')} /></div>
          </div>
          <div className="mt-4"><Toggle on={s.taxOnFee} onChange={(v) => set('taxOnFee', v)} text="Charge 10% tax on the delivery fee too" /></div>
        </div>
      )}

      {s.pricingMode === 'distance' && (
      <div className={card}>
        <h3 className="font-black mb-4">Distance and fee</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><span className={label}>Free delivery within (km)</span><input type="number" step="0.5" min="0" className={inputCls} value={s.freeKm} onChange={numField('freeKm')} /></div>
          <div><span className={label}>Maximum distance (km)</span><input type="number" step="0.5" min="0" className={inputCls} value={s.maxKm} onChange={numField('maxKm')} /></div>
          <div><span className={label}>Minimum order (KD)</span><input type="number" step="0.5" min="0" className={inputCls} value={s.minOrder} onChange={numField('minOrder')} /></div>
          <div>
            <span className={label}>Fee beyond the free distance</span>
            <select className={inputCls} value={s.feeMode} onChange={(e) => set('feeMode', e.target.value as DeliverySettings['feeMode'])}>
              <option value="per_km">Per extra kilometre</option>
              <option value="fixed">One fixed fee</option>
              <option value="tiers">Distance tiers</option>
            </select>
          </div>
          {s.feeMode === 'per_km' && <div><span className={label}>KD per extra km</span><input type="number" step="0.05" min="0" className={inputCls} value={s.feePerKm} onChange={numField('feePerKm')} /></div>}
          {s.feeMode === 'fixed' && <div><span className={label}>Fixed fee (KD)</span><input type="number" step="0.05" min="0" className={inputCls} value={s.feeFixed} onChange={numField('feeFixed')} /></div>}
        </div>
        {s.feeMode === 'tiers' && (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-xs text-black/50">Within the free distance is free. Beyond it, the first tier the distance fits applies.</p>
            {s.feeTiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm text-black/60 w-24">Up to (km)</span>
                <input type="number" step="0.5" className={inputCls} value={t.upToKm} onChange={(e) => setTier(i, { upToKm: Number(e.target.value) })} />
                <span className="text-sm text-black/60 w-16">Fee KD</span>
                <input type="number" step="0.05" className={inputCls} value={t.fee} onChange={(e) => setTier(i, { fee: Number(e.target.value) })} />
                <button type="button" onClick={() => set('feeTiers', s.feeTiers.filter((_, j) => j !== i))} className="p-2 text-red-500"><Trash2 size={16} /></button>
              </div>
            ))}
            <button type="button" onClick={() => set('feeTiers', [...s.feeTiers, { upToKm: s.feeTiers.length ? s.feeTiers[s.feeTiers.length - 1].upToKm + 3 : s.freeKm + 3, fee: 0.5 }])}
              className="self-start flex items-center gap-1 text-sm font-bold text-brand-red"><Plus size={14} /> Add tier</button>
          </div>
        )}
        <div className="mt-4"><Toggle on={s.taxOnFee} onChange={(v) => set('taxOnFee', v)} text="Charge 10% tax on the delivery fee too" /></div>
      </div>
      )}

      {s.pricingMode === 'distance' && (
      <div className={card}>
        <h3 className="font-black mb-1">Shop location</h3>
        <p className="text-xs text-black/50 mb-4">Distances are measured from here. Copy the latitude and longitude from Google Maps (right-click your shop).</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><span className={label}>Name</span><input className={inputCls} value={s.shopLabel} onChange={(e) => set('shopLabel', e.target.value)} /></div>
          <div><span className={label}>Latitude</span><input type="number" step="0.0001" className={inputCls} value={s.shopLat} onChange={numField('shopLat')} /></div>
          <div><span className={label}>Longitude</span><input type="number" step="0.0001" className={inputCls} value={s.shopLng} onChange={numField('shopLng')} /></div>
        </div>
      </div>
      )}

      <div className={card}>
        <h3 className="font-black mb-4">Delivery hours (Kuwait time)</h3>
        <div className="flex flex-col gap-2">
          {DAY_NAMES.map((name, d) => {
            const h = s.hours[String(d)];
            const upd = (patch: Partial<typeof h>) => set('hours', { ...s.hours, [String(d)]: { ...h, ...patch } });
            return (
              <div key={name} className="flex flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-bold">{name}</span>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={h.closed} onChange={(e) => upd({ closed: e.target.checked })} /> Closed</label>
                <input type="time" disabled={h.closed} className={`${inputCls} !w-32 disabled:opacity-40`} value={h.open} onChange={(e) => upd({ open: e.target.value })} />
                <span className="text-black/40">to</span>
                <input type="time" disabled={h.closed} className={`${inputCls} !w-32 disabled:opacity-40`} value={h.close} onChange={(e) => upd({ close: e.target.value })} />
              </div>
            );
          })}
        </div>
        <p className="text-xs text-black/50 mt-3">A closing time earlier than the opening time means after midnight (for example 10:00 to 02:00).</p>
      </div>

      <div className={card}>
        <h3 className="font-black mb-4">Payment</h3>
        <div className="flex flex-col gap-4">
          <Toggle on={s.codEnabled} onChange={(v) => set('codEnabled', v)} text="Allow cash on delivery" />
          <div className="max-w-xs"><span className={label}>Maximum cash order (KD, 0 = no limit)</span><input type="number" step="1" min="0" className={inputCls} value={s.codMax} onChange={numField('codMax')} /></div>
          {/* PAYMENT: leave OFF until a gateway is wired (see docs/PAYMENTS-TODO.md). The server also refuses online orders until then. */}
          <Toggle on={s.onlinePaymentEnabled} onChange={(v) => set('onlinePaymentEnabled', v)} text="Allow online payment (KNET / cards / Apple Pay)" hint="Keep OFF until a payment gateway is connected. See docs/PAYMENTS-TODO.md." />
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black mb-4">At the door</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><span className={label}>Code length (4 to 6)</span><input type="number" min="4" max="6" className={inputCls} value={s.otpLength} onChange={numField('otpLength')} /></div>
          <div><span className={label}>Code expires after (minutes)</span><input type="number" min="5" className={inputCls} value={s.otpExpiryMinutes} onChange={numField('otpExpiryMinutes')} /></div>
          <div><span className={label}>Wrong attempts before lock</span><input type="number" min="1" className={inputCls} value={s.otpMaxAttempts} onChange={numField('otpMaxAttempts')} /></div>
          <div><span className={label}>Calls before a delivery can fail</span><input type="number" min="1" className={inputCls} value={s.failedCallAttempts} onChange={numField('failedCallAttempts')} /></div>
          <div><span className={label}>Minutes to wait after the last call</span><input type="number" min="0" className={inputCls} value={s.failedWaitMinutes} onChange={numField('failedWaitMinutes')} /></div>
          <div>
            <span className={label}>If delivery fails</span>
            <select className={inputCls} value={s.failedPolicy} onChange={(e) => set('failedPolicy', e.target.value as DeliverySettings['failedPolicy'])}>
              <option value="customer_pays_all">Customer pays food and fee</option>
              <option value="customer_pays_fee">Customer pays the fee only</option>
              <option value="restaurant_absorbs">Restaurant absorbs it</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-black/50 mt-3">The refund rules apply to online payments only; cash orders have nothing to refund.</p>
      </div>

      <div className="flex items-center gap-4 sticky bottom-4">
        <button onClick={() => save()} disabled={saving} className="px-8 py-3.5 rounded-2xl bg-brand-red text-white font-black shadow-lg shadow-brand-red/25 disabled:opacity-60">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {msg && <span className={`text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-brand-red'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
