"use client";

// Country tax settings (GST / non-GST), set once by the Admin and applied to
// every bill. Stored as a single row in `app_settings` (id = 'tax', value jsonb)
// so all panels read the same figure. Falls back to "no tax" until configured.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export interface TaxSettings {
  enabled: boolean; // GST on (true) / non-GST (false)
  rate: number;     // percent, e.g. 5 for 5%
  label: string;    // shown on bills, e.g. "GST", "VAT"
  inclusive: boolean; // true = price already includes tax; false = added on top
}

export const DEFAULT_TAX: TaxSettings = { enabled: false, rate: 0, label: 'GST', inclusive: false };

interface Row { id: string; enabled: boolean; rate: number; label: string; inclusive: boolean }

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    enabled: !!v.enabled,
    rate: Number(v.rate ?? 0),
    label: (v.label as string) || 'GST',
    inclusive: !!v.inclusive,
  };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToTax(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getTaxSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getTaxServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** Current tax settings (from the store rows), or the no-tax default. */
export function taxFrom(rows: Row[]): TaxSettings {
  const row = rows.find(r => r.id === 'tax');
  return row ? { enabled: row.enabled, rate: row.rate, label: row.label, inclusive: row.inclusive } : DEFAULT_TAX;
}

export function getTaxSettings(): TaxSettings {
  store.ensureHydrated();
  return taxFrom(store.get());
}

/** Tax amount for a (post-discount) taxable base, per the current settings. */
export function taxAmountFor(base: number, t: TaxSettings = getTaxSettings()): number {
  if (!t.enabled || t.rate <= 0 || base <= 0) return 0;
  const amount = t.inclusive
    ? base - base / (1 + t.rate / 100) // tax already inside the price
    : (base * t.rate) / 100;           // tax added on top
  return Math.round(amount * 1000) / 1000;
}

export function saveTaxSettings(next: TaxSettings) {
  const row: Row = { id: 'tax', ...next };
  store.patchLocal((cur) => {
    const exists = cur.some(r => r.id === 'tax');
    return exists ? cur.map(r => (r.id === 'tax' ? row : r)) : [row, ...cur];
  });
  // Upsert the single settings row.
  void write({ table: 'app_settings', op: 'update', values: { value: next }, match: { id: 'tax' } }).then(async ({ error }) => {
    if (error) {
      // Row may not exist yet → insert it.
      const ins = await write({ table: 'app_settings', op: 'insert', values: { id: 'tax', value: next } });
      if (ins.error) console.warn('[tax] save failed — apply supabase/app_settings.sql to persist tax settings.', ins.error.message);
    }
  });
}
