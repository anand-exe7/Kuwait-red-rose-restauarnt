'use client';

import { useEffect, useRef, useState } from 'react';

/* ── The hero cake ─────────────────────────────────────────────────────────
   72 pre-rendered turntable frames live at /public/cake/cake-000.webp …
   cake-071.webp and together weigh about 2.3 MB.

   That is fine on a laptop and ruinous on a phone, which is exactly what the
   stutter was: every phone opening the landing page downloaded 72 files over
   mobile data before anything could spin, then had to decode a fresh WebP
   24 times a second — on the same frame the browser was already using to
   scroll a hero full of gradients, grain and falling petals. The spin
   juddered and the whole page felt stuck.

   So the cake now spins only where a spin is affordable:

   • Phones, coarse pointers, Data Saver, a slow connection, or anyone who
     asked for reduced motion get ONE sharp still (cake-hd, ~105 KB). Nothing
     else is ever fetched. A gentle CSS float keeps it from looking dead.
   • Wider screens with a mouse load the frames AFTER the page has settled
     (requestIdleCallback), and only then start turning.

   The spin itself no longer goes through React. Re-rendering a component 24
   times a second to change one attribute makes React, not the GPU, the thing
   that drops the frame. We hold a ref to the <img> and write `src` straight
   onto it from one requestAnimationFrame loop, which also pauses itself when
   the tab is hidden or the cake is scrolled out of view.
   ────────────────────────────────────────────────────────────────────────── */

const FRAMES = 72;
const FPS = 24;
const pad = (n: number) => String(n).padStart(3, '0');
const frameSrc = (i: number) => `/cake/cake-${pad(i)}.webp`;

/** The single still. Already in /public and used as the poster everywhere. */
const STILL = '/cake-hd.webp';
const STILL_SMALL = '/cake-hd-720.webp';

/** Is this a device we are willing to send 2.3 MB of turntable frames to? */
function canAffordTheSpin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    // A phone-sized screen or a finger rather than a mouse: still image.
    if (!window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches) return false;
    // Data Saver on, or 2g/3g: the frames are a luxury, not the content.
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (conn?.saveData) return false;
    if (conn?.effectiveType && /(^|-)2g$|3g/.test(conn.effectiveType)) return false;
    // Very low-core machines judder on the decode too.
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 2) return false;
    return true;
  } catch {
    return false;
  }
}

/** Run `fn` when the browser is idle, or soon after, whichever comes first. */
function whenIdle(fn: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const id = w.requestIdleCallback(fn, { timeout: 2500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 1200);
  return () => window.clearTimeout(id);
}

export default function HeroCake({ alt }: { alt: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  // Only ever flipped once, on devices that passed the test above. Everyone
  // else renders the still and this component never updates again.
  const [spinning, setSpinning] = useState(false);

  useEffect(() => {
    if (!canAffordTheSpin()) return;

    let cancelled = false;
    let raf = 0;
    let stopIdle: (() => void) | null = null;
    const frames: HTMLImageElement[] = [];
    let io: IntersectionObserver | null = null;
    let onVisibility: (() => void) | null = null;

    // Hold a decoded copy of every frame alive for the life of the page, so
    // swapping `src` is a cache hit instead of a decode.
    const preload = async () => {
      await Promise.all(
        Array.from({ length: FRAMES }, (_, i) => {
          const im = new window.Image();
          im.decoding = 'async';
          im.src = frameSrc(i);
          frames.push(im);
          return im.decode().catch(
            () =>
              new Promise<void>((res) => {
                im.onload = im.onerror = () => res();
              }),
          );
        }),
      );
      if (cancelled) return;
      setSpinning(true);
      start();
    };

    // One rAF loop, time-based, so a dropped frame costs a frame and not the
    // rhythm. Paused while off-screen or in a background tab.
    const start = () => {
      let last = performance.now();
      let frame = 0;
      let onScreen = true;
      const step = (now: number) => {
        raf = requestAnimationFrame(step);
        if (!onScreen || document.hidden) {
          last = now;
          return;
        }
        if (now - last < 1000 / FPS) return;
        last = now;
        frame = (frame + 1) % FRAMES;
        const el = imgRef.current;
        if (el) el.src = frames[frame].src;
      };
      raf = requestAnimationFrame(step);

      if (wrapRef.current && typeof IntersectionObserver !== 'undefined') {
        io = new IntersectionObserver(
          (entries) => {
            onScreen = entries.some((e) => e.isIntersecting);
          },
          { rootMargin: '120px' },
        );
        io.observe(wrapRef.current);
      }
      onVisibility = () => {
        /* `document.hidden` is read inside the loop; nothing to do here beyond
           letting the next tick see it. */
      };
      document.addEventListener('visibilitychange', onVisibility);
    };

    stopIdle = whenIdle(() => {
      void preload();
    });

    return () => {
      cancelled = true;
      stopIdle?.();
      cancelAnimationFrame(raf);
      io?.disconnect();
      if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
      frames.length = 0;
    };
  }, []);

  return (
    <span ref={wrapRef} className="hero-cake-img relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={spinning ? frameSrc(0) : STILL}
        srcSet={spinning ? undefined : `${STILL_SMALL} 720w, ${STILL} 1100w`}
        sizes="(min-width: 1024px) 30vw, 70vw"
        /* The still is a wider crop of the same pose than a turntable frame.
           Declaring the dimensions of whichever one is actually on screen is
           what keeps the hero from jumping as the spin takes over. */
        width={spinning ? 441 : 1100}
        height={spinning ? 469 : 1042}
        alt={alt}
        fetchPriority="high"
        decoding="async"
        className={`block h-auto w-full ${spinning ? '' : 'hero-cake-still'}`}
      />
    </span>
  );
}
