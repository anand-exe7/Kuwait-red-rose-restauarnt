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
