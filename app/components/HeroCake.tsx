'use client';

import { useEffect, useRef } from 'react';

/**
 * The hero cake, from the 2500px studio cutout.
 *
 * It replaced the 72-frame turntable (CakeSpin): those frames were 441px wide
 * and had to be stretched to fill the hero, which is what made the cake look
 * soft. This one is sharp at every screen density, and the motion is CSS:
 *   - a slow 3D sway (globals.css, .cake-sway),
 *   - a tilt toward the pointer on mouse/pen devices (vars set here),
 *   - a light sheen that runs across the icing every few seconds.
 */
export default function HeroCake({ alt }: { alt: string }) {
  const tiltRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = tiltRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--cy', `${x * 14}deg`);
        el.style.setProperty('--cx', `${-y * 8}deg`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <span className="hero-cake-img relative block">
      <span className="cake-sway block">
        <span ref={tiltRef} className="cake-tilt relative block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/cake-hd.webp"
            srcSet="/cake-hd-720.webp 720w, /cake-hd.webp 1100w"
            sizes="(min-width: 1024px) 34vw, (min-width: 640px) 40vw, 78vw"
            width={1100}
            height={1042}
            alt={alt}
            fetchPriority="high"
            decoding="async"
            className="block h-auto w-full"
          />
          <span aria-hidden className="cake-sheen">
            <span className="cake-sheen-bar" />
          </span>
        </span>
      </span>
    </span>
  );
}
