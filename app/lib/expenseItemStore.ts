"use client";

// The things the shop buys again and again.
//
// Nearly every expense here is the same handful of purchases repeating month
// after month — gas, maida, packaging, the rent. Typing the name out each time
// is both slower and worse data: "Gas cylinder", "gas", "Gas Cyl" end up as
// three different expenses that no report can add together.
//
// So the names are remembered. Anything saved through the Add expense form is
// kept here with the category it was filed under, and next month the form
// offers it back as a tick-box: tap the name, type the amount, done.
//
// Stored in `app_settings` under id = 'expense_items' ({ list: [...] }), the
// same place the expense CATEGORIES live — see expenseCategoryStore.ts. Names
// already used by a saved expense are merged in by the page, so a shop with
// months of history gets a full list on the first visit without anyone having
// to re-enter anything, and nothing disappears if this row is missing or
// supabase/app_settings.sql has not been applied yet.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

/** One remembered purchase. The category is what it was last filed under, so
 *  picking the name fills the category in too. */
export interface ExpenseItem {
  name: string;
  category: string;
}

interface Row { id: string; list: ExpenseItem[] }

const ROW_ID = 'expense_items';

/** Two names are the same purchase when they differ only by case or spacing. */
export const itemKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(v.list) ? v.list : [];
  const list: ExpenseItem[] = [];
  for (const entry of raw) {
    // Tolerate both shapes: the plain strings an older row may hold, and the
    // { name, category } objects written from here on.
    const name = typeof entry === 'string' ? entry : String((entry as Record<string, unknown>)?.name ?? '');
    const category = typeof entry === 'string' ? '' : String((entry as Record<string, unknown>)?.category ?? '');
    const clean = name.trim();
    if (clean) list.push({ name: clean, category: category.trim() });
  }
  return { id: String(r.id), list };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToExpenseItems(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getExpenseItemsSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getExpenseItemsServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** The saved purchases, in the order they were added. */
export function expenseItemsFrom(rows: Row[]): ExpenseItem[] {
  return rows.find((r) => r.id === ROW_ID)?.list ?? [];
}

function persist(list: ExpenseItem[]): Promise<{ error: { message: string } | null }> {
  // Last write of a name wins, so re-filing a purchase under a new category
  // updates it rather than leaving two rows with the same name.
  const seen = new Map<string, ExpenseItem>();
  for (const i of list) {
    const name = i.name.trim();
    if (!name) continue;
    seen.set(itemKey(name), { name, category: (i.category ?? '').trim() });
  }
  const clean = [...seen.values()];
  const row: Row = { id: ROW_ID, list: clean };
  store.patchLocal((cur) =>
    cur.some((r) => r.id === ROW_ID) ? cur.map((r) => (r.id === ROW_ID ? row : r)) : [row, ...cur],
  );
  const value = { list: clean };
  return write({ table: 'app_settings', op: 'update', values: { value }, match: { id: ROW_ID } }).then(async (res) => {
    if (!res.error) return res;
    // No row yet — the update matched nothing. Create it.
    const ins = await write({ table: 'app_settings', op: 'insert', values: { id: ROW_ID, value } });
    if (ins.error) {
      void store.refetch();
      return {
        error: {
          message: /schema cache|does not exist|unknown table/i.test(ins.error.message || '')
            ? 'The saved items list needs supabase/app_settings.sql — run it in the Supabase SQL editor.'
            : ins.error.message,
        },
      };
    }
    return ins;
  });
}

/**
 * The list as the SERVER currently holds it.
 *
 * Every write below replaces the whole `list` array, so it must never be
 * built on top of a list we have not actually read: saving an expense in the
 * second before this store first loads would otherwise write a one-item list
 * over everything the shop had saved. One small read first makes that
 * impossible, and an expense is saved rarely enough that nobody feels it.
 */
async function currentList(): Promise<ExpenseItem[]> {
  await store.refetch();
  return expenseItemsFrom(store.get());
}

/**
 * Remember a purchase, or re-file one that already exists under a new
 * category. Called every time an expense is saved, so the list builds itself
 * out of what the shop actually buys — nobody has to curate it.
 *
 * Returns `added: true` only when the name is new, so the page can say "added
 * to your list" without crying wolf on the twelfth gas cylinder.
 */
export async function rememberExpenseItem(
  name: string,
  category: string,
): Promise<{ ok: boolean; added: boolean; error?: string }> {
  const clean = name.trim();
  if (!clean) return { ok: false, added: false, error: 'Give the expense a name.' };
  const key = itemKey(clean);
  const existing = await currentList();
  const known = existing.find((i) => itemKey(i.name) === key);
  // Nothing to write: we already hold this name under this category.
  if (known && itemKey(known.category) === itemKey(category)) return { ok: true, added: false };
  const next = known
    ? existing.map((i) => (itemKey(i.name) === key ? { name: i.name, category: category.trim() } : i))
    : [...existing, { name: clean, category: category.trim() }];
  const { error } = await persist(next);
  return error ? { ok: false, added: false, error: error.message } : { ok: true, added: !known };
}

/** Drop a purchase off the list. The expenses already filed under it are not
 *  touched — this only stops the name being offered on the form. */
export async function forgetExpenseItem(name: string): Promise<{ ok: boolean; error?: string }> {
  const key = itemKey(name);
  const existing = await currentList();
  const { error } = await persist(existing.filter((i) => itemKey(i.name) !== key));
  return error ? { ok: false, error: error.message } : { ok: true };
}
