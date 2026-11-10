"use client";

// Pick-up time — the phone's own clock picker, nothing else.
//
// Tapping the field opens the device's native time picker: the Material clock
// dial on Android, the wheel on iOS, the spinner on desktop. That is the
// control people already know, so there is nothing to learn here and no list
// of times written into the code. We only translate what they picked into the
// one wording the confirmation and the shop's WhatsApp message both use, and
// say how far away it is so a mis-tap is obvious.

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

/** Nothing sooner than this, so the kitchen is never handed an order due in
 *  five minutes. */
const LEAD_MINUTES = 20;

/** Kept for callers that still import it; the field no longer offers it. */
export const ASAP = 'As soon as possible';

/** "7:30 PM" — written the same way on the field, in the confirmation and in
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

/** The next whole five minutes that is at least the lead time away — where
 *  the picker opens when nothing has been chosen yet. */
function defaultHHMM(now: Date): string {
  const d = new Date(now.getTime() + LEAD_MINUTES * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "19:30" → today at 19:30. A time already past counts as tomorrow, so
 *  "in …" never reads as a negative. */
function dateFor(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() < now.getTime() - 60000) d.setDate(d.getDate() + 1);
  return d;
}

export default function PickupTime({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hhmm, setHhmm] = useState('');
  // Minutes from now to the chosen time. Read from the clock after mount
  // only: the server and the phone are in different time zones, and a time
  // computed on both sides is a guaranteed hydration mismatch.
  const [minsAway, setMinsAway] = useState<number | null>(null);

  /* The parent clears `value` when the order is reset, so the field follows
     it rather than keeping a time nobody chose. Derived, not stored: two
     copies of the same answer would be one too many. */
  const shown = value ? hhmm : '';

  useEffect(() => {
    const d = shown ? dateFor(shown) : null;
    // The clock is an external system; this is the one read of it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinsAway(d ? Math.round((d.getTime() - Date.now()) / 60000) : null);
  }, [shown]);

  const open = () => {
    const el = inputRef.current;
    if (!el) return;
    if (!el.value) el.value = defaultHHMM(new Date());
    // Chrome / Edge open the picker without the user hunting for the icon.
    // Everywhere else focusing the field is what opens it.
    try { (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); }
    catch { /* not allowed without a gesture — focus below still works */ }
    el.focus();
  };

  const commit = (v: string) => {
    setHhmm(v);
    const d = dateFor(v);
    onChange(d ? clock(d) : '');
  };

  const tooSoon = minsAway !== null && minsAway < LEAD_MINUTES;

  return (
    <div className="block min-w-0">
      <span className="mb-1.5 block font-body text-[11px] font-medium uppercase tracking-[0.22em] text-brand-wine/70">
        Preferred pick-up time<span className="ml-1 text-brand-red">*</span>
      </span>

      {/* The whole row is the tap target; the real <input type="time"> sits on
          top of it, invisible but full size, so a tap anywhere opens the
          device's clock and the keyboard never appears. */}
      <div
        onClick={open}
        className={`relative flex min-h-[56px] w-full items-center gap-3 rounded-2xl border bg-white px-4 py-3 transition ${
          tooSoon ? 'border-brand-red/70' : value ? 'border-brand-red/50' : 'border-brand-gold/30'
        }`}
      >
        <Clock size={20} className="shrink-0 text-brand-red" aria-hidden />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate font-wordmark text-[20px] leading-none sm:text-[22px] ${
              value ? 'text-brand-wine' : 'text-brand-wine/35'
            }`}
            style={{ transform: 'scaleY(1.06)', transformOrigin: 'bottom left' }}
          >
            {value || 'Tap to pick a time'}
          </span>
          {value && minsAway !== null && (
            <span className="mt-1 block font-body text-[11.5px] text-brand-wine/55">
              {away(Math.max(minsAway, 0))}
            </span>
          )}
        </span>
        <input
          ref={inputRef}
          type="time"
          aria-label="Pick-up time"
          value={shown}
          onChange={(e) => commit(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      {tooSoon ? (
        <p className="mt-2 font-body text-[12px] leading-relaxed text-brand-red">
          We need about {LEAD_MINUTES} minutes — please pick a slightly later time.
        </p>
      ) : value ? (
        <p className="mt-2 font-body text-[12px] leading-relaxed text-brand-wine/60">
          We&apos;ll have it ready at {value}.
        </p>
      ) : (
        <p className="mt-2 font-body text-[12px] leading-relaxed text-brand-wine/45">
          Anytime from about {LEAD_MINUTES} minutes from now.
        </p>
      )}
    </div>
  );
}
