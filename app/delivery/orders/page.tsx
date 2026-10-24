"use client";
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2, Truck } from 'lucide-react';
import { useCustomer } from '../../lib/customerClient';
import { formatKWD } from '../../lib/currency';

interface Row { id: string; orderId: string; status: string; statusLabel: string; createdAt: number; total: number; items: { name: string; qty: number }[] }

export default function MyDeliveries() {
  const { user, ready, call, signInWithGoogle, signInAsDev, devLoginAvailable } = useCustomer();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    call<{ deliveries: Row[] }>('mine').then((r) => { if (alive) setRows(r.deliveries); }).catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
    // `call` changes with the session; reload only when the person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  const tone = (s: string) => (s === 'delivered' ? 'bg-emerald-100 text-emerald-700' : s === 'failed' || s === 'cancelled' ? 'bg-red-100 text-brand-red' : 'bg-amber-100 text-amber-800');

  return (
    <div className="min-h-screen bg-brand-cream text-brand-ink font-sans pb-16">
      <header className="sticky top-0 z-30 bg-brand-cream/90 backdrop-blur border-b border-brand-gold/20">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/delivery" className="flex items-center gap-1 font-bold text-sm"><ChevronLeft size={18} /> Menu</Link>
          <span className="font-black flex items-center gap-2"><Truck size={18} className="text-brand-red" /> My deliveries</span>
          <span className="w-12" />
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 mt-5 flex flex-col gap-3">
        {ready && !user && (
          <div className="bg-white rounded-3xl border border-brand-gold/20 p-5">
            <p className="font-bold mb-3">Sign in to see your orders.</p>
            <button onClick={() => signInWithGoogle().catch((e: Error) => setError(e.message))} className="w-full py-3 rounded-xl bg-brand-ink text-white font-bold">Continue with Google</button>
            {devLoginAvailable && <button onClick={() => signInAsDev('tester')} className="mt-2 w-full py-3 rounded-xl border border-brand-ink/20 font-bold text-sm">Test login</button>}
          </div>
        )}
        {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
        {user && !rows && !error && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-red" /></div>}
        {rows?.length === 0 && <p className="text-center text-brand-ink/50 py-12">No delivery orders yet.</p>}
        {rows?.map((r) => (
          <Link key={r.id} href={`/delivery/track/${r.id}`} className="bg-white rounded-2xl border border-brand-gold/20 p-4 flex items-center justify-between gap-3 hover:border-brand-red/40">
            <div className="min-w-0">
              <p className="text-xs font-bold text-brand-ink/50">{new Date(r.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {r.orderId}</p>
              <p className="font-bold truncate">{r.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
              <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${tone(r.status)}`}>{r.statusLabel}</span>
            </div>
            <span className="font-black text-brand-red shrink-0">{formatKWD(r.total)}</span>
          </Link>
        ))}
      </main>
    </div>
  );
}
