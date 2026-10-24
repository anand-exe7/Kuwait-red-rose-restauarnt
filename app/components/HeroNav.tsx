'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, ShoppingBag } from 'lucide-react';
import { BRAND } from '../lib/brand';

const LINKS = [
  { label: 'Menu', href: '/menu' },
  { label: 'Delivery', href: '/delivery' },
  { label: 'Our Story', href: '#story' },
  { label: 'Gifting', href: '#gifting' },
  { label: 'Visit', href: '#locations' },
  { label: 'Contact', href: '#contact' },
];

/**
 * Floating glass nav island.
 *
 * It sits detached from the page edges over the hero and settles into a
 * deeper, more opaque wine once the page scrolls. Under `lg` it collapses to
 * the mark and a menu button that opens a full-height sheet.
 */
export default function HeroNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4 anim-fade-down">
        <div
          className={`mx-auto flex items-center justify-between gap-3 rounded-full border transition-[max-width,padding,background-color,box-shadow,border-color] duration-300 ease-out ${
            scrolled
              ? 'max-w-5xl border-brand-gold/25 bg-[#4f070c]/90 py-1.5 pl-2 pr-1.5 shadow-[0_18px_44px_-12px_rgba(35,0,4,0.6)] backdrop-blur-md'
              : 'max-w-6xl border-white/15 bg-white/[0.07] py-2 pl-2.5 pr-2 shadow-[0_14px_40px_-16px_rgba(35,0,4,0.45)] backdrop-blur-sm'
          }`}
        >
          {/* ---- Mark ---- */}
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className="group flex shrink-0 items-center gap-2.5 pr-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rose-mark.webp"
              alt=""
              width={40}
              height={40}
              className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-brand-gold/60 transition-transform duration-500 group-hover:scale-105 sm:h-10 sm:w-10"
            />
            <span className="leading-none">
              <span className="sr-only">{BRAND.fullName}</span>
              <span
                aria-hidden
                className="block font-wordmark text-[21px] uppercase tracking-[0.04em] text-white sm:text-[24px]"
                style={{ transform: 'scaleY(1.12)', transformOrigin: 'bottom' }}
              >
                Red Rose
              </span>
              <span
                aria-hidden
                className="mt-1 block font-body text-[7.5px] font-medium uppercase tracking-[0.5em] text-brand-gold-light/85"
              >
                Pastry · Kuwait
              </span>
            </span>
          </Link>

          {/* ---- Links ---- */}
          <nav aria-label="Main" className="hidden items-center lg:flex">
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="group relative px-4 py-2 font-body text-[11px] font-medium uppercase tracking-[0.22em] text-white/80 transition-colors duration-300 hover:text-white xl:px-5"
              >
                {l.label}
                <span
                  aria-hidden
                  className="absolute inset-x-4 bottom-1 h-px origin-left scale-x-0 bg-brand-gold-light transition-transform duration-500 ease-out group-hover:scale-x-100 xl:inset-x-5"
                />
              </Link>
            ))}
          </nav>

          {/* ---- Actions ---- */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/menu"
              aria-label="Your bag"
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/90 transition-colors duration-300 hover:border-brand-gold-light/60 hover:text-white sm:flex"
            >
              <ShoppingBag size={16} strokeWidth={1.6} />
            </Link>

            <Link href="/menu" className="btn btn-gold hidden px-6 py-3 text-[10.5px] sm:inline-flex">
              Order Now
              <ArrowRight size={13} strokeWidth={1.8} />
            </Link>

            {/* ---- Menu button ---- */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/25 text-white transition-colors duration-300 hover:bg-white/10 active:scale-95 lg:hidden"
            >
              <Menu
                size={18}
                strokeWidth={1.6}
                className={`absolute transition-all duration-300 ${open ? 'rotate-90 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
              />
              <X
                size={18}
                strokeWidth={1.6}
                className={`absolute transition-all duration-300 ${open ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-75 opacity-0'}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile sheet ---- */}
      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 transition-opacity duration-500 lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full cursor-default bg-[#2a0306]/60 backdrop-blur-sm"
        />

        <nav
          aria-label="Mobile"
          className={`absolute inset-x-3 top-3 flex max-h-[calc(100svh-24px)] flex-col overflow-y-auto rounded-[28px] border border-brand-gold/20 px-7 pb-8 pt-[92px] shadow-[0_30px_70px_rgba(30,0,4,0.55)] transition-all duration-500 ease-[cubic-bezier(.22,.9,.25,1)] sm:inset-x-5 sm:top-4 ${
            open ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
          }`}
          style={{
            backgroundImage: 'linear-gradient(165deg, #8c1119 0%, #690a10 55%, #470509 100%)',
          }}
        >
          <ul className="flex flex-col">
            {LINKS.map((l, i) => (
              <li key={l.label} className="border-b border-white/10 last:border-b-0">
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  tabIndex={open ? 0 : -1}
                  className="group flex items-baseline gap-5 py-4 text-white transition-all duration-500"
                  style={{
                    transitionDelay: open ? `${120 + i * 60}ms` : '0ms',
                    opacity: open ? 1 : 0,
                    transform: open ? 'translateX(0)' : 'translateX(-14px)',
                  }}
                >
                  <span className="w-6 font-display text-[15px] italic text-brand-gold-light/70">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 font-display text-[32px] font-medium leading-none">
                    {l.label}
                  </span>
                  <ArrowRight
                    size={16}
                    strokeWidth={1.5}
                    className="text-brand-gold-light transition-transform duration-300 group-hover:translate-x-1.5"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <div
            className="mt-8 flex flex-col gap-5 transition-all duration-500"
            style={{
              transitionDelay: open ? `${120 + LINKS.length * 60}ms` : '0ms',
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(-10px)',
            }}
          >
            <Link
              href="/menu"
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className="btn btn-gold w-full"
            >
              Order Now
              <ArrowRight size={14} strokeWidth={1.8} />
            </Link>
            <p className="text-center font-body text-[11px] font-light tracking-[0.12em] text-white/60">
              Salmiya · Open daily 8:00 – 23:00 ·{' '}
              <a href="tel:+96522000000" tabIndex={open ? 0 : -1} className="text-white/85 underline-offset-4 hover:underline">
                +965 2200 0000
              </a>
            </p>
          </div>
        </nav>
      </div>
    </>
  );
}
