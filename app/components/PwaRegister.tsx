"use client";
import { useEffect } from 'react';

/** Registers the service worker so the app is installable and works offline.
 *  Only active in production — in dev the SW would cache page HTML and serve it
 *  back after a rebuild, causing hydration mismatches. Rendered once from the
 *  root layout; renders nothing itself. */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      // Dev: ensure no stale SW/cache from a previous run interferes with HMR.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ('caches' in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* registration failures are non-fatal — the app still works online */
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);
  return null;
}
