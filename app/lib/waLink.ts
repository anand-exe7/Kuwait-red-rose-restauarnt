/* ── Every WhatsApp link in the app is built here ──────────────────────────

   Four places used to build their own `wa.me` URL — the order hand-off, the
   invoice, the coupon and the enquiry — and emoji were arriving on the
   customer's phone as blanks, question marks or tofu boxes.

   Three separate things had to be true to stop that, so they all live in this
   one file rather than being re-derived at four call sites:

   1. THE HOST.  `wa.me` is a shortener: it answers with a redirect to
      api.whatsapp.com, and that hop is where the percent-encoded multi-byte
      characters get mangled. We now build the destination ourselves —
      `https://api.whatsapp.com/send/?phone=…&text=…`, with the trailing
      slash after `send`, which is the form WhatsApp's own buttons use.

   2. THE EMOJI.  Every emoji is a `String.fromCodePoint()` call, never a
      character typed into the file. That keeps every source file pure ASCII,
      so nothing — the editor that saves it, the bundler, the minifier — ever
      has to carry a surrogate pair, and the character is produced by the
      JavaScript engine at the last possible moment.

      The set below is deliberately small and old. Nothing here uses a
      variation selector (U+FE0F) or any joiner or skin-tone modifier: the
      protocol handler decodes those inconsistently, and a sequence that
      half-decodes is exactly what shows up as a box. Everything here is
      Emoji 1.0 (2015) or older, so it renders on any phone the shop's
      customers are realistically holding.

   3. THE ENCODING.  `encodeURIComponent` is applied to the message exactly
      once, here, and the caller passes plain text. Encoding an already-
      encoded string turns every `%` into `%25` and the message arrives as
      gibberish, so `waLink` takes raw text and nothing else.
   ────────────────────────────────────────────────────────────────────────── */

/** Emoji safe-list. Add to it only with single, pre-2016, modifier-free code
 *  points — and always as a code point, never as a pasted character. */
export const WA = {
  wave: String.fromCodePoint(0x1f44b), // Waving Hand Sign
  rose: String.fromCodePoint(0x1f339), // Rose - the shop's own mark
  speech: String.fromCodePoint(0x1f4ac), // Speech Balloon
  bookmark: String.fromCodePoint(0x1f516), // Bookmark - used on invoices; Receipt (0x1f9fe) is a 2018
  //                                        emoji and shows as a box on older phones
  money: String.fromCodePoint(0x1f4b0), // Money Bag
  card: String.fromCodePoint(0x1f4b3), // Credit Card
  down: String.fromCodePoint(0x1f447), // White Down Pointing Backhand Index
  gift: String.fromCodePoint(0x1f381), // Wrapped Present
  sparkle: String.fromCodePoint(0x2728), // Sparkles
  star: String.fromCodePoint(0x2b50), // White Medium Star
  bell: String.fromCodePoint(0x1f514), // Bell
  person: String.fromCodePoint(0x1f464), // Bust In Silhouette
  phone: String.fromCodePoint(0x1f4de), // Telephone Receiver
  mobile: String.fromCodePoint(0x1f4f1), // Mobile Phone
  pin: String.fromCodePoint(0x1f4cd), // Round Pushpin
  cart: String.fromCodePoint(0x1f6d2), // Shopping Trolley
  box: String.fromCodePoint(0x1f4e6), // Package
  check: String.fromCodePoint(0x2705), // White Heavy Check Mark
  truck: String.fromCodePoint(0x1f69a), // Delivery Truck
} as const;

/* Kuwait numbers are 8 digits with +965 as the country code. A customer can
   also paste a full international number (e.g. 965…), in which case we don't
   prefix anything. */
export function toWaNumber(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('965')) return d;
  if (d.length === 8) return `965${d}`;
  return d; // treat as already-international
}

/**
 * A WhatsApp link with the message pre-filled.
 *
 * @param phone  Any format — digits are extracted and the country code added.
 *               Empty means "let the user pick the chat".
 * @param text   PLAIN text. Never pass something already encoded.
 */
export function waLink(phone: string, text: string): string {
  const number = toWaNumber(phone);
  /* Built by hand rather than with URLSearchParams, which encodes a space as
     "+" — WhatsApp shows that literally, so every message would arrive with
     plus signs between the words. encodeURIComponent is the right encoder
     here, and it is applied once. */
  const q = number ? `phone=${number}&` : '';
  return `https://api.whatsapp.com/send/?${q}text=${encodeURIComponent(text)}`;
}

/** Open the pre-filled chat in a new tab. Returns the window, or null if the
 *  browser blocked it. */
export function openWhatsApp(phone: string, text: string): Window | null {
  return window.open(waLink(phone, text), '_blank', 'noopener,noreferrer');
}
