"use client";

// Pick-up time, chosen by tapping rather than typing.
//
// A bare <input type="time"> asks a customer standing on a pavement to work
// out a clock time and then fight their phone's time spinner. The choices
// here are built from the clock the moment the field appears — the next half
// hours from now, never a list of shop hours written into the code — so "in
// half an hour" is one tap, and anyone who genuinely wants 8:15 can still say
// so under "Another time".

import { useEffect, useState } from 'react';

const SLOT_COUNT = 6;
const SLOT_MINUTES = 30;
/** Nothing sooner than this, so the kitchen is never handed an order due in
 *  five minutes. */
const LEAD_MINUTES = 20;

export const ASAP = 'As soon as possible';

interface Slot { value: string; sub: string }

/** "7:30 PM" — written the same way on the chip, in the confirmation and in
 *  the WhatsApp message the shop receives. */
const clock = (d: Date) =>
  d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

/** "in 40 min" / "in 1 h 10 min" — how far away that is, in plain words. */
function away(minutes: number): string {
  if (minutes < 60) return `in ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `in ${h} h` : `in ${h} h ${m} min`;
}

function buildSlots(from: Date): Slot[] {
  const first = new Date(from.getTime() + LEAD_MINUTES * 60000);
  first.setSeconds(0, 0);
  // Round up to the next half hour, so the chips read 7:00, 7:30, 8:00 —
  // not 7:11, 7:41.
  if (first.getMinutes() % SLOT_MINUTES !== 0) {
    first.setMinutes(Math.ceil(first.getMinutes() / SLOT_MINUTES) * SLOT_MINUTES);
  }
  return Array.from({ length: SLOT_COUNT }, (_, i) => {
    const t = new Date(first.getTime() + i * SLOT_MINUTES * 60000);
    return { value: clock(t), sub: away(Math.round((t.getTime() - from.getTime()) / 60000)) };
  });
}

export default function PickupTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Built after mount, never during render: the server and the phone are in
  // different time zones and write the clock differently, and a time computed
  // on both sides is a guaranteed hydration mismatch.
  const [slots, setSlots] = useState<Slot[]>([]);
  const [exact, setExact] = useState(false);
  // The clock is an external system, and this is the one read of it: the
  // chips are the times as they stood when the field appeared.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSlots(buildSlots(new Date())), []);

  const chip = (on: boolean) =>
    `flex min-h-[48px] flex-col items-center justify-center rounded-2xl border px-3 py-2 text-center transition ${
      on
        ? 'border-brand-red bg-brand-red text-white shadow-[0_8px_20px_-12px_rgba(176,30,40,0.8)]'
        : 'border-brand-gold/30 bg-white text-brand-wine hover:border-brand-red/40'
    }`;

  return (
    <div className="block">
      <span className="mb-1.5 block font-body text-[11px] font-medium uppercase tracking-[0.22em] text-brand-wine/70">
        Preferred pick-up time<span className="ml-1 text-brand-red">*</span>
      </span>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => { setExact(false); onChange(ASAP); }}
          className={`${chip(value === ASAP)} col-span-2 sm:col-span-1`}
        >
          <span className="font-body text-[13px] font-bold leading-tight">Ready soon</span>
          <span className="font-body text-[10.5px] opacity-70">about {LEAD_MINUTES} min</span>
        </button>
        {slots.map((sl) => (
          <button
            key={sl.value}
            type="button"
            onClick={() => { setExact(false); onChange(sl.value); }}
            className={chip(value === sl.value)}
          >
            <span className="font-body text-[13px] font-bold leading-tight">{sl.value}</span>
            <span className="font-body text-[10.5px] opacity-70">{sl.sub}</span>
          </button>
        ))}
      </div>

      {exact ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <input
            type="time"
            autoFocus
            aria-label="Pick-up time"
            className="input-plain w-auto min-w-[9rem] flex-1"
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return onChange('');
              const [h, m] = v.split(':').map(Number);
              const d = new Date();
              d.setHours(h, m, 0, 0);
              onChange(clock(d));
            }}
          />
          <button
            type="button"
            onClick={() => { setExact(false); onChange(''); }}
            className="shrink-0 font-body text-[12px] font-semibold text-brand-wine/60 underline underline-offset-2"
          >
            Back to the quick times
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setExact(true); onChange(''); }}
          className="mt-2.5 font-body text-[12px] font-semibold text-brand-red underline underline-offset-2"
        >
          Another time
        </button>
      )}

      {value && (
        <p className="mt-2 font-body text-[12px] text-brand-wine/60">
          We&apos;ll have it ready {value === ASAP ? 'as soon as we can' : `at ${value}`}.
        </p>
      )}
    </div>
  );
}
