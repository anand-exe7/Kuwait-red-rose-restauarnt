'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Star, Plus, X } from 'lucide-react';

export type Review = {
  name: string;
  text: string;
  rating: number;
  photo: string;
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

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={size}
          className={i < value ? 'fill-current text-brand-gold' : 'text-brand-gold/25'}
        />
      ))}
    </div>
  );
}

/** Photo and words in one card, rather than a photo, then a card, then a photo. */
function Card({ r }: { r: Review }) {
  return (
    <figure className="flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-brand-gold/18 shadow-[0_10px_28px_rgba(74,21,21,0.09)]">
      <div className="relative h-[150px] shrink-0 overflow-hidden sm:h-[168px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#2a1108]/45 to-transparent"
        />
      </div>
      <figcaption className="flex flex-1 flex-col gap-2.5 p-5">
        <Stars value={r.rating} />
        <p className="flex-1 text-[13px] leading-relaxed text-brand-ink/70">
          {r.text}
        </p>
        <p className="text-[11.5px] font-bold tracking-wide text-brand-red">{r.name}</p>
      </figcaption>
    </figure>
  );
}

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
    const entry: Review = {
      name: n,
      text: t,
      rating,
      photo: seed[mine.length % seed.length].photo,
    };
    writeRaw([entry, ...mine]);
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
        <ul className="marquee-track">
          {[...all, ...all].map((r, i) => (
            <li
              key={i}
              className="mr-4 w-[248px] shrink-0 sm:mr-5 sm:w-[288px]"
              aria-hidden={i >= all.length}
            >
              <Card r={r} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center px-4">
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group inline-flex items-center gap-2 rounded-full bg-brand-red px-7 py-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-red-dark"
          >
            <Plus size={14} className="transition-transform duration-300 group-hover:rotate-90" />
            Add your review
          </button>
        )}

        {saved && (
          <p role="status" className="mt-1 text-[13px] text-brand-green">
            Thanks — your review is saved on this device.
          </p>
        )}

        {open && (
          <form
            onSubmit={submit}
            className="w-full rounded-2xl bg-white p-6 text-left ring-1 ring-brand-gold/25 shadow-[0_16px_40px_rgba(74,21,21,0.12)]"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[22px] leading-none text-[#4a1515]">
                  Add your review
                </h3>
                <p className="mt-1.5 text-[12.5px] text-brand-ink/55">
                  Saved in this browser only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-brand-ink/45 transition-colors hover:bg-brand-ink/5 hover:text-brand-ink"
              >
                <X size={17} />
              </button>
            </div>

            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ink/50">
              Your rating
            </label>
            <div className="mb-5 flex gap-1.5">
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
                    className={n <= rating ? 'fill-current text-brand-gold' : 'text-brand-gold/30'}
                  />
                </button>
              ))}
            </div>

            <label
              htmlFor="rv-name"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ink/50"
            >
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
              className="mb-5 w-full rounded-xl border border-brand-gold/30 bg-brand-cream/50 px-4 py-3 text-[14px] text-brand-ink outline-none transition-colors placeholder:text-brand-ink/30 focus:border-brand-red"
            />

            <label
              htmlFor="rv-text"
              className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ink/50"
            >
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
              className="mb-5 w-full resize-none rounded-xl border border-brand-gold/30 bg-brand-cream/50 px-4 py-3 text-[14px] leading-relaxed text-brand-ink outline-none transition-colors placeholder:text-brand-ink/30 focus:border-brand-red"
            />

            <button
              type="submit"
              className="w-full rounded-full bg-brand-red px-7 py-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white transition-colors hover:bg-brand-red-dark disabled:opacity-40"
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
