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
  Bike, PackageCheck, MapPin, LogIn, LogOut, Send, QrCode, User, Mail, Phone,
  ClipboardList, CalendarClock, Home, Receipt, Clock, PlusCircle,
} from 'lucide-react';
import {
  addOrder, type DeliveryAddress, type OrderMode,
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders, orderLabel,
  getUserOpenDineInTab, type UserOpenTab, type Order,
} from '../lib/orderStore';
import {
  subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot,
  requestBill,
} from '../lib/sessionStore';
import { getMenuSnapshot, getMenuServerSnapshot, subscribeToMenu, MENU_CATEGORIES } from '../lib/menuStore';
import { formatKWD } from '../lib/currency';
import {
  validateCoupon,
  subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot,
} from '../lib/couponStore';
import {
  subscribeToAreas, getAreasSnapshot, getAreasServerSnapshot, activeAreas,
} from '../lib/deliveryAreaStore';
import { landingFonts } from '../fonts';
import BrandMark from '../components/BrandMark';
import SignInGate from '../components/SignInGate';
import {
  subscribeToCustomerAuth, getCustomerAuthSnapshot, getCustomerAuthServerSnapshot,
  signOut,
} from '../lib/customerAuthStore';
import { sendOrderToShop, isWhatsAppConfigured, type WhatsAppOrderInput } from '../lib/whatsapp';
import { invoicePath, resolveInvoiceNo, resolveOrderNo } from '../lib/invoice';
import { subscribeToTables, getTablesSnapshot, getTablesServerSnapshot } from '../lib/tableStore';
import { getBills, getBillsSnapshot, getBillsServerSnapshot, subscribeToBills } from '../lib/billStore';
import { BRAND } from '../lib/brand';

const PETALS = [
  { src: 'petal-a', left: '8%', w: '26px', dur: 17, delay: 0, sway: 40 },
  { src: 'petal-b', left: '26%', w: '20px', dur: 21, delay: 6, sway: -30 },
  { src: 'petal-c', left: '71%', w: '24px', dur: 19, delay: 3, sway: 36 },
  { src: 'petal-a', left: '90%', w: '18px', dur: 23, delay: 9, sway: -44 },
];

// Fallback delivery zones + fee (KD) — used only until an admin adds zones in
// Admin → Delivery Zones. Once zones exist in the database they take over here,
// so delivery pricing is fully admin-editable but never empty.
const FALLBACK_ZONES: { name: string; fee: number }[] = [
  { name: 'Al Asimah (Capital)', fee: 1.0 },
  { name: 'Hawalli', fee: 1.0 },
  { name: 'Farwaniya', fee: 1.25 },
  { name: 'Mubarak Al-Kabeer', fee: 1.5 },
  { name: 'Ahmadi', fee: 1.75 },
  { name: 'Jahra', fee: 2.0 },
];

const EMPTY_ADDRESS: DeliveryAddress = {
  governorate: '', area: '', street: '', avenue: '', building: '',
  floor: '', apartment: '', landmark: '',
};

type CheckoutStep = 'browse' | 'mode' | 'details' | 'submitting' | 'success';
type CheckoutMode = Exclude<OrderMode, 'standing'>; // 'table' | 'takeaway' | 'delivery'

// Keys for cart + checkout-resume state persisted across the OAuth round-trip.
// Google sign-in replaces the whole document, which wipes in-memory React
// state; without this, returning from auth drops the user back on an empty
// menu instead of the next checkout step.
const CART_STORAGE_KEY = 'rrs_menu_cart_v1';
const RESUME_CHECKOUT_KEY = 'rrs_menu_resume_checkout';

export default function MenuPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [step, setStep] = useState<CheckoutStep>('browse');
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  // The session the order landed on — the invoice is keyed to it, so this is
  // what the confirmation screen and the WhatsApp message both point at.
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [lastWhatsApp, setLastWhatsApp] = useState<WhatsAppOrderInput | null>(null);
  const [lastMode, setLastMode] = useState<CheckoutMode | null>(null);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discountPercent: number; id: string } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  // Targeted ("personal") coupons only work for the numbers they were sent to.
  // When the code is one of those, we reveal a phone field so the customer can
  // claim it with the number it was sent to, right at apply time.
  const [couponPhone, setCouponPhone] = useState('');
  const [couponNeedsPhone, setCouponNeedsPhone] = useState(false);
  // Arrived from a /coupon/CODE link ("Use it & order now"): the code travels
  // in the URL and is applied for them at checkout.
  const [pendingCoupon, setPendingCoupon] = useState('');
  const [signInOpen, setSignInOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // True while we're waiting on sign-in to continue the user's checkout —
  // once auth.user flips to truthy, we close the modal and jump to mode select.
  const [pendingCheckout, setPendingCheckout] = useState(false);

  const [selectedMode, setSelectedMode] = useState<CheckoutMode | null>(null);
  // When true, a dine-in checkout appends to the customer's existing open tab
  // instead of starting a new one (so no table re-pick, one running bill).
  const [attachToTab, setAttachToTab] = useState(false);
  const [phone, setPhone] = useState('');
  const [tableInput, setTableInput] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  // A note for the whole order ("no sugar", "call before you come"). It reaches
  // the admin, the chef's ticket and the waiter, and prints on the invoice.
  const [remark, setRemark] = useState('');
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
  const allOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const sessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const openDineInSessions = React.useMemo(
    () => sessions.filter(s => s.status === 'open' && s.mode === 'table'),
    [sessions]
  );
  // The signed-in customer's live dine-in tab (one open bill until admin closes
  // it). Powers the "add to current bill?" prompt and the open-tab banner.
  const myOpenTab = React.useMemo(
    () => getUserOpenDineInTab(
      allOrders,
      openDineInSessions,
      auth.user ? { id: auth.user.id, email: auth.user.email } : null,
    ),
    [allOrders, openDineInSessions, auth.user]
  );
  // Live list of tables the admin has created. We only let the customer pick
  // from active ones, so a deactivated table never shows up as a choice.
  const tables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const activeTables = React.useMemo(
    () => [...tables].filter(t => t.active).sort((a, b) => a.number - b.number),
    [tables]
  );

  // Subscribe to coupons purely to trigger hydration — the customer page
  // doesn't render the list, but without this, store.get() in validateCoupon
  // sees an empty cache and every code reads as "invalid".
  useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);

  // Deep link from home-page best-seller tiles: /menu?item=<id>. Once the
  // matching card is in the DOM, scroll to it and flash a highlight ring.
  // The menu data lives in a client store that hydrates after mount, and the
  // page's above-the-fold images are lazy-loaded, so the target keeps moving
  // for a while after mount. We retry scrolling a few times to land it even
  // as layout settles.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const want = new URL(window.location.href).searchParams.get('item');
    if (!want) return;
    let tries = 0;
    let landed = false;
    const scrollAttempts = [250, 700, 1400, 2200];
    const landOn = (el: HTMLElement) => {
      landed = true;
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
      el.classList.add('menu-item-flash');
      window.setTimeout(() => el.classList.remove('menu-item-flash'), 2400);
      const u = new URL(window.location.href);
      u.searchParams.delete('item');
      window.history.replaceState({}, '', u.toString());
      // Re-center the item after images finish loading and push the layout.
      for (const d of scrollAttempts) {
        window.setTimeout(() => {
          const cur = document.getElementById(`menu-item-${want}`);
          if (cur) cur.scrollIntoView({ behavior: 'auto', block: 'center' });
        }, d);
      }
    };
    const run = () => {
      if (landed) return;
      const el = document.getElementById(`menu-item-${want}`);
      if (el) { landOn(el); return; }
      if (tries++ < 40) window.setTimeout(run, 150);
    };
    run();
  }, []);

  // /menu?coupon=CODE — carry the code in, clean the URL, and tell them it is
  // waiting. Deferred to a task so this never sets state inside the effect body.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const want = new URL(window.location.href).searchParams.get('coupon');
    if (!want) return;
    const t = window.setTimeout(() => {
      const code = want.trim().toUpperCase().slice(0, 40);
      setPendingCoupon(code);
      setCouponInput(code);
      const u = new URL(window.location.href);
      u.searchParams.delete('coupon');
      window.history.replaceState({}, '', u.toString());
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  const allMenuItems = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);

  const menu = allMenuItems.filter(m => m.status === 'active');
  // Categories reflect what the admin actually created (built-ins + any custom
  // ones in use), so a new category shows up here automatically.
  const categories = React.useMemo(
    () => ['All', ...Array.from(new Set([...MENU_CATEGORIES, ...menu.map(m => m.category)].filter(Boolean)))],
    [menu]
  );
  const filteredMenu = activeCategory === 'All' ? menu : menu.filter(m => m.category === activeCategory);
  const bestSellers = menu.filter(m => m.isBestSeller);

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
  // No tax: shop prefers all-inclusive pricing.
  const taxAmt = 0;
  // Delivery zones come from the admin (Delivery Zones page). Until any exist we
  // fall back to the default governorates so delivery always has options.
  const areas = useSyncExternalStore(subscribeToAreas, getAreasSnapshot, getAreasServerSnapshot);
  const deliveryZones = React.useMemo(() => {
    const a = activeAreas(areas);
    return a.length ? a.map(x => ({ name: x.name, fee: x.fee })) : FALLBACK_ZONES;
  }, [areas]);
  const feeForZone = (name: string) => deliveryZones.find(z => z.name === name)?.fee ?? 0;
  // Goods total (what the order stores). Delivery is charged on top and shown
  // separately at checkout + in the WhatsApp message, so the stored total stays
  // consistent with the itemised receipt.
  const grandTotal = Math.max(0, cartTotal - discount);
  const deliveryFee = selectedMode === 'delivery' ? feeForZone(address.governorate) : 0;
  const payableTotal = grandTotal + deliveryFee;

  const applyCoupon = () => {
    // Use the number the customer gave to claim the coupon, falling back to any
    // contact number already entered for checkout.
    const claimPhone = couponPhone.trim() || phone.trim();
    const res = validateCoupon(couponInput, cartTotal, claimPhone || undefined);
    if (res.needsPhone) {
      // Personal coupon — reveal the phone field and prompt (no hard error until
      // they actually try a number that wasn't sent to).
      setCouponNeedsPhone(true);
      setAppliedCoupon(null);
      setCouponError(couponPhone.trim() ? (res.reason || null) : null);
      return;
    }
    if (!res.ok || !res.coupon) {
      setCouponError(res.reason || 'Invalid coupon');
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code: res.coupon.code, discountPercent: res.coupon.discountPercent, id: res.coupon.id });
    setCouponError(null);
    setCouponNeedsPhone(false);
    // Carry the claimed number into checkout so the submit-time re-check (and the
    // order's contact number) match the number the coupon was claimed with.
    if (claimPhone && !phone.trim()) setPhone(claimPhone);
  };
  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    setCouponPhone('');
    setCouponNeedsPhone(false);
  };

  // Advance checkout to the mode-picker step. Shared by the normal "Checkout"
  // button, the SignInGate's onSignedIn callback (so sign-in → mode happens in
  // one click with no useEffect race), and the Google-OAuth resume path.
  const advanceToCheckoutMode = () => {
    setPendingCheckout(false);
    setSignInOpen(false);
    setIsCartOpen(true);
    setStep('mode');
    try {
      sessionStorage.removeItem(RESUME_CHECKOUT_KEY);
      sessionStorage.removeItem(CART_STORAGE_KEY);
    } catch { /* ignore */ }
  };

  const openCheckout = () => {
    if (cartItemCount === 0) return;
    if (!auth.user) {
      // Google OAuth replaces the whole document, so stash the cart and a
      // resume flag now — on the way back we rehydrate the cart and jump
      // straight to the mode step.
      try {
        sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
        sessionStorage.setItem(RESUME_CHECKOUT_KEY, '1');
      } catch { /* storage disabled — demo flow still works */ }
      setPendingCheckout(true);
      setSignInOpen(true);
      return;
    }
    advanceToCheckoutMode();
  };

  // On mount after returning from Google OAuth: restore the stashed cart +
  // resume flag and open the drawer immediately, so the user sees the
  // checkout picking up instead of landing on a bare menu while auth loads.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        if (parsed && typeof parsed === 'object') setCart(parsed);
      }
      if (sessionStorage.getItem(RESUME_CHECKOUT_KEY) === '1') {
        setPendingCheckout(true);
        setIsCartOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  // Fallback for the Google-OAuth round-trip: on return, sessionStorage says
  // we were mid-checkout, and the Supabase listener eventually flips auth.user
  // truthy. When that happens we advance the drawer. The demo-sign-in path is
  // handled synchronously via SignInGate's onSignedIn callback.
  useEffect(() => {
    if (!pendingCheckout || !auth.user) return;
    advanceToCheckoutMode();
    // advanceToCheckoutMode is stable within one render; running it as part of
    // this effect is safe because it only mutates state we own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user, pendingCheckout]);

  // Sign-out mid-checkout: the drawer was sitting at a signed-in-only step
  // (mode / details / submitting), but we can't go through those without a
  // user. Bounce back to browse so the drawer shows "Sign in to checkout"
  // again instead of trapping the shopper at a step they can't finish.
  useEffect(() => {
    if (auth.user) return;
    if (step === 'mode' || step === 'details' || step === 'submitting') {
      setStep('browse');
      setSelectedMode(null);
      setAttachToTab(false);
      setFormError(null);
      setPendingCheckout(false);
      setSignInOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  // The checkout drawer slides over the hero; letting the body scroll behind
  // it pulls the whole page out from under the sheet. Lock scroll while it's
  // open and release it on close.
  useEffect(() => {
    if (!isCartOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isCartOpen]);

  const chooseMode = (mode: CheckoutMode) => {
    setSelectedMode(mode);
    setAttachToTab(false);
    setFormError(null);
    setStep('details');
  };

  // Dine-in, but the customer already has an open tab: append to it. No table
  // re-pick — the items land on the same running bill until the admin closes it.
  const chooseAddToTab = () => {
    if (!myOpenTab) return;
    setSelectedMode('table');
    setAttachToTab(true);
    setTableInput(String(myOpenTab.table));
    setPhone(p => p || myOpenTab.orders[0]?.customer?.phone || '');
    setFormError(null);
    setStep('details');
  };

  /* "Add items" on the open tab means exactly that: show me the food. It used
     to open the checkout drawer at the Last-details step, which is the one
     screen a guest with an open tab has no reason to see. Now it closes
     everything and scrolls to the first dish, with the tab remembered so
     checkout lands straight back on it. */
  const startAddToTab = () => {
    setProfileOpen(false);
    setIsCartOpen(false);
    setStep('browse');
    setAttachToTab(true);
    setActiveCategory('All');
    // Next frame: the profile modal has to unmount (it locks body scroll)
    // before the page can be scrolled.
    requestAnimationFrame(() => {
      const grid = document.getElementById('menu-grid');
      if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // A coupon that came in on the URL is applied as soon as the checkout knows
  // the basket (and the number, for a personal coupon).
  useEffect(() => {
    if (!pendingCoupon || appliedCoupon || step !== 'details' || cartTotal <= 0) return;
    const t = window.setTimeout(() => {
      const res = validateCoupon(pendingCoupon, cartTotal, phone.trim() || undefined);
      if (res.ok && res.coupon) {
        setAppliedCoupon({ code: res.coupon.code, discountPercent: res.coupon.discountPercent, id: res.coupon.id });
        setCouponError(null);
        setCouponNeedsPhone(false);
      } else if (res.needsPhone) {
        setCouponNeedsPhone(true);
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [pendingCoupon, appliedCoupon, step, cartTotal, phone]);

  const askBill = () => {
    if (myOpenTab && !myOpenTab.billRequested) requestBill(myOpenTab.sessionId);
  };

  const submit = () => {
    if (!auth.user || !selectedMode) { setSignInOpen(true); return; }
    if (!phone.trim()) { setFormError('A phone number is required so we can reach you.'); return; }
    if (selectedMode === 'table' && !attachToTab) {
      const n = Number(tableInput);
      if (!Number.isFinite(n) || n <= 0) { setFormError('Please choose your table from the list.'); return; }
      // Table lock: a table with another open tab can't be taken.
      const picked = activeTables.find(t => t.number === n);
      if (picked?.sessionId) { setFormError(`Table ${n} is in use right now — please pick another table.`); return; }
    }
    if (selectedMode === 'takeaway' && !pickupTime) {
      setFormError('Please choose a preferred pick-up time.');
      return;
    }
    if (selectedMode === 'delivery') {
      if (!address.governorate || !address.area || !address.street || !address.building) {
        setFormError('Please complete at least Governorate, Area, Street, and Building.');
        return;
      }
    }
    // Targeted coupons only work for the phone they were sent to — re-check now
    // that we have the customer's number, so the order can't fail server-side.
    if (appliedCoupon) {
      const recheck = validateCoupon(appliedCoupon.code, cartTotal, phone.trim());
      if (!recheck.ok) { setFormError(recheck.reason || 'This coupon isn’t valid for this number.'); return; }
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
      // Dine-in appending to an existing tab: reuse that session (and its table)
      // so the new items land on the same running bill.
      const attach = selectedMode === 'table' && attachToTab && myOpenTab;
      const order = addOrder({
        table: selectedMode === 'table' ? (attach ? myOpenTab!.table : Number(tableInput)) : 0,
        items,
        priority: 'normal',
        subtotal: cartTotal,
        tax: taxAmt,
        total: grandTotal,
        source: 'customer',
        mode: selectedMode,
        discount: discount > 0 ? discount : undefined,
        couponCode: appliedCoupon?.code,
        sessionId: attach ? myOpenTab!.sessionId : undefined,
        customer,
        deliveryAddress: selectedMode === 'delivery' ? address : undefined,
        note: remark.trim() || undefined,
        // No explicit status: a dine-in order goes straight to the chef, a
        // takeaway or delivery queues for the admin. addOrder decides, and the
        // server decides again — the two agree.
      });
      // The server counts the redemption when it prices the order (see
      // consumeCoupon in /api/db), so counting it here too burned every coupon
      // twice and hit the usage limit after half the orders.
      setLastOrderId(order.id);
      setLastSessionId(order.sessionId ?? null);
      setLastMode(selectedMode);
      if (selectedMode === 'takeaway' || selectedMode === 'delivery') {
        // Keep the exact message input around: "Open WhatsApp again" has to
        // resend THIS order. It used to rebuild the message from the cart,
        // which placeOrder empties two lines below — so the second message
        // went out with no items and a different invoice number.
        const waInput: WhatsAppOrderInput = {
          order,
          mode: selectedMode,
          customer,
          address: selectedMode === 'delivery' ? address : undefined,
          deliveryFee: selectedMode === 'delivery' ? deliveryFee : 0,
          pickupTime: selectedMode === 'takeaway' ? pickupTime : undefined,
          note: remark.trim() || undefined,
        };
        setLastWhatsApp(waInput);
        sendOrderToShop(waInput);
      } else {
        setLastWhatsApp(null);
      }
      setCart({});
      setAppliedCoupon(null);
      setCouponInput('');
      setRemark('');
      setStep('success');
    }, 600);
  };

  const resendWhatsApp = () => {
    if (lastWhatsApp) sendOrderToShop(lastWhatsApp);
  };

  const startNewOrder = () => {
    setStep('browse');
    setLastOrderId(null);
    setLastSessionId(null);
    setLastWhatsApp(null);
    setLastMode(null);
    setSelectedMode(null);
    setAttachToTab(false);
    setIsCartOpen(false);
    setAddress(EMPTY_ADDRESS);
    setPhone('');
    setTableInput('');
    setPickupTime('');
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
      <header className="fixed inset-x-0 top-0 z-40 px-2 pt-2 sm:px-5 sm:pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-full border border-brand-gold/25 bg-[#4f070c]/90 py-1 pl-1.5 pr-1.5 shadow-[0_18px_44px_-12px_rgba(35,0,4,0.6)] backdrop-blur-md sm:gap-3 sm:py-1.5 sm:pl-2">
          <BrandMark href="/" sub="Pastry · Kuwait" compact />

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/"
              aria-label="Back to home"
              className="btn btn-outline-light h-9 justify-center gap-1.5 px-3 py-0 sm:h-10 sm:px-4 sm:py-3 sm:text-[10px]"
            >
              <Home size={14} />
              <span className="hidden sm:inline">Home</span>
            </Link>
            {auth.user ? (
              <>
                <button
                  onClick={() => setProfileOpen(true)}
                  aria-label="Your profile"
                  className="hidden items-center gap-2 rounded-full border border-brand-gold/30 bg-white/10 px-3 py-2 font-body text-[10.5px] text-brand-gold-light transition-colors hover:border-brand-gold hover:bg-white/15 sm:flex"
                >
                  {auth.user.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={auth.user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-5 w-5 rounded-full" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-gold/30 text-[9px] font-black">
                      {(auth.user.name || auth.user.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="max-w-[120px] truncate">{auth.user.name || auth.user.email}</span>
                </button>
                <button
                  onClick={() => setProfileOpen(true)}
                  aria-label="Your profile"
                  className="btn btn-outline-light h-9 w-9 p-0 sm:hidden"
                >
                  <User size={14} />
                </button>
                <button onClick={() => void signOut()} aria-label="Sign out" className="btn btn-outline-light h-9 w-9 p-0 sm:h-10 sm:w-10">
                  <LogOut size={14} />
                </button>
              </>
            ) : (
              <button onClick={() => setSignInOpen(true)} aria-label="Sign in" className="btn btn-outline-light h-9 w-9 justify-center p-0 sm:h-10 sm:w-auto sm:px-5 sm:py-3 sm:text-[10px]">
                <LogIn size={14} />
                <span className="hidden sm:inline">Sign in</span>
              </button>
            )}
            <button onClick={() => setIsCartOpen(true)} aria-label="Your order" className="btn btn-gold relative h-9 w-9 p-0 transition-transform hover:scale-105 active:scale-95 sm:h-10 sm:w-10">
              <ShoppingBag size={15} strokeWidth={1.8} />
              {cartItemCount > 0 && (
                <span key={cartItemCount} className="qty-pop absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#4f070c] bg-brand-red font-body text-[9px] font-semibold tracking-normal text-white sm:h-5 sm:w-5 sm:text-[10px]">
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

        <div className="h-20 sm:h-24" aria-hidden />

        <div className="relative z-30 mx-auto grid max-w-6xl select-none grid-cols-1 items-center gap-6 px-5 pb-24 sm:px-8 sm:pb-28 md:grid-cols-[1.05fr_1fr] md:gap-10 md:pb-32">

          {/* ---- Left: eyebrow + title + subtitle ---- */}
          <div className="order-2 flex flex-col items-start md:order-1">
            <div className="anim-fade-down flex items-center gap-3 sm:gap-5">
              <span className="h-px w-10 bg-gradient-to-r from-transparent to-brand-gold/70 sm:w-16" />
              <span className="whitespace-nowrap font-body text-[9px] font-medium uppercase tracking-[0.34em] text-brand-gold-light/90 sm:text-[10px] sm:tracking-[0.42em]">
                Our menu · Baked fresh daily
              </span>
            </div>

            <h1
              className="anim-slide-left mt-5 font-wordmark text-[clamp(60px,11vw,120px)] uppercase leading-[0.92] tracking-[-0.008em] text-white"
              style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', filter: 'drop-shadow(0 2px 1px rgba(90,3,12,0.45)) drop-shadow(0 20px 44px rgba(28,0,4,0.55))' }}
            >
              <span
                className="block bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(180deg, #ffbdb6 0%, #ff7f87 50%, #ee3242 100%)' }}
              >The sweet</span>
              <span
                className="block bg-clip-text text-transparent"
                style={{ backgroundImage: 'linear-gradient(100deg, #fdeed6 0%, #f2d3a4 32%, #ffffff 48%, #fffdf8 54%, #f2d3a4 70%, #fdeed6 100%)' }}
              >side of Kuwait</span>
            </h1>

            <p className="anim-fade-up mt-6 max-w-md font-body text-[14px] font-light leading-relaxed text-white/80 sm:text-[15px]">
              Baklava, cakes and pastries from our {BRAND.area} kitchen — browse, build your order, and we&apos;ll have it to your table, counter or door.
            </p>

            <div className="anim-fade-up mt-7 flex flex-wrap items-center gap-4 font-body text-[10px] font-medium uppercase tracking-[0.26em] text-brand-gold-light/85">
              <span className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-brand-gold-light/80" /> 12 items</span>
              <span className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-brand-gold-light/80" /> Dine-in</span>
              <span className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-brand-gold-light/80" /> Takeaway</span>
              <span className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-brand-gold-light/80" /> Delivery</span>
            </div>
          </div>

          {/* ---- Right: cake with floating cutouts ---- */}
          <div className="order-1 flex items-center justify-center md:order-2 md:justify-end">
            <div className="anim-cake-drop relative aspect-square w-[72vw] max-w-[380px] md:w-[36vw] md:max-w-[460px]">
              <div
                aria-hidden
                className="anim-glow absolute inset-[-14%] -z-10"
                style={{ background: 'radial-gradient(closest-side, rgba(255,196,186,0.55), rgba(255,120,120,0.18) 55%, transparent 78%)' }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cake-hd-720.webp"
                srcSet="/cake-hd-720.webp 720w, /cake-hd.webp 1100w"
                sizes="(min-width: 768px) 36vw, 72vw"
                alt="A Red Rose signature cake"
                width={720}
                height={682}
                fetchPriority="high"
                className="cake-sway relative z-10 block h-full w-full object-contain drop-shadow-[0_30px_40px_rgba(45,0,8,0.55)]"
              />

              {/* Floating cutouts around the cake */}
              <span aria-hidden className="float absolute -left-[6%] top-[18%] z-20 w-[22%] max-w-[100px]" style={{ ['--f' as string]: '7s', ['--fd' as string]: '0.4s' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cutouts/strawberries.webp" alt="" className="block h-auto w-full drop-shadow-[0_14px_14px_rgba(45,0,8,0.42)]" />
              </span>
              <span aria-hidden className="float absolute -right-[4%] top-[6%] z-20 w-[20%] max-w-[94px]" style={{ ['--f' as string]: '6.2s', ['--fd' as string]: '0s' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cutouts/rose.webp" alt="" className="block h-auto w-full drop-shadow-[0_14px_14px_rgba(45,0,8,0.42)]" />
              </span>
              <span aria-hidden className="float absolute -right-[10%] bottom-[22%] z-20 w-[26%] max-w-[120px]" style={{ ['--f' as string]: '8s', ['--fd' as string]: '0.8s' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cutouts/croissant.webp" alt="" className="block h-auto w-full drop-shadow-[0_14px_14px_rgba(45,0,8,0.42)]" />
              </span>
              <span aria-hidden className="float absolute -left-[2%] bottom-[8%] z-20 w-[16%] max-w-[76px]" style={{ ['--f' as string]: '5.5s', ['--fd' as string]: '1.2s' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cutouts/cherries.webp" alt="" className="block h-auto w-full drop-shadow-[0_14px_14px_rgba(45,0,8,0.42)]" />
              </span>
              <span aria-hidden className="float absolute right-[-2%] bottom-[-4%] z-20 w-[14%] max-w-[70px] rotate-[12deg]" style={{ ['--f' as string]: '6.8s', ['--fd' as string]: '0.5s' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/cutouts/petal-c.webp" alt="" className="block h-auto w-full drop-shadow-[0_10px_10px_rgba(45,0,8,0.35)]" />
              </span>
            </div>
          </div>
        </div>

        <svg aria-hidden viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 bottom-[-1px] z-40 h-12 w-full fill-brand-cream sm:h-20">
          <path d="M0,86 C300,24 1080,24 1440,86 L1440,120 L0,120 Z" />
        </svg>
      </section>

      {/* Live dine-in tab — one open bill the customer keeps adding to until the
          admin closes it. */}
      {myOpenTab && (
        <div className="mx-auto -mt-2 max-w-6xl px-4 md:px-6">
          <div className="anim-review-rise flex flex-col gap-3 rounded-[1.5rem] border border-brand-gold/40 bg-white p-4 shadow-[0_18px_44px_-24px_rgba(74,21,21,0.5)] sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-wine leading-none text-brand-gold-light">
                <span className="text-[7.5px] font-medium uppercase tracking-[0.2em] opacity-75">Tbl</span>
                <span className="font-wordmark text-xl" style={{ transform: 'scaleY(1.08)' }}>{myOpenTab.table}</span>
              </span>
              <div>
                <p className="flex items-center gap-1.5 font-body text-[10px] font-black uppercase tracking-[0.22em] text-brand-gold-dark">
                  <Clock size={12} /> {myOpenTab.billRequested ? 'Bill requested' : 'Open tab'}
                </p>
                <p className="font-body text-sm text-brand-wine/70">
                  {myOpenTab.orders.reduce((a, o) => a + o.items.reduce((s, i) => s + i.qty, 0), 0)} items ·{' '}
                  <span className="font-wordmark text-lg text-brand-red" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{formatKWD(myOpenTab.total)}</span> so far
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setProfileOpen(true)} className="btn btn-outline flex-1 justify-center px-4 py-3 text-[10px] sm:flex-none">
                <Receipt size={14} /> View tab
              </button>
              {myOpenTab.billRequested ? (
                <span className="flex-1 rounded-full border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-center font-body text-[10px] font-black uppercase tracking-[0.18em] text-brand-green sm:flex-none">
                  Waiting for staff
                </span>
              ) : (
                <button onClick={askBill} className="btn btn-wine flex-1 justify-center px-4 py-3 text-[10px] sm:flex-none">
                  Request bill
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      {bestSellers.length > 0 && (
        <div className="mx-auto mt-10 max-w-6xl px-4 md:px-6">
          <h3 className="mb-5 font-wordmark text-[26px] uppercase tracking-[0.02em] text-brand-wine md:text-[32px]" style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}>
            Best <span className="text-brand-red">sellers</span>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {bestSellers.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => addToCart(item.id)}
                className="group relative block aspect-square overflow-hidden rounded-2xl border border-brand-gold/30 bg-brand-sand text-left shadow-[0_18px_40px_-28px_rgba(74,21,21,0.45)] transition-transform hover:-translate-y-1 hover:border-brand-gold/60"
                aria-label={`Add ${item.name} to cart`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt={item.name} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute left-2 top-2 rounded-full bg-brand-red px-2 py-0.5 font-body text-[8px] font-bold uppercase tracking-[0.14em] text-white">Best seller</span>
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-3 pt-8">
                  <span className="block truncate font-body text-[13px] font-bold text-white">{item.name}</span>
                  <span className="font-body text-[12px] font-medium text-brand-gold-light">{formatKWD(item.price)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingCoupon && !appliedCoupon && (
        <div className="mx-auto mt-8 max-w-6xl px-4 md:px-6">
          <div className="anim-coupon-applied flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-brand-green/40 bg-brand-green/10 px-4 py-3">
            <Tag size={15} className="shrink-0 text-brand-green" />
            <p className="font-body text-[12.5px] font-bold text-brand-wine">
              Coupon <span className="font-mono">{pendingCoupon}</span> is ready for you.
            </p>
            <p className="font-body text-[12px] text-brand-ink/60">
              Add what you want — we apply it at checkout.
            </p>
          </div>
        </div>
      )}

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

      <div id="menu-grid" className="mx-auto max-w-6xl px-4 pt-8 md:px-6 md:pt-10">
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
          <div className="grid grid-cols-2 gap-3 sm:gap-6 md:gap-8 lg:grid-cols-3">
            {filteredMenu.map(item => (
              <div key={item.id} id={`menu-item-${item.id}`} className="menu-item-card group relative flex flex-col overflow-hidden rounded-2xl border border-brand-gold/25 bg-white shadow-[0_18px_40px_-28px_rgba(74,21,21,0.45)] transition-all duration-500 hover:-translate-y-1.5 hover:border-brand-gold/60 hover:shadow-[0_34px_60px_-28px_rgba(143,23,32,0.55)] sm:rounded-[1.75rem]">
                <div className="relative aspect-[4/3] w-full flex-shrink-0 overflow-hidden bg-brand-sand">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.07]" />
                  <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2a0a0a]/55 via-[#2a0a0a]/0 to-transparent" />
                  <span aria-hidden className="pointer-events-none absolute inset-[6px] rounded-xl border border-white/35 sm:inset-[10px] sm:rounded-[1.25rem]" />

                  <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-1.5 sm:left-4 sm:right-4 sm:top-4 sm:gap-2">
                    {item.isPopular ? (
                      <span className="rounded-full bg-brand-red px-2 py-1 font-body text-[7.5px] font-semibold uppercase tracking-[0.2em] text-white shadow-[0_8px_18px_-8px_rgba(176,30,40,0.75)] sm:px-3 sm:py-1.5 sm:text-[9px] sm:tracking-[0.26em]">
                        Popular
                      </span>
                    ) : <span />}
                    {item.isChefSpecial && (
                      <span className="rounded-full bg-brand-gold px-2 py-1 font-body text-[7.5px] font-semibold uppercase tracking-[0.2em] text-brand-wine shadow-[0_8px_18px_-8px_rgba(30,0,4,0.55)] sm:px-3 sm:py-1.5 sm:text-[9px] sm:tracking-[0.26em]">
                        Chef&apos;s pick
                      </span>
                    )}
                  </div>

                  <span className="absolute bottom-2 left-2 rounded-full bg-brand-cream/95 px-2 py-0.5 font-body text-[7.5px] font-medium uppercase tracking-[0.22em] text-brand-gold-dark shadow-sm backdrop-blur-sm sm:bottom-4 sm:left-4 sm:px-3 sm:py-1 sm:text-[9px] sm:tracking-[0.3em]">
                    {item.category}
                  </span>
                </div>

                <div className="flex flex-1 flex-col p-3 sm:p-5 md:p-6">
                  <h4
                    className="font-wordmark text-[16px] uppercase leading-[1.02] tracking-[0.012em] text-brand-wine sm:text-[26px] md:text-[28px]"
                    style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                  >
                    {item.name}
                  </h4>
                  <p className="mt-2 mb-3 hidden line-clamp-2 font-body text-[13px] font-light leading-relaxed text-brand-ink/60 sm:mt-4 sm:mb-5 sm:block">
                    {item.description}
                  </p>
                  <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-brand-gold/25 pt-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:pt-4">
                    <div className="min-w-0 shrink-0">
                      <span
                        className="lining-nums font-wordmark text-[18px] leading-none text-brand-red sm:text-[26px] md:text-[28px]"
                        style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', display: 'inline-block' }}
                      >
                        {formatKWD(item.price)}
                      </span>
                      {cart[item.id] > 0 && (
                        <p className="mt-1 hidden font-body text-[10px] font-medium uppercase tracking-[0.18em] text-brand-ink/45 sm:mt-1.5 sm:block">
                          {formatKWD(item.price * cart[item.id])} total
                        </p>
                      )}
                    </div>
                    {cart[item.id] ? (
                      <div className="qty-pop flex w-full items-center justify-between gap-1 rounded-full border border-brand-gold/50 bg-brand-cream p-0.5 sm:w-auto sm:shrink-0 sm:justify-start sm:gap-2 sm:p-1">
                        <button onClick={() => removeFromCart(item.id)} aria-label={`Remove one ${item.name}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-wine shadow-sm transition-all hover:scale-105 hover:text-brand-red active:scale-95 sm:h-9 sm:w-9"><Minus size={13} /></button>
                        <span key={cart[item.id]} className="qty-bump w-5 text-center font-wordmark text-base text-brand-wine sm:text-xl" style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}>{cart[item.id]}</span>
                        <button onClick={() => addToCart(item.id)} aria-label={`Add one ${item.name}`} className="btn btn-wine h-8 w-8 shrink-0 p-0 transition-transform hover:scale-105 active:scale-95 sm:h-9 sm:w-9"><Plus size={13} /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item.id)} className="btn btn-wine w-full justify-center gap-1.5 px-3 py-2.5 text-[10px] transition-transform hover:scale-[1.03] active:scale-95 sm:w-auto sm:shrink-0 sm:gap-2 sm:px-6 sm:py-3.5">
                        <Plus size={13} /> Add
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
                  <div className="flex flex-col items-center gap-1.5">
                    {/* An order number, NOT an invoice: nothing has been billed
                        yet. The invoice we issue at billing ends in these same
                        five digits. */}
                    <div className="rounded-full border border-brand-gold/40 bg-white px-5 py-2.5 font-mono text-[15px] font-bold tracking-[0.14em] text-brand-wine">
                      #{resolveOrderNo({ sessionId: lastSessionId, id: lastOrderId })}
                    </div>
                    <p className="font-body text-[10.5px] font-medium uppercase tracking-[0.2em] text-brand-gold-dark">
                      Your order number
                    </p>
                    <p className="max-w-[16rem] text-center font-body text-[11px] leading-snug text-brand-wine/50">
                      Keep this number. Your invoice is sent once the shop closes the bill.
                    </p>
                  </div>
                )}
                <div className="mt-2 flex w-full flex-col gap-3">
                  {lastOrderId && (
                    <a
                      href={invoicePath({ sessionId: lastSessionId, id: lastOrderId })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline w-full justify-center py-4"
                    >
                      <Receipt size={16} /> Track my order
                    </a>
                  )}
                  {waConfigured && lastWhatsApp && (
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
                <div className="flex items-center gap-3 border-b border-brand-gold/25 p-4 md:p-5">
                  <button
                    onClick={() => {
                      if (step === 'details') setStep('mode');
                      else if (step === 'mode') setStep('browse');
                      else setIsCartOpen(false);
                    }}
                    aria-label="Back"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-brand-gold/40 bg-white text-brand-wine transition-colors hover:border-brand-red hover:text-brand-red"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex-1">
                    <span className="font-body text-[9.5px] font-medium uppercase tracking-[0.3em] text-brand-gold-dark">
                      {step === 'mode' ? 'Where should it go?' : step === 'details' ? 'Almost there' : 'Your selection'}
                    </span>
                    <h2
                      className="font-wordmark text-[24px] uppercase leading-none tracking-[0.012em] text-brand-wine md:text-[28px]"
                      style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                    >
                      {step === 'mode' ? 'Choose a mode' : step === 'details' ? 'Last details' : 'Your Order'}
                    </h2>
                  </div>
                </div>

                {(step === 'browse') && (
                  <>
                    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-4 md:p-5">
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
                              className="anim-cart-item-in flex items-center gap-3 rounded-[1.25rem] border border-brand-gold/25 bg-white p-2.5 shadow-[0_10px_24px_-18px_rgba(74,21,21,0.4)] transition-shadow hover:shadow-[0_14px_28px_-18px_rgba(74,21,21,0.55)]"
                              style={{ '--i': idx } as React.CSSProperties}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={item.image} alt={item.name} className="h-14 w-14 rounded-xl bg-brand-sand object-cover" />
                              <div className="min-w-0 flex-1">
                                <h4
                                  className="mb-1 block line-clamp-1 font-wordmark text-[15px] uppercase leading-tight tracking-[0.012em] text-brand-wine"
                                  style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                                >{item.name}</h4>
                                <p
                                  className="block font-wordmark text-[15px] leading-none text-brand-red"
                                  style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left' }}
                                >{formatKWD(item.price * qty)}</p>
                              </div>
                              <div className="flex items-center gap-1 rounded-full border border-brand-gold/50 bg-brand-cream p-0.5">
                                <button onClick={() => removeFromCart(id)} aria-label={`Remove one ${item.name}`} className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-wine shadow-sm transition-transform hover:scale-105 hover:text-brand-red active:scale-95"><Minus size={12} /></button>
                                <span key={qty} className="qty-bump w-5 text-center font-wordmark text-[15px] text-brand-wine" style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}>{qty}</span>
                                <button onClick={() => addToCart(id)} aria-label={`Add one ${item.name}`} className="btn btn-wine h-7 w-7 p-0 transition-transform hover:scale-105 active:scale-95"><Plus size={12} /></button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {cartItemCount > 0 && (
                      <div className="rounded-b-[2rem] border-t border-brand-gold/25 bg-brand-sand/60 p-4 pb-6 md:rounded-bl-[2rem] md:rounded-br-none md:p-5">
                        <div className="mb-2 flex justify-between font-body text-[13px] font-light text-brand-ink/65"><span>Subtotal</span><span className="font-medium text-brand-ink">{formatKWD(cartTotal)}</span></div>
                        <div className="mb-3 flex items-end justify-between border-t border-brand-gold/30 pt-3">
                          <span className="font-body text-[10px] font-medium uppercase tracking-[0.22em] text-brand-wine">Total</span>
                          <span
                            className="font-wordmark text-[32px] leading-none text-brand-red"
                            style={{ display: 'inline-block', transform: 'scaleY(1.08)', transformOrigin: 'bottom right' }}
                          >{formatKWD(cartTotal)}</span>
                        </div>
                        <p className="mb-3 text-center font-body text-[10px] font-medium uppercase tracking-[0.18em] text-brand-wine/45">Coupon &amp; delivery on the next step</p>
                        <button onClick={openCheckout} className="btn btn-wine w-full py-4">
                          {auth.user ? 'Checkout' : (<><LogIn size={16} /> Sign in to checkout</>)}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {step === 'mode' && (
                  <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 md:p-8">
                    {myOpenTab && (
                      <button
                        onClick={chooseAddToTab}
                        className="group flex items-center gap-5 rounded-3xl border-2 border-brand-red/50 bg-brand-red/5 p-5 text-left transition-all hover:-translate-y-0.5 hover:border-brand-red hover:shadow-lg"
                      >
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-red text-white">
                          <PlusCircle size={22} />
                        </span>
                        <div className="flex-1">
                          <h4 className="font-wordmark text-xl uppercase tracking-[0.014em] text-brand-wine" style={{ display: 'inline-block', transform: 'scaleY(1.08)' }}>
                            Add to current bill
                          </h4>
                          <p className="mt-1 font-body text-sm text-brand-wine/65">
                            You have an open tab at Table {myOpenTab.table} · {formatKWD(myOpenTab.total)} so far. Keep it on one bill.
                          </p>
                        </div>
                        <ChevronLeft size={18} className="rotate-180 text-brand-red/60 transition-transform group-hover:translate-x-1 group-hover:text-brand-red" />
                      </button>
                    )}
                    <ModeTile
                      icon={<MapPin size={22} />} title={myOpenTab ? 'Dine-in — new table' : 'Dine-in'}
                      body={myOpenTab
                        ? "Start a separate tab at another table instead."
                        : "You're seated at a table in the shop. We'll add this to your table's tab."}
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
                          {selectedMode === 'table' && (attachToTab
                            ? `Added to your open tab at Table ${myOpenTab?.table ?? ''} · one running bill.`
                            : 'Added to your table’s open tab · waiter brings it.')}
                        </p>
                      </div>

                      <Field label="Your name">
                        <input value={auth.user?.name ?? ''} readOnly className="input-plain" />
                      </Field>
                      <Field label="Contact phone" required>
                        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="e.g. 9XXXXXXX" inputMode="tel" className="input-plain" />
                      </Field>

                      {selectedMode === 'table' && attachToTab && (
                        <div className="flex items-center gap-3 rounded-2xl border border-brand-red/25 bg-brand-red/5 px-4 py-3.5 text-brand-wine">
                          <PlusCircle size={18} className="shrink-0 text-brand-red" />
                          <p className="font-body text-sm">
                            Adding to your <span className="font-bold">open tab · Table {myOpenTab?.table}</span>. No need to pick a table again.
                          </p>
                        </div>
                      )}

                      {selectedMode === 'table' && !attachToTab && (
                        <Field label="Table" required>
                          {activeTables.length === 0 ? (
                            <p className="rounded-xl border border-brand-gold/30 bg-brand-sand/40 px-4 py-3 font-body text-xs text-brand-wine/70">
                              No tables available yet. Please ask a waiter.
                            </p>
                          ) : (
                            <select
                              value={tableInput}
                              onChange={e => setTableInput(e.target.value)}
                              className="input-plain"
                            >
                              <option value="">Choose your table…</option>
                              {activeTables.map(t => {
                                const occupied = !!t.sessionId; // in use by another open tab
                                return (
                                  <option key={t.id} value={String(t.number)} disabled={occupied}>
                                    Table {t.number}{t.label ? ` · ${t.label}` : ''}{t.zone ? ` — ${t.zone}` : ''}{occupied ? ' — in use' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </Field>
                      )}

                      {selectedMode === 'takeaway' && (
                        <Field label="Preferred pick-up time" required>
                          <input
                            type="time"
                            value={pickupTime}
                            onChange={e => setPickupTime(e.target.value)}
                            className="input-plain"
                          />
                        </Field>
                      )}

                      {selectedMode === 'delivery' && (
                        <>
                          <Field label="Delivery area" required>
                            <select value={address.governorate} onChange={e => setAddress(a => ({ ...a, governorate: e.target.value }))} className="input-plain">
                              <option value="">Select your area…</option>
                              {deliveryZones.map(z => <option key={z.name} value={z.name}>{z.name} · {z.fee > 0 ? formatKWD(z.fee) : 'Free'}</option>)}
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

                      <Field label="Anything we should know? (optional)">
                        <textarea
                          value={remark}
                          onChange={e => setRemark(e.target.value.slice(0, 300))}
                          rows={2}
                          placeholder={
                            selectedMode === 'delivery' ? 'Less sweet, call me before you come…'
                            : selectedMode === 'takeaway' ? 'Less sweet, pack it in two boxes…'
                            : 'Less sweet, no nuts…'
                          }
                          className="input-plain resize-none leading-snug"
                        />
                        <p className="mt-1 font-body text-[10.5px] font-medium text-brand-ink/45">
                          The shop, the kitchen and the counter all see this. {300 - remark.length} characters left.
                        </p>
                      </Field>

                      {formError && (
                        <p className="rounded-xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 font-body text-xs text-brand-red">{formError}</p>
                      )}
                    </div>

                    <div className="rounded-b-[2rem] border-t border-brand-gold/25 bg-brand-sand/60 p-6 pb-8 md:rounded-bl-[2rem] md:rounded-br-none md:p-8">
                      {/* Coupon — applied here, after the mode is chosen, so the
                          contact number is already filled for personal coupons. */}
                      <div className="mb-4">
                        {appliedCoupon ? (
                          <div
                            key={appliedCoupon.code}
                            className="anim-coupon-applied flex items-center justify-between gap-2 overflow-hidden rounded-full border border-brand-green/40 bg-brand-green/10 px-3 py-1.5"
                          >
                            <span className="flex items-center gap-1.5 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-brand-green">
                              <CheckCircle2 size={13} /> {appliedCoupon.code} · {appliedCoupon.discountPercent}% off
                            </span>
                            <button onClick={removeCoupon} aria-label="Remove coupon" className="text-brand-ink/40 transition-colors hover:text-brand-red"><X size={14} /></button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-1.5">
                              <div className="relative flex-1">
                                <Tag size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
                                <input value={couponInput} onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); setCouponNeedsPhone(false); }} placeholder="Coupon code"
                                  className="w-full rounded-full border border-brand-gold/40 bg-white py-2 pl-8 pr-3 font-body text-[11px] font-medium uppercase tracking-[0.14em] placeholder:text-brand-ink/35 focus:border-brand-red focus:outline-none" />
                              </div>
                              <button onClick={applyCoupon} disabled={!couponInput.trim() || (couponNeedsPhone && !couponPhone.trim())} className="btn btn-outline px-4 py-2 text-[9px] disabled:opacity-40">{couponNeedsPhone ? 'Claim' : 'Apply'}</button>
                            </div>
                            {couponNeedsPhone && (
                              <div className="relative anim-coupon-applied">
                                <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-gold-dark" />
                                <input value={couponPhone} onChange={e => { setCouponPhone(e.target.value); setCouponError(null); }}
                                  onKeyDown={e => { if (e.key === 'Enter' && couponPhone.trim()) applyCoupon(); }}
                                  placeholder="Mobile number it was sent to" inputMode="tel" autoFocus
                                  className="w-full rounded-full border border-brand-gold/40 bg-white py-2 pl-8 pr-3 font-body text-[11px] font-medium tracking-[0.08em] placeholder:text-brand-ink/35 focus:border-brand-red focus:outline-none" />
                              </div>
                            )}
                          </div>
                        )}
                        {couponNeedsPhone && !couponError && (
                          <p className="mt-1.5 pl-3 font-body text-[11px] font-medium text-brand-wine/60">This is a personal coupon — enter the mobile number it was sent to.</p>
                        )}
                        {couponError && <p className="mt-1.5 pl-3 font-body text-[11px] font-medium text-brand-red">{couponError}</p>}
                      </div>

                      {/* Price breakdown */}
                      <div className="mb-2 flex justify-between font-body text-[13px] font-light text-brand-ink/65"><span>Subtotal</span><span className="font-medium text-brand-ink">{formatKWD(cartTotal)}</span></div>
                      {discount > 0 && <div className="mb-2 flex justify-between font-body text-[13px] text-brand-green"><span>Discount{appliedCoupon ? ` · ${appliedCoupon.code}` : ''}</span><span className="font-medium">− {formatKWD(discount)}</span></div>}
                      {selectedMode === 'delivery' && (
                        <div className="mb-2 flex justify-between font-body text-[13px] font-light text-brand-ink/65">
                          <span>Delivery{address.governorate ? ` · ${address.governorate}` : ''}</span>
                          <span className="font-medium text-brand-ink">{address.governorate ? formatKWD(deliveryFee) : '—'}</span>
                        </div>
                      )}
                      <div className="mb-4 flex items-end justify-between border-t border-brand-gold/30 pt-3">
                        <span className="font-body text-[11px] font-medium uppercase tracking-[0.24em] text-brand-wine">
                          {selectedMode === 'table' ? 'Total · Settled on your tab' : `Grand total · Cash on ${selectedMode === 'delivery' ? 'delivery' : 'pickup'}`}
                        </span>
                        <span
                          className="font-wordmark text-[32px] text-brand-red"
                          style={{ display: 'inline-block', transform: 'scaleY(1.08)', transformOrigin: 'bottom right' }}
                        >{formatKWD(payableTotal)}</span>
                      </div>
                      <button onClick={submit} disabled={step === 'submitting'} className="btn btn-wine w-full py-5 disabled:cursor-wait disabled:opacity-70">
                        {step === 'submitting' ? (
                          <><Loader2 size={18} className="animate-spin" /> Placing order…</>
                        ) : selectedMode === 'table' ? (
                          attachToTab ? <><PlusCircle size={18} /> Add to tab</> : <><Send size={18} /> Place order</>
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
        onClose={() => { setSignInOpen(false); setPendingCheckout(false); }}
        onSignedIn={() => {
          // The viewer just signed in. Only advance if they were in the
          // middle of a checkout — a profile-wide sign-in from the header
          // shouldn't pop the drawer open.
          if (pendingCheckout) advanceToCheckoutMode();
        }}
        message="Enter your name to continue — we use it to tie this order to you. Google sign-in is optional."
      />

      {profileOpen && auth.user && (
        <CustomerProfileModal
          user={auth.user}
          allOrders={allOrders}
          openTab={myOpenTab}
          onClose={() => setProfileOpen(false)}
          onSignOut={() => { setProfileOpen(false); void signOut(); }}
          onRequestBill={askBill}
          onAddToTab={startAddToTab}
        />
      )}
    </div>
  );
}

function CustomerProfileModal({
  user, allOrders, openTab, onClose, onSignOut, onRequestBill, onAddToTab,
}: {
  user: { id: string; email: string | null; name: string | null; avatarUrl: string | null };
  allOrders: ReturnType<typeof getOrdersSnapshot>;
  openTab: UserOpenTab | null;
  onClose: () => void;
  onSignOut: () => void;
  onRequestBill: () => void;
  onAddToTab: () => void;
}) {
  // Match my orders: userId wins when we have one, else fall back to email
  // (demo sign-ins get a synthesized @demo.local email).
  // The bills the shop closed. We read the invoice number off the bill row
  // itself rather than deriving it, so what the customer sees here is exactly
  // what is printed on their receipt and sent on WhatsApp — even when the
  // number had to be probed forward past a clash.
  const bills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);
  React.useMemo(() => getBills(), []);
  const invoiceBySession = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bills) {
      if (b.sessionId && b.invoiceNo) m.set(b.sessionId, b.invoiceNo);
    }
    return m;
  }, [bills]);
  const invoiceOf = React.useCallback(
    (o: Order) => (o.sessionId ? invoiceBySession.get(o.sessionId) ?? '' : ''),
    [invoiceBySession]
  );

  const myOrders = React.useMemo(() => {
    return allOrders
      .filter(o => {
        if (o.customer?.userId && o.customer.userId === user.id) return true;
        if (user.email && o.customer?.email && o.customer.email === user.email) return true;
        return false;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [allOrders, user.id, user.email]);

  // The live tab's orders never count as "history" — they only land there once
  // the admin closes the bill. Everything else is a completed/past order.
  const [detail, setDetail] = React.useState<Order | null>(null);
  const openTabOrderIds = React.useMemo(
    () => new Set(openTab?.orders.map(o => o.id) ?? []),
    [openTab]
  );
  const historyOrders = React.useMemo(
    () => myOrders.filter(o => !openTabOrderIds.has(o.id)),
    [myOrders, openTabOrderIds]
  );

  const lifetimeSpend = historyOrders.reduce((s, o) => s + o.total, 0);
  const itemsOrdered = historyOrders.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty, 0), 0);
  const latest = myOrders[0];
  const latestAddress = myOrders.find(o => o.deliveryAddress)?.deliveryAddress;
  const latestPhone = latest?.customer?.phone;

  const statusTone = (s: string) => {
    switch (s) {
      case 'awaiting_admin': return 'bg-brand-gold/15 text-brand-gold-dark border-brand-gold/40';
      case 'pending':        return 'bg-brand-sand/80 text-brand-wine/70 border-brand-gold/25';
      case 'cooking':        return 'bg-brand-red/10 text-brand-red border-brand-red/25';
      case 'ready':          return 'bg-brand-plum/10 text-brand-plum border-brand-plum/25';
      case 'served':         return 'bg-brand-green/10 text-brand-green border-brand-green/25';
      case 'cancelled':      return 'bg-brand-red/15 text-brand-red border-brand-red/40';
      default:               return 'bg-brand-sand text-brand-wine/70 border-brand-gold/25';
    }
  };

  /* Said the way a customer would say it — "awaiting admin" means nothing to
     the person who ordered. */
  const statusLabel = (o: Order) => {
    switch (o.status) {
      case 'cancelled':      return 'Cancelled';
      case 'awaiting_admin': return 'Waiting for the shop';
      case 'pending':        return 'With the kitchen';
      case 'cooking':        return 'Being made';
      case 'ready':          return o.billed ? 'Ready for you' : 'Cooked — bill to come';
      case 'served':         return o.billed ? 'Completed' : 'Served';
      default:               return String(o.status).replace('_', ' ');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#2a0a0a]/55 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-brand-gold/30 bg-brand-cream shadow-[0_30px_60px_-20px_rgba(30,0,4,0.55)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-brand-gold/25 bg-gradient-to-r from-brand-red/10 via-transparent to-transparent p-5">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-14 w-14 rounded-full object-cover ring-2 ring-brand-gold/40" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-red font-black text-xl text-white ring-2 ring-brand-gold/40">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="font-wordmark text-2xl text-brand-wine" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>
                {user.name || 'Your profile'}
              </h2>
              <p className="font-body text-xs text-brand-wine/60">{user.email || 'Guest member'}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-brand-wine/60 transition-colors hover:bg-brand-sand hover:text-brand-wine">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Live dine-in tab — the one open bill, editable until the admin closes it. */}
          {openTab && (
            <div className="border-b border-brand-gold/20 bg-brand-red/[0.04] p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 font-body text-[10px] font-black uppercase tracking-[0.24em] text-brand-red">
                  <Clock size={14} /> Ongoing tab · Table {openTab.table}
                </p>
                <span className={`inline-flex rounded-full border px-2.5 py-0.5 font-body text-[9px] font-black uppercase tracking-wide ${openTab.billRequested ? 'border-brand-green/30 bg-brand-green/10 text-brand-green' : 'border-brand-gold/40 bg-brand-gold/15 text-brand-gold-dark'}`}>
                  {openTab.billRequested ? 'Bill requested' : 'Open'}
                </span>
              </div>
              <div className="rounded-2xl border border-brand-gold/25 bg-white p-3">
                <ul className="flex flex-col divide-y divide-brand-gold/15">
                  {openTab.orders.flatMap(o => o.items.map(it => (
                    <li key={`${o.id}-${it.id}`} className="flex items-center justify-between gap-3 py-2 font-body text-sm text-brand-wine/80">
                      <span className="truncate">
                        <span className="font-bold text-brand-wine">{it.qty}×</span> {it.name}
                        {o.source === 'waiter' && (
                          <span className="ml-1.5 align-middle rounded-full bg-brand-gold/15 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-brand-gold-dark">Added by staff</span>
                        )}
                      </span>
                      <span className="shrink-0 text-brand-wine/60">{formatKWD(it.price * it.qty)}</span>
                    </li>
                  )))}
                </ul>
                <div className="mt-2 flex items-end justify-between border-t border-brand-gold/25 pt-3">
                  <span className="font-body text-[10px] font-black uppercase tracking-[0.2em] text-brand-wine/60">Running total</span>
                  <span className="font-wordmark text-2xl text-brand-red" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{formatKWD(openTab.total)}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={onAddToTab} className="btn btn-outline justify-center py-3 text-[10px]">
                  <PlusCircle size={14} /> Add items
                </button>
                {openTab.billRequested ? (
                  <span className="flex items-center justify-center rounded-full border border-brand-green/40 bg-brand-green/10 px-4 py-3 text-center font-body text-[10px] font-black uppercase tracking-[0.16em] text-brand-green">
                    Waiting for staff
                  </span>
                ) : (
                  <button onClick={onRequestBill} className="btn btn-wine justify-center py-3 text-[10px]">
                    <Receipt size={14} /> Request bill
                  </button>
                )}
              </div>
              <p className="mt-2.5 text-center font-body text-[11px] text-brand-wine/50">
                Your tab stays open until a staff member closes the bill. Then it moves to your order history.
              </p>
            </div>
          )}

          {/* Lifetime stats */}
          <div className="grid grid-cols-3 gap-3 border-b border-brand-gold/20 p-5">
            <div className="rounded-2xl border border-brand-gold/25 bg-white p-3">
              <p className="font-body text-[10px] font-black uppercase tracking-wide text-brand-wine/50">Orders</p>
              <p className="mt-1 font-wordmark text-2xl text-brand-red" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{historyOrders.length}</p>
            </div>
            <div className="rounded-2xl border border-brand-gold/25 bg-white p-3">
              <p className="font-body text-[10px] font-black uppercase tracking-wide text-brand-wine/50">Spent</p>
              <p className="mt-1 font-wordmark text-2xl text-brand-wine" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{formatKWD(lifetimeSpend)}</p>
            </div>
            <div className="rounded-2xl border border-brand-gold/25 bg-white p-3">
              <p className="font-body text-[10px] font-black uppercase tracking-wide text-brand-wine/50">Items</p>
              <p className="mt-1 font-wordmark text-2xl text-brand-plum" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>{itemsOrdered}</p>
            </div>
          </div>

          {/* Contact */}
          <div className="border-b border-brand-gold/20 p-5">
            <p className="mb-3 font-body text-[10px] font-black uppercase tracking-[0.24em] text-brand-wine/60">Contact</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ProfileRow icon={User}  label="Name"  value={user.name || '—'} />
              <ProfileRow icon={Mail}  label="Email" value={user.email || '—'} />
              <ProfileRow icon={Phone} label="Phone" value={latestPhone || 'Add at next checkout'} />
            </div>
          </div>

          {/* Latest address */}
          {latestAddress && (
            <div className="border-b border-brand-gold/20 p-5">
              <p className="mb-3 font-body text-[10px] font-black uppercase tracking-[0.24em] text-brand-wine/60">Last delivery address</p>
              <div className="flex items-start gap-3 rounded-2xl border border-brand-red/20 bg-brand-red/5 p-4 text-sm text-brand-wine">
                <Home size={16} className="mt-0.5 shrink-0 text-brand-red" />
                <div>
                  <p>
                    {[latestAddress.governorate, latestAddress.area,
                      latestAddress.street && `Street ${latestAddress.street}`,
                      latestAddress.avenue && `Avenue ${latestAddress.avenue}`,
                      latestAddress.building && `Building ${latestAddress.building}`,
                      latestAddress.floor && `Floor ${latestAddress.floor}`,
                      latestAddress.apartment && `Apt ${latestAddress.apartment}`,
                    ].filter(Boolean).join(', ')}
                  </p>
                  {latestAddress.landmark && (
                    <p className="mt-1 italic text-brand-wine/70">Landmark: {latestAddress.landmark}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Order history */}
          <div className="p-5">
            <p className="mb-3 flex items-center gap-2 font-body text-[10px] font-black uppercase tracking-[0.24em] text-brand-wine/60">
              <ClipboardList size={14} /> Order history ({historyOrders.length})
            </p>
            {historyOrders.length === 0 ? (
              <p className="rounded-2xl border border-brand-gold/25 bg-white p-6 text-center font-body text-sm text-brand-wine/60">
                No completed orders yet. Once a bill is closed it shows up here.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {historyOrders.map(o => (
                  /* Tap anywhere on the row to open the full order. The row
                     itself stays a summary — the detail belongs in a sheet, so
                     a long history is still skimmable. */
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setDetail(o)}
                    className="w-full rounded-2xl border border-brand-gold/25 bg-white p-3 text-left transition-colors hover:border-brand-red/40 active:scale-[0.995]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* Billed → the invoice number, which is what the receipt
                            and the WhatsApp message show. Not billed yet → the
                            order number, because no invoice exists. */}
                        <p className="font-mono text-sm font-black text-brand-red">
                          {o.billed
                            ? invoiceOf(o) || resolveInvoiceNo({ sessionId: o.sessionId, id: o.id, createdAt: o.createdAt })
                            : `#${resolveOrderNo({ sessionId: o.sessionId, id: o.id, createdAt: o.createdAt })}`}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 font-body text-xs text-brand-wine/60">
                          <CalendarClock size={11} />
                          {new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          <span className="opacity-50">·</span> {orderLabel(o)}
                          {o.source === 'waiter' && (
                            <span className="rounded-full bg-brand-gold/15 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-brand-gold-dark">Staff</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="font-wordmark text-xl text-brand-wine" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>
                          {formatKWD(o.total)}
                        </p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-wide ${statusTone(o.status)}`}>
                          {statusLabel(o)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 font-body text-xs text-brand-wine/70">
                        {o.items.slice(0, 3).map(it => (
                          <li key={it.id}><span className="font-bold">{it.qty}×</span> {it.name}</li>
                        ))}
                        {o.items.length > 3 && <li className="text-brand-wine/45">+{o.items.length - 3} more</li>}
                      </ul>
                      <span className="shrink-0 font-body text-[10px] font-black uppercase tracking-[0.14em] text-brand-red">
                        View
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-brand-gold/25 bg-brand-sand/40 p-4">
          <button onClick={onSignOut} className="btn btn-outline flex-1 py-3 text-[11px]">
            <LogOut size={14} /> Sign out
          </button>
          <button onClick={onClose} className="btn btn-wine flex-1 py-3 text-[11px]">
            Back to menu
          </button>
        </div>
      </div>

      {detail && <OrderDetailModal order={detail} invoiceNo={invoiceOf(detail)} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** One past order, in full: every line, what was paid, and the way through to
 *  the invoice (or, for an order still being made, its live status page). */
function OrderDetailModal({ order, invoiceNo, onClose }: { order: Order; invoiceNo?: string; onClose: () => void }) {
  const billed = !!order.billed;
  const invoice = billed
    ? invoiceNo || resolveInvoiceNo({ sessionId: order.sessionId, id: order.id, createdAt: order.createdAt })
    : '';
  const ref = billed ? invoice : `#${resolveOrderNo({ sessionId: order.sessionId, id: order.id, createdAt: order.createdAt })}`;
  const itemsTotal = order.items.reduce((sum, i) => sum + i.price * i.qty, 0);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-[#2a0a0a]/55 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Order ${ref}`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-brand-gold/30 bg-brand-cream shadow-2xl sm:rounded-3xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-brand-gold/25 bg-white p-5">
          <div className="min-w-0">
            <p className="font-body text-[9.5px] font-black uppercase tracking-[0.22em] text-brand-gold-dark">
              {billed ? 'Invoice' : 'Order number'}
            </p>
            <p className="mt-1 font-mono text-lg font-black text-brand-red">{ref}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 font-body text-xs text-brand-wine/60">
              <CalendarClock size={11} />
              {new Date(order.createdAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              <span className="opacity-50">·</span> {orderLabel(order)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-brand-gold/30 text-brand-wine/60 hover:text-brand-red">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-2.5 font-body text-[10px] font-black uppercase tracking-[0.22em] text-brand-wine/60">
            What you ordered
          </p>
          <ul className="divide-y divide-brand-gold/20 overflow-hidden rounded-2xl border border-brand-gold/25 bg-white">
            {order.items.map(it => (
              <li key={it.id} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-7 min-w-7 place-items-center rounded-lg bg-brand-red/10 px-1.5 font-body text-[12px] font-black text-brand-red">
                  {it.qty}×
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-body text-sm font-semibold text-brand-wine">{it.name}</p>
                  {it.notes && <p className="font-body text-[11.5px] italic text-brand-wine/50">{it.notes}</p>}
                  <p className="font-body text-[11px] text-brand-wine/45">{formatKWD(it.price)} each</p>
                </div>
                <span className="shrink-0 font-body text-sm font-bold text-brand-wine/75">{formatKWD(it.price * it.qty)}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-3 space-y-1.5 rounded-2xl bg-white/70 p-4 font-body text-sm text-brand-wine/70">
            <div className="flex justify-between">
              <dt>Items</dt>
              <dd>{formatKWD(itemsTotal)}</dd>
            </div>
            {!!order.discount && order.discount > 0 && (
              <div className="flex justify-between text-brand-green">
                <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</dt>
                <dd>-{formatKWD(order.discount)}</dd>
              </div>
            )}
            <div className="flex items-end justify-between border-t border-brand-gold/25 pt-2">
              <dt className="font-body text-[10px] font-black uppercase tracking-[0.2em] text-brand-wine">Total</dt>
              <dd className="font-wordmark text-2xl text-brand-red" style={{ transform: 'scaleY(1.08)', display: 'inline-block' }}>
                {formatKWD(order.total)}
              </dd>
            </div>
          </dl>

          {order.note && (
            <div className="mt-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-4 font-body text-sm text-brand-wine">
              <p className="mb-1 font-body text-[9.5px] font-black uppercase tracking-[0.2em] text-brand-gold-dark">Your remark</p>
              {order.note}
            </div>
          )}

          {order.deliveryAddress && (
            <div className="mt-3 rounded-2xl border border-brand-red/20 bg-brand-red/5 p-4 font-body text-sm text-brand-wine">
              <p className="mb-1 font-body text-[9.5px] font-black uppercase tracking-[0.2em] text-brand-red">Delivered to</p>
              {[order.deliveryAddress.governorate, order.deliveryAddress.area,
                order.deliveryAddress.street && `Street ${order.deliveryAddress.street}`,
                order.deliveryAddress.building && `Building ${order.deliveryAddress.building}`,
                order.deliveryAddress.floor && `Floor ${order.deliveryAddress.floor}`,
                order.deliveryAddress.apartment && `Apt ${order.deliveryAddress.apartment}`,
              ].filter(Boolean).join(', ')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-brand-gold/25 bg-brand-sand/40 p-4">
          <button onClick={onClose} className="btn btn-outline flex-1 justify-center py-3 text-[11px]">Close</button>
          <Link
            href={invoice ? `/invoice/${encodeURIComponent(invoice)}` : invoicePath({ sessionId: order.sessionId, id: order.id, createdAt: order.createdAt, billed: order.billed })}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-wine flex-1 justify-center py-3 text-[11px]"
          >
            <Receipt size={14} /> {billed ? 'View invoice' : 'Track order'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({
  icon: Icon, label, value, mono,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string; value: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-gold/25 bg-white p-3">
      <Icon size={16} className="shrink-0 text-brand-red" />
      <div className="min-w-0">
        <p className="font-body text-[9.5px] font-black uppercase tracking-wide text-brand-wine/50">{label}</p>
        <p className={`${mono ? 'font-mono' : 'font-body'} truncate text-sm font-bold text-brand-wine`}>{value}</p>
      </div>
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
