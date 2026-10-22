"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, LogOut, Phone, ShieldCheck, Truck } from 'lucide-react';
import { addressLine, type DeliveryDto } from '../lib/delivery/shared';
import { formatKWD } from '../lib/currency';

interface Mine {
  driver: { id: string; name: string };
  active: DeliveryDto[];
  recent: DeliveryDto[];
  rules: { callAttempts: number; waitMinutes: number; otpLength: number };
}

async function api<T>(url: string, body: Record<string, unknown>): Promise<T & { status: number }> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const err = new Error(typeof json?.error === 'string' ? json.error : json?.error?.message ?? 'Something went wrong') as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return { ...json, status: res.status };
}

export default function DriverStation() {
  const [data, setData] = useState<Mine | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ phone: '', pin: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [cash, setCash] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      setData(await api<Mine>('/api/delivery/driver', { action: 'mine' }));
      setNeedLogin(false);
    } catch (e) {
      if ((e as { status?: number }).status === 401) { setNeedLogin(true); setData(null); }
      else setError((e as Error).message);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = setInterval(load, 8000);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearTimeout(first); clearInterval(poll); clearInterval(tick); };
  }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy('login'); setError(null);
    try { await api('/api/driver/login', form); setForm({ phone: '', pin: '' }); await load(); }
    catch (err) { setError((err as Error).message); }
    setBusy(null);
  };

  const logout = async () => { await api('/api/driver/logout', {}).catch(() => {}); setData(null); setNeedLogin(true); };

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(id + action); setError(null); setNotice(null);
    try {
      const r = await api<{ delivered?: boolean; cashMismatch?: number }>('/api/delivery/driver', { action, deliveryId: id, ...extra });
      if (r.delivered) setNotice(r.cashMismatch ? `Delivered. You collected ${formatKWD(r.cashMismatch)} less than expected - tell the restaurant.` : 'Delivered. Well done!');
      await load();
    } catch (err) { setError((err as Error).message); }
    setBusy(null);
  };

  const card = 'bg-white rounded-3xl border border-black/10 shadow-sm p-5';
  const input = 'w-full px-4 py-3.5 rounded-xl border border-black/15 text-lg focus:outline-none focus:border-brand-red';

  return (
    <div className="min-h-screen bg-[#f6f1ec] text-brand-ink font-sans pb-16">
      <header className="sticky top-0 z-30 bg-brand-ink text-white">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-black flex items-center gap-2"><Truck size={18} /> Driver</span>
          {data && <button onClick={logout} className="flex items-center gap-1 text-sm font-bold text-white/70"><LogOut size={15} /> {data.driver.name}</button>}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 flex flex-col gap-4">
        {!loaded && <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brand-red" /></div>}

        {loaded && needLogin && (
          <form onSubmit={login} className={`${card} flex flex-col gap-3`}>
            <h1 className="text-xl font-black">Driver sign-in</h1>
            <input required inputMode="tel" placeholder="Mobile number" className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} autoComplete="username" />
            <input required type="password" inputMode="numeric" placeholder="PIN" className={input} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} autoComplete="current-password" />
            <button disabled={busy === 'login'} className="py-4 rounded-2xl bg-brand-red text-white font-black text-lg disabled:opacity-60">{busy === 'login' ? 'Signing in…' : 'Sign in'}</button>
          </form>
        )}

        {error && <p className="text-sm font-bold text-brand-red bg-red-50 rounded-xl px-4 py-3">{error}</p>}
        {notice && <p className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl px-4 py-3 flex items-center gap-2"><CheckCircle2 size={16} /> {notice}</p>}

        {data && data.active.length === 0 && (
          <div className={`${card} text-center text-black/50 font-bold py-12`}>No deliveries assigned to you right now.</div>
        )}

        {data?.active.map((d) => {
          const out = d.status === 'out_for_delivery';
          const calls = d.callAttempts;
          const callsOk = calls.length >= data.rules.callAttempts;
          const waitLeft = calls.length ? Math.max(0, Math.ceil((calls[calls.length - 1] + data.rules.waitMinutes * 60000 - now) / 60000)) : 0;
          const failReady = callsOk && waitLeft === 0;
          const cod = d.paymentMethod === 'cod';
          return (
            <section key={d.id} className={card}>
              <div className="flex justify-between items-start gap-3">
                <div><p className="text-xs font-bold text-black/40">{d.orderId}</p><h2 className="text-xl font-black">{d.customerName}</h2></div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${out ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>{d.statusLabel}</span>
              </div>

              <p className="mt-3 font-bold leading-snug">{addressLine(d.address as never)}</p>
              {typeof d.address.landmark === 'string' && d.address.landmark && <p className="text-sm text-black/60">Landmark: {d.address.landmark}</p>}
              {d.note && <p className="text-sm text-black/60">Note: {d.note}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${d.lat !== null && d.lng !== null ? `${d.lat},${d.lng}` : encodeURIComponent(`${addressLine(d.address as never)}, Kuwait`)}`} target="_blank" rel="noreferrer" className="py-3 rounded-xl bg-blue-600 text-white font-bold text-center flex items-center justify-center gap-2"><ExternalLink size={16} /> Navigate</a>
                <a href={`tel:${d.customerPhone}`} className="py-3 rounded-xl bg-emerald-600 text-white font-bold text-center flex items-center justify-center gap-2"><Phone size={16} /> {d.customerPhone}</a>
              </div>

              <p className="mt-3 text-sm text-black/70">{d.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
              {cod
                ? <p className="mt-2 text-lg font-black text-brand-red">Collect cash: {formatKWD(d.codExpected)}</p>
                : <p className="mt-2 text-sm font-bold text-emerald-700">Already paid - no cash to collect.</p>}

              {!out && (
                <div className="mt-4">
                  <button disabled={d.kitchenStatus !== 'ready' || busy === d.id + 'pickup'} onClick={() => act(d.id, 'pickup')}
                    className="w-full py-4 rounded-2xl bg-brand-red text-white font-black text-lg disabled:opacity-40">
                    {d.kitchenStatus === 'ready' ? 'I picked it up - start delivery' : 'Waiting for the kitchen…'}
                  </button>
                </div>
              )}

              {out && (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="rounded-2xl bg-brand-ink/5 p-4">
                    <p className="text-sm font-bold flex items-center gap-2 mb-2"><ShieldCheck size={16} /> Ask the customer for their {data.rules.otpLength}-digit code</p>
                    <input inputMode="numeric" maxLength={data.rules.otpLength} placeholder={'•'.repeat(data.rules.otpLength)}
                      className={`${input} text-center tracking-[0.4em] font-black text-2xl`} value={codes[d.id] ?? ''}
                      onChange={(e) => setCodes({ ...codes, [d.id]: e.target.value.replace(/\D/g, '') })} />
                    {cod && (
                      <input inputMode="decimal" placeholder={`Cash collected (KD) - expected ${d.codExpected.toFixed(3)}`} className={`${input} mt-3 text-base`}
                        value={cash[d.id] ?? ''} onChange={(e) => setCash({ ...cash, [d.id]: e.target.value })} />
                    )}
                    <button disabled={busy === d.id + 'verifyOtp' || (codes[d.id] ?? '').length !== data.rules.otpLength || (cod && !cash[d.id])}
                      onClick={() => act(d.id, 'verifyOtp', { code: codes[d.id], collected: cod ? cash[d.id] : undefined })}
                      className="mt-3 w-full py-4 rounded-2xl bg-emerald-600 text-white font-black text-lg disabled:opacity-40">Confirm delivery</button>
                    {d.otpLocked && <p className="mt-2 text-sm font-bold text-brand-red">Locked after wrong codes. Ask the restaurant to unlock it.</p>}
                  </div>

                  <div className="rounded-2xl border border-black/10 p-4">
                    <p className="text-sm font-bold mb-2">Customer not answering?</p>
                    <div className="flex gap-2">
                      <button disabled={busy === d.id + 'callAttempt'} onClick={() => act(d.id, 'callAttempt')} className="flex-1 py-3 rounded-xl border border-black/20 font-bold text-sm">I called ({calls.length}/{data.rules.callAttempts})</button>
                      <button disabled={!failReady || busy === d.id + 'markFailed'} onClick={() => { if (confirm('Mark this delivery as failed?')) act(d.id, 'markFailed', { reason: 'Customer did not answer' }); }}
                        className="flex-1 py-3 rounded-xl bg-black/80 text-white font-bold text-sm disabled:opacity-30">Mark failed</button>
                    </div>
                    {!failReady && <p className="text-xs text-black/50 mt-2">{!callsOk ? `Call at least ${data.rules.callAttempts} time(s) first.` : `Wait ${waitLeft} more minute(s) after the last call.`}</p>}
                  </div>
                </div>
              )}
            </section>
          );
        })}

        {data && data.recent.length > 0 && (
          <section className={card}>
            <h3 className="font-black mb-2">Last 24 hours</h3>
            <ul className="divide-y divide-black/5 text-sm">
              {data.recent.map((d) => (
                <li key={d.id} className="py-2 flex justify-between gap-2"><span>{d.customerName} · {d.orderId}</span><span className={`font-bold ${d.status === 'delivered' ? 'text-emerald-700' : 'text-brand-red'}`}>{d.statusLabel}</span></li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
