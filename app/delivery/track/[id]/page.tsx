"use client";
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCircle2, ChefHat, ChevronLeft, Loader2, MapPin, Phone, ShieldCheck, Truck, XCircle, Package } from 'lucide-react';
import { useCustomer } from '../../../lib/customerClient';
import { formatKWD } from '../../../lib/currency';
import { addressLine } from '../../../lib/delivery/shared';

interface Dto {
  id: string; orderId: string; status: string; statusLabel: string; kitchenStatus: string; createdAt: number;
  driver: { name: string; phone: string } | null; address: Record<string, string>; fee: number; total: number; subtotal: number;
  tax: number; discount: number; items: { name: string; qty: number; price: number }[]; paymentMethod: string; paymentStatus: string;
  failedReason: string | null; otpLocked: boolean; distanceKm: number;
}
interface Detail { delivery: Dto; code: string | null; codeExpiresAt: number | null }

function stage(d: Dto): number {
  if (d.status === 'delivered') return 4;
  if (d.status === 'out_for_delivery') return 3;
  if (d.status === 'assigned' || d.kitchenStatus === 'ready' || d.kitchenStatus === 'served') return 2;
  if (d.kitchenStatus === 'cooking') return 1;
  return 0;
}
const STEPS = ['Order received', 'Being prepared', 'Ready for the driver', 'Out for delivery', 'Delivered'];

export default function TrackDelivery() {
  const { id } = useParams<{ id: string }>();
  const { user, ready, call, signInWithGoogle, signInAsDev, devLoginAvailable } = useCustomer();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try { setData(await call<Detail>('detail', { id })); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [call, id]);

  useEffect(() => {
    if (!user) return;
    const first = setTimeout(load, 0);
    const t = setInterval(load, 5000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [user, load]);

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    setCancelling(true);
    try { await call('cancel', { id }); await load(); } catch (e) { setError((e as Error).message); }
    setCancelling(false);
  };

  const d = data?.delivery;
  const closed = d && (d.status === 'cancelled' || d.status === 'failed');
  const canCancel = d && d.status === 'pending' && d.kitchenStatus === 'pending';
  const card = 'bg-white rounded-3xl border border-brand-gold/20 shadow-sm p-5';

  return (
    <div className="min-h-screen bg-brand-cream text-brand-ink font-sans pb-16">
      <header className="sticky top-0 z-30 bg-brand-cream/90 backdrop-blur border-b border-brand-gold/20">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/delivery/orders" className="flex items-center gap-1 font-bold text-sm"><ChevronLeft size={18} /> My orders</Link>
          <span className="font-black flex items-center gap-2"><Truck size={18} className="text-brand-red" /> Track delivery</span>
          <span className="w-16" />
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 flex flex-col gap-4">
        {ready && !user && (
          <div className={card}>
            <p className="font-bold mb-3">Sign in to see your order.</p>
            <button onClick={() => signInWithGoogle().catch((e: Error) => setError(e.message))} className="w-full py-3 rounded-xl bg-brand-ink text-white font-bold">Continue with Google</button>
            {devLoginAvailable && <button onClick={() => signInAsDev('tester')} className="mt-2 w-full py-3 rounded-xl border border-brand-ink/20 font-bold text-sm">Test login</button>}
          </div>
        )}
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
        {user && !d && !error && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-red" /></div>}

        {d && (
          <>
            <section className={card}>
              <p className="text-xs font-bold text-brand-ink/50">Order {d.orderId}</p>
              <h1 className="text-2xl font-black mb-1">{d.statusLabel}</h1>
              {closed && <p className="flex items-center gap-2 text-brand-red font-bold text-sm"><XCircle size={16} /> {d.failedReason ?? 'This delivery was stopped.'}</p>}

              {!closed && (
                <ol className="mt-4 flex flex-col gap-3">
                  {STEPS.map((label, i) => {
                    const at = stage(d);
                    const done = i < at || at === 4;
                    const now = i === at && at !== 4;
                    return (
                      <li key={label} className="flex items-center gap-3">
                        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0 ${done ? 'bg-emerald-500' : now ? 'bg-brand-red animate-pulse' : 'bg-brand-ink/15'}`}>
                          {done ? <CheckCircle2 size={16} /> : i === 1 ? <ChefHat size={14} /> : i === 3 ? <Truck size={14} /> : <Package size={14} />}
                        </span>
                        <span className={`font-bold text-sm ${done || now ? '' : 'text-brand-ink/40'}`}>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {data.code && (
              <section className="rounded-3xl bg-brand-ink text-white p-6 text-center">
                <p className="text-sm font-bold flex items-center justify-center gap-2 text-brand-gold"><ShieldCheck size={16} /> Your delivery code</p>
                <p className="text-5xl font-black tracking-[0.3em] my-3 pl-[0.3em]">{data.code}</p>
                <p className="text-sm text-white/70">Give this code to the driver <b>only when you receive your order</b>.</p>
              </section>
            )}
            {d.status === 'out_for_delivery' && !data.code && (
              <section className={`${card} text-sm font-bold text-brand-red`}>
                {d.otpLocked ? 'Too many wrong codes were entered. Please call the restaurant to unlock your delivery.' : 'Your code has expired. Please call the restaurant for a new one.'}
              </section>
            )}

            {d.driver && !closed && d.status !== 'delivered' && (
              <section className={`${card} flex items-center justify-between`}>
                <div><p className="text-xs font-bold text-brand-ink/50">Your driver</p><p className="font-black">{d.driver.name}</p></div>
                <a href={`tel:${d.driver.phone}`} className="px-4 py-2.5 rounded-xl bg-brand-red text-white font-bold text-sm flex items-center gap-2"><Phone size={16} /> Call</a>
              </section>
            )}

            <section className={card}>
              <p className="flex items-start gap-2 text-sm"><MapPin size={16} className="text-brand-red mt-0.5 shrink-0" /> <span>{addressLine({ ...d.address } as never)}</span></p>
              <ul className="text-sm divide-y divide-brand-gold/15 mt-3">
                {d.items.map((it, i) => <li key={i} className="py-1.5 flex justify-between"><span>{it.qty} × {it.name}</span><span>{formatKWD(it.price * it.qty)}</span></li>)}
              </ul>
              <div className="text-sm mt-3 flex flex-col gap-1">
                <div className="flex justify-between"><span>Delivery</span><span>{d.fee > 0 ? formatKWD(d.fee) : 'Free'}</span></div>
                <div className="flex justify-between font-black text-lg"><span>Total</span><span className="text-brand-red">{formatKWD(d.total)}</span></div>
                <p className="text-xs text-brand-ink/50">{d.paymentMethod === 'cod' ? (d.paymentStatus === 'paid' ? 'Paid in cash.' : 'Pay the driver in cash on delivery.') : `Payment: ${d.paymentStatus}`}</p>
              </div>
              {canCancel && (
                <button onClick={cancel} disabled={cancelling} className="mt-4 w-full py-3 rounded-xl border border-brand-red/40 text-brand-red font-bold text-sm disabled:opacity-60">
                  {cancelling ? 'Cancelling…' : 'Cancel order'}
                </button>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
