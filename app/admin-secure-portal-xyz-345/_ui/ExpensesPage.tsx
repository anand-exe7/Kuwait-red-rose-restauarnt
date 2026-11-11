"use client";

// Expenses — what the shop spends, so "net earnings" on Analytics means
// something. Rent, wages, gas, packaging, a repair: one row each, with a
// category and the day the money actually went out.

import { useMemo, useState, useSyncExternalStore } from "react";
import type { Expense } from "./types";
import { rupee } from "./money";
import { expenseStats, rangeOf, type Period } from "./analytics";
import { useAdmin } from "./Store";
import { EXPENSE_CATEGORIES } from "../../lib/expenseStore";
import {
  addExpenseCategory,
  deleteExpenseCategory,
  expenseCategoriesFrom,
  getExpenseCategoriesServerSnapshot,
  getExpenseCategoriesSnapshot,
  renameExpenseCategory,
  subscribeToExpenseCategories,
} from "../../lib/expenseCategoryStore";
import {
  Btn,
  Card,
  DateRange,
  Empty,
  Field,
  Icon,
  Kpi,
  Modal,
  Page,
  PageHead,
  Pills,
  SearchBox,
  cx,
  downloadExcel,
  fmtDate,
  inputCls,
} from "./kit";

type Form = { id?: string; title: string; category: string; amount: string; expenseDate: string; notes: string };

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = (category = ""): Form => ({ title: "", category, amount: "", expenseDate: todayISO(), notes: "" });

const th = "px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3.5 text-[13px]";

export default function ExpensesPage() {
  const { s, act, confirm, toast } = useAdmin();
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [renameOf, setRenameOf] = useState<string | null>(null);
  const [renaming, setRenaming] = useState("");

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const stats = useMemo(() => expenseStats(s.expenses, range, cat, q), [s.expenses, range, cat, q]);

  /* Three sources, in priority order: the list the admin manages, the
     built-in starters, and anything an expense already carries — so a
     category somebody typed last month never vanishes from the filter. */
  const savedCats = expenseCategoriesFrom(
    useSyncExternalStore(subscribeToExpenseCategories, getExpenseCategoriesSnapshot, getExpenseCategoriesServerSnapshot),
  );
  const categories = useMemo(
    () => [...new Set([...savedCats, ...EXPENSE_CATEGORIES, ...s.expenses.map((e) => e.category)].filter(Boolean))],
    [savedCats, s.expenses],
  );
  /* What the Add/Edit form offers. Once the admin has made their own
     categories, those are the only ones on the picker — a list of built-in
     names nobody chose is how expenses end up filed under "Other". The
     built-ins are the fallback only while the admin has created none, so the
     form is never an empty dropdown. A category an older expense already
     carries is added back when that expense is opened, so editing it can
     never silently re-file it. */
  const pickerCats = savedCats.length > 0 ? savedCats : EXPENSE_CATEGORIES;
  const formCats =
    form && form.category && !pickerCats.includes(form.category) ? [form.category, ...pickerCats] : pickerCats;
  /** How many expenses sit in each category — shown on the filter chips, and
   *  what decides whether a category is safe to delete. */
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of s.expenses) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [s.expenses]);

  const createCategory = async () => {
    setBusy(true);
    const r = await addExpenseCategory(newCatName, categories);
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: r.error ?? "Could not create that category." });
    toast({ kind: "ok", title: `"${newCatName.trim()}" added.` });
    setNewCatName("");
  };

  const applyRename = async (from: string) => {
    setBusy(true);
    const r = await renameExpenseCategory(from, renaming, categories);
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: r.error ?? "Could not rename that category." });
    // Re-tag the expenses that carried the old name, or they drop out of
    // every filter and the breakdown shows a category that no longer exists.
    const moving = s.expenses.filter((e) => e.category === from);
    for (const e of moving) await act("expense.save", { ...e, category: renaming.trim() });
    if (cat === from) setCat(renaming.trim());
    toast({ kind: "ok", title: `Renamed to "${renaming.trim()}"${moving.length ? ` · ${moving.length} expense${moving.length === 1 ? "" : "s"} moved` : ""}.` });
    setRenameOf(null);
  };

  const removeCategory = async (name: string) => {
    const used = usage.get(name) ?? 0;
    if (used > 0) {
      return toast({ kind: "err", title: `${used} expense${used === 1 ? " is" : "s are"} still in "${name}". Move them first.` });
    }
    if (!(await confirm({ title: `Delete "${name}"?`, body: "Nothing is filed under it, so nothing is lost.", ok: "Delete", danger: true }))) return;
    const r = await deleteExpenseCategory(name, categories);
    if (!r.ok) return toast({ kind: "err", title: r.error ?? "Could not delete that category." });
    if (cat === name) setCat("all");
    toast({ kind: "ok", title: `"${name}" deleted.` });
  };

  const rows = useMemo(() => [...stats.rows].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.at - a.at), [stats.rows]);

  const save = async () => {
    if (!form) return;
    const amount = Number(form.amount);
    if (!form.title.trim()) return toast({ kind: "err", title: "Give the expense a name." });
    if (!Number.isFinite(amount) || amount <= 0) return toast({ kind: "err", title: "Enter how much it cost." });
    if (!form.category.trim()) return toast({ kind: "err", title: "Choose a category for this expense." });
    setBusy(true);
    const r = await act<Expense>("expense.save", { ...form, amount });
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: r.error });
    toast({ kind: "ok", title: form.id ? "Expense updated" : `${form.title.trim()} recorded` });
    setForm(null);
  };

  const remove = async (e: Expense) => {
    const ok = await confirm({ title: `Delete "${e.title}"?`, body: `${rupee(e.amount)} on ${fmtDate(new Date(`${e.expenseDate}T12:00:00`).getTime())}. This can't be undone.`, ok: "Delete", danger: true });
    if (!ok) return;
    const r = await act("expense.delete", { id: e.id });
    if (!r.ok) return toast({ kind: "err", title: r.error });
    toast({ kind: "ok", title: "Expense deleted" });
  };

  const exportExcel = () => {
    downloadExcel(`expenses-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: "Expenses",
        rows: [
          ["Date", "Title", "Category", "Amount", "Notes"],
          ...rows.map((e) => [e.expenseDate, e.title, e.category, e.amount, e.notes]),
          [],
          ["Total", "", "", stats.total, ""],
        ],
      },
    ]);
  };

  return (
    <Page>
      <PageHead
        title="Expenses"
        sub="Everything the shop pays out. Analytics takes these off revenue to show what you actually earned."
        right={
          <span className="flex flex-wrap gap-2">
            <Btn icon="download" onClick={exportExcel} disabled={!rows.length}>
              Download Excel
            </Btn>
            <Btn icon="edit" onClick={() => setManageCats(true)}>
              Manage categories
            </Btn>
            <Btn kind="red" icon="plus" onClick={() => setForm(blank(pickerCats[0] ?? ""))}>
              Add expense
            </Btn>
          </span>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Pills
          label="Period:"
          value={period}
          onChange={setPeriod}
          options={[
            { v: "all", t: "All time" },
            { v: "today", t: "Today" },
            { v: "week", t: "This week" },
            { v: "month", t: "This month" },
            { v: "year", t: "This year" },
            { v: "custom", t: "Custom" },
          ]}
        />
        {period === "custom" && <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Kpi label="Spent in this period" value={rupee(stats.total)} hint={`${stats.count} expense${stats.count === 1 ? "" : "s"}`} icon="rupee" tone="rose" />
        <Kpi label="Biggest category" value={stats.top?.category ?? "—"} hint={stats.top ? rupee(stats.top.amount) : "Nothing recorded yet"} icon="bag" tone="amber" small />
        <Kpi label="Average expense" value={rupee(stats.count ? stats.total / stats.count : 0)} hint="Per entry in this period" icon="chart" tone="violet" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="adm-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          {["all", ...categories].map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cx(
                  "h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[12.5px] font-bold capitalize transition",
                  on ? "bg-red-600 text-white shadow-[0_4px_10px_-4px_rgba(220,38,38,.9)]" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {c === "all" ? "All categories" : c}
                  <span className={cx("adm-num rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", on ? "bg-white/20 text-white/90" : "bg-white text-slate-500")}>
                    {c === "all" ? s.expenses.length : usage.get(c) ?? 0}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search expenses…" className="w-full lg:w-64" />
      </div>

      {stats.breakdown.length > 1 && (
        <Card title="Where it went" className="mb-5">
          <ul className="space-y-3">
            {stats.breakdown.map((b) => (
              <li key={b.category} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-800">{b.category}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="adm-fill h-full rounded-full bg-red-600" style={{ width: `${(b.amount / (stats.total || 1)) * 100}%` }} />
                  </div>
                </div>
                <b className="adm-num text-[13px] text-slate-900">{rupee(b.amount)}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Expenses">
        {!rows.length ? (
          <Empty icon="bag" title="Nothing recorded in this period">
            Add what the shop paid out — rent, wages, gas, packaging — and Analytics will take it off revenue.
          </Empty>
        ) : (
          <div className="adm-scroll overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Expense</th>
                  <th className={th}>Category</th>
                  <th className={cx(th, "text-right")}>Amount</th>
                  <th className={cx(th, "text-right")}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 last:border-0">
                    <td className={cx(td, "whitespace-nowrap text-slate-600")}>{e.expenseDate}</td>
                    <td className={td}>
                      <b className="block text-slate-900">{e.title}</b>
                      {e.notes && <span className="text-[11.5px] text-slate-500">{e.notes}</span>}
                    </td>
                    <td className={cx(td, "text-slate-600")}>{e.category}</td>
                    <td className={cx(td, "adm-num text-right font-bold text-slate-900")}>{rupee(e.amount)}</td>
                    <td className={cx(td, "text-right")}>
                      <span className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setForm({ id: e.id, title: e.title, category: e.category, amount: String(e.amount), expenseDate: e.expenseDate, notes: e.notes })}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          aria-label={`Edit ${e.title}`}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(e)}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                          aria-label={`Delete ${e.title}`}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className={cx(td, "font-bold text-slate-700")} colSpan={3}>
                    Total
                  </td>
                  <td className={cx(td, "adm-num text-right text-[15px] font-extrabold text-slate-900")}>{rupee(stats.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit expense" : "Add expense"}
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="red" onClick={save} disabled={busy}>
              {busy ? "Saving…" : form?.id ? "Save changes" : "Add expense"}
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What was it for" className="sm:col-span-2">
              <input className={inputCls} value={form.title} maxLength={80} placeholder="Gas cylinder, October rent…" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">Choose a category…</option>
                {formCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {savedCats.length === 0 && (
                <p className="mt-1.5 text-[11.5px] text-slate-400">
                  These are the starter categories. Make your own in <b>Manage categories</b> and the list becomes yours.
                </p>
              )}
            </Field>
            <Field label="Amount (KD)">
              <input className={inputCls} type="number" min={0} step="0.001" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Date it was paid">
              <input className={inputCls} type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <input className={inputCls} value={form.notes} maxLength={200} placeholder="Optional — invoice number, who was paid…" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* Manage categories — create one before you have spent the money,
          rename one everywhere at once, retire one nothing uses. */}
      <Modal
        open={manageCats}
        onClose={() => (setManageCats(false), setNewCatName(""), setRenameOf(null))}
        title="Expense categories"
        footer={<Btn onClick={() => (setManageCats(false), setNewCatName(""), setRenameOf(null))}>Done</Btn>}
      >
        <div className="mb-4 rounded-xl border border-dashed border-slate-200 p-3">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Create category</span>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={newCatName}
              maxLength={40}
              placeholder="e.g. Electricity"
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newCatName.trim() && createCategory()}
            />
            <Btn kind="red" disabled={busy || !newCatName.trim()} onClick={createCategory}>
              Create
            </Btn>
          </div>
        </div>

        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
          {categories.map((c) => {
            const used = usage.get(c) ?? 0;
            return (
              <li key={c} className="flex items-center gap-2 bg-white px-3 py-2.5">
                {renameOf === c ? (
                  <>
                    <input
                      autoFocus
                      className={inputCls}
                      value={renaming}
                      maxLength={40}
                      onChange={(e) => setRenaming(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && renaming.trim() && applyRename(c)}
                    />
                    <Btn kind="red" disabled={busy || !renaming.trim()} onClick={() => applyRename(c)}>
                      Save
                    </Btn>
                    <Btn kind="plain" onClick={() => setRenameOf(null)}>
                      Cancel
                    </Btn>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-slate-800">{c}</span>
                    <span className="adm-num shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      {used}
                    </span>
                    <button
                      type="button"
                      aria-label={`Rename ${c}`}
                      onClick={() => (setRenameOf(c), setRenaming(c))}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${c}`}
                      onClick={() => removeCategory(c)}
                      className={cx("rounded-lg p-1.5", used > 0 ? "text-slate-300" : "text-red-500 hover:bg-red-50")}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11.5px] text-slate-400">
          Renaming moves every expense filed under the old name. A category with expenses in it can&rsquo;t be deleted —
          move them first.
        </p>
      </Modal>
    </Page>
  );
}
