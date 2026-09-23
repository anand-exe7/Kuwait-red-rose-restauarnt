'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The hero cake, always turning.
 *
 * 72 keyed frames off the Flow render. The clip is an arc of roughly 80°, not a
 * full revolution, so the cake sweeps and returns rather than spinning through
 * 360 — at this speed it reads as continuous rotation either way.
 *
 * Position is a float and adjacent frames are cross-faded, so the motion is
 * smooth. Frame COUNT is the thing that decides whether this reads as rotation
 * or as ghosting: across an ~80 degree arc, 18 frames is 4.4 degrees a step and
 * cross-fading two poses that far apart looks like a double exposure. 72 frames
 * is 1.1 degrees, which dissolves into actual motion. The clip itself is 30fps
 * over ~100 usable frames, so that is the ceiling on how smooth this can get.
 * Scrolling adds speed on top, then decays back to the resting rate.
 *
 * Two things keep it cheap, and both matter:
 *   - frames are decoded straight to the size they are actually drawn at, so
 *     the canvas never resamples a 665px bitmap down to ~365px every frame, and
 *     the whole set costs a quarter of the texture memory it otherwise would;
 *   - the set is 72 x 365px rather than 30 x 665px: more frames than the first
 *     attempt and still less texture memory, because they are decoded to the
 *     size they are painted at instead of to the size they were authored at.
 *
 * The <img> is the real element for layout, LCP and no-JS. Frames load only
 * after the page settles; if that fails the poster simply stays.
 */

const COUNT = 72;
const SWEEP_MS = 4000;                   // one pass across the arc
const BASE = (COUNT - 1) / SWEEP_MS;     // frames per ms at rest
// No redraw throttle. Each draw is now two 365px blits with nothing rescaled,
// which is a fraction of what the old 665px canvas cost, and capping to 30fps
// was itself part of why the turn looked choppy.
const frameSrc = (i: number) => `/cake/cake-${String(i).padStart(3, '0')}.webp`;

export default function CakeSpin({ alt }: { alt: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let cancelled = false;
    let frames: ImageBitmap[] = [];
    let raf = 0;
    let last = 0;
    let pos = 0;
    let dir = 1;
    let boost = 0;
    let lastY = window.scrollY;
    let visible = true;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || !frames.length) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const i = Math.floor(pos);
      const f = pos - i;
      const a = frames[i];
      const b = frames[Math.min(COUNT - 1, i + 1)];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.drawImage(a, 0, 0);
      if (f > 0.02 && b !== a) {
        ctx.globalAlpha = f;
        ctx.drawImage(b, 0, 0);
        ctx.globalAlpha = 1;
      }
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, t - (last || t));
      last = t;

      pos += dir * BASE * (1 + boost) * dt;
      if (pos >= COUNT - 1) { pos = COUNT - 1; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      boost *= Math.pow(0.996, dt);

      draw();
    };

    const start = () => {
      if (raf || !visible || !frames.length) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onScroll = () => {
      const y = window.scrollY;
      boost = Math.min(7, boost + Math.abs(y - lastY) * 0.02);
      lastY = y;
    };

    const io = new IntersectionObserver(
      ([e]) => { visible = e.isIntersecting; if (visible) start(); else stop(); },
      { threshold: 0 },
    );

    const load = async () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;

      // Decode at the size we actually paint. Anything larger is memory we pay
      // for and a downscale we pay for again on every single frame.
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = wrap.getBoundingClientRect().width || 380;
      // 420 is all the source frame holds now, so decoding past it buys
      // nothing and costs 4 bytes a pixel, forty-eight times over.
      const size = Math.max(280, Math.min(420, Math.round(cssW * dpr)));
      canvas.width = size;
      canvas.height = size;

      try {
        const bitmaps: ImageBitmap[] = [];
        for (let i = 0; i < COUNT; i++) {
          const res = await fetch(frameSrc(i));
          if (!res.ok) return;
          bitmaps.push(
            await createImageBitmap(await res.blob(), {
              resizeWidth: size,
              resizeHeight: size,
              resizeQuality: 'high',
            }),
          );
          if (cancelled) return;
        }
        frames = bitmaps;
        draw();
        setReady(true);
        wrap.closest('.hero-cake-pos')?.classList.add('has-frames');
        io.observe(wrap);
        window.addEventListener('scroll', onScroll, { passive: true });
        start();
      } catch {
        /* poster stays */
      }
    };

    const hasIdle = typeof window.requestIdleCallback === 'function';
    const handle = hasIdle
      ? window.requestIdleCallback(load, { timeout: 2500 })
      : window.setTimeout(load, 1200);

    return () => {
      cancelled = true;
      stop();
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      if (hasIdle) window.cancelIdleCallback(handle);
      else clearTimeout(handle);
      frames.forEach((b) => b.close());
    };
  }, []);

  return (
    <span ref={wrapRef} className="hero-cake-img relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cake-hero.webp" alt={alt} className="block w-full h-auto" />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 h-full w-full transition-opacity duration-500"
        style={{ opacity: ready ? 1 : 0 }}
      />
      <span aria-hidden className="hero-cake-sweep" />
    </span>
  );
}
