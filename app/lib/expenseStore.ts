"use client";

// Shop expenses — Supabase + Realtime backed, like every other store here.
//
// Analytics takes revenue minus expenses to show what the shop actually
// earned, so this is real data, not a per-browser note: whoever is logged in
// as admin on any device sees and edits the same list.
//
// Needs supabase/expenses.sql. Until that is applied the store simply stays
// empty and the page says so, rather than throwing.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export interface Expense {
  id: string;
  title: string;
  category: string;
  amount: number;
  /** Shop-local day the money went out, "YYYY-MM-DD". */
  expenseDate: string;
  notes: string;
  createdAt: number;
}

/** Starting categories. Anything an admin types becomes a category too. */
export const EXPENSE_CATEGORIES = [
  'Ingredients',
  'Packaging',
  'Rent',
  'Salaries',
  'Utilities',
  'Equipment',
  'Marketing',
  'Transport',
  'Other',
];

function fromRow(r: Record<string, unknown>): Expense {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    category: (r.category as string) || 'Other',
    amount: Number(r.amount ?? 0),
    expenseDate: (r.expense_date as string) ?? '',
    notes: (r.notes as string) ?? '',
    createdAt: Number(r.created_at ?? 0),
  };
}

const store = createRealtimeStore<Expense>({ table: 'expenses', fromRow });

export function getExpenses(): Expense[] {
  store.ensureHydrated();
  return store.get();
}
export function getExpensesSnapshot(): Expense[] {
  return store.getSnapshot();
}
export function getExpensesServerSnapshot(): Expense[] {
  return store.getServerSnapshot();
}
export function subscribeToExpenses(cb: () => void): () => void {
  return store.subscribe(cb);
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function row(e: Partial<Expense>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.id !== undefined) out.id = e.id;
  if (e.title !== undefined) out.title = e.title;
  if (e.category !== undefined) out.category = e.category;
  if (e.amount !== undefined) out.amount = e.amount;
  if (e.expenseDate !== undefined) out.expense_date = e.expenseDate;
  if (e.notes !== undefined) out.notes = e.notes;
  if (e.createdAt !== undefined) out.created_at = e.createdAt;
  return out;
}

export async function saveExpense(input: Partial<Expense> & { id?: string }): Promise<{ ok: boolean; error?: string; expense?: Expense }> {
  const patch: Expense = {
    id: input.id ?? `EX-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0')}`,
    title: (input.title ?? '').trim() || 'Expense',
    category: (input.category ?? 'Other').trim() || 'Other',
    amount: Math.max(0, Number(input.amount ?? 0) || 0),
    expenseDate: input.expenseDate || todayISO(),
    notes: (input.notes ?? '').trim(),
    createdAt: input.createdAt ?? Date.now(),
  };
  const editing = Boolean(input.id);
  store.patchLocal((cur) => (editing ? cur.map((x) => (x.id === patch.id ? patch : x)) : [patch, ...cur]));
  const { error } = editing
    ? await write({ table: 'expenses', op: 'update', values: row({ ...patch, id: undefined, createdAt: undefined }), match: { id: patch.id } })
    : await write({ table: 'expenses', op: 'insert', values: row(patch) });
  if (error) {
    void store.refetch();
    return { ok: false, error: missingTable(error.message) };
  }
  // The row is in the database; pull the table back so what the screen shows
  // is the server's copy rather than only our optimistic one.
  void store.refetch();
  return { ok: true, expense: patch };
}

export async function deleteExpense(id: string): Promise<{ ok: boolean; error?: string }> {
  store.patchLocal((cur) => cur.filter((x) => x.id !== id));
  const { error } = await write({ table: 'expenses', op: 'delete', match: { id } });
  if (error) {
    void store.refetch();
    return { ok: false, error: missingTable(error.message) };
  }
  void store.refetch();
  return { ok: true };
}

function missingTable(message: string): string {
  if (/schema cache|does not exist|could not find the table|unknown table/i.test(message || '')) {
    return 'The expenses table is not in the database yet — run supabase/expenses.sql in the Supabase SQL editor.';
  }
  return message || 'Could not save that expense.';
}
