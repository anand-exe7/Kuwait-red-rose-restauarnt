"use client";

// The coupon the customer gets as a WhatsApp link.
//
// It is a shareable page on purpose: the shop sends one link and whoever opens
// it sees the real, live coupon — the percentage, what they have to spend, how
// long it lasts, and a button straight into the menu with the code already in
// hand. A personal coupon says so, since it only works with the number it was
// sent to.

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  getCouponsSnapshot,
  getCouponsServerSnapshot,
  subscribeToCoupons,
  isExpired,
  remainingUses,
  type Coupon,
} from "../../lib/couponStore";
import { formatKWD } from "../../lib/currency";
import { BRAND } from "../../lib/brand";

const KEYFRAMES = `
@keyframes cpn-rise { from { opacity: 0; transform: translateY(26px) scale(.96) } to { opacity: 1; transform: none } }
@keyframes cpn-pop { 0% { opacity: 0; transform: scale(.4) rotate(-8deg) } 60% { opacity: 1; transform: scale(1.14) rotate(2deg) } 100% { transform: scale(1) rotate(0) } }
@keyframes cpn-shine { 0% { transform: translateX(-120%) skewX(-18deg) } 55%, 100% { transform: translateX(240%) skewX(-18deg) } }
@keyframes cpn-fade { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
@keyframes cpn-float { 0% { transform: translateY(-8%) rotate(0deg); opacity: 0 } 12% { opacity: .85 } 100% { transform: translateY(118vh) rotate(260deg); opacity: 0 } }
@keyframes cpn-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(176,30,40,.45) } 70% { box-shadow: 0 0 0 16px rgba(176,30,40,0) } }
.cpn-rise { animation: cpn-rise .7s cubic-bezier(.2,.8,.2,1) both }
.cpn-pop { animation: cpn-pop .9s .18s cubic-bezier(.2,.9,.2,1) both }
.cpn-fade { animation: cpn-fade .6s both }
.cpn-shine::after { content: ""; position: absolute; inset: 0; background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,.42) 50%, transparent 80%); animation: cpn-shine 3.4s 1s ease-in-out infinite }
.cpn-cta { animation: cpn-pulse 2.6s 1.2s ease-out infinite }
@media (prefers-reduced-motion: reduce) {
  .cpn-rise, .cpn-pop, .cpn-fade, .cpn-cta { animation: none }
  .cpn-shine::after { display: none }
  .cpn-petal { display: none }
}
`;

const PETALS = [
  { left: "6%", size: 22, dur: 15, delay: 0 },
  { left: "24%", size: 15, dur: 19, delay: 3 },
  { left: "48%", size: 19, dur: 17, delay: 6 },
  { left: "71%", size: 13, dur: 21, delay: 1.5 },
  { left: "88%", size: 24, dur: 16, delay: 8 },
];

function daysLeft(expiry: string): number | null {
  if (!expiry) return null;
  const end = new Date(`${expiry}T23:59:59`).getTime();
  return Math.ceil((end - Date.now()) / 86400000);
}

function Petals() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {PETALS.map((p, i) => (
        <span
          key={i}
          className="cpn-petal absolute top-0 block rounded-[60%_40%_55%_45%/50%_60%_40%_50%] bg-brand-red/25"
          style={{
            left: p.left,
            width: p.size,
            height: p.size * 0.78,
            animation: `cpn-float ${p.dur}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-brand-gold/30 pb-2 last:border-0 last:pb-0">
      <dt className="font-body text-[12px] font-semibold uppercase tracking-[0.1em] text-brand-ink/50">{label}</dt>
      <dd className={`text-right font-body text-[13.5px] ${strong ? "font-black text-brand-wine" : "font-semibold text-brand-ink/80"}`}>
        {value}
      </dd>
    </div>
  );
}

function CouponCard({ coupon }: { coupon: Coupon }) {
  const [copied, setCopied] = useState(false);
  const expired = isExpired(coupon);
  const rem = remainingUses(coupon);
  const exhausted = rem !== null && rem <= 0;
  const invalid = expired || exhausted || !coupon.active;
  const left = daysLeft(coupon.expiry);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the code is on screen anyway */
    }
  };

  return (
    <div className="cpn-rise overflow-hidden rounded-[2rem] border border-brand-gold/35 bg-white shadow-[0_30px_70px_-34px_rgba(74,21,21,0.55)]">
      {/* The headline: what they actually get */}
      <div className="cpn-shine relative overflow-hidden bg-gradient-to-br from-[#b01e28] via-[#8d1420] to-[#5d0b14] px-6 pb-9 pt-8 text-center text-white">
        {/* Whose coupon this is, on the coupon itself — a screenshot of the
            red panel should still say the shop's name at the counter. */}
        <p className="font-body text-[9.5px] font-black uppercase tracking-[0.3em] text-white/65">A gift from</p>
        <p className="mt-1 font-wordmark text-[23px] uppercase leading-none tracking-[0.04em] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,.3)] sm:text-[26px]">
          {BRAND.fullName}
        </p>
        <p className="mt-1.5 font-body text-[9.5px] font-bold uppercase tracking-[0.26em] text-white/60">{BRAND.area}</p>
        <p className="cpn-pop mt-5 font-display text-[88px] font-semibold leading-[0.82] tracking-tight drop-shadow-[0_6px_18px_rgba(0,0,0,.35)]">
          {coupon.discountPercent}
          <span className="align-top text-[40px]">%</span>
        </p>
        <p className="mt-2 font-body text-[12px] font-black uppercase tracking-[0.3em] text-white/90">off your order</p>
        {!invalid && left !== null && left <= 7 && (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 font-body text-[11px] font-bold uppercase tracking-[0.14em] backdrop-blur">
            {left <= 0 ? "Last day" : left === 1 ? "1 day left" : `${left} days left`}
          </p>
        )}
      </div>

      {/* Perforated tear line, like a real ticket */}
      <div className="relative h-7 bg-white">
        <span className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-brand-cream" />
        <span className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-brand-cream" />
        <span className="absolute left-5 right-5 top-1/2 border-t-2 border-dashed border-brand-gold/40" />
      </div>

      <div className="px-6 pb-7">
        <div className="cpn-fade rounded-2xl border-2 border-dashed border-brand-red/35 bg-brand-cream px-4 py-4 text-center" style={{ animationDelay: ".28s" }}>
          <p className="font-body text-[10px] font-black uppercase tracking-[0.24em] text-brand-ink/45">Your code</p>
          <p className="mt-1 font-wordmark text-[34px] uppercase leading-none tracking-[0.1em] text-brand-wine">{coupon.code}</p>
          <button
            type="button"
            onClick={copy}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-brand-wine/25 px-5 font-body text-[11px] font-bold uppercase tracking-[0.14em] text-brand-wine transition-colors hover:bg-brand-wine hover:text-white"
          >
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <dl className="cpn-fade mt-5 space-y-2.5" style={{ animationDelay: ".4s" }}>
          <Row
            label="You save"
            value={`${coupon.discountPercent}% of what you order`}
            strong
          />
          <Row
            label="Spend at least"
            value={coupon.minOrder > 0 ? formatKWD(coupon.minOrder) : "No minimum"}
          />
          <Row
            label="Valid until"
            value={
              coupon.expiry
                ? new Date(`${coupon.expiry}T23:59:59`).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })
                : "No expiry"
            }
          />
          <Row label="Uses left" value={rem === null ? "Unlimited" : `${rem} of ${coupon.usageLimit}`} />
          {coupon.targetedOnly && <Row label="Who can use it" value="Only the mobile number it was sent to" />}
        </dl>

        {invalid ? (
          <p className="mt-5 rounded-2xl border border-brand-red/30 bg-brand-red/5 px-4 py-3 text-center font-body text-[13px] font-bold text-brand-red">
            {expired
              ? "This coupon has expired."
              : exhausted
                ? "This coupon has been used up."
                : "This coupon is paused right now — call the shop."}
          </p>
        ) : (
          <>
            <Link
              href={`/menu?coupon=${encodeURIComponent(coupon.code)}`}
              className="cpn-cta mt-6 flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-red font-body text-[13px] font-black uppercase tracking-[0.16em] text-white transition-transform active:scale-[0.99]"
            >
              Use it &amp; order now
            </Link>
            <p className="mt-3 text-center font-body text-[11.5px] leading-relaxed text-brand-ink/55">
              {coupon.targetedOnly
                ? "The code is applied for you at checkout — just enter the mobile number this was sent to."
                : "The code is applied for you at checkout. You can also show this screen at the counter."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function CouponView({ code }: { code: string }) {
  const coupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);
  const coupon = useMemo(() => coupons.find((c) => c.code === code), [coupons, code]);
  // The store hydrates on first subscribe; give it a beat before saying "not
  // found", so a slow connection doesn't look like a dead link.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!coupon && !waited) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="cpn-rise rounded-[2rem] border border-brand-gold/30 bg-white px-6 py-16 text-center">
          <p className="animate-pulse font-body text-[13px] font-semibold text-brand-ink/55">Opening your coupon…</p>
        </div>
      </>
    );
  }

  if (!coupon) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="cpn-rise rounded-[2rem] border border-brand-gold/30 bg-white px-6 py-12 text-center">
          <p className="font-display text-[24px] text-brand-wine">We can&apos;t find that coupon</p>
          <p className="mt-2 font-body text-[13px] leading-relaxed text-brand-ink/60">
            There is no coupon with the code <b className="font-mono">{code}</b> any more. It may have been removed or
            replaced — call {BRAND.name} on{" "}
            <a href={BRAND.telHref} className="font-bold text-brand-red">
              {BRAND.phoneDisplay}
            </a>
            .
          </p>
          <Link
            href="/menu"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-brand-red px-6 font-body text-[12.5px] font-black uppercase tracking-[0.16em] text-white"
          >
            See the menu
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{KEYFRAMES}</style>
      <Petals />
      <div className="relative">
        <CouponCard coupon={coupon} />
      </div>
    </>
  );
}
