'use client';

import { useEffect, useState } from 'react';

/* ── The opening curtain ───────────────────────────────────────────────────
   On a phone the landing page used to assemble itself in public: the hero
   appeared, then the cake, then the photographs dropped in one at a time over
   several seconds. Nothing was broken — there is simply a lot of photography
   on this page — but the first few seconds looked unfinished, which is the
   worst possible first second for a shop.

   So the page now opens behind a cream curtain carrying the wordmark, and the
   curtain lifts once the things above the fold are actually ready.

   Three rules it must never break:

   1. It can never trap anyone. There is a hard ceiling (WAIT_MAX) after which
      it lifts whatever the network is doing, AND a pure-CSS fallback fade in
      globals.css that runs even if this component never hydrates.
   2. It is skipped for the rest of the session once it has played. Coming
      back from the menu to the landing page should not replay it.
   3. It is skipped entirely for `prefers-reduced-motion`, and hidden outright
      without JavaScript.

   The page underneath is fully rendered the whole time — this is a cover, not
   a gate — so search engines and screen readers are unaffected.
   ────────────────────────────────────────────────────────────────────────── */

/** Never hold the page longer than this, whatever is still loading. */
const WAIT_MAX = 2600;
/** …and never flash by faster than this, or it reads as a glitch. */
const WAIT_MIN = 420;
const SEEN_KEY = 'rr-landing-opened';

export default function LandingLoader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const started = performance.now();

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1';
    } catch {
      /* private mode — just play it */
    }
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let timer = 0;
    let ceiling = 0;
    let finished = false;

    if (seen || reduced) {
      // Deferred rather than set inline, so this doesn't cascade a second
      // render synchronously inside the effect (same reason as Reveal).
      timer = window.setTimeout(() => setDone(true), 0);
      return () => window.clearTimeout(timer);
    }

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {}
      const waited = performance.now() - started;
      timer = window.setTimeout(() => setDone(true), Math.max(0, WAIT_MIN - waited));
    };

    /* Ready = every image that is on screen right now has decoded. Images
       further down the page are lazy and are nobody's business yet — waiting
       for those is how a "loading screen" turns into a hostage situation. */
    const heroReady = async () => {
      const above = Array.from(document.images).filter((im) => {
        const r = im.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0 && r.width > 0;
      });
      await Promise.all(
        above.map((im) =>
          im.complete
            ? Promise.resolve()
            : new Promise<void>((res) => {
                im.addEventListener('load', () => res(), { once: true });
                im.addEventListener('error', () => res(), { once: true });
              }),
        ),
      );
      finish();
    };

    // Fonts matter as much as photos here — the wordmark is the page.
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.all([fonts, heroReady()]).then(finish, finish);

    ceiling = window.setTimeout(finish, WAIT_MAX);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(ceiling);
    };
  }, []);

  return (
    <div
      id="landing-loader"
      className={`landing-loader${done ? ' landing-loader-done' : ''}`}
      aria-hidden="true"
      /* Not a live region and not focusable: assistive tech reads the real
         page, which is already there underneath. */
    >
      <div className="landing-loader-mark">
        <span className="landing-loader-rose">Red</span>
        <span className="landing-loader-sub">Rose</span>
      </div>
      <span className="landing-loader-bar" />
    </div>
  );
}
