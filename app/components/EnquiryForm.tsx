'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Phone } from 'lucide-react';
import { shopName, shopPhone, shopTelHref, shopPhoneDisplay } from '../lib/shop';
import { WA, openWhatsApp } from '../lib/waLink';

/* ── Enquiry ───────────────────────────────────────────────────────────────
   Landing page only, between the reviews and "Find our shop": the two places
   on the page where somebody has just decided they like the look of this and
   has a question that is not an order — a wedding cake, forty boxes for an
   office, something that needs a conversation first.

   It is deliberately NOT an order. It collects five things and hands them to
   the shop's own WhatsApp, exactly the way a placed order already does
   (app/lib/whatsapp.ts): we build the message, open the chat, and the customer
   taps send in their own WhatsApp. That matters for three reasons —

     • the shop is notified where it already watches for orders, with no new
       inbox, table or backend to run;
     • the customer keeps a copy of what they asked in their own chat, and the
       shop can simply reply to it;
     • nothing is stored by us, so there is no list of names and numbers on
       this site to leak.

   The number comes from NEXT_PUBLIC_SHOP_WHATSAPP, like every other WhatsApp
   link in the app. If it is not set, the section falls back to the shop's
   phone number rather than showing a button that goes nowhere.
   ────────────────────────────────────────────────────────────────────────── */

const fieldLabel =
  'mb-2 block font-body text-[10px] font-medium uppercase tracking-[0.26em] text-brand-wine/55';
const fieldInput =
  'w-full rounded-xl border border-brand-gold/30 bg-brand-cream/60 px-4 py-3 font-body text-[15px] font-light text-brand-ink outline-none transition-colors placeholder:text-brand-ink/30 focus:border-brand-red/60 focus:bg-white';

/** Digits only, as the WhatsApp link wants it. */
function whatsAppNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_SHOP_WHATSAPP;
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length ? digits : null;
}

/* What the shop receives. Headed so it is obvious at a glance that this is an
   enquiry and not an order waiting on the kitchen. */
function buildEnquiryMessage(v: {
  name: string;
  phone: string;
  product: string;
  people: string;
  when: string;
  note: string;
}): string {
  const lines = [
    `${WA.speech} New CATERING REQUEST — ${shopName()}`,
    '',
    `Name: ${v.name.trim()}`,
    `Mobile: ${v.phone.trim()}`,
    `Catering for: ${v.product.trim()}`,
  ];
  if (v.people.trim()) lines.push(`Guests: ${v.people.trim()}`);
  if (v.when.trim()) lines.push(`Needed by: ${v.when.trim()}`);
  if (v.note.trim()) lines.push('', '— Their message —', v.note.trim());
  lines.push('', 'Sent from the Red Rose website. This is a catering request, not a placed order.');
  return lines.join('\n');
}

export default function EnquiryForm() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState('');
  const [people, setPeople] = useState('');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);
  const number = whatsAppNumber();

  // Esc closes it, and the first field takes focus when it opens.
  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while the sheet is up on a phone.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const ready = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 6 && product.trim().length > 1;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    const text = buildEnquiryMessage({ name, phone, product, people, when, note });
    if (number) {
      // A new tab, so the landing page is still here when they come back.
      openWhatsApp(number, text);
    } else {
      // No WhatsApp configured — hand it to whatever SMS app they have, so
      // the enquiry still reaches the shop instead of hitting a dead button.
      window.location.href = `sms:${shopPhone()}?&body=${encodeURIComponent(text)}`;
    }
    setSent(true);
    setOpen(false);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-5">
      <div className="relative overflow-hidden rounded-[28px] border border-brand-gold/30 bg-white/70 px-6 py-10 text-center shadow-[0_30px_60px_-40px_rgba(74,21,21,0.55)] sm:px-12 sm:py-14">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(90% 70% at 50% 0%, rgba(201,169,97,0.14) 0%, transparent 70%)',
          }}
        />
        <div className="relative">
          <p className="eyebrow eyebrow-center text-brand-gold-dark">For every occasion</p>
          <h2 className="heading mt-5 text-brand-wine">
            Catering <em className="text-brand-red">Services</em>
          </h2>
          <p className="lede mx-auto mt-5 max-w-md text-brand-ink/65">
            Weddings, engagements, office trays, Eid hampers and parties of any size — tell us the
            occasion and the number of guests, and we will plan the menu with you on WhatsApp.
          </p>

          {sent ? (
            <div className="mx-auto mt-9 max-w-md rounded-2xl border border-brand-green/30 bg-brand-green/5 px-6 py-5">
              <p role="status" className="font-body text-[14px] font-light text-brand-ink/80">
                Your catering request is open in WhatsApp — press send there and {shopName()} will have it.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setOpen(true);
                }}
                className="mt-3 font-body text-[12.5px] font-medium uppercase tracking-[0.18em] text-brand-red underline-offset-4 hover:underline"
              >
                Send another
              </button>
            </div>
          ) : (
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <button type="button" onClick={() => setOpen(true)} className="btn btn-red">
                <MessageCircle size={14} strokeWidth={1.8} />
                Book catering
              </button>
              <a href={shopTelHref()} className="btn btn-outline">
                <Phone size={13} strokeWidth={1.8} />
                {shopPhoneDisplay()}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* The form itself. A centred dialog on a laptop, a bottom sheet on a
          phone — where a tall form pinned to the middle of the screen is the
          one thing a thumb cannot reach. */}
      {open && (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="enquiry-title"
        >
          <button
            type="button"
            aria-label="Close catering form"
            onClick={() => setOpen(false)}
            className="anim-cart-backdrop absolute inset-0 bg-[#2a1108]/55 backdrop-blur-[2px]"
          />
          <form
            onSubmit={submit}
            className="anim-cart-sheet relative max-h-[92svh] w-full max-w-lg overflow-y-auto rounded-t-[26px] border border-brand-gold/25 bg-brand-cream p-6 text-left shadow-[0_-20px_60px_-20px_rgba(20,0,3,0.6)] sm:rounded-[26px] sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="enquiry-title"
                  className="font-display text-[26px] font-medium leading-none text-brand-wine sm:text-[30px]"
                >
                  Plan your <em className="font-normal italic text-brand-red">catering</em>
                </h3>
                <p className="mt-2.5 font-body text-[12.5px] font-light text-brand-ink/55">
                  This opens WhatsApp with your message ready to send.
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

            <label htmlFor="eq-name" className={fieldLabel}>
              Your name *
            </label>
            <input
              id="eq-name"
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={60}
              autoComplete="name"
              placeholder="Reem A."
              className={`${fieldInput} mb-5`}
            />

            <label htmlFor="eq-phone" className={fieldLabel}>
              Mobile number *
            </label>
            <input
              id="eq-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              type="tel"
              inputMode="tel"
              maxLength={24}
              autoComplete="tel"
              placeholder="+965 5556 8759"
              className={`${fieldInput} mb-5`}
            />

            <label htmlFor="eq-product" className={fieldLabel}>
              Occasion / what you need *
            </label>
            <input
              id="eq-product"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              required
              maxLength={120}
              placeholder="Wedding reception, sweets and savouries"
              className={`${fieldInput} mb-5`}
            />

            <div className="mb-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="eq-people" className={fieldLabel}>
                  How many guests
                </label>
                <input
                  id="eq-people"
                  value={people}
                  onChange={(e) => setPeople(e.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                  inputMode="numeric"
                  placeholder="40"
                  className={fieldInput}
                />
              </div>
              <div>
                <label htmlFor="eq-when" className={fieldLabel}>
                  Needed by
                </label>
                <input
                  id="eq-when"
                  type="date"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={fieldInput}
                />
              </div>
            </div>

            <label htmlFor="eq-note" className={fieldLabel}>
              Anything else
            </label>
            <textarea
              id="eq-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Allergies, delivery area, a budget in mind…"
              className={`${fieldInput} mb-6 resize-none leading-relaxed`}
            />

            <button
              type="submit"
              disabled={!ready}
              className="btn btn-red w-full disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Send size={14} strokeWidth={1.8} />
              {number ? 'Send on WhatsApp' : 'Send to the shop'}
            </button>
            <p className="mt-3 text-center font-body text-[11px] font-light text-brand-ink/45">
              We only use your number to reply about your catering.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
