"use client";

// Public menu + ordering page. The flow:
//   browse (public) → cart → sign-in (if needed) → pick mode (dine-in /
//   takeaway / delivery) → fill mode-specific details → submit.
// On submit, the order is written with status='awaiting_admin' and (for
// takeaway + delivery) a pre-filled WhatsApp message is opened to the shop.
// Chef dashboards filter out awaiting_admin, so unapproved tickets never reach
// the kitchen.

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, Minus, Plus, ChevronLeft, CheckCircle2, Loader2, Tag, X,
  Bike, PackageCheck, MapPin, LogIn, LogOut, Send, QrCode,
} from 'lucide-react';
import { addOrder, type DeliveryAddress, type OrderMode } from '../lib/orderStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu, MENU_CATEGORIES } from '../lib/menuStore';
import { formatKWD } from '../lib/currency';
import { validateCoupon, incrementCouponUsage } from '../lib/couponStore';
import { landingFonts } from '../fonts';
import BrandMark from '../components/BrandMark';
import SignInGate from '../components/SignInGate';
import {
  subscribeToCustomerAuth, getCustomerAuthSnapshot, getCustomerAuthServerSnapshot,
  signOut,
} from '../lib/customerAuthStore';
import { sendOrderToShop, isWhatsAppConfigured } from '../lib/whatsapp';

const PETALS = [
  { src: 'petal-a', left: '8%', w: '26px', dur: 17, delay: 0, sway: 40 },
  { src: 'petal-b', left: '26%', w: '20px', dur: 21, delay: 6, sway: -30 },
  { src: 'petal-c', left: '71%', w: '24px', dur: 19, delay: 3, sway: 36 },
  { src: 'petal-a', left: '90%', w: '18px', dur: 23, delay: 9, sway: -44 },
];

const KUWAIT_GOVERNORATES = [
  'Al Asimah (Capital)',
  'Hawalli',
  'Farwaniya',
  'Mubarak Al-Kabeer',
  'Ahmadi',
  'Jahra',
];

const EMPTY_ADDRESS: DeliveryAddress = {
  governorate: '', area: '', street: '', avenue: '', building: '',
  floor: '', apartment: '', landmark: '',
};

type CheckoutStep = 'browse' | 'mode' | 'details' | 'submitting' | 'success';
type CheckoutMode = Exclude<OrderMode, 'standing'>; // 'table' | 'takeaway' | 'delivery'

export default function MenuPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>('browse');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<CheckoutMode | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; id: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const [selectedMode, setSelectedMode] = useState<CheckoutMode | null>(null);
  const [phone, setPhone] = useState('');
  const [tableInput, setTableInput] = useState('');
  const [address, setAddress] = useState<DeliveryAddress>(EMPTY_ADDRESS);
  const [formError, setFormError] = useState<string | null>(null);

  // The frosted strip behind the floating nav, and the solid Review Order pill,
  // both block the red hero when they appear over it. Only switch them on once
  // the hero has fully scrolled off; before that the pill stays translucent so
  // the cake behind it still shows.
  const [pastHero, setPastHero] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const hero = document.getElementById('menu-hero');
      const heroBottom = hero ? hero.getBoundingClientRect().bottom : 600;
      setPastHero(heroBottom < 90);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const auth = useSyncExternalStore(subscribeToCustomerAuth, getCustomerAuthSnapshot, getCustomerAuthServerSnapshot);

  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const menu = allMenuItems.filter(m => m.status === 'active');
  const categories = ['All', ...MENU_CATEGORIES];
  const filteredMenu = activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory);

  const addToCart = (id: string) => setCart(p => ({ ...p, [id]: (p[id] || 0) + 1 }));
  const removeFromCart = (id: string) => setCart(p => {
    const n = { ...p };
    if (n[id] > 1) n[id]--;
    else delete n[id];
    return n;
  });

  const cartTotal = Object.entries(cart).reduce((acc, [id, qty]) => {
    const item = menu.find(m => m.id === id);
    return acc + (item?.price || 0) * qty;
  }, 0);
  const cartItemCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const discount = appliedCoupon ? (cartTotal * appliedCoupon.discountPercent) / 100 : 0;
  const taxable = Math.max(0, cartTotal - discount);
  const taxAmt = taxable * 0.1;
  const grandTotal = taxable + taxAmt;

  const applyCoupon = () => {
    const res = validateCoupon(couponInput, cartTotal);
    if (!res.ok || !res.coupon) {
      setCouponError(res.reason || 'Invalid coupon');
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code: res.coupon.code, discountPercent: res.coupon.discountPercent, id: res.coupon.id });
    setCouponError(null);
  };
  const removeCoupon = () => { setAppliedCoupon(null); setCouponInput(''); setCouponError(null); };

  const openCheckout = () => {
    if (cartItemCount === 0) return;
    if (!auth.user) { setSignInOpen(true); return; }
    setStep('mode');
  };

  const chooseMode = (mode: CheckoutMode) => {
    setSelectedMode(mode);
    setFormError(null);
    setStep('details');
  };

  const submit = () => {
    if (!auth.user || !selectedMode) { setSignInOpen(true); return; }
    if (!phone.trim()) { setFormError('A phone number is required so we can reach you.'); return; }
    if (selectedMode === 'table') {
      const n = Number(tableInput);
      if (!Number.isFinite(n) || n <= 0) { setFormError('Please enter a valid table number.'); return; }
    }
    if (selectedMode === 'delivery') {
      if (!address.governorate || !address.area || !address.street || !address.building) {
        setFormError('Please complete at least Governorate, Area, Street, and Building.');
        return;
      }
    }
    setFormError(null);
    setStep('submitting');

    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menu.find(m => m.id === id)!;
      return { id: item.id, name: item.name, price: item.price, qty };
    });

    setTimeout(() => {
      const customer = {
        userId: auth.user!.id,
        name: auth.user!.name ?? undefined,
        email: auth.user!.email ?? undefined,
        phone: phone.trim(),
      };
      const order = addOrder({
        table: selectedMode === 'table' ? Number(tableInput) : 0,
        items,
        priority: 'normal',
        subtotal: cartTotal,
        tax: taxAmt,
        total: grandTotal,
        source: 'customer',
        mode: selectedMode,
        discount: discount > 0 ? discount : undefined,
        couponCode: appliedCoupon?.code,
        customer,
        deliveryAddress: selectedMode === 'delivery' ? address : undefined,
        // Explicit — all customer orders queue for admin, regardless of mode.
        status: 'awaiting_admin',
      });
      if (appliedCoupon) incrementCouponUsage(appliedCoupon.id);
      setLastOrderId(order.id);
      setLastMode(selectedMode);
      if (selectedMode === 'takeaway' || selectedMode === 'delivery') {
        sendOrderToShop({
          order,
          mode: selectedMode,
          customer,
          address: selectedMode === 'delivery' ? address : undefined,
        });
      }
      setCart({});
      setAppliedCoupon(null);
      setCouponInput('');
      setStep('success');
    }, 600);
  };

  const resendWhatsApp = () => {
    if (!lastOrderId || !lastMode || lastMode === 'table') return;
    const items = Object.entries(cart).map(([id, qty]) => {
      const item = menu.find(m => m.id === id)!;
      return { id: item.id, name: item.name, price: item.price, qty };
    });
    sendOrderToShop({
      order: {
        id: lastOrderId, table: 0, items, status: 'awaiting_admin', priority: 'normal',
        subtotal: cartTotal, tax: taxAmt, total: grandTotal, createdAt: Date.now(),
        source: 'customer', mode: lastMode,
      },
      mode: lastMode,
      customer: {
        name: auth.user?.name ?? undefined,
        email: auth.user?.email ?? undefined,
        phone,
      },
      address: lastMode === 'delivery' ? address : undefined,
    });
  };

  const startNewOrder = () => {
    setStep('browse');
    setLastOrderId(null);
    setLastMode(null);
    setSelectedMode(null);
    setIsCartOpen(false);
    setAddress(EMPTY_ADDRESS);
    setPhone('');
    setTableInput('');
  };

  const waConfigured = isWhatsAppConfigured();

  return (
    <div className={`landing ${landingFonts} min-h-screen bg-brand-cream font-body text-brand-ink pb-32`}>
      {/* Frosted strip that sits behind the floating nav pill so page content
          scrolling underneath the gaps around it doesn't bleed through. */}
      <div
        aria-hidden
        className={`fixed inset-x-0 top-0 z-30 h-[82px] bg-brand-cream/80 backdrop-blur-xl transition-opacity duration-300 sm:h-[88px] ${pastHero ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={{
          maskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 78%, transparent 100%)',
        }}
      />
      <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full border border-brand-gold/25 bg-[#4f070c]/90 py-1.5 pl-2 pr-1.5 shadow-[0_18px_44px_-12px_rgba(35,0,4,0.6)] backdrop-blur-md">
          <BrandMark href="/" />

          <div className="flex items-center gap-2">
            {auth.user ? (
              <>
                <span className="hidden items-center gap-2 rounded-full border border-brand-gold/30 bg-white/10 px-3 py-2 font-body text-[10.5px] text-brand-gold-light sm:flex">
                  {auth.user.avatarUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={auth.user.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
                  )}
                  <span className="max-w-[120px] truncate">{auth.user.name || auth.user.email}</span>
                </span>
                <button onClick={() => void signOut()} aria-label="Sign out" className="btn btn-outline-light h-10 w-10 p-0">
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button onClick={() => setSignInOpen(true)} className="btn btn-outline-light px-4 py-3 text-[10px] sm:px-5">
                <LogIn size={14} /> Sign in
              </button>
            )}
            <button onClick={() => setIsCartOpen(true)} aria-label="Your order" className="btn btn-gold relative h-10 w-10 p-0 transition-transform hover:scale-105 active:scale-95">
              <ShoppingBag size={16} strokeWidth={1.8} />
              {cartItemCount > 0 && (
                <span key={cartItemCount} className="qty-pop absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-[#4f070c] bg-brand-red font-body text-[10px] font-semibold tracking-normal text-white">
                  {cartItemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section id="menu-hero" className="relative overflow-clip bg-brand-red text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(120% 88% at 50% 14%, #f2404f 0%, #dc2a38 26%, #b81a27 56%, #8e1019 80%, #6d0810 100%)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(65% 42% at 50% 66%, rgba(255,152,160,0.22) 0%, rgba(255,120,132,0.08) 45%, transparent 72%)' }} />
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-[0.055] mix-blend-overlay" />

        {PETALS.map((p, i) => (
          <span key={i} aria-hidden className="petal-fall pointer-events-none absolute top-0 z-10"
            style={{ left: p.left, width: p.w, '--dur': `${p.dur}s`, '--delay': `${p.delay}s`, '--sway': `${p.sway}px` } as React.CSSProperties}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/cutouts/${p.src}.webp`} alt="" className="block h-auto w-full drop-shadow-[0_8px_8px_rgba(40,0,6,0.35)]" />
          </span>
        ))}

        <div className="h-24 sm:h-28" aria-hidden />

        <div className="relative z-30 mx-auto flex max-w-6xl select-none flex-col items-center px-4 pb-24 sm:pb-28 md:pb-32">
          <div className="anim-fade-down flex items-center gap-3 sm:gap-5">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-brand-gold/70 sm:w-16" />
            <span className="whitespace-nowrap font-body text-[9px] font-medium uppercase tracking-[0.34em] text-brand-gold-light/90 sm:text-[10px] sm:tracking-[0.42em]">
              Our menu · Freshly made, every day
            </span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-brand-gold/70 sm:w-16" />
          </div>

          <div className="relative mt-4 flex w-full flex-col items-center md:mt-2 md:flex-row md:justify-center">
            <div className="flex items-end gap-3 md:contents">
              <span
                className="anim-slide-left block bg-clip-text font-wordmark text-[clamp(84px,25vw,150px)] leading-[0.9] tracking-[-0.022em] text-transparent md:order-1 md:text-[clamp(110px,16vw,220px)]"
                style={{ backgroundImage: 'linear-gradient(180deg, #ffa8a6 0%, #ff7078 34%, #fb4d5b 70%, #ee3242 100%)', filter: 'drop-shadow(0 2px 1px rgba(90,3,12,0.45)) drop-shadow(0 20px 44px rgba(28,0,4,0.55))' }}
              >RED</span>
              <span
                className="anim-slide-right block bg-clip-text font-wordmark text-[clamp(84px,25vw,150px)] leading-[0.9] tracking-[-0.022em] text-transparent md:order-3 md:text-[clamp(110px,16vw,220px)]"
                style={{ backgroundImage: 'linear-gradient(100deg, #fdeed6 0%, #f2d3a4 30%, #ffffff 45%, #fffdf8 51%, #f2d3a4 68%, #fdeed6 100%)', filter: 'drop-shadow(0 2px 1px rgba(90,3,12,0.35)) drop-shadow(0 20px 44px rgba(28,0,4,0.55))' }}
              >ROSE</span>
            </div>

            <div className="anim-cake-drop relative z-10 -mt-3 w-[64vw] max-w-[320px] md:order-2 md:mt-0 md:-mx-[5vw] md:w-[30vw] md:max-w-[420px]">
              <div aria-hidden className="anim-glow absolute inset-[-12%] -z-10" style={{ background: 'radial-gradient(closest-side, rgba(255,196,186,0.55), rgba(255,120,120,0.18) 55%, transparent 78%)' }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/cake-hd-720.webp" alt="A Red Rose cake" width={720} height={682}
                className="cake-sway block h-auto w-full drop-shadow-[0_26px_30px_rgba(45,0,8,0.45)]" />
            </div>
          </div>
        </div>

        <svg aria-hidden viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[-1px] z-40 h-12 w-full fill-brand-cream sm:h-20">
          <path d="M0,86 C300,24 1080,24 1440,86 L1440,120 L0,120 Z" />
        </svg>
      </section>

      <div className="mx-auto max-w-6xl px-4 pt-6 text-center md:px-6 md:pt-8">
        <span className="eyebrow eyebrow-center text-brand-red">Our menu</span>
        <h2
          className="mt-5 font-wordmark text-[clamp(42px,6vw,72px)] uppercase leading-[1] tracking-[0.012em] text-brand-wine"
          style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom' }}
        >
          Fresh from the <span className="text-brand-red">oven</span>
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-body text-sm text-brand-wine/60">
          Browse freely — you&apos;ll choose dine-in, takeaway or delivery at checkout.
        </p>
      </div>

      <div className="sticky top-[68px] z-30 mt-8 border-b border-brand-gold/20 bg-brand-cream/85 py-3 backdrop-blur-md md:mb-2">
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 md:justify-center md:gap-3 md:px-6">
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)}
              className={`btn shrink-0 px-5 py-3 text-[10px] md:px-7 ${activeCategory === cat ? 'btn-wine' : 'btn-outline bg-white/60'}`}>
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-8 md:px-6 md:pt-10">
        <div className="mb-6 flex items-end justify-between gap-4 md:mb-8">
          <h3
            className="font-wordmark text-[32px] uppercase leading-none tracking-[0.012em] text-brand-wine md:text-[40px]"
            style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
          >
            {activeCategory === 'All' ? <>All <span className="text-brand-red">creations</span></> : activeCategory}
          </h3>
          <span className="font-body text-[10.5px] font-medium uppercase tracking-[0.24em] text-brand-gold-dark">
            {filteredMenu.length} {filteredMenu.length === 1 ? 'item' : 'items'}
          </span>
        </div>

        {filteredMenu.length === 0 ? (
          <p className="rounded-3xl border border-brand-gold/30 bg-white p-10 text-center font-body text-sm text-brand-wine/60">
            No items in this category yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:gap-8 lg:grid-cols-3">
            {filteredMenu.map(item => (
              <div key={item.id} className="group relative flex flex-col overflow-hidden rounded-[1.75rem] border border-brand-gold/25 bg-white shadow-[0_24px_50px_-32px_rgba(74,21,21,0.45)] transition-all duration-500 hover:-translate-y-1.5 hover:border-brand-gold/60 hover:shadow-[0_34px_60px_-28px_rgba(143,23,32,0.55)]">
                <div className="relative aspect-[4/3] w-full flex-shrink-0 overflow-hidden bg-brand-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]" />
                  <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2a0a0a]/55 via-[#2a0a0a]/0 to-transparent" />
                  <span aria-hidden className="pointer-events-none absolute inset-[10px] rounded-[1.25rem] border border-white/35" />

                  <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
                    {item.isPopular ? (
                      <span className="rounded-full bg-brand-red px-3 py-1.5 font-body text-[9px] font-semibold uppercase tracking-[0.26em] text-white shadow-[0_8px_18px_-8px_rgba(176,30,40,0.75)]">
                        Popular
                      </span>
                    ) : <span />}
                    {item.isChefSpecial && (
                      <span className="rounded-full bg-brand-gold px-3 py-1.5 font-body text-[9px] font-semibold uppercase tracking-[0.26em] text-brand-wine shadow-[0_8px_18px_-8px_rgba(30,0,4,0.55)]">
                        Chef&apos;s pick
                      </span>
                    )}
                  </div>

                  <span className="absolute bottom-4 left-4 rounded-full bg-brand-cream/95 px-3 py-1 font-body text-[9px] font-medium uppercase tracking-[0.3em] text-brand-gold-dark shadow-sm backdrop-blur-sm">
                    {item.category}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-5 md:p-6">
                  <h4
                    className="font-wordmark text-[26px] uppercase leading-[1.02] tracking-[0.012em] text-brand-wine md:text-[28px]"
                    style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                  >
                    {item.name}
                  </h4>
                  <p className="mt-4 mb-5 line-clamp-2 flex-1 font-body text-[13px] font-light leading-relaxed text-brand-ink/60">
                    {item.description}
                  </p>
                  <div className="flex items-center justify-between gap-3 border-t border-brand-gold/25 pt-4">
                    <div className="shrink-0">
                      <span
                        className="lining-nums font-wordmark text-[26px] leading-none text-brand-red md:text-[28px]"
                        style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', display: 'inline-block' }}
                      >
                        {formatKWD(item.price)}
                      </span>
                      {cart[item.id] > 0 && (
                        <p className="mt-1.5 font-body text-[10px] font-medium uppercase tracking-[0.18em] text-brand-ink/45">
                          {formatKWD(item.price * cart[item.id])} total
                        </p>
                      )}
                    </div>
                    {cart[item.id] ? (
                      <div className="qty-pop flex shrink-0 items-center gap-2 rounded-full border border-brand-gold/50 bg-brand-cream p-1">
                        <button onClick={() => removeFromCart(item.id)} aria-label={`Remove one ${item.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-wine shadow-sm transition-all hover:scale-105 hover:text-brand-red active:scale-95"><Minus size={15} /></button>
                        <span key={cart[item.id]} className="qty-bump w-5 text-center font-wordmark text-xl text-brand-wine" style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}>{cart[item.id]}</span>
                        <button onClick={() => addToCart(item.id)} aria-label={`Add one ${item.name}`} className="btn btn-wine h-9 w-9 shrink-0 p-0 transition-transform hover:scale-105 active:scale-95"><Plus size={15} /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item.id)} className="btn btn-wine shrink-0 px-6 py-3.5 text-[10px] transition-transform hover:scale-[1.03] active:scale-95">
                        <Plus size={14} /> Add
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-14 flex flex-wrap items-center justify-center gap-4 text-center">
          <Link href="/" className="text-link text-brand-wine/70 hover:text-brand-red">← Back to home</Link>
        </div>
      </div>

      {/* Floating checkout CTA (mobile + anywhere) */}
      {!isCartOpen && cartItemCount > 0 && (
        <div className="anim-review-rise fixed bottom-6 left-0 right-0 z-30 px-4">
          <button
            onClick={() => setIsCartOpen(true)}
            className="btn pill-shine mx-auto flex w-full max-w-xl justify-between px-6 py-5 text-white transition-transform hover:-translate-y-0.5 active:translate-y-0"
            style={{
              backgroundImage: pastHero
                ? 'linear-gradient(135deg, #75201f 0%, #4a1515 50%, #2b0a0a 100%)'
                : 'linear-gradient(135deg, rgba(117,32,31,0.55) 0%, rgba(74,21,21,0.6) 50%, rgba(43,10,10,0.6) 100%)',
              backdropFilter: pastHero ? 'none' : 'blur(16px)',
              WebkitBackdropFilter: pastHero ? 'none' : 'blur(16px)',
              boxShadow: '0 18px 36px -14px rgba(74, 21, 21, 0.75), inset 0 0 0 1px rgba(201, 169, 97, 0.45)',
              transition: 'background-image 0.4s ease, backdrop-filter 0.4s ease',
            }}
          >
            <span className="flex items-center gap-3">
              <span key={cartItemCount} className="qty-pop flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold-light/25 text-[11px] tracking-normal">{cartItemCount}</span>
              <span>Review Order</span>
            </span>
            <span
              className="font-wordmark text-[22px] normal-case tracking-normal text-brand-gold-light"
              style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}
            >{formatKWD(grandTotal)}</span>
          </button>
        </div>
      )}

      {/* Cart / Checkout Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="anim-cart-backdrop absolute inset-0 bg-[#2a0a0a]/45 backdrop-blur-md" onClick={() => step !== 'success' && step !== 'submitting' && setIsCartOpen(false)} />
          <div className="anim-cart-sheet relative mt-16 flex h-[calc(100%-4rem)] w-full flex-col rounded-t-[2rem] border border-brand-gold/30 bg-brand-cream shadow-[0_-24px_60px_-20px_rgba(30,0,4,0.45)] md:mt-0 md:h-full md:w-[500px] md:rounded-l-[2rem] md:rounded-tr-none md:shadow-[-24px_0_60px_-20px_rgba(30,0,4,0.45)]">

            {step === 'success' ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
                <div className="animate-in zoom-in flex h-24 w-24 items-center justify-center rounded-full border border-brand-gold/50 bg-white shadow-[0_18px_40px_-18px_rgba(74,21,21,0.5)] duration-500">
                  <CheckCircle2 size={52} className="text-brand-green" strokeWidth={1.8} />
                </div>
                <div>
                  <span className="eyebrow eyebrow-center text-brand-red">Thank you</span>
                  <h2
                    className="mt-4 font-wordmark text-[52px] uppercase leading-[1] tracking-[0.012em] text-brand-wine"
                    style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom' }}
                  >
                    Order <span className="text-brand-red">placed</span>
                  </h2>
                  <p className="mx-auto mt-4 max-w-xs font-body text-[14px] leading-relaxed text-brand-ink/65">
                    {lastMode === 'delivery' && 'We’ve sent your order to the shop. Please tap Send in WhatsApp to confirm, then wait for admin approval.'}
                    {lastMode === 'takeaway' && 'We’ve sent your order to the shop. Please tap Send in WhatsApp to confirm, then wait for admin approval.'}
                    {lastMode === 'table' && 'Your order is on its way to admin for approval. We’ll have it to your table shortly.'}
                  </p>
                </div>
                {lastOrderId && (
                  <div className="rounded-full border border-brand-gold/40 bg-white px-5 py-2.5 font-body text-[10.5px] font-medium uppercase tracking-[0.24em] text-brand-gold-dark">
                    Order #{lastOrderId}
                  </div>
                )}
                <div className="mt-2 flex w-full flex-col gap-3">
                  {waConfigured && lastMode !== 'table' && (
                    <button onClick={resendWhatsApp} className="btn btn-outline w-full py-4">
                      <Send size={16} /> Open WhatsApp again
                    </button>
                  )}
                  <button onClick={startNewOrder} className="btn btn-wine w-full py-5">
                    Back to Menu
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-4 border-b border-brand-gold/25 p-6 md:p-8">
                  <button
                    onClick={() => {
                      if (step === 'details') setStep('mode');
                      else if (step === 'mode') setStep('browse');
                      else setIsCartOpen(false);
                    }}
                    aria-label="Back"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-brand-gold/40 bg-white text-brand-wine hover:border-brand-red hover:text-brand-red"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="flex-1">
                    <span className="font-body text-[10px] font-medium uppercase tracking-[0.34em] text-brand-gold-dark">
                      {step === 'mode' ? 'Where should it go?' : step === 'details' ? 'Almost there' : 'Your selection'}
                    </span>
                    <h2
                      className="font-wordmark text-[30px] uppercase leading-none tracking-[0.012em] text-brand-wine md:text-[36px]"
                      style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                    >
                      {step === 'mode' ? 'Choose a mode' : step === 'details' ? 'Last details' : 'Your Order'}
                    </h2>
                  </div>
                </div>

                {(step === 'browse') && (
                  <>
                    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 md:p-8">
                      {cartItemCount === 0 ? (
                        <div className="flex h-full flex-col items-center justify-center gap-4 text-brand-wine/35">
                          <ShoppingBag size={56} strokeWidth={1.2} />
                          <p
                            className="font-wordmark text-2xl uppercase tracking-[0.03em]"
                            style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}
                          >Your order is empty</p>
                        </div>
                      ) : (
                        Object.entries(cart).map(([id, qty], idx) => {
                          const item = menu.find(m => m.id === id);
                          if (!item) return null;
                          return (
                            <div
                              key={id}
                              className="anim-cart-item-in flex items-center gap-4 rounded-[1.5rem] border border-brand-gold/25 bg-white p-3 shadow-[0_12px_30px_-20px_rgba(74,21,21,0.4)] transition-shadow hover:shadow-[0_18px_36px_-20px_rgba(74,21,21,0.55)]"
                              style={{ '--i': idx } as React.CSSProperties}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt={item.name} className="h-20 w-20 rounded-[1.1rem] bg-brand-sand object-cover md:h-24 md:w-24" />
                              <div className="min-w-0 flex-1">
                                <h4
                                  className="mb-1.5 font-wordmark text-[20px] uppercase leading-tight tracking-[0.012em] text-brand-wine"
                                  style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', display: 'inline-block' }}
                                >{item.name}</h4>
                                <p
                                  className="font-wordmark text-[20px] text-brand-red"
                                  style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', display: 'inline-block' }}
                                >{formatKWD(item.price * qty)}</p>
                              </div>
                              <div className="flex items-center gap-1.5 rounded-full border border-brand-gold/50 bg-brand-cream p-1">
                                <button onClick={() => removeFromCart(id)} aria-label={`Remove one ${item.name}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-brand-wine shadow-sm transition-transform hover:scale-105 hover:text-brand-red active:scale-95"><Minus size={13} /></button>
                                <span key={qty} className="qty-bump w-5 text-center font-wordmark text-lg text-brand-wine" style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}>{qty}</span>
                                <button onClick={() => addToCart(id)} aria-label={`Add one ${item.name}`} className="btn btn-wine h-8 w-8 p-0 transition-transform hover:scale-105 active:scale-95"><Plus size={13} /></button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {cartItemCount > 0 && (
                      <div className="rounded-b-[2rem] border-t border-brand-gold/25 bg-brand-sand/60 p-6 pb-8 md:rounded-bl-[2rem] md:rounded-br-none md:p-8">
                        <div className="mb-5">
                          {appliedCoupon ? (
                            <div className="flex items-center justify-between gap-2 rounded-2xl border border-brand-green/30 bg-brand-green/10 px-4 py-3">
                              <span className="flex items-center gap-2 font-body text-sm font-medium text-brand-green">
                                <Tag size={15} /> {appliedCoupon.code} · {appliedCoupon.discountPercent}% off
                              </span>
                              <button onClick={removeCoupon} aria-label="Remove coupon" className="text-brand-ink/40 hover:text-brand-red"><X size={16} /></button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Tag size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
                                <input value={couponInput} onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }} placeholder="Coupon code"
                                  className="w-full rounded-full border border-brand-gold/40 bg-white py-3 pl-10 pr-4 font-body text-xs font-medium uppercase tracking-[0.18em] placeholder:text-brand-ink/35 focus:border-brand-red focus:outline-none" />
                              </div>
                              <button onClick={applyCoupon} disabled={!couponInput.trim()} className="btn btn-outline px-6 py-3 text-[10px] disabled:opacity-40">Apply</button>
                            </div>
                          )}
                          {couponError && <p className="mt-2 pl-4 font-body text-xs font-medium text-brand-red">{couponError}</p>}
                        </div>

                        <div className="mb-2.5 flex justify-between font-body text-sm font-light text-brand-ink/65"><span>Subtotal</span><span className="font-medium text-brand-ink">{formatKWD(cartTotal)}</span></div>
                        {discount > 0 && <div className="mb-2.5 flex justify-between font-body text-sm text-brand-green"><span>Discount</span><span className="font-medium">− {formatKWD(discount)}</span></div>}
                        <div className="mb-5 flex justify-between font-body text-sm font-light text-brand-ink/65"><span>Tax (10%)</span><span className="font-medium text-brand-ink">{formatKWD(taxAmt)}</span></div>
                        <div className="mb-6 flex items-end justify-between border-t border-brand-gold/30 pt-5">
                          <span className="font-body text-[11px] font-medium uppercase tracking-[0.24em] text-brand-wine">Total</span>
                          <span
                            className="font-wordmark text-[40px] leading-none text-brand-red"
                            style={{ display: 'inline-block', transform: 'scaleY(1.08)', transformOrigin: 'bottom right' }}
                          >{formatKWD(grandTotal)}</span>
                        </div>
                        <button onClick={openCheckout} className="btn btn-wine w-full py-5">
                          {auth.user ? 'Checkout' : (<><LogIn size={18} /> Sign in to checkout</>)}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {step === 'mode' && (
                  <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 md:p-8">
                    <ModeTile
                      icon={<MapPin size={22} />} title="Dine-in"
                      body="You're seated at a table in the shop. We'll add this to your table's tab."
                      onClick={() => chooseMode('table')}
                    />
                    <ModeTile
                      icon={<PackageCheck size={22} />} title="Takeaway"
                      body="Order ahead and pick up at the shop. Cash at the counter."
                      onClick={() => chooseMode('takeaway')}
                    />
                    <ModeTile
                      icon={<Bike size={22} />} title="Delivery"
                      body="We bring it to your address. Cash on delivery across Kuwait."
                      onClick={() => chooseMode('delivery')}
                    />
                    <div className="mt-2 rounded-2xl border border-brand-gold/30 bg-white/60 p-4 text-brand-wine/70">
                      <p className="flex items-start gap-2 font-body text-xs leading-relaxed">
                        <QrCode size={14} className="mt-0.5 shrink-0" />
                        <span>Already at a table? Just scan the QR there — it auto-fills your table number.</span>
                      </p>
                    </div>
                  </div>
                )}

                {(step === 'details' || step === 'submitting') && selectedMode && (
                  <>
                    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6 md:p-8">
                      <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                        <span className="font-body text-[10px] font-medium uppercase tracking-[0.24em] text-brand-gold-dark">
                          {selectedMode === 'delivery' ? 'Delivery' : selectedMode === 'takeaway' ? 'Takeaway' : 'Dine-in'}
                        </span>
                        <p className="font-body text-sm text-brand-wine/80">
                          {selectedMode === 'delivery' && 'Cash on delivery · we’ll open WhatsApp to confirm with the shop.'}
                          {selectedMode === 'takeaway' && 'Cash at pickup · we’ll open WhatsApp to confirm with the shop.'}
                          {selectedMode === 'table' && 'Added to your table’s open tab · waiter brings it.'}
                        </p>
                      </div>

                      <Field label="Your name">
                        <input value={auth.user?.name ?? ''} readOnly className="input-plain" />
                      </Field>
                      <Field label="Contact phone" required>
                        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9XXXXXXX" inputMode="tel" className="input-plain" />
                      </Field>

                      {selectedMode === 'table' && (
                        <Field label="Table number" required>
                          <input value={tableInput} onChange={e => setTableInput(e.target.value)} placeholder="e.g. 7" inputMode="numeric" className="input-plain" />
                        </Field>
                      )}

                      {selectedMode === 'delivery' && (
                        <>
                          <Field label="Governorate" required>
                            <select value={address.governorate} onChange={e => setAddress(a => ({ ...a, governorate: e.target.value }))} className="input-plain">
                              <option value="">Select…</option>
                              {KUWAIT_GOVERNORATES.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </Field>
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Area / Block" required><input value={address.area} onChange={e => setAddress(a => ({ ...a, area: e.target.value }))} placeholder="Block 10" className="input-plain" /></Field>
                            <Field label="Street" required><input value={address.street} onChange={e => setAddress(a => ({ ...a, street: e.target.value }))} placeholder="23" className="input-plain" /></Field>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Avenue"><input value={address.avenue ?? ''} onChange={e => setAddress(a => ({ ...a, avenue: e.target.value }))} className="input-plain" /></Field>
                            <Field label="Building" required><input value={address.building} onChange={e => setAddress(a => ({ ...a, building: e.target.value }))} className="input-plain" /></Field>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Floor"><input value={address.floor ?? ''} onChange={e => setAddress(a => ({ ...a, floor: e.target.value }))} className="input-plain" /></Field>
                            <Field label="Apartment"><input value={address.apartment ?? ''} onChange={e => setAddress(a => ({ ...a, apartment: e.target.value }))} className="input-plain" /></Field>
                          </div>
                          <Field label="Landmark (optional)">
                            <input value={address.landmark ?? ''} onChange={e => setAddress(a => ({ ...a, landmark: e.target.value }))} placeholder="next to the pharmacy" className="input-plain" />
                          </Field>
                        </>
                      )}

                      {formError && (
                        <p className="rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-xs text-brand-red">{formError}</p>
                      )}
                    </div>

                    <div className="rounded-b-[2rem] border-t border-brand-gold/25 bg-brand-sand/60 p-6 pb-8 md:rounded-bl-[2rem] md:rounded-br-none md:p-8">
                      <div className="mb-4 flex items-end justify-between">
                        <span className="font-body text-[11px] font-medium uppercase tracking-[0.24em] text-brand-wine">
                          Total · {selectedMode === 'table' ? 'Settled on your tab' : `Cash on ${selectedMode === 'delivery' ? 'delivery' : 'pickup'}`}
                        </span>
                        <span
                          className="font-wordmark text-[32px] text-brand-red"
                          style={{ display: 'inline-block', transform: 'scaleY(1.08)', transformOrigin: 'bottom right' }}
                        >{formatKWD(grandTotal)}</span>
                      </div>
                      <button onClick={submit} disabled={step === 'submitting'} className="btn btn-wine w-full py-5 disabled:cursor-wait disabled:opacity-70">
                        {step === 'submitting' ? (
                          <><Loader2 size={18} className="animate-spin" /> Placing order…</>
                        ) : selectedMode === 'table' ? (
                          <><Send size={18} /> Place order</>
                        ) : (
                          <><Send size={18} /> Place order & send on WhatsApp</>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <SignInGate
        open={signInOpen}
        onClose={() => setSignInOpen(false)}
        message="Sign in with Google to place your order. We only use this to tie orders to your account."
      />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-body text-[11px] font-medium uppercase tracking-[0.22em] text-brand-wine/70">
        {label}{required && <span className="ml-1 text-brand-red">*</span>}
      </span>
      {children}
    </label>
  );
}

function ModeTile({ icon, title, body, onClick }: { icon: React.ReactNode; title: string; body: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-5 rounded-3xl border border-brand-gold/25 bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-red/40 hover:shadow-lg"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-red/10 text-brand-red transition-colors group-hover:bg-brand-red group-hover:text-white">
        {icon}
      </span>
      <div className="flex-1">
        <h4
          className="font-wordmark text-xl uppercase tracking-[0.014em] text-brand-wine"
          style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}
        >{title}</h4>
        <p className="mt-1 font-body text-sm text-brand-wine/65">{body}</p>
      </div>
      <ChevronLeft size={18} className="rotate-180 text-brand-wine/40 transition-transform group-hover:translate-x-1 group-hover:text-brand-red" />
    </button>
  );
}
