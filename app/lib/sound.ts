"use client";

// Shared two-tone chime used by the waiter and chef dashboards to flag a
// state change (new ticket, ticket ready, waiter call) without relying on
// the user staring at the screen. Event-driven only — callers decide when a
// "new" thing happened; this file just knows how to make noise about it.

type AudioCtor = typeof AudioContext;

export function playChime(ctxRef: { current: AudioContext | null }, muted: boolean) {
  if (muted) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    if (!Ctx) return;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.4);
    });
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch {
    /* audio not available — the visual toast/banner still covers it */
  }
}

/** Prime/resume an AudioContext on first user interaction (browser autoplay policy). */
export function primeAudioOnFirstInteraction(ctxRef: { current: AudioContext | null }) {
  const prime = () => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
      if (Ctx && !ctxRef.current) ctxRef.current = new Ctx();
      void ctxRef.current?.resume();
    } catch { /* ignore */ }
  };
  window.addEventListener('pointerdown', prime, { once: true });
  return () => window.removeEventListener('pointerdown', prime);
}

/* ───────────────────────── File-based alert clip ─────────────────────────
   The chime above is synthesised, which is right for a ticket landing but too
   polite for "you are selling something you do not have". Stock alerts play a
   real audio file instead, so the shop can swap in their own without touching
   any code: drop a file in /public and point the env var at it.            */

/** Clip played when a product runs out. Override in .env with
 *  NEXT_PUBLIC_STOCK_ALERT_SOUND=/sounds/your-file.mp3 (any format the
 *  browser can play — mp3, wav, m4a, ogg). */
export const STOCK_ALERT_SOUND =
  process.env.NEXT_PUBLIC_STOCK_ALERT_SOUND || '/sounds/stock-alert.wav';

let alertEl: HTMLAudioElement | null = null;

/** Play an alert clip. No-op when muted, server-side, or when the browser
 *  refuses autoplay (nothing has been clicked yet) — the on-screen alert is
 *  always there as well, so a silent failure never loses the message. */
export function playAlertSound(muted: boolean, src: string = STOCK_ALERT_SOUND) {
  if (muted || typeof window === 'undefined') return;
  try {
    if (!alertEl || alertEl.dataset.src !== src) {
      alertEl = new Audio(src);
      alertEl.dataset.src = src;
      alertEl.preload = 'auto';
    }
    alertEl.currentTime = 0;
    void alertEl.play().catch(() => {});
  } catch {
    /* no audio on this device — the banner and the modal still say it */
  }
}
