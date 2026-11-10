"use client";

// Where are we delivering, and what does it cost?
//
// Delivery is priced by weight, so the honest answer depends on what is in the
// basket. A native <select> could only ever show a list of names, which is why
// this is a sheet: it says how heavy the order is, what each area charges FOR
// THAT WEIGHT, and which weight bracket the order landed in — all without the
// customer having to close it, change something and open it again.

import { useEffect, useState } from 'react';
import { Check, ChevronRight, Scale, X } from 'lucide-react';
import { formatKWD } from '../lib/currency';
import { gramsLabel, tierForWeight, tierLabel, type WeightTier } from '../lib/delivery/shared';

export interface DeliveryZone {
  name: string;
  tiers: WeightTier[];
}

/** One line of the basket, as the weight panel lists it. */
export interface WeighedLine {
  name: string;
  qty: number;
  /** Weight of ONE of them, in grams. */
  grams: number;
}

export default function DeliveryAreaPicker({
  zones,
  grams,
  lines,
  value,
  onPick,
  onClose,
}: {
  zones: DeliveryZone[];
  grams: number;
  lines: WeighedLine[];
  value: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  // Chosen inside the sheet; it only reaches the checkout when they confirm,
  // so backing out cannot silently change the delivery they already had.
  const [picked, setPicked] = useState(value);
  const chosen = zones.find((z) => z.name === picked) ?? null;
  const chosenTier = chosen ? tierForWeight(chosen.tiers, grams) : null;
  const weighed = lines.filter((l) => l.grams > 0);
  const unweighed = lines.filter((l) => l.grams <= 0);

  // Escape closes, like every other sheet on the site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-[#2a0a0a]/55 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose your delivery area"
        onClick={(e) => e.stopPropagation()}
        className="anim-cart-slide-up flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-brand-gold/30 bg-brand-cream shadow-2xl sm:max-h-[88dvh] sm:rounded-[2rem]"
      >
        {/* ---------- header: the weight everything else depends on ---------- */}
        <div className="shrink-0 border-b border-brand-gold/25 bg-white px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h3
                className="font-wordmark text-[21px] uppercase leading-tight tracking-[0.012em] text-brand-wine"
                style={{ transform: 'scaleY(1.08)', transformOrigin: 'bottom left', display: 'inline-block' }}
              >
                Delivery area
              </h3>
              <p className="font-body text-[11.5px] text-brand-ink/55">
                The price depends on how heavy your order is.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 text-brand-wine/50 hover:bg-brand-sand hover:text-brand-wine"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-3 rounded-2xl border border-brand-gold/25 bg-brand-sand/50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Scale size={16} className="shrink-0 text-brand-gold-dark" />
              <span className="font-body text-[10px] font-black uppercase tracking-[0.22em] text-brand-ink/50">
                Your order weighs
              </span>
              <span className="ml-auto font-wordmark text-[22px] leading-none text-brand-red">{gramsLabel(grams)}</span>
            </div>

            {weighed.length > 0 && (
              <ul className="mt-2.5 space-y-1 border-t border-brand-gold/20 pt-2.5">
                {weighed.map((l, i) => (
                  <li key={i} className="flex items-baseline gap-2 font-body text-[12px] text-brand-ink/65">
                    <span className="shrink-0 font-bold text-brand-wine">{l.qty}×</span>
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="shrink-0 font-semibold text-brand-ink/80">{gramsLabel(l.grams * l.qty)}</span>
                  </li>
                ))}
              </ul>
            )}
            {unweighed.length > 0 && (
              <p className="mt-2 font-body text-[11px] text-brand-ink/45">
                {unweighed.length === 1 ? 'One item has' : `${unweighed.length} items have`} no weight recorded, so
                {unweighed.length === 1 ? ' it is' : ' they are'} not counted.
              </p>
            )}
          </div>
        </div>

        {/* ---------- the areas ---------- */}
        <ul className="min-h-0 flex-1 divide-y divide-brand-gold/20 overflow-y-auto custom-scrollbar bg-white">
          {zones.length === 0 && (
            <li className="px-5 py-8 text-center font-body text-[13px] text-brand-ink/55">
              No delivery areas have been set up yet. Please call the shop to order.
            </li>
          )}

          {zones.map((z) => {
            const priced = z.tiers.length > 0;
            const tier = tierForWeight(z.tiers, grams);
            const on = picked === z.name;
            return (
              <li key={z.name}>
                <button
                  type="button"
                  disabled={!priced}
                  onClick={() => setPicked(z.name)}
                  aria-pressed={on}
                  className={`flex w-full items-center gap-3 px-5 py-3.5 text-left transition ${
                    !priced ? 'cursor-not-allowed opacity-55' : on ? 'bg-brand-red/[0.07]' : 'hover:bg-brand-sand/40'
                  }`}
                >
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition ${
                      on ? 'border-brand-red bg-brand-red text-white' : 'border-brand-gold/50'
                    }`}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-[15px] font-bold text-brand-wine">{z.name}</span>
                    <span className="mt-0.5 block font-body text-[11.5px] text-brand-ink/55">
                      {priced && tier ? tierLabel(tier) : 'Delivery price not set — please call the shop'}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-wordmark text-[19px] leading-none text-brand-red">
                      {priced ? (tier && tier.fee > 0 ? formatKWD(tier.fee) : 'Free') : '—'}
                    </span>
                  </span>
                </button>

                {/* The area's whole price list, opened by choosing it — so the
                    customer can see why they are paying this, and what a
                    heavier basket would cost, without leaving the sheet. */}
                {on && priced && (
                  <ul className="border-t border-brand-gold/15 bg-brand-sand/30 px-5 py-2.5">
                    {z.tiers.map((t, i) => {
                      const applies = tier === t;
                      return (
                        <li
                          key={i}
                          className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 font-body text-[12.5px] ${
                            applies ? 'bg-white font-bold text-brand-wine shadow-[0_2px_10px_-6px_rgba(74,21,21,0.5)]' : 'text-brand-ink/55'
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate">{tierLabel(t)}</span>
                          {applies && (
                            <span className="shrink-0 rounded-full bg-brand-red px-2 py-0.5 font-body text-[9px] font-black uppercase tracking-[0.14em] text-white">
                              Your order
                            </span>
                          )}
                          <span className="shrink-0">{t.fee > 0 ? formatKWD(t.fee) : 'Free'}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        {/* ---------- confirm ---------- */}
        <div className="shrink-0 border-t border-brand-gold/25 bg-brand-cream px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:pb-4">
          <button
            type="button"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              onPick(chosen.name);
              onClose();
            }}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-red font-body text-[13px] font-black uppercase tracking-[0.14em] text-white transition active:scale-[0.99] disabled:opacity-40"
          >
            {chosen ? (
              <>
                Deliver to {chosen.name}
                <span className="opacity-60">·</span>
                {chosenTier && chosenTier.fee > 0 ? formatKWD(chosenTier.fee) : 'Free'}
                <ChevronRight size={15} strokeWidth={2.5} />
              </>
            ) : (
              'Choose your area'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
