'use client';

import { useEffect, useRef, useState } from 'react';

// 72 pre-rendered turntable frames at /public/cake/cake-000.webp .. cake-071.webp
// Cycled at ~24 FPS for a smooth 360° spin. Frames are preloaded so the first
// pass doesn't pop — we only start cycling once every frame is in cache.
const FRAMES = 72;
const FPS = 24;
const pad = (n: number) => String(n).padStart(3, '0');
const frameSrc = (i: number) => `/cake/cake-${pad(i)}.webp`;

/**
 * The hero cake — a 72-frame turntable spin.
 *
 * Earlier we tried a pure CSS 3D rotate on one HD image, but the client wants
 * the real spin back. We preload all frames on mount, then swap the <img>
 * source on a timer. Respects prefers-reduced-motion by locking to one frame.
 */
export default function HeroCake({ alt }: { alt: string }) {
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const reducedRef = useRef(false);

  // Preload every frame once, then flip `ready` so the spin can start.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    let cancelled = false;
    let loaded = 0;
    const imgs: HTMLImageElement[] = [];
    for (let i = 0; i < FRAMES; i++) {
      const img = new window.Image();
      img.decoding = 'async';
      img.src = frameSrc(i);
      img.onload = img.onerror = () => {
        loaded++;
        if (!cancelled && loaded >= FRAMES) setReady(true);
      };
      imgs.push(img);
    }
    return () => { cancelled = true; };
  }, []);

  // Cycle frames at a fixed interval once everything is cached.
  useEffect(() => {
    if (!ready || reducedRef.current) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES);
    }, 1000 / FPS);
    return () => window.clearInterval(id);
  }, [ready]);

  return (
    <span className="hero-cake-img relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={frameSrc(frame)}
        width={441}
        height={469}
        alt={alt}
        fetchPriority="high"
        decoding="async"
        className="block h-auto w-full"
      />
    </span>
  );
}
