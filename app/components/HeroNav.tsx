'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight, ShoppingBag } from 'lucide-react';
import { BRAND } from '../lib/brand';

const LINKS = [
  { label: 'Menu', href: '/customer' },
  { label: 'Delivery', href: '/delivery' },
  { label: 'About', href: '#story' },
  { label: 'Locations', href: '#locations' },
  { label: 'Contact', href: '#contact' },
];

/**
 * Floating glass nav island.
 *
 * It sits detached from the page edges over the hero, tightens and darkens
 * once the page scrolls, and carries a gold pill that slides between links on
 * hover. Under `lg` it collapses to mark + hamburger with a full-screen sheet.
 */
export default function HeroNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Sliding hover indicator behind the desktop links.
  const linkWrapRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState({ left: 0, width: 0, on: false });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
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


  const movePill = (el: HTMLElement) =>
    setPill({ left: el.offsetLeft, width: el.offsetWidth, on: true });

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 px-3 sm:px-5 pt-3 sm:pt-4 anim-fade-down">
        <div
          className={`mx-auto flex items-center justify-between gap-3 rounded-full border backdrop-blur-md transition-[max-width,padding,background-color,box-shadow,border-color] duration-200 ease-out ${
            scrolled
              ? 'max-w-5xl border-white/15 bg-[#5c070d]/78 py-1.5 pl-2.5 pr-2 shadow-[0_18px_50px_rgba(35,0,4,0.5)]'
              : 'max-w-6xl border-white/20 bg-white/[0.08] py-2 pl-3.5 pr-2.5 shadow-[0_14px_44px_rgba(35,0,4,0.28)]'
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
              alt={BRAND.fullName}
              width={40}
              height={40}
              className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-full object-cover ring-1 ring-brand-gold/70 shadow-[0_3px_8px_rgba(35,0,4,0.45)] transition-transform duration-300 group-hover:scale-105"
            />
            <span className="leading-none">
              <span className="block font-display uppercase text-[22px] sm:text-[26px] tracking-wide text-white" style={{ transform: 'scaleY(1.15)', transformOrigin: 'bottom' }}>
                Red Rose
              </span>
              <span className="mt-0.5 block text-[7.5px] sm:text-[8px] font-semibold uppercase tracking-[0.42em] text-brand-gold/90">
                Pastry
              </span>
            </span>
          </Link>

          {/* ---- Links with the sliding pill ---- */}
          <div
            ref={linkWrapRef}
            onMouseLeave={() => setPill((p) => ({ ...p, on: false }))}
            className="relative hidden lg:flex items-center"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 my-auto h-8 rounded-full transition-all duration-400 ease-out"
              style={{
                left: pill.left,
                width: pill.width,
                opacity: pill.on ? 1 : 0,
                backgroundImage:
                  'linear-gradient(135deg, rgba(247,227,176,0.22), rgba(201,169,97,0.14))',
                boxShadow: 'inset 0 0 0 1px rgba(247,227,176,0.28)',
              }}
            />
            {LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onMouseEnter={(e) => movePill(e.currentTarget)}
                onFocus={(e) => movePill(e.currentTarget)}
                className="relative z-10 px-5 py-2 text-[13.5px] font-medium tracking-[0.01em] text-white/85 transition-colors duration-300 hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* ---- Actions ---- */}
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/customer"
              aria-label="Your bag"
              className="hidden sm:flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-all duration-300 hover:bg-white/20 hover:-translate-y-0.5"
            >
              <ShoppingBag size={16} strokeWidth={1.9} />
            </Link>

            <Link
              href="/customer"
              className="group relative hidden sm:inline-flex items-center gap-2 overflow-hidden rounded-full px-6 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#4a1515] shadow-[0_8px_22px_rgba(35,0,4,0.35)] transition-transform duration-300 hover:-translate-y-0.5"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #fbeec6 0%, #dcbb79 48%, #b9924b 100%)',
              }}
            >
              <span
                aria-hidden
                className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-[22deg] bg-white/45 transition-all duration-700 ease-out group-hover:left-full"
              />
              <span className="relative">Order Now</span>
              <ArrowRight
                size={13}
                className="relative transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>

            {/* ---- Hamburger ---- */}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              className="lg:hidden relative flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors duration-300 hover:bg-white/20 active:scale-95"
            >
              <Menu
                size={18}
                className={`absolute transition-all duration-300 ${open ? 'scale-75 rotate-90 opacity-0' : 'scale-100 rotate-0 opacity-100'}`}
              />
              <X
                size={18}
                className={`absolute transition-all duration-300 ${open ? 'scale-100 rotate-0 opacity-100' : 'scale-75 -rotate-90 opacity-0'}`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile sheet ---- */}
      <div
        className={`lg:hidden fixed inset-0 z-40 transition-opacity duration-400 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label="Close menu"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full cursor-default bg-[#3d0509]/65 backdrop-blur-md"
        />

        <nav
          className={`absolute inset-x-3 top-3 overflow-hidden rounded-[2rem] border border-white/15 px-6 pb-8 pt-[clamp(78px,13svh,110px)] shadow-[0_30px_70px_rgba(30,0,4,0.55)] transition-all duration-500 ease-[cubic-bezier(.22,.9,.25,1)] ${
            open ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
          }`}
          style={{
            backgroundImage:
              'linear-gradient(165deg, #8c1119 0%, #690a10 55%, #470509 100%)',
          }}
        >
          <ul className="flex flex-col divide-y divide-white/10">
            {LINKS.map((l, i) => (
              <li key={l.label}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  tabIndex={open ? 0 : -1}
                  className="group flex items-center justify-between py-4 text-white transition-all duration-500"
                  style={{
                    transitionDelay: open ? `${130 + i * 70}ms` : '0ms',
                    opacity: open ? 1 : 0,
                    transform: open ? 'translateX(0)' : 'translateX(-16px)',
                  }}
                >
                  <span className="font-display text-[28px] leading-none">
                    {l.label}
                  </span>
                  <ArrowRight
                    size={17}
                    className="text-brand-gold transition-transform duration-300 group-hover:translate-x-1.5"
                  />
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href="/customer"
            onClick={() => setOpen(false)}
            tabIndex={open ? 0 : -1}
            className="mt-7 flex items-center justify-center gap-2 rounded-full px-7 py-4 text-[11.5px] font-bold uppercase tracking-[0.18em] text-[#4a1515] shadow-xl transition-all duration-500 active:scale-95"
            style={{
              backgroundImage:
                'linear-gradient(135deg, #fbeec6 0%, #dcbb79 48%, #b9924b 100%)',
              transitionDelay: open ? `${130 + LINKS.length * 70}ms` : '0ms',
              opacity: open ? 1 : 0,
              transform: open ? 'translateY(0)' : 'translateY(-12px)',
            }}
          >
            Order Now
            <ArrowRight size={14} />
          </Link>
        </nav>
      </div>
    </>
  );
}
