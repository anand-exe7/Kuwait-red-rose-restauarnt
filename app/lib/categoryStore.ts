"use client";

// Product categories.
//
// A category used to be "whatever string the products happen to carry", which
// meant creating one did nothing: there was no product in it yet, so it was
// gone the moment the form closed. That is why Create category looked broken.
//
// They now live in `app_settings` under id = 'categories' ({ list: string[] }),
// so an empty category persists, shows up in the pickers, and can be renamed or
// deleted on its own. The categories in use by products are still merged in, so
// nothing is lost if this row is missing or the migration hasn't been applied.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

interface Row { id: string; list: string[] }

const ROW_ID = 'categories';

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(v.list) ? v.list : [];
  return {
    id: String(r.id),
    list: raw.map((x) => String(x).trim()).filter(Boolean),
  };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToCategories(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getCategoriesSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getCategoriesServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** The saved category names, in the order the admin arranged them. */
export function categoriesFrom(rows: Row[]): string[] {
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
    // The row doesn't exist yet — create it.
    const ins = await write({ table: 'app_settings', op: 'insert', values: { id: ROW_ID, value } });
    if (ins.error) {
      void store.refetch();
      return {
        error: {
          message: /schema cache|does not exist|unknown table/i.test(ins.error.message || '')
            ? 'Categories need supabase/app_settings.sql — run it in the Supabase SQL editor.'
            : ins.error.message,
        },
      };
    }
    return ins;
  });
}

/** Add a category. Returns an error message when it could not be saved. */
export async function addCategory(name: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'Give the category a name.' };
  if (existing.some((c) => c.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: `"${clean}" already exists.` };
  }
  const { error } = await persist([...existing, clean]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Rename a category in the saved list (products are re-tagged separately). */
export async function renameCategory(from: string, to: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const clean = to.trim();
  if (!clean) return { ok: false, error: 'Give the category a name.' };
  const next = existing.map((c) => (c === from ? clean : c));
  if (!existing.includes(from)) next.push(clean);
  const { error } = await persist(next);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Remove a category from the saved list. Only safe when nothing uses it. */
export async function deleteCategory(name: string, existing: string[]): Promise<{ ok: boolean; error?: string }> {
  const { error } = await persist(existing.filter((c) => c !== name));
  return error ? { ok: false, error: error.message } : { ok: true };
}
