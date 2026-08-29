'use client';

import { useEffect } from 'react';

/**
 * Publishes the scroll offset as `--sy` (a unitless number) on the root
 * element, so CSS can drive parallax without React re-rendering on every
 * frame. Consumed by `.px-slow` / `.px-fast` in globals.css.
 */
export default function ScrollFx() {
  useEffect(() => {
    let raf = 0;
    const write = () => {
      raf = 0;
      document.documentElement.style.setProperty(
        '--sy',
        String(Math.round(window.scrollY)),
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(write);
    };
    write();

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
