'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Star, Plus, X } from 'lucide-react';

export type Review = {
  name: string;
  text: string;
  rating: number;
  /** Older saved reviews carry a photo; cards no longer show one. */
  photo?: string;
};

const STORAGE_KEY = 'rr_reviews_v1';

/* Reviews live in this browser only — there is no backend yet, so what someone
   writes is theirs alone and nobody else sees it. Read through an external
   store so the server render and the first client render agree on "none yet",
   then swap in whatever is actually stored. */
const listeners = new Set<() => void>();

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '[]';
  } catch {
    return '[]';   // private mode, storage disabled — just show the seeded ones
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function writeRaw(next: Review[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* nothing to do — it still shows for this visit */
  }
  listeners.forEach((l) => l());
}

function Stars({ value, size = 11 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-[3px]" role="img" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.4}
          className={i < value ? 'fill-current text-brand-gold' : 'text-brand-gold/35'}
        />
      ))}
    </div>
  );
}

/** A quote card: the words carry it, set in the serif. */
function Card({ r }: { r: Review }) {
  return (
    <figure className="flex h-full flex-col rounded-[20px] border border-brand-gold/25 bg-white/70 px-7 pb-6 pt-7 shadow-[0_18px_40px_-28px_rgba(74,21,21,0.35)]">
      <span aria-hidden className="block h-7 font-display text-[64px] leading-[0.9] text-brand-gold/70">
        &ldquo;
      </span>
      <blockquote className="mt-3 flex-1 font-display text-[19px] leading-[1.5] text-brand-wine sm:text-[20px]">
        {r.text}
      </blockquote>
      <figcaption className="mt-6 flex items-center justify-between gap-4 border-t border-brand-gold/20 pt-4">
        <span className="font-body text-[10.5px] font-medium uppercase tracking-[0.26em] text-brand-wine/80">
          {r.name}
        </span>
        <Stars value={r.rating} />
      </figcaption>
    </figure>
  );
}

const fieldLabel =
  'mb-2 block font-body text-[10px] font-medium uppercase tracking-[0.26em] text-brand-wine/55';
const fieldInput =
  'w-full rounded-xl border border-brand-gold/30 bg-brand-cream/60 px-4 py-3 font-body text-[15px] font-light text-brand-ink outline-none transition-colors placeholder:text-brand-ink/30 focus:border-brand-red/60 focus:bg-white';

export default function Reviews({ seed }: { seed: Review[] }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]');
  const mine = useMemo<Review[]>(() => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as Review[]) : [];
    } catch {
      return [];
    }
  }, [raw]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [rating, setRating] = useState(5);
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    const t = text.trim();
    if (!n || !t) return;
    writeRaw([{ name: n, text: t, rating }, ...mine]);
    setName('');
    setText('');
    setRating(5);
    setOpen(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 4000);
  };

  const all = [...mine, ...seed];

  return (
    <>
      <div className="marquee">
        <ul className="marquee-track py-2">
          {[...all, ...all].map((r, i) => (
            <li
              key={i}
              className="mr-5 w-[290px] shrink-0 sm:mr-6 sm:w-[360px]"
              aria-hidden={i >= all.length}
            >
              <Card r={r} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-12 flex max-w-xl flex-col items-center px-4">
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn btn-outline">
            <Plus size={14} strokeWidth={1.6} />
            Write a review
          </button>
        )}

        {saved && (
          <p role="status" className="mt-4 font-body text-[13px] font-light text-brand-green">
            Thank you — your review is saved on this device.
          </p>
        )}

        {open && (
          <form
            onSubmit={submit}
            className="w-full rounded-[24px] border border-brand-gold/25 bg-white p-7 text-left shadow-[0_24px_50px_-30px_rgba(74,21,21,0.45)] sm:p-9"
          >
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[30px] font-medium leading-none text-brand-wine">
                  Share your <em className="italic font-normal text-brand-red">experience</em>
                </h3>
                <p className="mt-2.5 font-body text-[12.5px] font-light text-brand-ink/55">
                  Saved in this browser only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-brand-ink/45 transition-colors hover:bg-brand-ink/5 hover:text-brand-ink"
              >
                <X size={17} strokeWidth={1.6} />
              </button>
            </div>

            <span className={fieldLabel}>Your rating</span>
            <div className="mb-6 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={rating === n}
                  className="rounded p-0.5 transition-transform hover:scale-110"
                >
                  <Star
                    size={24}
                    strokeWidth={1.3}
                    className={n <= rating ? 'fill-current text-brand-gold' : 'text-brand-gold/35'}
                  />
                </button>
              ))}
            </div>

            <label htmlFor="rv-name" className={fieldLabel}>
              Your name
            </label>
            <input
              id="rv-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
              placeholder="Reem A."
              className={`${fieldInput} mb-6`}
            />

            <label htmlFor="rv-text" className={fieldLabel}>
              Your review
            </label>
            <textarea
              id="rv-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              rows={4}
              maxLength={400}
              placeholder="What did you order, and how was it?"
              className={`${fieldInput} mb-7 resize-none leading-relaxed`}
            />

            <button
              type="submit"
              className="btn btn-red w-full disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!name.trim() || !text.trim()}
            >
              Post review
            </button>
          </form>
        )}
      </div>
    </>
  );
}
