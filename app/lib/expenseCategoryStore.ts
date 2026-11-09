"use client";

// Expense categories the admin manages by hand.
//
// Same problem product categories had: a category was only ever "a string some
// expense happens to carry", so there was no way to create one before you had
// spent the money, and no way to rename or retire one. These live in
// `app_settings` under id = 'expense_categories' ({ list: string[] }).
//
// The built-in starters and anything already used by an expense are merged in
// by the page, so nothing disappears if this row is missing or
// supabase/app_settings.sql has not been applied yet.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

interface Row { id: string; list: string[] }

const ROW_ID = 'expense_categories';

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(v.list) ? v.list : [];
  return { id: String(r.id), list: raw.map((x) => String(x).trim()).filter(Boolean) };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToExpenseCategories(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getExpenseCategoriesSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getExpenseCategoriesServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** The saved names, in the order the admin arranged them. */
export function expenseCategoriesFrom(rows: Row[]): string[] {
  return rows.find((r) => r.id === ROW_ID)?.list ?? [];
}

function persist(list: string[]): Promise<{ error: { message: string } | null }> {
  const clean = [...new Set(list.map((c) => c.trim()).filter(Boolean))];
  const row: Row = { id: ROW_ID, list: clean };
  store.patchLocal((cur) =>
    cur.some((r) => r.id === ROW_ID) ? cur.map((r) => (r.id === ROW_ID ? row : r)) : [row, ...cur],
  );
  const value = { list: clean };
  return write({ table: 'app_settings', op: 'update', values: { value }, match: { id: ROW_ID } }).then(async (res) => {
    if (!res.error) return res;
    const ins = await write({ table: 'app_settings', op: 'insert', values: { id: ROW_ID, value } });
    if (ins.error) {
      void store.refetch();
      return {
        error: {
          message: /schema cache|does not exist|unknown table/i.test(ins.error.message || '')
            ? 'Expense categories need supabase/app_settings.sql — run it in the Supabase SQL editor.'
            : ins.error.message,
        },
      };
    }
    return ins;
  });
}

export async function addExpenseCategory(name: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'Give the category a name.' };
  if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) return { ok: false, error: `"${clean}" already exists.` };
  const { error } = await persist([...existing, clean]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function renameExpenseCategory(from: string, to: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const clean = to.trim();
  if (!clean) return { ok: false, error: 'Give the category a name.' };
  if (clean !== from && existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: `"${clean}" already exists.` };
  }
  const next = existing.map((c) => (c === from ? clean : c));
  if (!existing.includes(from)) next.push(clean);
  const { error } = await persist(next);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteExpenseCategory(name: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const { error } = await persist(existing.filter((c) => c !== name));
  return error ? { ok: false, error: error.message } : { ok: true };
}
