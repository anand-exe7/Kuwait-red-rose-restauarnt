'use client';

import { useEffect, useState } from 'react';

/* ── The opening curtain ───────────────────────────────────────────────────
   On a phone the landing page used to assemble itself in public: the hero
   appeared, then the cake, then the photographs dropped in one at a time over
   several seconds. Nothing was broken — there is simply a lot of photography
   on this page — but the first few seconds looked unfinished, which is the
   worst possible first second for a shop.

   So the page opens behind a curtain, and the curtain lifts once the things
   above the fold are actually ready.

   The curtain is the SAME deep red as the hero, lit by the same radial
   gradient. That is the whole trick: the first version was cream, so the
   hand-off flashed white-to-red like a missed cut. Matching the hero means
   the gold seal and the wordmark simply rise away and the hero is already
   underneath, as one continuous shot.

   It also HOLDS the hero's entrance. The cake drop, the fruit burst and the
   words sliding in are CSS animations that start the moment the page paints,
   so they used to play out behind the curtain and the visitor arrived after
   the show. While `rr-loading` is on <html> those animations are paused, and
   the cake lands as the curtain lifts.

   Three rules it must never break:

   1. It can never trap anyone. There is a hard ceiling (WAIT_MAX) after
      which it lifts whatever the network is doing, a separate unconditional
      timer that un-pauses the page, AND a pure-CSS fade in globals.css that
      runs even if this component never hydrates.
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
const WAIT_MIN = 700;
/** Belt and braces: the hero is un-paused by this point no matter what. */
const UNPAUSE_BY = 5000;
const SEEN_KEY = 'rr-landing-opened';
const LOADING_CLASS = 'rr-loading';

const WORDMARK = ['R', 'E', 'D', ' ', 'R', 'O', 'S', 'E'];

export default function LandingLoader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const started = performance.now();
    const root = document.documentElement;

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
    let unpause = 0;
    let finished = false;

    if (seen || reduced) {
      // Deferred rather than set inline, so this doesn't cascade a second
      // render synchronously inside the effect (same reason as Reveal).
      timer = window.setTimeout(() => setDone(true), 0);
      return () => window.clearTimeout(timer);
    }

    // Hold the hero's entrance until the curtain is on its way up.
    root.classList.add(LOADING_CLASS);
    // Set before anything can throw: whatever else happens below, the page
    // starts moving again. A paused hero is far worse than an early one.
    unpause = window.setTimeout(() => root.classList.remove(LOADING_CLASS), UNPAUSE_BY);

    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {}
      const waited = performance.now() - started;
      timer = window.setTimeout(() => {
        // The hero starts moving as the curtain lifts, not after it.
        root.classList.remove(LOADING_CLASS);
        setDone(true);
      }, Math.max(0, WAIT_MIN - waited));
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
    };

    // Fonts matter as much as photos here — the wordmark is the page.
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.all([fonts, heroReady()]).then(finish, finish);

    ceiling = window.setTimeout(finish, WAIT_MAX);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(ceiling);
      window.clearTimeout(unpause);
      root.classList.remove(LOADING_CLASS);
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
      {/* Petals, the same ones that fall through the hero. Three only — this
          is on screen for two seconds and every one of them is a layer. */}
      {[0, 1, 2].map((i) => (
        <span key={i} className={`ll-petal ll-petal-${i}`} />
      ))}

      <div className="ll-stage">
        {/* The seal: a gold ring that turns, with the shop's own mark inside.
            The ring IS the spinner — one element doing two jobs rather than a
            logo with a loading bar bolted underneath it. */}
        <div className="ll-seal">
          <svg viewBox="0 0 120 120" className="ll-ring" aria-hidden="true">
            <circle className="ll-ring-track" cx="60" cy="60" r="55" />
            <circle className="ll-ring-arc" cx="60" cy="60" r="55" />
          </svg>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/finallogo.jpeg" alt="" width={120} height={120} className="ll-mark" />
        </div>

        <div className="ll-word">
          {WORDMARK.map((ch, i) =>
            ch === ' ' ? (
              <span key={i} className="ll-space" />
            ) : (
              <span key={i} className="ll-letter" style={{ '--n': i } as React.CSSProperties}>
                {ch}
              </span>
            ),
          )}
        </div>

        <p className="ll-tag">Pastry · Kuwait</p>
      </div>
    </div>
  );
}
