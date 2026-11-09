// Stable invoice number shared by the receipt page, the public /invoice page,
// the admin Orders table, the customer's order history and the WhatsApp
// message — so one order always shows ONE number everywhere.
//
// Format: INV-<year>-<5 digits>, e.g. INV-2026-48213. The year comes from the
// moment the order was raised, so bills roll over to INV-2027-… on 1 January
// without any code change. The 5 digits look random but are derived from the
// order key, which is what makes the number stable: the same order always
// hashes to the same digits, on any device, before and after it is billed.

function hash32(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** INV-2026-48213 — the same input always yields the same number. */
export function invoiceNumber(key: string, when?: number): string {
  const year = new Date(when ?? Date.now()).getFullYear();
  // Two independent hashes mixed together so near-identical keys (session ids
  // differ by a couple of characters) land far apart in the 5-digit space.
  const a = hash32(key, 2166136261);
  const b = hash32(key.split('').reverse().join(''), 913);
  const n = (a ^ Math.imul(b, 2654435761)) >>> 0;
  return `INV-${year}-${String(n % 100000).padStart(5, '0')}`;
}

/** Anything we can derive an invoice number from. */
export interface InvoiceKeyed {
  id?: string | null;
  sessionId?: string | null;
  invoiceNo?: string | null;
  createdAt?: number | null;
}

/**
 * The key an invoice number is derived from.
 *
 * The session id wins whenever there is one. A dine-in / takeaway / delivery
 * order gets an invoice number the moment the customer places it (no bill row
 * exists yet), and the bill that settles it is created later with its own id.
 * Keying off the session means the number the customer saw at checkout is the
 * number on the final receipt, instead of silently changing once staff close
 * the bill.
 */
export function invoiceKey(b: InvoiceKeyed): string {
  return b.sessionId || b.id || '';
}

/**
 * The invoice number to display. Prefers the number persisted on the bill
 * (authoritative — it was frozen with the correct year at billing time) and
 * otherwise derives one from the session / bill id.
 */
export function resolveInvoiceNo(b: InvoiceKeyed, fallbackKey?: string, when?: number): string {
  const stored = (b.invoiceNo || '').trim();
  if (stored) return stored;
  const key = invoiceKey(b) || fallbackKey || '';
  if (!key) return '';
  return invoiceNumber(key, when ?? b.createdAt ?? undefined);
}

/** Accepts "INV-2026-48213", "inv-2026-48213" or a bare "48213". */
export function normaliseInvoiceNo(raw: string): string {
  const v = (raw || '').trim().toUpperCase();
  const m = v.match(/^(?:INV-)?(\d{4})-(\d{1,5})$/);
  if (m) return `INV-${m[1]}-${m[2].padStart(5, '0')}`;
  return v;
}

/**
 * The number to actually ISSUE for a new bill.
 *
 * `invoiceNumber` is a hash, and a 5-digit format only has 100,000 slots, so
 * two different orders can land on the same digits. That is fine for a
 * provisional, not-yet-billed display, but a real invoice has to be unique.
 * At billing time we therefore probe forward from the derived number until we
 * find one no existing bill already uses, and persist the result — from then
 * on the stored number is what everything reads back.
 *
 * @param taken invoice numbers already issued (any year; only the same-year
 *              ones can clash, and comparing all of them is cheap).
 */
export function issueInvoiceNumber(key: string, taken: Iterable<string>, when?: number): string {
  const first = invoiceNumber(key, when);
  const used = new Set<string>();
  for (const t of taken) {
    const n = normaliseInvoiceNo(t || '');
    if (n) used.add(n);
  }
  if (!used.has(first)) return first;
  const m = first.match(/^INV-(\d{4})-(\d{5})$/);
  if (!m) return first;
  const year = m[1];
  const start = Number(m[2]);
  for (let i = 1; i < 100000; i++) {
    const candidate = `INV-${year}-${String((start + i) % 100000).padStart(5, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  return first; // every slot taken — cannot happen in practice
}

// -----------------------------------------------------------------------------
// Order numbers (before billing)
// -----------------------------------------------------------------------------
//
// An order is NOT an invoice. Between "customer placed it" and "admin settled
// the bill" there is nothing to invoice yet, so the customer is given a plain
// 5-digit ORDER number — the same 5 digits the invoice will end in once the
// bill is closed. So a guest quoting "my order is 48213" on the phone is also
// quoting the tail of INV-2026-48213 they will receive afterwards.

/** The bare 5 digits for an order key, e.g. "48213". */
export function orderNumber(key: string): string {
  return invoiceNumber(key).slice(-5);
}

/** The 5-digit tail of any invoice number ("INV-2026-48213" → "48213"). */
export function invoiceDigits(invoiceNo: string): string {
  const m = (invoiceNo || '').trim().match(/(\d{5})\s*$/);
  return m ? m[1] : '';
}

/** The order number to show for a session/order that has not been billed. */
export function resolveOrderNo(b: InvoiceKeyed): string {
  const stored = (b.invoiceNo || '').trim();
  if (stored) {
    const d = invoiceDigits(stored);
    if (d) return d;
  }
  const key = invoiceKey(b);
  return key ? orderNumber(key) : '';
}

/**
 * The reference that goes in a customer-facing link: `/invoice/<ref>`.
 *
 * Billed → the full invoice number (INV-2026-48213), which is what the printed
 * receipt and the WhatsApp message show. Not billed yet → the bare order number
 * (48213), so the link reads as an order tracker rather than an invoice that
 * does not exist. `/invoice/[id]` resolves both.
 */
export function publicInvoiceRef(b: InvoiceKeyed & { billed?: boolean | null }): string {
  const stored = (b.invoiceNo || '').trim();
  if (stored) return normaliseInvoiceNo(stored);
  if (b.billed) {
    const key = invoiceKey(b);
    return key ? invoiceNumber(key, b.createdAt ?? undefined) : '';
  }
  return resolveOrderNo(b);
}

/** `/invoice/INV-2026-48213` or `/invoice/48213` — never a raw session id. */
export function invoicePath(b: InvoiceKeyed & { billed?: boolean | null }): string {
  const ref = publicInvoiceRef(b);
  return ref ? `/invoice/${encodeURIComponent(ref)}` : '';
}
