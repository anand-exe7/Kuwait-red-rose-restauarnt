import { Anton, Poppins } from 'next/font/google';

/*
 * Red Rose type — ONE face everywhere.
 *
 * The whole app (admin, landing, customer, chef, waiter) now runs on a single
 * family: Poppins. Hierarchy is carried by weight alone — bold for emphasis,
 * regular for everything else — so nothing mixes a second typeface anymore.
 *
 *  - Anton    — kept ONLY for the "RED ROSE" wordmark logo lockup.
 *  - Poppins  — body, headings, prices, labels, buttons… everything else.
 */
export const wordmark = Anton({
  variable: '--font-wordmark-src',
  subsets: ['latin'],
  weight: '400',
});

/** The single UI face for the entire product. */
export const sans = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const landingFonts = `${wordmark.variable} ${sans.variable}`;
export const adminFonts = sans.variable;
