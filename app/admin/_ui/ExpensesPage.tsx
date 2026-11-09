"use client";

// Expenses — what the shop spends, so "net earnings" on Analytics means
// something. Rent, wages, gas, packaging, a repair: one row each, with a
// category and the day the money actually went out.

import { useMemo, useState } from "react";
import type { Expense } from "./types";
import { rupee } from "./money";
import { expenseStats, rangeOf, type Period } from "./analytics";
import { useAdmin } from "./Store";
import { EXPENSE_CATEGORIES } from "../../lib/expenseStore";
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
const blank = (): Form => ({ title: "", category: "Ingredients", amount: "", expenseDate: todayISO(), notes: "" });

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

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const stats = useMemo(() => expenseStats(s.expenses, range, cat, q), [s.expenses, range, cat, q]);

  /* Every category the shop has actually used, plus the starters, so the
     picker never loses one somebody typed last month. */
  const categories = useMemo(
    () => [...new Set([...EXPENSE_CATEGORIES, ...s.expenses.map((e) => e.category)].filter(Boolean))],
    [s.expenses],
  );

  const rows = useMemo(() => [...stats.rows].sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.at - a.at), [stats.rows]);

  const save = async () => {
    if (!form) return;
    const amount = Number(form.amount);
    if (!form.title.trim()) return toast({ kind: "err", title: "Give the expense a name." });
    if (!Number.isFinite(amount) || amount <= 0) return toast({ kind: "err", title: "Enter how much it cost." });
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
            <Btn kind="red" icon="plus" onClick={() => setForm(blank())}>
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
                {c === "all" ? "All categories" : c}
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
              <input className={inputCls} list="expense-cats" value={form.category} maxLength={40} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <datalist id="expense-cats">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
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
    </Page>
  );
}
