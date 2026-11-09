"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AdminState, Product } from "./types";
import { rupee } from "./money";
import { BEST_SELLER_SLOTS, useAdmin } from "./Store";
import { Badge, Btn, Empty, Field, Icon, Kpi, Modal, Page, PageHead, SearchBox, Switch, cx, inputCls } from "./kit";
import { playAlertSound } from "../../lib/sound";
import { MENU_UNITS, variantLabel, type MenuUnit, type MenuVariant } from "../../lib/menuStore";

/* ── Stock-alert preferences ───────────────────────────────────────────────
   Two separate switches, because they annoy two different people: the sound
   carries across the shop, the pop-up stops whoever is mid-edit. Either can
   be off without touching the other. Kept in localStorage so the choice is
   per-device — the till in the kitchen can be loud while the office is not. */
const PREF_SOUND = "rr-inv-alert-sound";
const PREF_POPUP = "rr-inv-alert-popup";

/** Read a boolean pref, defaulting to on. */
function readPref(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function writePref(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {}
}

const IMAGE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB per image, as agreed with the client.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("read failed"));
    r.onload = () => resolve(String(r.result ?? ""));
    r.readAsDataURL(f);
  });

/* One size row while it is being typed. Numbers stay strings until save, so a
   half-typed "1." doesn't become 1 under the cursor. */
type SizeRow = { id: string; amount: string; unit: MenuUnit; price: string; stock: string };

type Form = {
  id?: string;
  name: string;
  category: string;
  price: string;
  weightGrams: string;
  track: boolean;
  stock: string;
  lowAt: string;
  description: string;
  image: string;
  tags: string[];
  active: boolean;
  /** Sizes. Empty = this product is sold as one thing. */
  sizes: SizeRow[];
};

const EMPTY: Form = { name: "", category: "", price: "", weightGrams: "", track: true, stock: "10", lowAt: "4", description: "", image: "", tags: [], active: true, sizes: [] };

const newSizeId = () => `v-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;

/** The sizes a new product starts with when the admin turns sizes on — the
 *  three a cake shop actually sells, so the common case is two taps. */
const STARTER_SIZES = (): SizeRow[] => [
  { id: newSizeId(), amount: "500", unit: "g", price: "", stock: "0" },
  { id: newSizeId(), amount: "1", unit: "kg", price: "", stock: "0" },
];

const toSizeRows = (variants: MenuVariant[]): SizeRow[] =>
  variants.map((v) => ({
    id: v.id,
    amount: String(v.amount),
    unit: v.unit,
    price: String(v.price),
    stock: v.stock == null ? "" : String(v.stock),
  }));

/** Form rows → what gets saved. Anything without a real amount is dropped. */
function toVariants(rows: SizeRow[]): MenuVariant[] {
  return rows
    .map((r) => {
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount <= 0) return null;
      const stock = r.stock.trim() === "" ? null : Number(r.stock);
      return {
        id: r.id,
        amount,
        unit: r.unit,
        price: Number(r.price) || 0,
        stock: stock == null || !Number.isFinite(stock) ? null : stock,
      } satisfies MenuVariant;
    })
    .filter((v): v is MenuVariant => v !== null);
}
/* "Best seller" is the one tag that does anything: it puts the product in the
   four slots on the landing page. The old "New" chip was decoration — nothing
   anywhere read it — so it is gone. */
const TAGS = [["bestseller", "★ Best seller"]] as const;
const thumb = (src: string) => (src.includes("images.unsplash.com") ? src.replace(/([?&])w=\d+/, "$1w=120") : src);

const th = "px-4 py-3.5 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500 whitespace-nowrap";
const td = "px-4 py-3 text-[13px]";

/* Table-ish list of products — shown inside a KPI tile's modal when the user
   taps "Low stock", "Sold out" or "On the menu" to see what's behind the number. */
function ProductSummaryList({ products, empty, showStock, showStatus }: { products: Product[]; empty: string; showStock?: boolean; showStatus?: boolean }) {
  if (!products.length) return <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-[13px] text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
      {products.map((p) => (
        <li key={p.id} className="flex items-center gap-3 bg-white px-3 py-2.5">
          {p.image ? <img src={thumb(p.image)} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" loading="lazy" /> : <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 font-bold text-slate-400">{p.name[0]}</span>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold text-slate-900">{p.name}</p>
            <p className="truncate text-[11.5px] text-slate-500">{p.category} · {rupee(p.price)}</p>
          </div>
          <div className="shrink-0 text-right text-[12px]">
            {showStock && (
              <span className={cx("adm-num font-bold", p.stock === 0 ? "text-red-600" : p.stock !== null && p.stock <= p.lowAt ? "text-amber-600" : "text-slate-700")}>
                {p.stock === null ? "∞" : p.stock} {p.stock !== null && "left"}
              </span>
            )}
            {showStatus && (p.active ? <Badge tone="green">On menu</Badge> : <Badge tone="slate">Hidden</Badge>)}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* Image chooser: one photo per product. Takes a file (up to 4 MB) and stores it
   as a base64 data URL on the product, or accepts a pasted link. The × button
   clears it. Everything stays on `form.image`, which both the form preview and
   the catalog already know how to render. */
function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { toast } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pickFile = async (f: File | null | undefined) => {
    if (!f) return;
    if (!IMAGE_TYPES.includes(f.type)) {
      toast({ kind: "err", title: "That file type is not supported.", body: "Use JPEG, PNG, WebP or GIF." });
      return;
    }
    if (f.size > IMAGE_MAX_BYTES) {
      toast({ kind: "err", title: "That image is too big.", body: `Keep it under 4 MB — this one is ${(f.size / 1024 / 1024).toFixed(1)} MB.` });
      return;
    }
    setBusy(true);
    try {
      onChange(await fileToDataUrl(f));
    } catch {
      toast({ kind: "err", title: "Couldn't read that image." });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = ""; // let the same file be picked again after delete
    }
  };

  const uploaded = value.startsWith("data:");

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" kind="soft" icon="download" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Reading…" : value ? "Replace image" : "Upload image"}
        </Btn>
        {value && (
          <Btn size="sm" kind="red" icon="trash" onClick={() => onChange("")}>
            Remove
          </Btn>
        )}
        <span className="text-[11.5px] text-slate-400">One image · up to 4 MB</span>
      </div>
      <input
        className={inputCls}
        value={uploaded ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={uploaded ? "Uploaded image in use — clear it to paste a link" : "or paste an image URL (https://…)"}
        disabled={uploaded}
      />
    </div>
  );
}

type StockFilter = "all" | "menu" | "hidden" | "low" | "out";

/* What the screen should show the instant a stock button is pressed; the server
   confirms (and corrects, if it has to) in the background. */
const withStock = (id: string, next: (now: number) => number) => (st: AdminState): AdminState => ({
  ...st,
  products: st.products.map((p) => (p.id === id && p.stock !== null ? { ...p, stock: Math.max(0, next(p.stock)) } : p)),
});
const stepBy = (id: string, delta: number) => ({ optimistic: withStock(id, (n) => n + delta) });

function StockCell({ p }: { p: Product }) {
  const { act } = useAdmin();
  const [edit, setEdit] = useState<string | null>(null);
  if (p.stock === null)
    return (
      <span className="inline-flex items-center gap-2 text-slate-400">
        ∞ <span className="text-[11px]">untracked</span>
      </span>
    );
  const tone = p.stock <= 0 ? "text-red-600" : p.stock <= p.lowAt ? "text-amber-600" : "text-slate-900";
  const commit = () => {
    if (edit !== null && edit.trim() !== "" && Number(edit) !== p.stock) act("product.stock", { id: p.id, set: Number(edit) }, { optimistic: withStock(p.id, () => Number(edit)) });
    setEdit(null);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => act("product.stock", { id: p.id, delta: -1 }, stepBy(p.id, -1))} disabled={p.stock <= 0} aria-label={`One less ${p.name}`}>
        <Icon name="minus" size={13} />
      </button>
      {edit !== null ? (
        <input
          autoFocus
          className="h-7 w-14 rounded-lg border border-slate-400 text-center text-[13px] font-bold outline-none"
          value={edit}
          inputMode="numeric"
          onChange={(e) => setEdit(e.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEdit(null);
          }}
        />
      ) : (
        <button type="button" title="Click to set exact stock" className={cx("h-7 min-w-14 rounded-lg px-2 text-center text-[14px] font-extrabold hover:bg-slate-100", tone)} onClick={() => setEdit(String(p.stock))}>
          {p.stock}
        </button>
      )}
      <button type="button" className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => act("product.stock", { id: p.id, delta: 1 }, stepBy(p.id, 1))} aria-label={`One more ${p.name}`}>
        <Icon name="plus" size={13} />
      </button>
    </span>
  );
}

export default function InventoryPage() {
  const { s, act, confirm, toast, categories } = useAdmin();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  const [renameOf, setRenameOf] = useState<string | null>(null);
  const [renaming, setRenaming] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [alertOpen, setAlertOpen] = useState(false);
  // Default to on; the real stored value is read after mount so the server and
  // the first client render agree (localStorage doesn't exist on the server).
  const [soundOn, setSoundOn] = useState(true);
  const [popupOn, setPopupOn] = useState(true);
  /* Until this is true, `soundOn` is still the SSR default rather than what
     the user actually chose — and acting on it is what made a muted alert
     play anyway on every visit. Nothing makes a noise before the switch is
     known. */
  const [prefsReady, setPrefsReady] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSoundOn(readPref(PREF_SOUND));
    setPopupOn(readPref(PREF_POPUP));
    setPrefsReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const cats = categories;
  const low = s.products.filter((p) => p.stock !== null && p.stock > 0 && p.stock <= p.lowAt);
  const out = s.products.filter((p) => p.stock !== null && p.stock <= 0);

  /* Opening Inventory with something sold out or running low puts it in front
     of you once, rather than leaving it to a small number in the corner. The
     stores hydrate a tick after mount, so this waits for real data and then
     fires exactly once per visit. */
  const alerted = useRef(false);
  const lowCount = low.length;
  const outCount = out.length;
  useEffect(() => {
    if (alerted.current || s.products.length === 0) return;
    alerted.current = true;
    // Opening once off freshly-hydrated store data is the whole point here,
    // and the ref guard stops it cascading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lowCount + outCount > 0 && popupOn) setAlertOpen(true);
  }, [s.products.length, lowCount, outCount, popupOn]);

  /* The sound marks ONE event: a product that had stock a moment ago has just
     hit zero. Opening the page is not that event — the pop-up and the red
     "Sold out" tile already say what is out — so the first scan only records
     a baseline and stays quiet. After that, any product newly joining the
     sold-out list rings once. Tracked by product id, not by the count, or
     selling out one thing while restocking another would stay silent. */
  const outIds = useMemo(() => out.map((p) => p.id).sort().join(","), [out]);
  const knownOut = useRef<Set<string> | null>(null);
  // Read through a ref so the effect does NOT re-run when the switch is
  // flipped: flipping it is not a product going out of stock.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);
  useEffect(() => {
    if (!prefsReady || s.products.length === 0) return;
    const now = new Set(outIds ? outIds.split(",") : []);
    const baseline = knownOut.current === null;
    const justWentOut = !baseline && [...now].some((id) => !knownOut.current!.has(id));
    knownOut.current = now;
    if (justWentOut) playAlertSound(!soundOnRef.current);
  }, [outIds, s.products.length, prefsReady]);
  const bestsellerCount = s.products.filter((p) => p.tags.includes("bestseller") && p.id !== form?.id).length;
  const BESTSELLER_CAP = BEST_SELLER_SLOTS;

  const list = s.products.filter((p) => {
    if (cat !== "All" && p.category !== cat) return false;
    if (q && !`${p.name} ${p.category} ${p.description}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "menu") return p.active;
    if (filter === "hidden") return !p.active;
    if (filter === "low") return p.stock !== null && p.stock > 0 && p.stock <= p.lowAt;
    if (filter === "out") return p.stock !== null && p.stock <= 0;
    return true;
  });

  const open = (p?: Product) => openForm(p);
  const openForm = (p?: Product) =>
    setForm(
      p
        ? {
            id: p.id,
            name: p.name,
            category: p.category,
            price: String(p.price),
            weightGrams: p.weightGrams == null ? "" : String(p.weightGrams),
            track: p.stock !== null,
            stock: p.stock === null ? "10" : String(p.stock),
            lowAt: String(p.lowAt),
            description: p.description,
            image: p.image,
            tags: p.tags,
            active: p.active,
            sizes: toSizeRows(p.variants ?? []),
          }
        : { ...EMPTY, category: cat !== "All" ? cat : cats[0] ?? "" },
    );

  const renameCat = async (from: string) => {
    const to = renaming.trim();
    setRenaming("");
    setRenameOf(null);
    if (!to || to === from) return;
    const r = await act("category.rename", { from, to });
    if (!r.ok) return toast({ kind: "err", title: r.error });
    toast({ kind: "ok", title: `Renamed to ${to}` });
    if (cat === from) setCat(to);
  };

  /* A category is saved in its own right now. It used to be "whatever string a
     product happens to carry", so creating one with no products in it did
     nothing at all and it vanished the moment the dialog closed. */
  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setBusy(true);
    const r = await act("category.create", { name });
    setBusy(false);
    if (!r.ok) return toast({ kind: "err", title: r.error });
    setNewCatName("");
    toast({ kind: "ok", title: `Category "${name}" created.` });
  };

  const removeCategory = async (name: string) => {
    const ok = await confirm({ title: `Delete the "${name}" category?`, body: "It only disappears from the list — no product is deleted.", ok: "Delete category", danger: true });
    if (!ok) return;
    const r = await act("category.delete", { name });
    if (!r.ok) return toast({ kind: "err", title: r.error });
    if (cat === name) setCat("All");
    toast({ kind: "ok", title: `"${name}" deleted.` });
  };

  const save = async () => {
    if (!form) return;
    const variants = toVariants(form.sizes);
    // A size with no price is a product the till cannot ring up. Say so here
    // rather than saving a 0.000 that somebody discovers at the counter.
    if (form.sizes.length > 0) {
      if (variants.length === 0) {
        return toast({ kind: "err", title: "Give each size an amount, or turn sizes off." });
      }
      const unpriced = variants.find((v) => v.price <= 0);
      if (unpriced) {
        return toast({ kind: "err", title: `What does the ${variantLabel(unpriced)} cost?` });
      }
      const seen = new Set<string>();
      for (const v of variants) {
        const key = variantLabel(v);
        if (seen.has(key)) return toast({ kind: "err", title: `There are two ${key} sizes. Each size has to be different.` });
        seen.add(key);
      }
    }
    setBusy(true);
    const r = await act<Product>("product.save", {
      ...form,
      variants,
      // With sizes, the price and the count both come from the sizes.
      price: variants.length ? Math.min(...variants.map((v) => v.price)) : Number(form.price) || 0,
      stock: variants.length ? null : form.track ? form.stock : null,
      weightGrams: form.weightGrams.trim() === "" ? null : Number(form.weightGrams),
    });
    setBusy(false);
    if (!r.ok) {
      // Say what went wrong instead of leaving the form open with no reason.
      toast({ kind: "err", title: r.error });
      return;
    }
    const name = r.result?.name || form.name.trim() || "Product";
    toast({ kind: "ok", title: form.id ? `${name} saved` : `${name} added${form.active ? " to the menu" : ""}` });
    setForm(null);
  };

  return (
    <Page>
      <PageHead
        title="Inventory"
        sub="Only products that are on the menu show up on the guest menu."
        right={
          <span className="flex flex-wrap gap-2">
            <Btn icon="plus" onClick={() => setManageCats(true)}>
              Create category
            </Btn>
            <Btn kind="red" icon="plus" onClick={() => open()}>
              Add product
            </Btn>
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-3">
        <Kpi
          label="On the menu"
          value={`${s.products.filter((p) => p.active).length} / ${s.products.length}`}
          hint="Visible to guests"
          icon="box"
          tone="emerald"
          details={<ProductSummaryList products={s.products} empty="No products yet." showStatus />}
        />
        <Kpi
          label="Low stock"
          value={low.length}
          hint="At or below alert level"
          icon="alert"
          tone={low.length ? "amber" : "slate"}
          details={<ProductSummaryList products={low} empty="Nothing is running low — stock levels look healthy." showStock />}
        />
        <Kpi
          label="Sold out"
          value={out.length}
          hint="Shown as sold out"
          icon="x"
          tone={out.length ? "red" : "slate"}
          details={<ProductSummaryList products={out} empty="Nothing is sold out right now." showStock />}
        />
      </div>

      {/* How this screen tells you something ran out. Both are on by default
          and remembered on this device. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <Icon name="alert" size={14} /> Out-of-stock alerts
        </span>
        <label className="flex items-center gap-2.5 text-[12.5px] font-semibold text-slate-700">
          <Switch
            on={soundOn}
            onChange={(v) => {
              setSoundOn(v);
              writePref(PREF_SOUND, v);
              // Play it on the way ON, so they hear what they just switched on
              // (and the click counts as the gesture browsers want before audio).
              if (v) playAlertSound(false);
            }}
            label="Alert sound when a product runs out"
          />
          Alert sound
          <span className="text-[11.5px] font-normal text-slate-400">{soundOn ? "plays when something hits zero" : "muted"}</span>
        </label>
        <label className="flex items-center gap-2.5 text-[12.5px] font-semibold text-slate-700">
          <Switch
            on={popupOn}
            onChange={(v) => {
              setPopupOn(v);
              writePref(PREF_POPUP, v);
              if (!v) setAlertOpen(false);
            }}
            label="Sold-out pop-up on opening Inventory"
          />
          Sold-out pop-up
          <span className="text-[11.5px] font-normal text-slate-400">{popupOn ? "opens on arrival" : "off"}</span>
        </label>
        <button
          type="button"
          onClick={() => playAlertSound(false)}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50"
        >
          <Icon name="bell" size={13} /> Test sound
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="adm-scroll flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          {["All", ...cats].map((c) => {
            const n = c === "All" ? s.products.length : s.products.filter((p) => p.category === c).length;
            const on = cat === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cx(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-[12.5px] font-semibold transition",
                  on
                    ? "border-slate-900 bg-slate-900 text-white shadow-[0_4px_14px_-6px_rgba(15,23,42,.6)]"
                    : "border-transparent bg-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-50",
                )}
              >
                <span className="truncate">{c}</span>
                <span className={cx("adm-num rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums", on ? "bg-white/15 text-white/90" : "bg-white text-slate-500")}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <select className="h-11 rounded-full border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 outline-none focus:border-slate-400" value={filter} onChange={(e) => setFilter(e.target.value as StockFilter)} aria-label="Filter">
            <option value="all">All products</option>
            <option value="menu">On the menu</option>
            <option value="hidden">Hidden</option>
            <option value="low">Low stock</option>
            <option value="out">Sold out</option>
          </select>
          <SearchBox value={q} onChange={setQ} placeholder="Search products…" className="w-full sm:w-64" />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-[0_2px_10px_-2px_rgba(15,23,42,.08)]">
        <div className="adm-scroll overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Product</th>
                <th className={th}>Category</th>
                <th className={th}>Price</th>
                <th className={th}>Stock</th>
                <th className={th}>On menu</th>
                <th className={cx(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={cx("border-b border-slate-100 last:border-0 hover:bg-slate-50/50", !p.active && "opacity-60")}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      {p.image ? <img src={thumb(p.image)} alt="" className="h-11 w-11 rounded-xl object-cover" loading="lazy" /> : <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 font-bold text-slate-400">{p.name[0]}</span>}
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-semibold text-slate-900">
                          {p.name}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-1">
                          {p.tags.map((t) => (
                            <Badge key={t} tone={t === "bestseller" ? "amber" : "violet"}>
                              {t}
                            </Badge>
                          ))}
                          {p.stock !== null && p.stock <= 0 ? <Badge tone="red">Sold out</Badge> : p.stock !== null && p.stock <= p.lowAt ? <Badge tone="amber">Low</Badge> : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={cx(td, "text-slate-600")}>{p.category}</td>
                  <td className={cx(td, "font-bold text-slate-900")}>{rupee(p.price)}</td>
                  <td className={td}>
                    <StockCell p={p} />
                  </td>
                  <td className={td}>
                    <Switch on={p.active} onChange={() => act("product.toggle", { id: p.id })} label={`${p.name} on the menu`} />
                  </td>
                  <td className={cx(td, "text-right")}>
                    <span className="inline-flex gap-1">
                      <Btn size="sm" kind="plain" icon="edit" onClick={() => open(p)}>
                        Edit
                      </Btn>
                      <Btn
                        size="sm"
                        kind="plain"
                        className="text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (await confirm({ title: `Delete ${p.name}?`, body: "It disappears from the menu and catalog. Past orders and bills keep their copy. To hide it for a while, switch “On menu” off instead.", ok: "Delete", danger: true }))
                            act("product.delete", { id: p.id });
                        }}
                        aria-label={`Delete ${p.name}`}
                      >
                        <Icon name="trash" size={14} />
                      </Btn>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && (
            <Empty icon="box" title={s.products.length ? "No products match" : "Your inventory is empty"}>
              {s.products.length ? "Try another filter." : "Add products — they appear on the guest menu straight away."}
            </Empty>
          )}
        </div>
      </div>

      <Modal
        open={alertOpen && popupOn}
        onClose={() => setAlertOpen(false)}
        title={out.length ? "Some products are sold out" : "Some products are running low"}
        footer={
          <>
            <Btn onClick={() => setAlertOpen(false)}>Close</Btn>
            <Btn
              kind="red"
              onClick={() => {
                setFilter(out.length ? "out" : "low");
                setCat("All");
                setAlertOpen(false);
              }}
            >
              Show me {out.length ? "what's sold out" : "what's low"}
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          {out.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-red-600">
                Sold out · {out.length} — guests can&rsquo;t order these
              </p>
              <ProductSummaryList products={out} empty="" showStock />
            </div>
          )}
          {low.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-amber-600">
                Running low · {low.length}
              </p>
              <ProductSummaryList products={low} empty="" showStock />
            </div>
          )}
        </div>
      </Modal>

      <Modal open={manageCats} onClose={() => (setManageCats(false), setNewCatName(""))} title="Manage categories" footer={<Btn onClick={() => (setManageCats(false), setNewCatName(""))}>Done</Btn>}>
        <div className="mb-4 rounded-xl border border-dashed border-slate-200 p-3">
          <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Create category</span>
          <div className="flex gap-2">
            <input className={inputCls} value={newCatName} maxLength={40} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createCategory()} placeholder="e.g. Cold drinks" />
            <Btn kind="red" disabled={busy || !newCatName.trim()} onClick={createCategory}>
              Create
            </Btn>
          </div>
          <p className="mt-2 text-[11.5px] text-slate-500">The category is saved straight away — it stays here even with no products in it, and shows up in the product form.</p>
        </div>
        <ul className="grid gap-2">
          {cats.map((c) => (
            <li key={c} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-2.5">
              {renameOf === c ? (
                <>
                  <input className={inputCls} autoFocus value={renaming} maxLength={40} onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameCat(c)} />
                  <Btn size="sm" kind="red" disabled={!renaming.trim()} onClick={() => renameCat(c)}>
                    Save
                  </Btn>
                  <Btn size="sm" onClick={() => setRenameOf(null)}>
                    Cancel
                  </Btn>
                </>
              ) : (
                <>
                  <span className="flex-1 font-semibold text-slate-800">{c}</span>
                  <span className="text-[12px] text-slate-500">{s.products.filter((p) => p.category === c).length} items</span>
                  <Btn
                    size="sm"
                    kind="plain"
                    icon="edit"
                    onClick={() => {
                      setRenameOf(c);
                      setRenaming(c);
                    }}
                  >
                    Rename
                  </Btn>
                  <button
                    type="button"
                    onClick={() => removeCategory(c)}
                    aria-label={`Delete the ${c} category`}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-red-600 transition hover:bg-red-50"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </>
              )}
            </li>
          ))}
          {!cats.length && <p className="text-[13px] text-slate-500">No categories yet — create the first one above.</p>}
        </ul>
      </Modal>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit product" : "Add product"}
        wide
        footer={
          <>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
            <Btn kind="red" disabled={busy || !form?.name.trim() || form?.price === "" || !form?.category.trim()} onClick={save}>
              {form?.id ? "Save product" : "Add product"}
            </Btn>
          </>
        }
      >
        {form && (
          <div className="grid gap-5 md:grid-cols-[1fr_220px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *" className="sm:col-span-2">
                <input className={inputCls} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Black Forest Slice" />
              </Field>
              <Field label="Category *">
                <select className={inputCls} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {!form.category && <option value="">Select category…</option>}
                  {(form.category && !cats.includes(form.category) ? [...cats, form.category] : cats).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {!cats.length && (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-amber-700">
                    No categories yet. Close this and use <b>Create category</b> at the top of the page.
                  </p>
                )}
                {/* Categories are created on their own, from "Create category"
                    on the page header — not buried in the product form. */}
              </Field>
              {/* With sizes on, the price is per size — a single price box
                  next to a list of sizes is just a number nobody charges. */}
              {form.sizes.length === 0 && (
                <Field label="Price (KD) *">
                  <input className={inputCls} type="number" min={0} step="0.5" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="1.500" />
                </Field>
              )}
              <Field label="Weight (grams)" hint="What one of these weighs. Delivery is charged by the weight of the basket.">
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  step="10"
                  value={form.weightGrams}
                  onChange={(e) => setForm({ ...form, weightGrams: e.target.value })}
                  placeholder="500"
                />
              </Field>
              <SizesField form={form} setForm={setForm} />

              {/* No sizes → the product is one thing with one count. */}
              {form.sizes.length === 0 && (
                <div className="rounded-2xl border border-slate-100 p-4 sm:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      <b className="block text-[13px] text-slate-800">Track stock</b>
                      <span className="text-[12px] text-slate-500">Off for made-to-order items like coffee — they never sell out.</span>
                    </span>
                    <Switch on={form.track} onChange={(v) => setForm({ ...form, track: v })} label="Track stock" />
                  </div>
                  {form.track && (
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <Field label="In stock now">
                        <input className={inputCls} type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
                      </Field>
                      <Field label="Low-stock alert at">
                        <input className={inputCls} type="number" min={0} value={form.lowAt} onChange={(e) => setForm({ ...form, lowAt: e.target.value })} />
                      </Field>
                    </div>
                  )}
                </div>
              )}
              <Field label="Description" className="sm:col-span-2">
                <textarea className={cx(inputCls, "h-20 resize-none py-3")} maxLength={240} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="One line that makes it irresistible." />
              </Field>
              <Field label="Image" className="sm:col-span-2" hint="Upload one photo (JPEG, PNG, WebP or GIF, up to 4 MB) or paste a link.">
                <ImageField value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
              </Field>
            </div>
            <div className="space-y-4">
              <div className="aspect-square overflow-hidden rounded-2xl bg-slate-100">
                {form.image ? <img src={form.image} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[12px] text-slate-400">No image</span>}
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-[13px] font-semibold text-slate-700">
                Show on menu
                <Switch on={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Show on menu" />
              </label>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  {TAGS.map(([t, label]) => {
                    const on = form.tags.includes(t);
                    const atCap = t === "bestseller" && !on && bestsellerCount >= BESTSELLER_CAP;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={atCap}
                        onClick={() => {
                          if (atCap) {
                            toast({ kind: "err", title: `Only ${BESTSELLER_CAP} bestsellers can show on the landing page.`, body: "Remove the bestseller tag from one of the current four first." });
                            return;
                          }
                          setForm({ ...form, tags: on ? form.tags.filter((x) => x !== t) : [...form.tags, t] });
                        }}
                        className={cx("h-8 rounded-full px-3 text-[12px] font-bold transition", on ? "bg-amber-400 text-amber-950" : atCap ? "bg-slate-100 text-slate-300" : "bg-slate-100 text-slate-500")}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500">Bestseller shows on the landing page — only {BESTSELLER_CAP} items, {Math.max(0, BESTSELLER_CAP - bestsellerCount)} slots left.</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Sizes (sub-products)

   A cake is sold as a 500 g, a 1 kg and a 1.5 kg. Each is its own price and
   its own count on the shelf — that is the whole point, and it is why the
   amount is the first and biggest field in each row.

   The unit is a dropdown of exactly four values and never free text. "half
   kilo", "500 grams", "0.5kg" and "500g" typed by four people on four days
   are four different products to a stock count, and the shelf figure quietly
   stops meaning anything. Weight is g / kg, volume is ml / L.
   ──────────────────────────────────────────────────────────────────────── */
function SizesField({ form, setForm }: { form: Form; setForm: (f: Form) => void }) {
  const rows = form.sizes;
  const on = rows.length > 0;

  const setRow = (id: string, patch: Partial<SizeRow>) =>
    setForm({ ...form, sizes: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  const addRow = () =>
    setForm({
      ...form,
      sizes: [...rows, { id: newSizeId(), amount: "", unit: rows[rows.length - 1]?.unit ?? "g", price: "", stock: "0" }],
    });

  return (
    <div className="rounded-2xl border-2 border-red-100 bg-red-50/40 p-4 sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <b className="flex items-center gap-1.5 text-[13.5px] text-slate-900">
            <Icon name="box" size={15} className="text-red-600" /> Sizes
          </b>
          <span className="mt-0.5 block text-[12px] leading-snug text-slate-600">
            Sell this in 500 g, 1 kg, 1.5 kg… Each size has its own price and its own stock, and the customer picks one
            before it reaches the kitchen.
          </span>
        </span>
        <Switch
          on={on}
          onChange={(v) => setForm({ ...form, sizes: v ? STARTER_SIZES() : [] })}
          label="Sell this product in sizes"
        />
      </div>

      {on && (
        <>
          <div className="mt-4 space-y-2.5">
            {rows.map((r, i) => {
              const amount = Number(r.amount);
              const preview = Number.isFinite(amount) && amount > 0 ? variantLabel({ amount, unit: r.unit }) : "—";
              return (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="adm-num rounded-lg bg-slate-900 px-2.5 py-1 text-[13px] font-extrabold text-white">
                      {preview}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove size ${i + 1}`}
                      onClick={() => setForm({ ...form, sizes: rows.filter((x) => x.id !== r.id) })}
                      className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {/* The amount leads — it is what the customer is buying. */}
                    <Field label="How much *" className="sm:col-span-1">
                      <input
                        className={cx(inputCls, "text-[16px] font-extrabold")}
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={r.amount}
                        placeholder="500"
                        onChange={(e) => setRow(r.id, { amount: e.target.value })}
                      />
                    </Field>
                    <Field label="Unit *">
                      <select
                        className={cx(inputCls, "font-bold")}
                        value={r.unit}
                        onChange={(e) => setRow(r.id, { unit: e.target.value as MenuUnit })}
                      >
                        <optgroup label="Weight">
                          {MENU_UNITS.filter((u) => u.kind === "weight").map((u) => (
                            <option key={u.v} value={u.v}>{u.label}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Volume">
                          {MENU_UNITS.filter((u) => u.kind === "volume").map((u) => (
                            <option key={u.v} value={u.v}>{u.label}</option>
                          ))}
                        </optgroup>
                      </select>
                    </Field>
                    <Field label="Price (KD) *">
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        step="0.5"
                        inputMode="decimal"
                        value={r.price}
                        placeholder="4.500"
                        onChange={(e) => setRow(r.id, { price: e.target.value })}
                      />
                    </Field>
                    <Field label="In stock" hint="Blank = not tracked">
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        value={r.stock}
                        placeholder="0"
                        onChange={(e) => setRow(r.id, { stock: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn kind="soft" icon="plus" onClick={addRow}>
              Add another size
            </Btn>
            <span className="text-[11.5px] text-slate-500">
              The menu shows the cheapest as &ldquo;from&rdquo;. Tickets and bills read{" "}
              <b>{form.name.trim() || "Product"} ({rows[0] && Number(rows[0].amount) > 0 ? variantLabel({ amount: Number(rows[0].amount), unit: rows[0].unit }) : "1kg"})</b>.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
