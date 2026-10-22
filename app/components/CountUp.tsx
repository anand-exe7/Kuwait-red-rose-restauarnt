'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Counts up to `to` once, after `delay` ms. The server renders the final
 * number, so it reads correctly without JavaScript and for crawlers.
 */
export default function CountUp({
  to,
  suffix = '',
  delay = 0,
  duration = 1600,
  className = '',
  style,
}: {
  to: number;
  suffix?: string;
  delay?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [n, setN] = useState(to);
  const raf = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    // Drop to zero straight away (the card is still invisible behind its own
    // entrance), then count once the card has arrived.
    raf.current = requestAnimationFrame(() => setN(0));
    const timer = window.setTimeout(() => {
      raf.current = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf.current);
    };
  }, [to, delay, duration]);

  return (
    <span className={className} style={style}>
      {n}
      {suffix}
    </span>
  );
}
