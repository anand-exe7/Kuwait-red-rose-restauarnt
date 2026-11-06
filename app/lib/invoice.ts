// Stable, human-looking invoice number shared by the receipt page, the admin
// Orders table and the print dialog — so the same bill always shows the same
// number everywhere. Format: INV-<year>-<7 uppercase chars>, derived
// deterministically from the bill / session id (no DB sequence needed).

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars, no ambiguous 0/O/1/I

function hash32(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

/** INV-2026-BEJUHWR — same input always yields the same code. */
export function invoiceNumber(key: string, when?: number): string {
  const year = new Date(when ?? Date.now()).getFullYear();
  let a = hash32(key, 2166136261);
  let b = hash32(key.split('').reverse().join(''), 913);
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += ALPHABET[a & 31];
    a = ((a >>> 5) | (b << 27)) >>> 0;
    b = b >>> 5;
  }
  return `INV-${year}-${code}`;
}
