"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleProducts,
  getWholesaleProductsSnapshot,
  getWholesaleProductsServerSnapshot,
  saveWholesaleProduct,
  deleteWholesaleProduct,
  unitPriceLabel,
  type WholesaleProduct,
  type WholesaleUnit,
} from "../../lib/wholesaleStore";
import { useAdmin } from "./Store";
import { rupee } from "./money";
import {
  Page, PageHead, Card, Btn, Field, Modal, Badge, Empty, SearchBox,
  inputCls, labelCls, cx,
} from "./kit";

type Draft = {
  id?: string;
  name: string;
  category: string;
  unit: WholesaleUnit;
  wholesalePrice: string;
  retailPrice: string;
  cost: string;
  active: boolean;
};

const blank: Draft = { name: "", category: "", unit: "piece", wholesalePrice: "", retailPrice: "", cost: "", active: true };

export default function WholesaleInventoryPage() {
  const { toast, confirm } = useAdmin();
  const products = useSyncExternalStore(subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot);

  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
    [products],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.category.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, q]);

  const edit = (p: WholesaleProduct) =>
    setDraft({
      id: p.id, name: p.name, category: p.category, unit: p.unit,
      wholesalePrice: String(p.wholesalePrice), retailPrice: String(p.retailPrice),
      cost: p.cost ? String(p.cost) : "", active: p.active,
    });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    const res = await saveWholesaleProduct({
      id: draft.id,
      name: draft.name,
      category: draft.category,
      unit: draft.unit,
      wholesalePrice: parseFloat(draft.wholesalePrice) || 0,
      retailPrice: parseFloat(draft.retailPrice) || 0,
      cost: parseFloat(draft.cost) || 0,
      active: draft.active,
    });
    setBusy(false);
    if (res.ok) { toast({ kind: "ok", title: draft.id ? "Product updated" : "Product added" }); setDraft(null); }
    else toast({ kind: "err", title: "Couldn't save", body: res.error });
  };

  const remove = async (p: WholesaleProduct) => {
    if (!(await confirm({ title: "Delete product?", body: `"${p.name}" will be removed from the wholesale catalogue.`, ok: "Delete", danger: true }))) return;
    const res = await deleteWholesaleProduct(p.id);
    if (res.ok) toast({ kind: "ok", title: "Product deleted" });
    else toast({ kind: "err", title: "Couldn't delete", body: res.error });
  };

  return (
    <Page>
      <PageHead
        bar
        title="Wholesale inventory"
        sub="The goods you sell to trade customers. Just a name, a unit and the price — no stock, no images."
        right={<Btn kind="red" icon="plus" onClick={() => setDraft({ ...blank })}>Add product</Btn>}
      />

      <div className="mb-4 max-w-sm">
        <SearchBox value={q} onChange={setQ} placeholder="Search products or categories…" />
      </div>

      {shown.length === 0 ? (
        <Empty icon="box" title={products.length === 0 ? "No products yet" : "Nothing matches"}>
          {products.length === 0 ? "Add your first wholesale product to start billing." : "Try a different search."}
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <Card key={p.id} className={cx(!p.active && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <b className="truncate text-[15px] text-slate-900">{p.name}</b>
                    {!p.active && <Badge tone="slate">Hidden</Badge>}
                  </div>
                  {p.category && <p className="mt-0.5 text-[12px] text-slate-500">{p.category}</p>}
                </div>
                <Badge tone={p.unit === "gram" ? "violet" : "sky"}>{p.unit === "gram" ? "By weight" : "By piece"}</Badge>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
                <div>
                  <span className="adm-num text-[18px] font-extrabold text-slate-900">{rupee(p.wholesalePrice)}</span>
                  <span className="ml-1 text-[11px] text-slate-400">{unitPriceLabel(p.unit)}</span>
                  {p.retailPrice > 0 && <p className="mt-0.5 text-[11px] text-slate-400">Retail ref {rupee(p.retailPrice)}</p>}
                </div>
                <div className="flex gap-1">
                  <Btn kind="ghost" size="sm" icon="edit" onClick={() => edit(p)} aria-label="Edit">Edit</Btn>
                  <Btn kind="ghost" size="sm" icon="trash" onClick={() => remove(p)} aria-label="Delete" className="!px-2" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit product" : "Add product"}
        footer={
          <>
            <Btn onClick={() => setDraft(null)}>Cancel</Btn>
            <Btn kind="red" onClick={save} disabled={busy || !draft?.name.trim()}>{busy ? "Saving…" : "Save"}</Btn>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Product name" required>
              <input className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Chocolate cake" autoFocus />
            </Field>

            <Field label="Category" hint="Free text — reuse an existing one from the list.">
              <input className={inputCls} list="wh-cats" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Cakes" />
              <datalist id="wh-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>

            <div>
              <span className={labelCls}>Sold by</span>
              <div className="flex gap-2">
                {(["piece", "gram"] as WholesaleUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDraft({ ...draft, unit: u })}
                    className={cx(
                      "h-10 flex-1 rounded-xl border text-[13px] font-semibold capitalize transition",
                      draft.unit === u ? "border-red-600 bg-red-50 text-red-600" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                    )}
                  >
                    {u === "gram" ? "Gram (weight)" : "Piece"}
                  </button>
                ))}
              </div>
              <span className="mt-1 block text-[11px] text-slate-400">
                {draft.unit === "gram" ? "Price is per 100 g. On a bill you enter the weight in grams." : "Price is per piece. On a bill you enter the number of pieces."}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Wholesale price" required hint={unitPriceLabel(draft.unit)}>
                <input className={inputCls} type="number" min={0} step="0.001" inputMode="decimal" value={draft.wholesalePrice} onChange={(e) => setDraft({ ...draft, wholesalePrice: e.target.value })} placeholder="0.000" />
              </Field>
              <Field label="Normal price" hint="Retail reference only">
                <input className={inputCls} type="number" min={0} step="0.001" inputMode="decimal" value={draft.retailPrice} onChange={(e) => setDraft({ ...draft, retailPrice: e.target.value })} placeholder="0.000" />
              </Field>
              <Field label="Cost price" hint="Optional · for profit">
                <input className={inputCls} type="number" min={0} step="0.001" inputMode="decimal" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} placeholder="0.000" />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4 accent-red-600" />
              Available for billing
            </label>
          </div>
        )}
      </Modal>
    </Page>
  );
}
