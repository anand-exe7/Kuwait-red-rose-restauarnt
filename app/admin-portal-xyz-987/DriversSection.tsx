"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { staffCall } from './staffApi';
import { formatKWD } from '../lib/currency';
import type { DeliveryDto } from '../lib/delivery/shared';

interface Driver { id: string; name: string; phone: string; active: boolean }

const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-black/10 text-sm focus:outline-none focus:border-brand-red bg-white';
const card = 'bg-white rounded-3xl border border-black/5 shadow-sm p-5 sm:p-6';
const blank = { id: '', name: '', phone: '', pin: '', active: true };

export default function DriversSection() {
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [cod, setCod] = useState<DeliveryDto[]>([]);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        staffCall<{ drivers: Driver[] }>('drivers.list'),
        staffCall<{ deliveries: DeliveryDto[] }>('cod.report'),
      ]);
      setDrivers(d.drivers); setCod(c.deliveries);
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); setDrivers([]); }
  }, []);

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await staffCall('drivers.save', { id: form.id || undefined, name: form.name, phone: form.phone, pin: form.pin || undefined, active: form.active });
      setForm(blank); setMsg({ ok: true, text: 'Driver saved.' }); await load();
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    setBusy(false);
  };

  const settle = async (driverId: string, name: string, amount: number) => {
    if (!confirm(`Confirm ${name} handed in ${formatKWD(amount)} cash?`)) return;
    try { await staffCall('cod.settle', { driverId }); await load(); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
  };

  // Cash report: per driver, what they collected and have not yet handed in.
  const report = useMemo(() => {
    const m = new Map<string, { name: string; owed: number; expected: number; count: number; short: number }>();
    for (const d of cod) {
      if (!d.driver || d.codSettled) continue;
      const r = m.get(d.driver.id) ?? { name: d.driver.name, owed: 0, expected: 0, count: 0, short: 0 };
      const got = d.codCollected ?? 0;
      r.owed += got; r.expected += d.codExpected; r.count += 1; r.short += Math.max(0, d.codExpected - got);
      m.set(d.driver.id, r);
    }
    return [...m.entries()];
  }, [cod]);

  return (
    <div className="flex flex-col gap-6">
      <div className={card}>
        <h2 className="text-xl font-black mb-1">Drivers</h2>
        <p className="text-xs text-black/50 mb-4">Drivers sign in at <code>/driver-station-ghi-789</code> with their phone number and PIN.</p>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
          <div className="sm:col-span-1"><span className="text-[11px] font-bold uppercase text-black/40">Name</span><input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><span className="text-[11px] font-bold uppercase text-black/40">Mobile</span><input required inputMode="tel" className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><span className="text-[11px] font-bold uppercase text-black/40">{form.id ? 'New PIN (optional)' : 'PIN (4-8 digits)'}</span><input inputMode="numeric" className={inputCls} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} /></div>
          <label className="flex items-center gap-2 text-sm font-bold pb-2.5"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          <div className="flex gap-2">
            <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-brand-red text-white text-sm font-bold disabled:opacity-60">{form.id ? 'Save' : 'Add driver'}</button>
            {form.id && <button type="button" onClick={() => setForm(blank)} className="px-3 text-sm font-bold text-black/50">Cancel</button>}
          </div>
        </form>
        {msg && <p className={`mt-3 text-sm font-bold ${msg.ok ? 'text-emerald-600' : 'text-brand-red'}`}>{msg.text}</p>}

        <div className="mt-5 divide-y divide-black/5">
          {!drivers && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-red" /></div>}
          {drivers?.length === 0 && <p className="py-6 text-center text-sm text-black/40 font-bold">No drivers yet.</p>}
          {drivers?.map((d) => (
            <div key={d.id} className="py-3 flex items-center justify-between gap-3">
              <div><p className="font-bold">{d.name} {!d.active && <span className="text-[10px] uppercase bg-black/10 rounded px-1.5 py-0.5 ml-1">Inactive</span>}</p><p className="text-xs text-black/50">{d.phone}</p></div>
              <button onClick={() => setForm({ id: d.id, name: d.name, phone: d.phone, pin: '', active: d.active })} className="text-sm font-bold text-blue-600">Edit</button>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <h2 className="text-xl font-black mb-1">Cash on delivery</h2>
        <p className="text-xs text-black/50 mb-4">Cash each driver collected and has not yet handed in (last 30 days). Mark it handed in when you receive it.</p>
        {report.length === 0 ? <p className="text-sm text-black/40 font-bold py-4">Nothing outstanding.</p> : (
          <div className="divide-y divide-black/5">
            {report.map(([id, r]) => (
              <div key={id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold">{r.name}</p>
                  <p className="text-xs text-black/50">{r.count} order(s) · expected {formatKWD(r.expected)}</p>
                  {r.short > 0.0005 && <p className="text-xs font-bold text-brand-red">Short by {formatKWD(r.short)} - check with the driver.</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-brand-red">{formatKWD(r.owed)}</span>
                  <button onClick={() => settle(id, r.name, r.owed)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Cash handed in</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
