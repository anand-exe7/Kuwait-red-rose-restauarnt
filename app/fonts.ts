import { Anton, Cormorant_Garamond, Jost } from 'next/font/google';

/*
 * Red Rose type. Loaded here rather than in the root layout so the admin portal
 * (which stays on Geist) doesn't preload faces it never renders. Used by the
 * landing, customer, chef and waiter pages.
 *
 *  - Anton      — the RED ROSE wordmark only (hero + logo lockups).
 *  - Cormorant  — every heading, price and quote: a high-contrast serif with a
 *                 real italic, which is what carries the "patisserie" voice.
 *  - Jost       — body copy, labels and buttons; geometric, light and quiet.
 *
 * Cormorant and Jost are variable fonts, so each is a single file per style.
 */
export const wordmark = Anton({
  variable: '--font-wordmark-src',
  subsets: ['latin'],
  weight: '400',
});

export const display = Cormorant_Garamond({
  variable: '--font-display-src',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

export const body = Jost({
  variable: '--font-body-src',
  subsets: ['latin'],
});

export const landingFonts = `${wordmark.variable} ${display.variable} ${body.variable}`;
