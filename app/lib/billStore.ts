"use client";

// Bills — the record that settles a session. Supabase + Realtime backed.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export interface Bill {
  id: string;
  sessionId: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  couponCode?: string | null;
  paidMethod?: string | null;
  invoiceNo?: string | null;
  // Full admin POS payload (items, GST breakdown, splits…). Present when the
  // admin wrote this bill; lets the short /invoice/INV-… page re-render it.
  payload?: Record<string, unknown> | null;
  createdAt: number;
}

function fromRow(r: Record<string, unknown>): Bill {
  return {
    id: r.id as string,
    sessionId: (r.session_id as string) ?? null,
    subtotal: Number(r.subtotal),
    tax: Number(r.tax),
    discount: Number(r.discount),
    total: Number(r.total),
    couponCode: (r.coupon_code as string) ?? null,
    paidMethod: (r.paid_method as string) ?? null,
    invoiceNo: (r.invoice_no as string) ?? null,
    payload: (r.payload as Record<string, unknown> | null) ?? null,
    createdAt: Number(r.created_at),
  };
}

const store = createRealtimeStore<Bill>({ table: 'bills', fromRow });

export function getBillsSnapshot(): Bill[] {
  return store.getSnapshot();
}
export function getBillsServerSnapshot(): Bill[] {
  return store.getServerSnapshot();
}
export function getBills(): Bill[] {
  store.ensureHydrated();
  return store.get();
}

/** Invoice numbers already issued — used to keep a new one unique. */
export function getIssuedInvoiceNumbers(): string[] {
  store.ensureHydrated();
  return store.get().map((b) => b.invoiceNo || '').filter(Boolean) as string[];
}

// The new POS persists the full bill payload + invoice number alongside the
// thin fields. Older databases don't have those columns yet — if the write
// is rejected for "unknown column", we retry once without them so the bill
// still lands (the UI just falls back to the short-URL + lookup for anything
// the stripped row can't rebuild).
const OPTIONAL_BILL_COLUMNS = ['invoice_no', 'payload'] as const;
let billSchemaIsLegacy = false;

function stripLegacyBillColumns(row: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...row };
  for (const k of OPTIONAL_BILL_COLUMNS) delete clean[k];
  return clean;
}

async function insertBillRow(row: Record<string, unknown>) {
  const payload = billSchemaIsLegacy ? stripLegacyBillColumns(row) : row;
  const result = await write({ table: 'bills', op: 'insert', values: payload });
  if (result.error && /unknown column|column .*? does not exist|unknown .*? field/i.test(result.error.message || '')) {
    billSchemaIsLegacy = true;
    console.warn(
      '[bills] your Supabase bills table is missing the invoice_no / payload columns. ' +
      'Apply supabase/add_bill_payload.sql in the Supabase SQL editor so the short ' +
      'invoice link (/invoice/INV-YYYY-XXXXX) can render without a URL blob.'
    );
    return write({ table: 'bills', op: 'insert', values: stripLegacyBillColumns(row) });
  }
  return result;
}

/** Create a bill that settles a session. Returns it synchronously (optimistic). */
export function createBill(input: {
  id?: string;
  sessionId: string | null;
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  couponCode?: string | null;
  paidMethod?: string | null;
  invoiceNo?: string | null;
  payload?: Record<string, unknown> | null;
}): Bill {
  // `BL-` prefix + alphanumeric tail — matches the server-side id validator.
  const id =
    input.id ?? `BL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const bill: Bill = {
    id,
    sessionId: input.sessionId,
    subtotal: input.subtotal,
    tax: input.tax,
    discount: input.discount ?? 0,
    total: input.total,
    couponCode: input.couponCode ?? null,
    paidMethod: input.paidMethod ?? null,
    invoiceNo: input.invoiceNo ?? null,
    payload: input.payload ?? null,
    createdAt: Date.now(),
  };
  store.patchLocal((cur) => [bill, ...cur]);
  void insertBillRow({
    id: bill.id,
    session_id: bill.sessionId,
    subtotal: bill.subtotal,
    tax: bill.tax,
    discount: bill.discount,
    total: bill.total,
    coupon_code: bill.couponCode,
    paid_method: bill.paidMethod,
    invoice_no: bill.invoiceNo,
    payload: bill.payload,
  }).then(({ error }) => { if (error) console.error('[bills] create failed', error.message); });
  return bill;
}

export function subscribeToBills(callback: () => void): () => void {
  return store.subscribe(callback);
}
