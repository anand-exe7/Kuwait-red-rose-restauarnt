"use client";
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Loader2, MapPin, ShieldCheck, Truck, Banknote, CreditCard } from 'lucide-react';
import { useCustomer, publicDelivery } from '../../lib/customerClient';
import MapPinPicker, { type LatLng } from '../../components/MapPinPicker';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu } from '../../lib/menuStore';
import { getCouponsSnapshot, getCouponsServerSnapshot, subscribeToCoupons, validateCoupon } from '../../lib/couponStore';
import { formatKWD, round3 } from '../../lib/currency';
import { DEFAULT_SETTINGS } from '../../lib/delivery/shared';

interface AreaOption { id: string; name: string; fee: number; minOrder: number | null }
interface Quote {
  ok: boolean; reason?: string; pricingMode: 'areas' | 'distance'; areaId: string | null; areaName: string; distanceKm: number; distanceSource: string; fee: number; free: boolean;
  freeKm: number; maxKm: number; minOrder: number; hoursText: string; codEnabled: boolean; codMax: number;
  onlinePaymentEnabled: boolean; taxOnFee: boolean;
}
interface SavedAddress {
  id: string; label: string; name: string; phone: string; area: string; block: string; street: string; jadda: string;
  building: string; floor: string; apartment: string; landmark: string; note: string; lat: number | null; lng: number | null; area_id: string | null;
}

const noopSubscribe = () => () => {};
const readCart = () => { try { return sessionStorage.getItem('rr_delivery_cart'); } catch { return null; } };

const blank = { label: 'Home', name: '', phone: '', area: '', block: '', street: '', jadda: '', building: '', floor: '', apartment: '', landmark: '', note: '' };

export default function DeliveryCheckout() {
  const router = useRouter();
  const { user, ready, signInWithGoogle, signInAsDev, signOut, call, devLoginAvailable } = useCustomer();
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);
  const rawCart = useSyncExternalStore(noopSubscribe, readCart, () => null);

  const saved = useMemo(() => {
    try { return rawCart ? (JSON.parse(rawCart) as { cart: Record<string, number>; coupon: string | null }) : null; } catch { return null; }
  }, [rawCart]);

  const lines = useMemo(() => {
    if (!saved) return [];
    return Object.entries(saved.cart).flatMap(([id, qty]) => {
      const m = menu.find((x) => x.id === id);
      return m && qty > 0 ? [{ id, name: m.name, price: m.price, qty }] : [];
    });
  }, [saved, menu]);
  const subtotal = round3(lines.reduce((s, l) => s + l.price * l.qty, 0));

  const [mode, setMode] = useState<'areas' | 'distance' | null>(null);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [areaId, setAreaId] = useState('');
  const [pos, setPos] = useState<LatLng | null>(null);
  const [form, setForm] = useState(blank);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [saveAddress, setSaveAddress] = useState(true);
  const [method, setMethod] = useState<'cod' | 'online'>('cod');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dev, setDev] = useState('tester');

  // Saved addresses once signed in.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    call<{ addresses: SavedAddress[] }>('addresses.list').then((r) => { if (alive) setAddresses(r.addresses); }).catch(() => {});
    return () => { alive = false; };
    // `call` changes with the session; only reload when the person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  // How fees work right now (areas list or map pin), set by the admin.
  useEffect(() => {
    let alive = true;
    publicDelivery<{ pricingMode: 'areas' | 'distance'; areas: AreaOption[] }>('areas')
      .then((r) => { if (alive) { setMode(r.pricingMode); setAreas(r.areas); } })
      .catch((e: Error) => { if (alive) { setMode('areas'); setQuoteError(e.message); } });
    return () => { alive = false; };
  }, []);

  // Ask the server for the fee whenever the area / pin or the cart changes.
  const target = mode === 'areas' ? (areaId ? { areaId } : null) : pos ? { lat: pos.lat, lng: pos.lng } : null;
  const targetKey = target ? JSON.stringify(target) : '';
  useEffect(() => {
    if (!targetKey) return;
    let alive = true;
    const t = setTimeout(() => {
      publicDelivery<{ quote: Quote }>('quote', { ...JSON.parse(targetKey), subtotal })
        .then((r) => { if (alive) { setQuote(r.quote); setQuoteError(null); } })
        .catch((e: Error) => { if (alive) setQuoteError(e.message); });
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [targetKey, subtotal]);
  const shownQuote = target ? quote : null;

  const coupon = saved?.coupon ? validateCoupon(saved.coupon, subtotal) : null;
  const discount = coupon?.ok ? round3(coupon.discount ?? 0) : 0;
  const fee = shownQuote?.ok ? shownQuote.fee : 0;
  const tax = round3((subtotal - discount + (shownQuote?.taxOnFee ? fee : 0)) * 0.1);
  const total = round3(subtotal - discount + fee + tax);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fillFrom = (a: SavedAddress) => {
    setForm({ label: a.label, name: a.name, phone: a.phone, area: a.area, block: a.block, street: a.street, jadda: a.jadda,
      building: a.building, floor: a.floor, apartment: a.apartment, landmark: a.landmark, note: a.note });
    if (mode === 'areas') {
      const match = areas.find((x) => x.id === a.area_id) ?? areas.find((x) => x.name === a.area);
      setAreaId(match ? match.id : '');
    } else if (a.lat !== null && a.lng !== null) setPos({ lat: a.lat, lng: a.lng });
  };

  const place = async () => {
    if (!target) { setError(mode === 'areas' ? 'Please choose your delivery area first.' : 'Please mark your delivery location on the map first.'); return; }
    setError(null); setPlacing(true);
    try {
      const r = await call<{ deliveryId: string; redirectUrl?: string }>('checkout', {
        items: lines.map((l) => ({ id: l.id, qty: l.qty })),
        couponCode: saved?.coupon ?? undefined,
        address: form, ...target, paymentMethod: method, saveAddress, note,
      });
      try { sessionStorage.removeItem('rr_delivery_cart'); } catch { /* ignore */ }
      if (r.redirectUrl) window.location.assign(r.redirectUrl); // PAYMENT: gateway's hosted page
      else router.push(`/delivery/track/${r.deliveryId}`);
    } catch (e) {
      setError((e as Error).message); setPlacing(false);
    }
  };

  const input = 'w-full px-4 py-3 rounded-xl border border-brand-gold/30 bg-white text-base focus:outline-none focus:border-brand-red';
  const card = 'bg-white rounded-3xl border border-brand-gold/20 shadow-sm p-5 md:p-6';
  const canPlace = !!user && !!target && !!shownQuote?.ok && lines.length > 0 && !placing;

  return (
    <div className="min-h-screen bg-brand-cream text-brand-ink font-sans pb-16">
      <header className="sticky top-0 z-30 bg-brand-cream/90 backdrop-blur border-b border-brand-gold/20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/delivery" className="flex items-center gap-1 font-bold text-sm"><ChevronLeft size={18} /> Menu</Link>
          <span className="font-black flex items-center gap-2"><Truck size={18} className="text-brand-red" /> Delivery checkout</span>
          {user ? <button onClick={signOut} className="text-xs font-bold text-brand-ink/50">Sign out</button> : <span className="w-12" />}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 mt-5 flex flex-col gap-5">
        {lines.length === 0 && (
          <div className={card}>
            <p className="font-bold mb-2">Your cart is empty.</p>
            <Link href="/delivery" className="text-brand-red font-bold">Choose something from the menu →</Link>
          </div>
        )}

        {/* 1. Sign in */}
        {ready && !user && lines.length > 0 && (
          <section className={card}>
            <h2 className="font-black text-lg mb-1">Sign in to order</h2>
            <p className="text-sm text-brand-ink/60 mb-4">So you can track your delivery, see the code for the driver and reorder later.</p>
            <button onClick={() => signInWithGoogle().catch((e: Error) => setError(e.message))}
              className="w-full py-3.5 rounded-xl bg-brand-ink text-white font-bold flex items-center justify-center gap-2">
              <ShieldCheck size={18} /> Continue with Google
            </button>
            {devLoginAvailable && (
              <div className="mt-3 flex gap-2">
                <input value={dev} onChange={(e) => setDev(e.target.value.replace(/[^a-z0-9_-]/gi, ''))} className={input} placeholder="test name" />
                <button onClick={() => signInAsDev(dev || 'tester')} className="px-4 rounded-xl border border-brand-ink/20 font-bold text-sm whitespace-nowrap">Test login</button>
              </div>
            )}
            {error && <p className="text-sm font-bold text-brand-red mt-3">{error}</p>}
          </section>
        )}

        {user && lines.length > 0 && (
          <>
            <p className="text-sm text-brand-ink/60">Signed in as <b>{user.name}</b></p>

            {/* 2. Location: pick an area (default) or drop a map pin (distance mode) */}
            <section className={card}>
              <h2 className="font-black text-lg mb-3 flex items-center gap-2"><MapPin size={18} className="text-brand-red" /> Where should we deliver?</h2>
              {addresses.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {addresses.map((a) => (
                    <button key={a.id} onClick={() => fillFrom(a)} className="px-3 py-2 rounded-full border border-brand-red/30 text-sm font-bold text-brand-red hover:bg-brand-red/5">
                      {a.label} · {a.area}
                    </button>
                  ))}
                </div>
              )}
              {mode === null && <p className="text-sm text-brand-ink/50 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>}
              {mode === 'areas' && (
                areas.length === 0
                  ? <p className="text-sm font-bold text-brand-red">Delivery areas have not been set up yet. Please try again later.</p>
                  : (
                    <>
                      <label className="text-xs font-bold uppercase tracking-wide text-brand-ink/50 block mb-1">Your area</label>
                      <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className={input}>
                        <option value="">Choose your area…</option>
                        {areas.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} — {a.fee > 0 ? formatKWD(a.fee) : 'Free delivery'}</option>
                        ))}
                      </select>
                    </>
                  )
              )}
              {mode === 'distance' && (
                <MapPinPicker value={pos} center={{ lat: DEFAULT_SETTINGS.shopLat, lng: DEFAULT_SETTINGS.shopLng }}
                  onChange={(p, s) => { setPos(p); if (s?.area) setForm((f) => (f.area ? f : { ...f, area: s.area! })); }} />
              )}
              {quoteError && <p className="mt-3 text-sm font-bold text-brand-red">{quoteError}</p>}
              {shownQuote && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-bold ${shownQuote.ok ? (shownQuote.free ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800') : 'bg-red-50 text-brand-red'}`}>
                  {shownQuote.ok
                    ? (shownQuote.distanceSource === 'area'
                      ? (shownQuote.free ? `Free delivery to ${shownQuote.areaName}` : `Delivery fee to ${shownQuote.areaName}: ${formatKWD(shownQuote.fee)}`)
                      : (shownQuote.free ? `Free delivery · ${shownQuote.distanceKm.toFixed(1)} km` : `Delivery fee ${formatKWD(shownQuote.fee)} · ${shownQuote.distanceKm.toFixed(1)} km`))
                    : shownQuote.reason}
                  {shownQuote.ok && shownQuote.distanceSource === 'estimated' && <span className="block font-medium text-xs opacity-70">Distance is an estimate.</span>}
                </div>
              )}
            </section>

            {/* 3. Details */}
            <section className={card}>
              <h2 className="font-black text-lg mb-3">Address details</h2>
              <div className="grid grid-cols-2 gap-3">
                <input className={`${input} col-span-2`} placeholder="Your name" value={form.name} onChange={set('name')} autoComplete="name" />
                <input className={`${input} col-span-2`} placeholder="Mobile number" inputMode="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
                {mode === 'distance' && <input className={input} placeholder="Area" value={form.area} onChange={set('area')} />}
                <input className={input} placeholder="Block" value={form.block} onChange={set('block')} />
                <input className={input} placeholder="Street" value={form.street} onChange={set('street')} />
                <input className={input} placeholder="Jadda (optional)" value={form.jadda} onChange={set('jadda')} />
                <input className={input} placeholder="Building / house no." value={form.building} onChange={set('building')} />
                <input className={input} placeholder="Floor" value={form.floor} onChange={set('floor')} />
                <input className={input} placeholder="Apartment / office" value={form.apartment} onChange={set('apartment')} />
                <input className={input} placeholder="Label (Home, Work…)" value={form.label} onChange={set('label')} />
                <input className={`${input} col-span-2`} placeholder="Landmark (for example next to the pharmacy)" value={form.landmark} onChange={set('landmark')} />
                <input className={`${input} col-span-2`} placeholder="Note for the driver (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm font-bold">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="w-4 h-4 accent-[#b01e28]" /> Save this address for next time
              </label>
            </section>

            {/* 4. Payment */}
            <section className={card}>
              <h2 className="font-black text-lg mb-3">Payment</h2>
              <label className={`flex items-center gap-3 p-3 rounded-xl border mb-2 ${method === 'cod' ? 'border-brand-red bg-brand-red/5' : 'border-brand-gold/30'} ${shownQuote && !shownQuote.codEnabled ? 'opacity-50' : ''}`}>
                <input type="radio" name="pay" checked={method === 'cod'} disabled={!!shownQuote && !shownQuote.codEnabled} onChange={() => setMethod('cod')} className="accent-[#b01e28]" />
                <Banknote size={20} className="text-brand-red" />
                <span><b className="block text-sm">Cash on delivery</b><span className="text-xs text-brand-ink/60">Pay the driver when your order arrives.{shownQuote?.codMax ? ` Up to ${formatKWD(shownQuote.codMax)}.` : ''}</span></span>
              </label>
              {/* PAYMENT: this option lights up once a gateway is wired and Admin -> Delivery has online payment switched on. */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border ${shownQuote?.onlinePaymentEnabled ? 'border-brand-gold/30' : 'border-brand-gold/20 opacity-50'}`}>
                <input type="radio" name="pay" checked={method === 'online'} disabled={!shownQuote?.onlinePaymentEnabled} onChange={() => setMethod('online')} className="accent-[#b01e28]" />
                <CreditCard size={20} className="text-brand-ink/50" />
                <span><b className="block text-sm">Pay online (KNET / card / Apple Pay)</b><span className="text-xs text-brand-ink/60">{shownQuote?.onlinePaymentEnabled ? 'Secure payment page.' : 'Coming soon.'}</span></span>
              </label>
            </section>

            {/* 5. Review */}
            <section className={card}>
              <h2 className="font-black text-lg mb-3">Your order</h2>
              <ul className="text-sm divide-y divide-brand-gold/15 mb-3">
                {lines.map((l) => (
                  <li key={l.id} className="py-2 flex justify-between"><span>{l.qty} × {l.name}</span><span className="font-bold">{formatKWD(l.price * l.qty)}</span></li>
                ))}
              </ul>
              <div className="text-sm flex flex-col gap-1">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatKWD(subtotal)}</span></div>
                {discount > 0 && <div className="flex justify-between text-emerald-700"><span>Discount ({saved?.coupon})</span><span>− {formatKWD(discount)}</span></div>}
                <div className="flex justify-between"><span>Delivery</span><span>{shownQuote ? (shownQuote.ok ? (shownQuote.free ? 'Free' : formatKWD(fee)) : '—') : mode === 'areas' ? 'Choose your area' : 'Pin your location'}</span></div>
                <div className="flex justify-between"><span>Tax (10%)</span><span>{formatKWD(tax)}</span></div>
                <div className="flex justify-between text-xl font-black mt-2"><span>Total</span><span className="text-brand-red">{formatKWD(total)}</span></div>
              </div>
              <p className="text-xs text-brand-ink/50 mt-2">The final price is confirmed by our server when you place the order.</p>
              {error && <p className="text-sm font-bold text-brand-red mt-3">{error}</p>}
              <button onClick={place} disabled={!canPlace}
                className="mt-4 w-full py-4 rounded-2xl bg-brand-red text-white font-black text-lg flex items-center justify-center gap-2 disabled:opacity-50">
                {placing ? <><Loader2 size={20} className="animate-spin" /> Placing order…</> : <><Truck size={20} /> Place order</>}
              </button>
              {!target && <p className="text-xs text-center text-brand-ink/50 mt-2">{mode === 'areas' ? 'Choose your area to continue.' : 'Mark your location on the map to continue.'}</p>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
