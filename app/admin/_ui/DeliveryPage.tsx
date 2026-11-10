"use client";

// Delivery — where we deliver, and what it costs by WEIGHT.
//
// An area is a name and a list of weight brackets, and nothing else. There is
// no flat fee and no per-area minimum order: you say "0–1 kg costs 0.500,
// 1–2 kg costs 1.000", and that is the whole price list. The checkout adds up
// the weight of the basket (each product's weight comes from Inventory, and a
// product sold in sizes uses the size the customer picked), finds the bracket
// and charges exactly that.
//
// An area with no brackets is not priced, so customers cannot order to it —
// it is flagged here until you give it one.
//
// Nothing else lives here on purpose. A delivery's kitchen life (accept → cook
// → ready → bill → hand to the driver) is Online orders, Open tabs and the
// waiter board; a second board for the same orders only splits attention.

import { useCallback, useEffect, useState } from "react";
import { gramsLabel, tierLabel, type DeliveryArea, type WeightTier } from "../../lib/delivery/shared";
import { useAdmin } from "./Store";
import { staffCall } from "./staffApi";
import { Badge, Btn, Card, Icon, Page, PageHead, cx, inputCls, labelCls } from "./kit";

/** A bracket being edited. Values stay strings so typing "0." works. */
interface TierDraft {
  minG: string;
  maxG: string;
  fee: string;
}

/** An area being edited. */
interface Draft {
  id: string | null;
  name: string;
  active: boolean;
  sort: number;
  tiers: TierDraft[];
}

const toDraft = (a: DeliveryArea): Draft => ({
  id: a.id,
  name: a.name,
  active: a.active,
  sort: a.sort,
  tiers: (a.tiers ?? []).map((t) => ({
    minG: String(t.minG),
    maxG: t.maxG === null ? "" : String(t.maxG),
    fee: String(t.fee),
  })),
});

const toTiers = (rows: TierDraft[]): WeightTier[] =>
  rows
    .filter((t) => t.minG.trim() !== "" || t.maxG.trim() !== "" || t.fee.trim() !== "")
    .map((t) => ({
      minG: Number(t.minG || 0),
      maxG: t.maxG.trim() === "" ? null : Number(t.maxG),
      fee: Number(t.fee || 0),
    }))
    .sort((a, b) => a.minG - b.minG);

/** The gaps and overlaps a human will otherwise find out about at checkout. */
function tierProblems(rows: TierDraft[]): string | null {
  const tiers = toTiers(rows);
  if (tiers.length === 0) return "Add at least one weight bracket — that is what delivery to this area costs.";
  for (const t of tiers) {
    if (t.maxG !== null && t.maxG <= t.minG) return "Each bracket's max weight must be more than its min.";
    if (!Number.isFinite(t.fee) || t.fee < 0) return "A delivery fee can't be negative.";
  }
  for (let i = 1; i < tiers.length; i++) {
    const prev = tiers[i - 1];
    if (prev.maxG === null) return "Only the last bracket can be left open-ended.";
    if (tiers[i].minG < prev.maxG) return "Two brackets overlap — fix the weights.";
    if (tiers[i].minG > prev.maxG) {
      return `Nothing covers ${gramsLabel(prev.maxG)}–${gramsLabel(tiers[i].minG)}. Start the next bracket where the last one ends.`;
    }
  }
  return null;
}

/** "Up to 1 kg · KD 0.500" — one bracket on the collapsed row. */
const kd = (n: number) => `KD ${n.toFixed(3)}`;

export default function DeliveryPage() {
  const { toast, confirm } = useAdmin();
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openArea, setOpenArea] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await staffCall<{ areas: DeliveryArea[] }>("areas.list");
    setRows(r.areas.map(toDraft));
    setDirty(new Set());
  }, []);

  useEffect(() => {
    let alive = true;
    // Deferred to a task so the state lands after this effect has run, not
    // synchronously inside it (which would cascade an extra render).
    const t = setTimeout(() => {
      load().catch((e: Error) => {
        if (alive) {
          setRows([]);
          setError(e.message);
        }
      });
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [load]);

  const head = (
    <PageHead
      title="Delivery areas & prices"
      sub="Where we deliver, and what it costs by weight. The checkout charges exactly what you set here."
    />
  );

  if (!rows)
    return (
      <Page>
        {head}
        <p className="py-10 text-center text-[13px] text-slate-400">Loading areas…</p>
      </Page>
    );

  // New rows have no id yet, so they are tracked by their position.
  const keyOf = (r: Draft, i: number) => r.id ?? `new-${i}`;
  const edit = (i: number, patch: Partial<Draft>) => {
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(new Set(dirty).add(keyOf(rows[i], i)));
  };
  const editTier = (i: number, k: number, patch: Partial<TierDraft>) =>
    edit(i, { tiers: rows[i].tiers.map((t, j) => (j === k ? { ...t, ...patch } : t)) });
  const addTier = (i: number) => {
    const cur = rows[i].tiers;
    const last = cur[cur.length - 1];
    // Start the new bracket where the last one ended — the common case, and
    // the one that leaves no uncovered weight in between.
    const from = last && last.maxG.trim() !== "" ? last.maxG : last ? "" : "0";
    edit(i, { tiers: [...cur, { minG: from, maxG: "", fee: last?.fee ?? "0.500" }] });
  };
  const removeTier = (i: number, k: number) => edit(i, { tiers: rows[i].tiers.filter((_, j) => j !== k) });

  const save = async (i: number) => {
    const r = rows[i];
    const k = keyOf(r, i);
    const problem = tierProblems(r.tiers);
    if (problem) {
      setOpenArea(k);
      toast({ kind: "err", title: problem });
      return;
    }
    setBusy(k);
    try {
      const tiers = toTiers(r.tiers);
      const res = await staffCall<{ id: string; tiersDropped?: boolean }>("areas.save", {
        id: r.id ?? undefined,
        name: r.name,
        // No flat fee and no per-area minimum any more: the brackets are the
        // whole price list. The old `fee` column still gets the lightest
        // bracket's price, so an area stays deliverable at a sensible rate
        // even on a database where the brackets themselves can't be stored
        // yet (supabase/delivery_weight_tiers.sql not run).
        fee: tiers[0]?.fee ?? 0,
        minOrder: null,
        active: r.active,
        sort: r.sort,
        tiers,
      });
      await load();
      if (res?.tiersDropped) {
        toast({
          kind: "err",
          title: `${r.name} saved, but the weight brackets could not be stored — run supabase/delivery_weight_tiers.sql in Supabase.`,
        });
      } else {
        toast({ kind: "ok", title: `${r.name} saved.` });
      }
    } catch (e) {
      toast({ kind: "err", title: (e as Error).message });
    }
    setBusy(null);
  };

  const remove = async (i: number) => {
    const r = rows[i];
    if (!r.id) {
      setRows(rows.filter((_, j) => j !== i));
      return;
    }
    const ok = await confirm({
      title: `Delete “${r.name}”?`,
      body: "Customers can no longer pick this area at checkout. Past orders keep the area name they were placed with.",
      ok: "Delete area",
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await staffCall("areas.delete", { id: r.id });
      await load();
      toast({ kind: "ok", title: "Area deleted." });
    } catch (e) {
      toast({ kind: "err", title: (e as Error).message });
    }
    setBusy(null);
  };

  const addRow = () => {
    // A new area starts with one open bracket, so it is priced the moment it
    // is saved instead of being born broken.
    setRows([...rows, { id: null, name: "", active: true, sort: rows.length + 1, tiers: [{ minG: "0", maxG: "", fee: "0.500" }] }]);
    setOpenArea(`new-${rows.length}`);
  };

  const unpriced = rows.filter((r) => r.id && toTiers(r.tiers).length === 0).length;

  return (
    <Page>
      {head}

      {error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          {error}
        </div>
      )}

      {unpriced > 0 && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          {unpriced === 1 ? "One area has" : `${unpriced} areas have`} no weight brackets, so customers cannot order
          there. Add a bracket to each, or switch the area off.
        </div>
      )}

      <Card title="Where we deliver, and what it costs">
        <p className="mb-4 text-[13px] leading-relaxed text-slate-500">
          An area is a name and its <b>weight brackets</b> — nothing else. Say what each weight range costs (for
          example <b>0–1000 g → KD 0.500</b>) and the checkout adds up how heavy the basket is, finds the bracket and
          charges that. Product weights come from Inventory; a product sold in sizes uses the size the customer picked.
          Switch an area off to hide it from customers without losing it.
        </p>

        {!rows.length && <p className="mb-4 text-[13px] text-slate-500">No areas yet — add your first one below.</p>}

        <div className="flex flex-col gap-3">
          {rows.map((r, i) => {
            const k = keyOf(r, i);
            const open = openArea === k;
            const tiers = toTiers(r.tiers);
            return (
              <div key={k} className={cx("rounded-2xl border", r.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50")}>
                <div className="grid grid-cols-2 items-end gap-3 p-3 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-6">
                    <span className={labelCls}>Area name</span>
                    <input className={inputCls} value={r.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="For example Salmiya" />
                  </div>
                  <label className="flex items-center gap-2 pb-3 text-[13px] font-semibold text-slate-700 sm:col-span-2">
                    <input type="checkbox" checked={r.active} onChange={(e) => edit(i, { active: e.target.checked })} /> On
                  </label>
                  <div className="col-span-2 flex justify-end gap-2 sm:col-span-4">
                    <Btn kind={dirty.has(k) || !r.id ? "red" : "ghost"} disabled={busy === k || !r.name.trim()} onClick={() => save(i)}>
                      {busy === k ? "Saving…" : r.id ? "Save" : "Add area"}
                    </Btn>
                    <Btn kind="plain" className="text-red-600" disabled={busy === k} onClick={() => remove(i)} aria-label={`Delete ${r.name || "area"}`}>
                      <Icon name="trash" size={16} />
                    </Btn>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setOpenArea(open ? null : k)}
                  className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <Icon name="chevron" size={14} className={cx("transition-transform", open && "rotate-90")} />
                  Weight brackets
                  {tiers.length ? (
                    <Badge tone="green">{tiers.length} bracket{tiers.length === 1 ? "" : "s"}</Badge>
                  ) : (
                    <Badge tone="red">no price set</Badge>
                  )}
                  {/* The whole price list at a glance, without opening the row. */}
                  {!open && tiers.length > 0 && (
                    <span className="adm-num ml-1 truncate text-[12px] font-medium text-slate-400">
                      {tiers.map((t) => `${tierLabel(t)} · ${kd(t.fee)}`).join("   ·   ")}
                    </span>
                  )}
                </button>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
                    <p className="mb-3 text-[12px] text-slate-500">
                      Weights are in grams (1 kg = 1000 g). Each bracket starts where the one before it ends. Leave the
                      last bracket&rsquo;s <b>max</b> empty for &ldquo;and anything heavier&rdquo;.
                    </p>

                    {r.tiers.length > 0 && (
                      <div className="mb-2 hidden grid-cols-12 gap-2 px-1 sm:grid">
                        <span className={cx(labelCls, "col-span-4 mb-0")}>Min weight (g)</span>
                        <span className={cx(labelCls, "col-span-4 mb-0")}>Max weight (g)</span>
                        <span className={cx(labelCls, "col-span-3 mb-0")}>Delivery fee (KD)</span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2">
                      {r.tiers.map((t, tIdx) => (
                        <div key={tIdx} className="grid grid-cols-12 items-center gap-2">
                          <input
                            type="number" min="0" step="50"
                            className={cx(inputCls, "col-span-4")}
                            value={t.minG}
                            onChange={(e) => editTier(i, tIdx, { minG: e.target.value })}
                            placeholder="0"
                            aria-label={`Bracket ${tIdx + 1} minimum weight in grams`}
                          />
                          <input
                            type="number" min="0" step="50"
                            className={cx(inputCls, "col-span-4")}
                            value={t.maxG}
                            onChange={(e) => editTier(i, tIdx, { maxG: e.target.value })}
                            placeholder="and above"
                            aria-label={`Bracket ${tIdx + 1} maximum weight in grams`}
                          />
                          <input
                            type="number" min="0" step="0.05"
                            className={cx(inputCls, "col-span-3")}
                            value={t.fee}
                            onChange={(e) => editTier(i, tIdx, { fee: e.target.value })}
                            placeholder="0.500"
                            aria-label={`Bracket ${tIdx + 1} delivery fee`}
                          />
                          <button
                            type="button"
                            onClick={() => removeTier(i, tIdx)}
                            className="col-span-1 grid h-10 place-items-center rounded-xl text-red-600 hover:bg-red-50"
                            aria-label={`Remove bracket ${tIdx + 1}`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* What the customer will actually be shown, in their words. */}
                    {tiers.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2">
                        {tiers.map((t, tIdx) => (
                          <li key={tIdx} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600">
                            {tierLabel(t)} · <b className="adm-num text-slate-800">{kd(t.fee)}</b>
                          </li>
                        ))}
                      </ul>
                    )}

                    {!r.tiers.length && (
                      <p className="text-[12.5px] font-semibold text-red-600">
                        No brackets yet, so {r.name || "this area"} has no delivery price and customers cannot choose
                        it. Add one below.
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn kind="soft" icon="plus" size="sm" onClick={() => addTier(i)}>
                        Add weight bracket
                      </Btn>
                      <Btn kind="red" size="sm" disabled={busy === k || !r.name.trim()} onClick={() => save(i)}>
                        {busy === k ? "Saving…" : "Save brackets"}
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Btn kind="soft" icon="plus" className="mt-4" onClick={addRow}>
          Add area
        </Btn>
      </Card>
    </Page>
  );
}
