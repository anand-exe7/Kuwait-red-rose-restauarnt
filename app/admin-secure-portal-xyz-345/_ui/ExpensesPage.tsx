"use client";

// Expenses — what the shop spends, so "net earnings" on Analytics means
// something. Rent, wages, gas, packaging, a repair: one row each, with a
// category and the day the money actually went out.

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

// useLayoutEffect on the client (measure the pill before paint, no flash),
// useEffect on the server (avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import type { Expense } from "./types";
import { rupee } from "./money";
import { expenseStats, rangeOf, type Period } from "./analytics";
import { useAdmin } from "./Store";
import { EXPENSE_CATEGORIES } from "../../lib/expenseStore";
import {
  expenseItemsFrom,
  forgetExpenseItem,
  getExpenseItemsServerSnapshot,
  getExpenseItemsSnapshot,
  itemKey,
  rememberExpenseItem,
  subscribeToExpenseItems,
  type ExpenseItem,
} from "../../lib/expenseItemStore";
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

/**
 * The Add-expense draft.
 *
 * One trip to the supplier is one payment covering several things — "maida,
 * sugar, gas, KD 45" — which is how the shop already writes them down. So the
 * form collects the THINGS as chips and the PRICE once, for the lot, and
 * writes a single expense whose title is the chips joined up.
 *
 * Editing an existing expense stays a plain single form (`Form` above),
 * because there you are changing one record that already exists.
 */
type Draft = {
  /** The chips sitting in the box, in the order they were put there. */
  picked: string[];
  category: string;
  /** What the whole lot cost — one price, not one per chip. */
  amount: string;
  expenseDate: string;
  notes: string;
  /** Names typed into this draft that the saved list does not hold yet. */
  extra: ExpenseItem[];
};

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** An expense's title is the things it covered, joined up — "maida, sugar,
 *  gas". Split it back out so the row can show them as chips. Falls back to
 *  the whole title when there is nothing to split. */
function splitItems(title: string): string[] {
  const parts = title.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : [title.trim()].filter(Boolean);
}

/** Everything about one expense, opened out under its row: what it covered,
 *  and every field in full — no truncation, no ellipsis. */
function ExpenseDetail({ e, parts }: { e: Expense; parts: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500">
        What it covered
      </span>
      <div className="flex flex-wrap gap-1.5">
        {parts.map((p, i) => (
          <span key={`${p}-${i}`} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[12.5px] font-semibold text-slate-700">
            {p}
          </span>
        ))}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 border-t border-slate-100 pt-3 sm:grid-cols-2">
        {[
          { k: "Category", v: e.category },
          { k: "Date it was paid", v: e.expenseDate },
          { k: "Amount", v: rupee(e.amount) },
          { k: "Notes", v: e.notes || "—" },
        ].map((f) => (
          <div key={f.k}>
            <dt className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-400">{f.k}</dt>
            <dd className="mt-0.5 break-words text-[13px] font-semibold text-slate-800">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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
  /** "date" is the plain ledger; "item" groups the same purchase together so
   *  you can see what the gas cost across the whole period at a glance. */
  const [draft, setDraft] = useState<Draft | null>(null);
  /** What is typed in the add form's name box: both a filter over the list
   *  and the way a name that is not on it yet gets added. */
  const [newName, setNewName] = useState("");
  const [view, setView] = useState<"date" | "item">("date");
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  /** The bare input inside the chip box — clicking anywhere in the box, or
   *  committing a chip, puts the cursor back here. */
  const nameRef = useRef<HTMLInputElement | null>(null);

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
  /* ---- the things the shop buys every month ----------------------------
     Nearly every expense is the same handful of purchases repeating. The
     names are remembered (app/lib/expenseItemStore.ts) so next month is a
     tick and an amount instead of typing. Two sources, merged: the saved
     list, and every name an expense already carries — so a shop with months
     of history has a full pick-list the first time it opens this, without
     anyone re-entering a thing. */
  const savedItems = expenseItemsFrom(
    useSyncExternalStore(subscribeToExpenseItems, getExpenseItemsSnapshot, getExpenseItemsServerSnapshot),
  );
  const items = useMemo(() => {
    const m = new Map<string, ExpenseItem>();
    for (const i of savedItems) if (itemKey(i.name)) m.set(itemKey(i.name), i);
    for (const e of s.expenses) {
      const k = itemKey(e.title);
      if (k && !m.has(k)) m.set(k, { name: e.title.trim(), category: e.category });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [savedItems, s.expenses]);

  /** Per purchase: what it last cost, and which months it has already been
   *  recorded in — that second one is what strikes a name through, so you can
   *  see at a glance what is still left to enter for the month. */
  const itemFacts = useMemo(() => {
    const m = new Map<string, { lastAmount: number; lastDate: string; months: Set<string> }>();
    for (const e of s.expenses) {
      const k = itemKey(e.title);
      if (!k) continue;
      const cur = m.get(k);
      if (!cur) m.set(k, { lastAmount: e.amount, lastDate: e.expenseDate, months: new Set([e.expenseDate.slice(0, 7)]) });
      else {
        cur.months.add(e.expenseDate.slice(0, 7));
        if (e.expenseDate >= cur.lastDate) { cur.lastDate = e.expenseDate; cur.lastAmount = e.amount; }
      }
    }
    return m;
  }, [s.expenses]);

  /** How many expenses sit in each category — shown on the filter chips, and
   *  what decides whether a category is safe to delete. */
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of s.expenses) m.set(e.category, (m.get(e.category) ?? 0) + 1);
    return m;
  }, [s.expenses]);

  /* Sliding segmented filter — the active red pill glides to whichever
     category you tap instead of each chip flipping its own colour. We measure
     the active button and move one absolutely-positioned indicator to it. */
  const catTabs = useMemo(() => ["all", ...categories], [categories]);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useIsoLayoutEffect(() => {
    const move = () => {
      const el = btnRefs.current[cat];
      if (!el) return;
      const next = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
      // Only update when the measurement actually changes — setting a fresh
      // object every run would re-render → re-run this effect → infinite loop.
      setPill((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    move();
    // Re-measure after fonts/layout settle and whenever the window resizes.
    const t = window.setTimeout(move, 60);
    window.addEventListener("resize", move);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", move); };
    // Primitive deps only — catTabs/usage are fresh refs each render and would
    // otherwise make this effect run every render.
  }, [cat, catTabs.length, s.expenses.length]);

  const selectCat = (c: string) => {
    setCat(c);
    btnRefs.current[c]?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  };

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

  /** The same rows, gathered by purchase: one line per thing bought, biggest
   *  spend first, each opening to the individual payments behind it. This is
   *  the view that answers "what did the gas cost us this year". */
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; categories: Set<string>; total: number; rows: typeof rows }>();
    for (const e of rows) {
      const k = itemKey(e.title) || e.id;
      const g = m.get(k) ?? { key: k, name: e.title || "Expense", categories: new Set<string>(), total: 0, rows: [] };
      g.total += e.amount;
      g.categories.add(e.category);
      g.rows.push(e);
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [rows]);

  const toggleGroup = (k: string) =>
    setOpenGroups((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  /* ---- the add-expense draft -------------------------------------------
     The box at the top holds chips. Tap a name from the row underneath and
     it moves up into the box; tap its × up there and it drops back down.
     Type a name that is not on the row yet and it becomes a chip too — and
     joins the row, so next month it is one tap. The price is entered once,
     for everything in the box. */
  const draftItems = useMemo(() => {
    const m = new Map<string, ExpenseItem>();
    for (const i of items) m.set(itemKey(i.name), i);
    // A name typed into this draft wins: it carries the category just chosen.
    for (const i of draft?.extra ?? []) m.set(itemKey(i.name), i);
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [items, draft]);

  const typed = newName.trim();
  const typedKey = itemKey(typed);
  /** Typing filters the row underneath, so a long list is still one tap. */
  const shownItems = typed ? draftItems.filter((i) => itemKey(i.name).includes(typedKey)) : draftItems;
  const typedIsNew = Boolean(typed) && !draftItems.some((i) => itemKey(i.name) === typedKey);
  const pickedKeys = useMemo(() => new Set((draft?.picked ?? []).map(itemKey)), [draft]);
  /** The one expense this draft would write: the chips, joined up. */
  const draftTitle = (draft?.picked ?? []).join(", ");
  const draftAmount = Number(draft?.amount);
  const draftCats = draft && draft.category && !pickerCats.includes(draft.category) ? [draft.category, ...pickerCats] : pickerCats;

  const openDraft = () => {
    setNewName("");
    setDraft({ picked: [], category: pickerCats[0] ?? "", amount: "", expenseDate: todayISO(), notes: "", extra: [] });
  };
  const closeDraft = () => { setDraft(null); setNewName(""); };

  /** Put a name in the box. Already there → take it out again, so a mis-tap
   *  costs one tap. */
  const toggleChip = (name: string) => {
    const k = itemKey(name);
    setDraft((d) =>
      d ? { ...d, picked: d.picked.some((p) => itemKey(p) === k) ? d.picked.filter((p) => itemKey(p) !== k) : [...d.picked, name] } : d,
    );
  };
  const unpick = (name: string) => {
    const k = itemKey(name);
    setDraft((d) => (d ? { ...d, picked: d.picked.filter((p) => itemKey(p) !== k) } : d));
  };

  /** Commit whatever is in the text box: it becomes a chip, and if it is a
   *  name we have never seen it also joins the row underneath for next time. */
  const commitTyped = () => {
    if (!draft || !typed) return;
    const k = typedKey;
    setDraft((d) =>
      d
        ? {
            ...d,
            extra: typedIsNew ? [...d.extra, { name: typed, category: d.category }] : d.extra,
            picked: d.picked.some((p) => itemKey(p) === k) ? d.picked : [...d.picked, typed],
          }
        : d,
    );
    setNewName("");
  };

  const forgetItem = async (it: ExpenseItem) => {
    const ok = await confirm({
      title: `Take "${it.name}" off the list?`,
      body: "It stops being offered here. Expenses already recorded under it are not touched.",
      ok: "Remove",
      danger: true,
    });
    if (!ok) return;
    const k = itemKey(it.name);
    setDraft((d) =>
      d ? { ...d, extra: d.extra.filter((x) => itemKey(x.name) !== k), picked: d.picked.filter((p) => itemKey(p) !== k) } : d,
    );
    const r = await forgetExpenseItem(it.name);
    if (!r.ok) return toast({ kind: "err", title: r.error ?? "Could not update the list." });
    toast({ kind: "ok", title: `"${it.name}" removed from the list.` });
  };

  /**
   * Write the draft as ONE expense — the chips joined up as its title, the
   * single price against the lot — then remember each chip so next month it
   * is already on the row underneath.
   */
  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.picked.length) return toast({ kind: "err", title: "Add what the money went on — tap a name, or type one and press Enter." });
    if (!Number.isFinite(draftAmount) || draftAmount <= 0) return toast({ kind: "err", title: "Enter what it all cost." });
    if (!draft.category.trim()) return toast({ kind: "err", title: "Choose a category for this expense." });

    setBusy(true);
    const r = await act<Expense>("expense.save", {
      title: draftTitle,
      category: draft.category,
      amount: draftAmount,
      expenseDate: draft.expenseDate,
      notes: draft.notes,
    });
    if (!r.ok) { setBusy(false); return toast({ kind: "err", title: r.error }); }
    // The expense is saved either way — a failure here costs the shortcut,
    // not the record, so it is said plainly and nothing is rolled back.
    const failed: string[] = [];
    for (const name of draft.picked) {
      const kept = await rememberExpenseItem(name, draft.category);
      if (!kept.ok) failed.push(name);
    }
    setBusy(false);
    if (failed.length) toast({ kind: "err", title: `Saved, but could not add ${failed.join(", ")} to your list.` });
    else toast({ kind: "ok", title: `${draftTitle} recorded`, body: `${rupee(draftAmount)} on ${draft.expenseDate}.` });
    closeDraft();
  };

  /** Editing one existing expense — a plain single form. */
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
    toast({ kind: "ok", title: "Expense updated" });
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
            <Btn kind="red" icon="plus" onClick={openDraft}>
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
        <div ref={trackRef} className="adm-scroll relative flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-full bg-slate-100 p-1">
          {/* the single sliding pill that glides to the active category */}
          {pill && (
            <span
              aria-hidden
              className="pointer-events-none absolute z-0 rounded-full bg-red-600 shadow-[0_4px_12px_-4px_rgba(220,38,38,.9)] transition-all duration-300 ease-out"
              style={{ left: pill.left, top: pill.top, width: pill.width, height: pill.height }}
            />
          )}
          {catTabs.map((c) => {
            const on = cat === c;
            return (
              <button
                key={c}
                ref={(el) => { btnRefs.current[c] = el; }}
                type="button"
                onClick={() => selectCat(c)}
                aria-pressed={on}
                className={cx(
                  "relative z-10 h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-[12.5px] font-bold capitalize transition-colors",
                  on ? "text-white" : "text-slate-600 hover:text-slate-900",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {c === "all" ? "All categories" : c}
                  <span className={cx("adm-num rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums transition-colors", on ? "bg-white/20 text-white/90" : "bg-white text-slate-500")}>
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

      <Card
        title="Expenses"
        right={
          rows.length > 0 && (
            <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
              {([
                { v: "date", t: "By date" },
                { v: "item", t: "By item" },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setView(o.v)}
                  aria-pressed={view === o.v}
                  className={cx(
                    "h-8 rounded-full px-3.5 text-[12px] font-bold transition",
                    view === o.v ? "bg-red-600 text-white shadow-[0_4px_12px_-4px_rgba(220,38,38,.9)]" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  {o.t}
                </button>
              ))}
            </div>
          )
        }
      >
        {!rows.length ? (
          <Empty icon="bag" title="Nothing recorded in this period">
            Add what the shop paid out — rent, wages, gas, packaging — and Analytics will take it off revenue.
          </Empty>
        ) : view === "date" ? (
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
                {rows.map((e) => {
                  const open = openGroups.includes(e.id);
                  const parts = splitItems(e.title);
                  return (
                    <Fragment key={e.id}>
                      <tr className={cx("border-b border-slate-100 last:border-0", open && "bg-slate-50/70")}>
                        <td className={cx(td, "whitespace-nowrap align-top text-slate-600")}>{e.expenseDate}</td>
                        <td className={cx(td, "align-top")}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(e.id)}
                            aria-expanded={open}
                            className="flex w-full items-start gap-2 text-left"
                          >
                            <Icon
                              name="chevron"
                              size={14}
                              className={cx("mt-1 shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
                            />
                            <span className="min-w-0">
                              {/* Never truncated: the whole thing it was for,
                                  wrapped onto as many lines as it needs. */}
                              <b className="block break-words text-slate-900">{e.title}</b>
                              {parts.length > 1 && !open && (
                                <span className="text-[11.5px] text-slate-400">{parts.length} things</span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td className={cx(td, "align-top text-slate-600")}>{e.category}</td>
                        <td className={cx(td, "adm-num align-top text-right font-bold text-slate-900")}>{rupee(e.amount)}</td>
                        <td className={cx(td, "align-top text-right")}>
                          <span className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => setForm({ id: e.id, title: e.title, category: e.category, amount: String(e.amount), expenseDate: e.expenseDate, notes: e.notes })}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              aria-label={`Edit ${e.title}`}
                            >
                              <Icon name="edit" size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(e)}
                              className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                              aria-label={`Delete ${e.title}`}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </span>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-slate-100 bg-slate-50/40 last:border-0">
                          <td colSpan={5} className="px-4 pb-4 pt-0">
                            <ExpenseDetail e={e} parts={parts} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
        ) : (
          /* By item — one line per thing the shop buys, biggest spend first,
             each one opening to the individual payments behind it. The same
             gas bought four times is one line that says four, not four lines
             you have to add up by eye. */
          <div className="adm-scroll overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[720px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Item</th>
                  <th className={th}>Category</th>
                  <th className={cx(th, "text-right")}>Times</th>
                  <th className={cx(th, "text-right")}>Total</th>
                  <th className={cx(th, "text-right")}>&nbsp;</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const open = openGroups.includes(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr
                        className={cx("border-b border-slate-100 last:border-0", open && "bg-slate-50/70")}
                      >
                        <td className={td}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(g.key)}
                            aria-expanded={open}
                            className="flex min-w-0 items-center gap-2 text-left"
                          >
                            <Icon
                              name="chevron"
                              size={14}
                              className={cx("shrink-0 text-slate-400 transition-transform", open && "rotate-90")}
                            />
                            <b className="text-slate-900">{g.name}</b>
                          </button>
                        </td>
                        <td className={cx(td, "text-slate-600")}>{[...g.categories].join(", ")}</td>
                        <td className={cx(td, "adm-num text-right text-slate-600")}>{g.rows.length}</td>
                        <td className={cx(td, "adm-num text-right font-bold text-slate-900")}>{rupee(g.total)}</td>
                        <td className={cx(td, "text-right")}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(g.key)}
                            aria-expanded={open}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            {open ? "Hide" : "Show"}
                            <Icon name="chevron" size={12} className={cx("transition-transform", open ? "-rotate-90" : "rotate-90")} />
                          </button>
                        </td>
                      </tr>
                      {open &&
                        g.rows.map((e) => (
                          <tr key={e.id} className="border-b border-slate-100 bg-slate-50/40 last:border-0">
                            <td className={cx(td, "whitespace-nowrap pl-10 text-slate-600")}>{e.expenseDate}</td>
                            <td className={cx(td, "break-words text-slate-500")} colSpan={2}>
                              {e.notes || <span className="text-slate-300">—</span>}
                            </td>
                            <td className={cx(td, "adm-num text-right font-semibold text-slate-800")}>{rupee(e.amount)}</td>
                            <td className={cx(td, "text-right")}>
                              <span className="inline-flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setForm({ id: e.id, title: e.title, category: e.category, amount: String(e.amount), expenseDate: e.expenseDate, notes: e.notes })}
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  aria-label={`Edit ${e.title} on ${e.expenseDate}`}
                                >
                                  <Icon name="edit" size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => remove(e)}
                                  className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50"
                                  aria-label={`Delete ${e.title} on ${e.expenseDate}`}
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </span>
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50">
                  <td className={cx(td, "font-bold text-slate-700")} colSpan={3}>
                    Total · {groups.length} item{groups.length === 1 ? "" : "s"}
                  </td>
                  <td className={cx(td, "adm-num text-right text-[15px] font-extrabold text-slate-900")}>{rupee(stats.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Add -------------------------------------------------------
          A box of chips and one price. Tap a name from the row underneath
          and it moves up into the box; tap its × and it drops back down.
          Type a name nobody has used before and it becomes a chip too, and
          joins the row for next month. */}
      <Modal
        open={!!draft}
        onClose={closeDraft}
        title="Add expense"
        footer={
          <>
            <Btn onClick={closeDraft}>Cancel</Btn>
            <Btn kind="red" onClick={saveDraft} disabled={busy}>
              {busy ? "Saving…" : "Add expense"}
            </Btn>
          </>
        }
      >
        {draft && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* The box. Chips first, then a bare input — click anywhere in it
                and you are typing. */}
            <Field label="What was it for" className="sm:col-span-2">
              <div
                className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 transition focus-within:border-red-300 focus-within:ring-2 focus-within:ring-red-100"
                onClick={() => nameRef.current?.focus()}
              >
                {draft.picked.map((name) => (
                  <span
                    key={itemKey(name)}
                    className="inline-flex max-w-full items-center gap-1 rounded-lg bg-red-50 py-1 pl-2.5 pr-1 text-[12.5px] font-bold text-red-700"
                  >
                    <span className="min-w-0 break-words">{name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); unpick(name); }}
                      aria-label={`Take ${name} out`}
                      className="grid h-4 w-4 shrink-0 place-items-center rounded text-red-400 transition hover:bg-red-100 hover:text-red-700"
                    >
                      <Icon name="x" size={11} stroke={2.6} />
                    </button>
                  </span>
                ))}
                <input
                  ref={nameRef}
                  className="min-w-[9rem] flex-1 border-0 bg-transparent px-1 py-1 text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                  value={newName}
                  maxLength={80}
                  placeholder={draft.picked.length ? "Add another…" : "Gas cylinder, October rent…"}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commitTyped(); return; }
                    // Backspace on an empty box lifts the last chip back out,
                    // which is what every tag box does.
                    if (e.key === "Backspace" && !newName && draft.picked.length) {
                      e.preventDefault();
                      unpick(draft.picked[draft.picked.length - 1]);
                    }
                  }}
                />
              </div>
            </Field>

            {/* The row underneath: everything the shop has ever bought, small,
                one tap each. Struck through while it is up in the box. */}
            <div className="sm:col-span-2 -mt-2">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {typed ? "Matching your list" : "Tap to add"}
                </span>
                {draftItems.length > 0 && (
                  <span className="adm-num rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">
                    {shownItems.length === draftItems.length ? draftItems.length : `${shownItems.length} of ${draftItems.length}`}
                  </span>
                )}
              </div>

              {!draftItems.length ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[12px] text-slate-500">
                  Nothing saved yet. Type what the money went on and press Enter — every name is kept, so next month
                  it is sitting here as a one-tap chip.
                </p>
              ) : (
                <div className="adm-scroll max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {typedIsNew && (
                      <button
                        type="button"
                        onClick={commitTyped}
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-2.5 py-1 text-[12.5px] font-bold text-amber-700 transition hover:bg-amber-100"
                      >
                        <Icon name="plus" size={11} stroke={2.6} />
                        {typed}
                      </button>
                    )}
                    {shownItems.map((it) => {
                      const k = itemKey(it.name);
                      const on = pickedKeys.has(k);
                      const facts = itemFacts.get(k);
                      return (
                        <span
                          key={k}
                          className={cx(
                            "inline-flex items-center rounded-lg border py-1 pl-2.5 pr-1 text-[12.5px] font-semibold transition",
                            on ? "border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white text-slate-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleChip(it.name)}
                            aria-pressed={on}
                            title={facts ? `Last time ${rupee(facts.lastAmount)} on ${facts.lastDate}` : "Not bought yet"}
                            className={cx("max-w-[14rem] truncate", on && "line-through")}
                          >
                            {it.name}
                          </button>
                          <button
                            type="button"
                            onClick={() => forgetItem(it)}
                            aria-label={`Take ${it.name} off the list for good`}
                            className="ml-1 grid h-4 w-4 shrink-0 place-items-center rounded text-slate-300 transition hover:bg-slate-200 hover:text-red-600"
                          >
                            <Icon name="x" size={11} stroke={2.6} />
                          </button>
                        </span>
                      );
                    })}
                    {!shownItems.length && !typedIsNew && (
                      <span className="px-1 py-1 text-[12px] text-slate-400">Nothing on the list matches that.</span>
                    )}
                  </div>
                </div>
              )}
              <p className="mt-1.5 text-[11.5px] text-slate-400">
                Tap a name to put it in the box · × on a chip here takes it off the list for good.
              </p>
            </div>

            <Field label="Category">
              <select className={inputCls} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                <option value="">Choose a category…</option>
                {draftCats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Total amount (KD)" hint="What the whole lot cost, not one item.">
              <input
                className={inputCls}
                type="number"
                min={0}
                step="0.001"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </Field>
            <Field label="Date it was paid">
              <input className={inputCls} type="date" value={draft.expenseDate} onChange={(e) => setDraft({ ...draft, expenseDate: e.target.value })} />
            </Field>
            <Field label="Notes">
              <input className={inputCls} value={draft.notes} maxLength={200} placeholder="Optional — invoice number, who was paid…" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      {/* ---- Edit: one existing expense, one plain form ----------------- */}
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title="Edit expense"
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="red" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What was it for" className="sm:col-span-2">
              <input className={inputCls} value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
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
              className={cx(inputCls, "min-w-0 flex-1")}
              value={newCatName}
              maxLength={40}
              placeholder="e.g. Electricity"
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newCatName.trim() && createCategory()}
            />
            <Btn kind="red" className="shrink-0 whitespace-nowrap" disabled={busy || !newCatName.trim()} onClick={createCategory}>
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
