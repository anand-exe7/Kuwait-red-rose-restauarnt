// Kuwaiti Dinar formatting — KWD is subdivided into 1000 fils, so amounts
// are shown with 3 decimal places (the official convention). All money in the
// app should render through these helpers so the currency stays consistent.

export const CURRENCY_CODE = 'KWD';
export const CURRENCY_SYMBOL = 'KD';

/** "KD 12.500" — the app-wide standard for displaying prices. */
export function formatKWD(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${CURRENCY_SYMBOL} ${n.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;
}

/** "12.500" — the number only, for inputs, tables, or custom layouts. */
export function formatKWDNumber(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

/** Round to whole fils (3 decimals) so stored money never has sub-fil digits. */
export function round3(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 1000) / 1000;
}
