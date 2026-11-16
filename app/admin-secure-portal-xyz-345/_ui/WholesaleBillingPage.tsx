"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot,
  subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot,
  subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot,
  saveWholesaleBill, computeWholesaleBill, priceFor, lineTotal, normPhone, round3, unitPriceLabel,
  type WholesaleProduct, type WholesaleBill, type WholesaleBillItem, type WholesaleCharges, type WholesalePayment, type WholesaleUnit,
} from "../../lib/wholesaleStore";
import { useAdmin } from "./Store";
import PrintModal, { PrintFormats } from "./PrintModal";
import { Receipt, billText, waLink, type PrintFormat } from "./receipt";
import { wholesaleToBill } from "./wholesaleAdapter";
import { rupee } from "./money";
import { Badge, Btn, Empty, Icon, Modal, SearchBox, WaIcon, cx } from "./kit";

/* The wholesale till. It is the POS Billing Panel with the restaurant-only
   parts taken out (customer tabs, coupons) and the wholesale parts put in:
   the catalogue is the wholesale catalogue, a saved customer's phone number
   brings in their special prices, and a product can be sold by the piece or
   by weight (grams, priced per 100 g). */

type Line = {
  key: number;
  /** null = a hand-typed line that is not in the catalogue. */
  productId: string | null;
  name: string;
  unit: WholesaleUnit;
  /** A price typed by hand. null = use the catalogue / customer price. */
  priceOverride: string | null;
  /** What is typed in the quantity box, in the line's own unit (g or kg for weight). */
  qty: string;
  /** A by-weight line can be keyed in kilograms instead of grams. */
  kg: boolean;
};
type DiscType = "amount" | "percent";

const box = "rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_2px_12px_-4px_rgba(15,23,42,.1)] sm:p-5";
const lbl = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-700";
const big = "h-10 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100";

/* Same phone rules as the POS: Kuwait numbers are 8 digits, a pasted "+965…"
   loses its prefix, and up to 15 digits are accepted for other countries. */
const kuwaitDigits = (v: string) => {
  const d = v.replace(/\D/g, "");
  const bare = d.startsWith("965") && d.length > 8 ? d.slice(3) : d;
  return bare.slice(0, 15);
};
const okPhone = (p: string) => /^\d{8,15}$/.test(p);

const DEFAULT_VAT = "5";
let seq = 0;
const blank = (): Line => ({ key: ++seq, productId: null, name: "", unit: "piece", priceOverride: null, qty: "1", kg: false });
const stepOf = (unit: WholesaleUnit) => (unit === "gram" ? 50 : 1);
const startQty = (unit: WholesaleUnit) => (unit === "gram" ? "100" : "1");

export default function WholesaleBillingPage() {
  const { s, print, toast } = useAdmin();
  const shop = s.settings.shopName;
  const products = useSyncExternalStore(subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot);
  const customers = useSyncExternalStore(subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot);
  const prices = useSyncExternalStore(subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot);

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phone, setPhone] = useState("");
  const [lines, setLines] = useState<Line[]>(() => [blank()]);
  const [mType, setMType] = useState<DiscType>("amount");
  const [mVal, setMVal] = useState("");
  const [delivery, setDelivery] = useState("");
  const [extra, setExtra] = useState("");
  const [isGst, setIsGst] = useState(false);
  const [gstPct, setGstPct] = useState(DEFAULT_VAT);
  const [pay, setPay] = useState<WholesalePayment>("cash");
  const [received, setReceived] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [picker, setPicker] = useState<number | null>(null); // swap one line
  const [picking, setPicking] = useState(false); // multi-add
  const [printFor, setPrintFor] = useState<WholesaleBill | null>(null);
  const [done, setDone] = useState<WholesaleBill | null>(null);
  const [busy, setBusy] = useState(false);

  /* A saved customer is recognised by phone — they bring their name and their
     special prices with them. */
  const matched = useMemo(() => {
    const digits = normPhone(phone);
    if (digits.length < 3) return null;
    return customers.find((c) => normPhone(c.phone) && normPhone(c.phone) === digits) ?? null;
  }, [phone, customers]);
  const customerId = matched ? matched.id : null;
  const effectiveName = matched && !nameTouched ? matched.name : name;

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /** The price a line is charged: a hand-typed one, else the customer's or the wholesale price. */
  const priceOf = (l: Line): number => {
    if (l.priceOverride !== null) return Math.max(0, Number(l.priceOverride) || 0);
    const p = l.productId ? byId.get(l.productId) : undefined;
    return p ? priceFor(p, customerId, prices).price : 0;
  };
  /** Quantity in the unit the bill is priced in: pieces, or grams (a kg line is converted). */
  const qtyOf = (l: Line) => Math.max(0, round3((Number(l.qty) || 0) * (l.kg ? 1000 : 1)));
  /** The text to show for a quantity given in pieces / grams, in the line's own unit. */
  const qtyText = (l: Pick<Line, "kg">, base: number) => String(l.kg ? round3(base / 1000) : base);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const bump = (l: Line, by: number) => {
    const next = Math.max(l.unit === "gram" ? 0 : 1, qtyOf(l) + by * stepOf(l.unit));
    setLine(l.key, { qty: qtyText(l, Math.min(l.unit === "gram" ? 999999 : 999, next)) });
  };
  /** Switch a by-weight line between g and kg, keeping the same weight. */
  const setKg = (l: Line, kg: boolean) => {
    if (l.kg === kg) return;
    setLine(l.key, { kg, qty: qtyText({ kg }, qtyOf(l)) });
  };

  const reset = () => {
    setName(""); setNameTouched(false); setPhone("");
    setLines([blank()]);
    setMType("amount"); setMVal(""); setDelivery(""); setExtra("");
    setIsGst(false); setGstPct(DEFAULT_VAT);
    setPay("cash"); setReceived(""); setSplitCash(""); setSplitCard("");
  };

  /* ---------- totals ---------- */
  const items: WholesaleBillItem[] = useMemo(
    () =>
      lines
        .filter((l) => l.name.trim() || priceOf(l) > 0)
        .map((l) => {
          const p = l.productId ? byId.get(l.productId) : undefined;
          const unitPrice = priceOf(l);
          const qty = qtyOf(l);
          return {
            productId: l.productId ?? `custom:${l.name.trim().toLowerCase()}`,
            name: l.name.trim(),
            unit: l.unit,
            unitPrice,
            cost: p?.cost ?? 0,
            qty,
            lineTotal: lineTotal(l.unit, unitPrice, qty),
          };
        }),
    // priceOf closes over byId/customerId/prices — list them so a new price list re-prices the bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, byId, customerId, prices],
  );

  const charges: WholesaleCharges = {
    discountType: (Number(mVal) || 0) > 0 ? mType : "none",
    discountValue: Number(mVal) || 0,
    deliveryFee: Number(delivery) || 0,
    extra: Number(extra) || 0,
    gstPercent: isGst ? Number(gstPct) || 0 : 0,
  };
  const calc = computeWholesaleBill(items, charges);
  const piecesCount = items.reduce((a, i) => a + (i.unit === "gram" ? 1 : i.qty), 0);
  const recv = Number(received) || 0;
  const change = pay === "cash" && recv > 0 ? round3(recv - calc.total) : 0;

  /* typing one half of a split fills the other with whatever is left of the total */
  const rest = (v: string) => (v === "" ? "" : String(Math.max(0, round3(calc.total - (Number(v) || 0)))));
  const sCash = Number(splitCash) || 0;
  const sCard = Number(splitCard) || 0;
  const splitOff = round3(calc.total - sCash - sCard);

  const problems: string[] = [];
  if (!items.length) problems.push("Add at least one item.");
  if (items.some((i) => !i.name)) problems.push("Every item needs a name.");
  if (items.some((i) => i.qty <= 0)) problems.push("Every item needs a quantity.");
  if (isGst && !(gstPct !== "" && Number(gstPct) >= 0 && Number(gstPct) <= 100)) problems.push("VAT should be a percentage between 0 and 100.");
  if (pay === "cash" && recv > 0 && recv < calc.total) problems.push("Amount received is less than the total.");
  if (pay === "split" && (!(sCash > 0) || !(sCard > 0))) problems.push("Split payment: enter both the cash and the card amount.");
  else if (pay === "split" && splitOff !== 0) problems.push(`Split payment: cash + card should equal ${rupee(calc.total)}.`);
  if (phone && !okPhone(phone)) problems.push("Enter the mobile number (8 digits for Kuwait, or with country code).");
  const ready = !problems.length && !busy;

  const complete = async (via: "wa" | "print" | "none", fmt?: PrintFormat) => {
    if (!ready) return;
    const w = via === "wa" ? window.open("about:blank", "_blank") : null;
    setBusy(true);
    const res = await saveWholesaleBill({
      customerId,
      customerName: effectiveName,
      customerPhone: matched ? matched.phone : phone,
      items,
      charges,
      payment: pay,
      received: recv,
      cashAmount: sCash,
      cardAmount: sCard,
    });
    setBusy(false);
    if (!res.ok || !res.bill) {
      w?.close();
      toast({ kind: "err", title: "Couldn't save bill", body: res.error });
      return;
    }
    const b = res.bill;
    if (w) w.location.href = waLink(b.customerPhone, billText(wholesaleToBill(b), shop, s.settings.publicUrl));
    if (via === "print") print(<Receipt b={wholesaleToBill(b)} shop={shop} fmt={fmt} />);
    setSaveOpen(false);
    setDone(b);
    reset();
  };

  const printBill = useMemo(() => (printFor ? wholesaleToBill(printFor) : null), [printFor]);

  return (
    <div className="adm-in rounded-[22px] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,.06),0_8px_24px_-12px_rgba(15,23,42,.1)] sm:p-5">
      {/* ---------- header ---------- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="h-6 w-[4px] rounded-full bg-red-600" />
          <h1 className="adm-title text-[22px] leading-none text-slate-900">Wholesale Billing Panel</h1>
          <span className="hidden h-5 w-px bg-slate-300 sm:block" />
          <span className="text-[13px] text-slate-500">Trade invoices — a saved customer&apos;s number brings in their prices</span>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wide text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Wholesale
        </span>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* ================= left ================= */}
        <div className="min-w-0 space-y-4">
          <section className={box}>
            <h2 className="mb-4 flex items-center gap-2.5 text-[16px] font-bold text-slate-900">
              <Icon name="users" size={18} className="text-red-600" /> Customer Details
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={lbl}>Customer name</span>
                <input className={big} value={effectiveName} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="Enter name" maxLength={60} />
              </label>
              <label>
                <span className={lbl}>Mobile number (WhatsApp)</span>
                <input className={cx(big, phone && !okPhone(phone) && "border-amber-500")} value={phone} onChange={(e) => setPhone(kuwaitDigits(e.target.value))} placeholder="Enter mobile number (Kuwait: 8 digits)" inputMode="numeric" autoComplete="tel-national" />
              </label>
            </div>
            <div className="mt-3">
              {matched
                ? <Badge tone="violet"><Icon name="check" size={12} /> Saved customer — their special prices apply</Badge>
                : <Badge tone="slate">Not in the customer book — wholesale prices apply</Badge>}
            </div>
          </section>

          <section className={box}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-[16px] font-bold text-slate-900">
                <Icon name="orders" size={18} className="text-red-600" /> Order Items
              </h2>
              <div className="flex flex-wrap gap-2">
                <Btn size="md" className="border-0 bg-slate-100 hover:bg-slate-200" onClick={() => setLines([blank()])}>
                  Clear Order
                </Btn>
                <Btn size="md" kind="dark" icon="list" onClick={() => setPicking(true)}>
                  Pick from catalog
                </Btn>
                <Btn size="md" kind="soft" className="text-[14px] font-bold" onClick={() => setLines((ls) => [...ls, blank()])}>
                  + Add Item
                </Btn>
              </div>
            </div>
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              {lines.map((l) => {
                const price = priceOf(l);
                const total = lineTotal(l.unit, price, qtyOf(l));
                const special = l.productId && l.priceOverride === null && byId.get(l.productId) && priceFor(byId.get(l.productId)!, customerId, prices).custom;
                return (
                  <div key={l.key} className="flex flex-wrap items-center gap-2 border-b border-slate-200/70 pb-2 last:border-0 last:pb-0">
                    <input
                      className="h-10 min-w-[180px] flex-1 rounded-xl border border-slate-300 bg-white px-3 text-[14px] outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                      placeholder="Item name / description…"
                      value={l.name}
                      onChange={(e) => setLine(l.key, { name: e.target.value })}
                    />
                    <button type="button" onClick={() => setPicker(l.key)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[13px] font-bold text-slate-700 transition hover:bg-slate-100">
                      <Icon name="list" size={15} /> Catalog
                    </button>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        inputMode="decimal"
                        className={cx("h-10 rounded-xl border bg-white px-3 text-[14px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100", special ? "border-violet-300" : "border-slate-300", l.unit === "gram" ? "w-36 pr-14" : "w-28")}
                        placeholder="KD Price"
                        value={l.priceOverride !== null ? l.priceOverride : price ? String(price) : ""}
                        onChange={(e) => setLine(l.key, { priceOverride: e.target.value })}
                        aria-label={l.unit === "gram" ? "Price per 100 g" : "Price"}
                      />
                      {l.unit === "gram" && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">/100 g</span>}
                    </div>
                    <div className={cx("flex h-10 items-center overflow-hidden rounded-xl border border-slate-300 bg-white", l.unit === "gram" ? "w-[248px]" : "w-[148px]")}>
                      <button type="button" className="h-full w-8 shrink-0 text-[16px] font-bold text-slate-700 hover:bg-slate-50" onClick={() => bump(l, -1)} aria-label="Less">
                        −
                      </button>
                      <input
                        className="h-full min-w-0 flex-1 border-l border-slate-200 px-1 text-center text-[14px] font-bold outline-none"
                        value={l.qty}
                        inputMode="decimal"
                        onChange={(e) => setLine(l.key, { qty: e.target.value.replace(l.unit === "gram" ? /[^\d.]/g : /\D/g, "").slice(0, l.kg ? 4 : l.unit === "gram" ? 6 : 3) })}
                        aria-label="Quantity"
                      />
                      {l.unit === "gram" && (
                        <span className="flex h-full shrink-0 items-center gap-0.5 border-l border-slate-200 bg-slate-50 px-1" role="group" aria-label="Weight unit">
                          {(["g", "kg"] as const).map((u) => (
                            <button
                              key={u}
                              type="button"
                              aria-pressed={l.kg === (u === "kg")}
                              onClick={() => setKg(l, u === "kg")}
                              className={cx("h-7 rounded-md px-2 text-[12px] font-bold transition", l.kg === (u === "kg") ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200")}
                            >
                              {u}
                            </button>
                          ))}
                        </span>
                      )}
                      <button type="button" className="h-full w-8 shrink-0 border-l border-slate-200 text-[16px] font-bold text-slate-700 hover:bg-slate-50" onClick={() => bump(l, 1)} aria-label="More">
                        +
                      </button>
                    </div>
                    <span className="adm-num min-w-[120px] flex-1 whitespace-nowrap text-right leading-tight" aria-label="Line total">
                      <b className="block text-[14px] text-slate-900">{rupee(total)}</b>
                      {l.unit === "gram" && qtyOf(l) > 0 && <small className="block text-[11px] font-semibold text-slate-500">{qtyOf(l).toLocaleString("en-US")} g</small>}
                      {special && <small className="block text-[11px] font-semibold text-violet-600">special price</small>}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blank()]))}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                      aria-label="Remove item"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* ================= right: summary ================= */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className={cx(box, "space-y-4")}>
            <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 text-[12px]">
              <div className="flex items-center justify-between py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Source</dt>
                <dd><Badge tone="green">Wholesale</Badge></dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Customer</dt>
                <dd className="truncate font-semibold text-slate-800">{effectiveName || "-"}</dd>
              </div>
              <div className="flex items-center justify-between py-3">
                <dt className="font-bold uppercase tracking-[0.12em] text-slate-400">Phone</dt>
                <dd className="font-semibold text-slate-800">{phone || "-"}</dd>
              </div>
            </dl>

            {items.length ? (
              <ul className="adm-scroll max-h-56 space-y-2 overflow-y-auto pr-1 text-[13px]">
                {items.map((i, k) => (
                  <li key={k} className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      <b>{i.unit === "gram" ? `${i.qty.toLocaleString("en-US")} g` : `${i.qty}×`}</b> {i.name || <em className="text-slate-400">unnamed</em>}
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <b className="block">{rupee(i.lineTotal)}</b>
                      <small className="block text-[11px] font-semibold text-slate-500">{rupee(i.unitPrice)} {i.unit === "gram" ? "/ 100 g" : "/ pc"}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-3 text-center text-[12.5px] text-slate-400">No items added yet</p>
            )}

            <div className="border-t border-dashed border-slate-200 pt-4">
              <span className={lbl}>Manual discount</span>
              <div className="flex gap-2">
                <select className="h-11 w-[84px] rounded-xl border border-slate-300 bg-white px-3 text-[14px] font-bold outline-none focus:border-slate-400" value={mType} onChange={(e) => setMType(e.target.value as DiscType)} aria-label="Discount type">
                  <option value="amount">KD</option>
                  <option value="percent">%</option>
                </select>
                <input type="number" min={0} inputMode="decimal" placeholder="0" className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-right text-[14px] outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={mVal} onChange={(e) => setMVal(e.target.value)} aria-label="Discount value" />
              </div>
            </div>

            <dl className="space-y-3 border-t border-dashed border-slate-200 pt-4 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-slate-600">
                  Subtotal ({piecesCount} items){isGst && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800/70">excl. VAT</span>}
                </dt>
                <dd className="font-semibold">{rupee(calc.subtotal)}</dd>
              </div>
              {calc.discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <dt>Discount</dt>
                  <dd className="font-semibold">-{rupee(calc.discount)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Delivery charge</dt>
                <dd>
                  <input type="number" min={0} step="0.25" inputMode="decimal" placeholder="0" className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-right text-[14px] outline-none focus:border-slate-400" value={delivery} onChange={(e) => setDelivery(e.target.value)} aria-label="Delivery charge" />
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Extra charges</dt>
                <dd>
                  <input type="number" min={0} inputMode="decimal" placeholder="0" className="h-10 w-24 rounded-lg border border-slate-300 px-3 text-right text-[14px] outline-none focus:border-slate-400" value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Extra charges" />
                </dd>
              </div>
            </dl>

            <div className="space-y-3 border-t border-dashed border-slate-200 pt-4">
              <div className="grid grid-cols-2 rounded-full border border-slate-200 bg-white p-1" role="group" aria-label="Bill type">
                {(
                  [
                    [false, "No VAT"],
                    [true, "VAT invoice"],
                  ] as const
                ).map(([g, t]) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={isGst === g}
                    onClick={() => setIsGst(g)}
                    className={cx("h-10 rounded-full text-[12.5px] font-extrabold uppercase tracking-wide transition", isGst === g ? "bg-slate-800 text-white shadow" : "text-slate-600 hover:text-slate-900")}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {isGst && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[14px]">
                  <span className="font-bold text-slate-800">
                    VAT <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800/70">(added on top)</span>
                  </span>
                  <span className="ml-auto flex items-center gap-2">
                    <input type="number" min={0} max={100} step="0.1" inputMode="decimal" className="h-10 w-20 rounded-lg border border-slate-300 px-3 text-right text-[14px] font-bold outline-none focus:border-slate-400" value={gstPct} onChange={(e) => setGstPct(e.target.value)} aria-label="VAT percent" />
                    <span className="text-slate-600">%</span>
                    <b className="adm-num min-w-24 whitespace-nowrap text-right font-semibold text-slate-700">{rupee(calc.gstAmount)}</b>
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-slate-200 pt-4">
              <span className="whitespace-nowrap text-[14px] font-extrabold uppercase tracking-[0.04em] text-slate-900 sm:text-[15px]">Grand total</span>
              <b className="adm-num whitespace-nowrap text-[20px] font-extrabold text-slate-900 sm:text-[22px]">{rupee(calc.total)}</b>
            </div>
            {isGst && calc.gstAmount > 0 && <p className="-mt-3 text-right text-[11.5px] text-slate-400">{rupee(calc.gstAmount)} VAT added on {rupee(calc.taxable)} after discount</p>}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">Payment</span>
                <div className="grid w-full grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
                  {(["cash", "upi", "card", "split"] as const).map((p) => (
                    <button key={p} type="button" onClick={() => setPay(p)} className={cx("h-8 rounded-lg px-1 text-[12px] font-bold uppercase transition", pay === p ? "bg-white text-slate-900 shadow" : "text-slate-500")}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              {pay === "cash" ? (
                <>
                  <span className="mb-2 block text-[12px] font-bold text-slate-700">Amount Received (KD)</span>
                  <input type="number" min={0} inputMode="decimal" placeholder={calc.total ? calc.total.toFixed(2) : "0.00"} className="h-12 w-full rounded-xl border border-slate-300 px-4 text-[18px] font-bold outline-none placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={received} onChange={(e) => setReceived(e.target.value)} />
                  {recv > 0 && (
                    <p className={cx("mt-2 flex justify-between text-[13px] font-semibold", change < 0 ? "text-red-600" : "text-emerald-600")}>
                      <span>{change < 0 ? "Still due" : "Change to return"}</span>
                      <span>{rupee(Math.abs(change))}</span>
                    </p>
                  )}
                </>
              ) : pay === "split" ? (
                <div className="space-y-2">
                  <p className="text-[12.5px] text-slate-500">Customer pays part in cash and part by card — enter how much of each.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="mb-1 block text-[12px] font-bold text-slate-700">Cash (KD)</span>
                      <input type="number" min={0} inputMode="decimal" placeholder="0.00" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[16px] font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={splitCash} onChange={(e) => (setSplitCash(e.target.value), setSplitCard(rest(e.target.value)))} />
                    </label>
                    <label>
                      <span className="mb-1 block text-[12px] font-bold text-slate-700">Card (KD)</span>
                      <input type="number" min={0} inputMode="decimal" placeholder="0.00" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[16px] font-bold outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100" value={splitCard} onChange={(e) => (setSplitCard(e.target.value), setSplitCash(rest(e.target.value)))} />
                    </label>
                  </div>
                  {(sCash > 0 || sCard > 0) && (
                    <p className={cx("flex justify-between text-[13px] font-semibold", splitOff === 0 ? "text-emerald-600" : "text-red-600")}>
                      <span>{splitOff === 0 ? "Adds up to the total" : splitOff > 0 ? "Still to collect" : "Over by"}</span>
                      <span>{splitOff === 0 ? rupee(calc.total) : rupee(Math.abs(splitOff))}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] text-slate-500">Collect {rupee(calc.total)} by {pay === "upi" ? "UPI" : "card"}, then complete the bill.</p>
              )}
            </div>

            {problems.length > 0 && items.length > 0 && <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">{problems[0]}</p>}

            <div className="space-y-2">
              <button
                type="button"
                disabled={!ready || !okPhone(phone)}
                onClick={() => complete("wa")}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#22c55e] px-4 text-[14px] font-extrabold uppercase tracking-wide text-white transition hover:bg-[#16a34a] disabled:opacity-45"
              >
                <WaIcon size={20} /> Save &amp; Send on WhatsApp
              </button>
              <Btn size="lg" kind="dark" icon="print" disabled={!ready} onClick={() => setSaveOpen(true)} className="w-full uppercase">
                Public Print
              </Btn>
              <Btn size="lg" kind="red" disabled={!ready} onClick={() => complete("none")} className="w-full uppercase">
                Save order
              </Btn>
              {!okPhone(phone) && phone && <p className="text-center text-[11.5px] text-slate-400">WhatsApp needs a valid mobile number.</p>}
            </div>
          </div>
        </aside>
      </div>

      {/* swap one line for a catalogue product */}
      <WholesaleCatalog
        open={picker !== null}
        onClose={() => setPicker(null)}
        title="Swap this line"
        products={products}
        priceOf={(p) => priceFor(p, customerId, prices)}
        onPick={(p) => {
          if (picker !== null) setLine(picker, { productId: p.id, name: p.name, unit: p.unit, priceOverride: null, qty: startQty(p.unit), kg: false });
          setPicker(null);
        }}
      />
      {/* add several */}
      <WholesaleCatalog
        open={picking}
        onClose={() => setPicking(false)}
        title="Pick items for this bill"
        multi
        products={products}
        priceOf={(p) => priceFor(p, customerId, prices)}
        counts={Object.fromEntries(lines.filter((l) => l.productId).map((l) => [l.productId as string, qtyOf(l)]))}
        onDec={(p) =>
          setLines((ls) => {
            const i = ls.findIndex((l) => l.productId === p.id);
            if (i < 0) return ls;
            const l = ls[i];
            const next = qtyOf(l) - stepOf(l.unit);
            if (next > 0) return ls.map((x, k) => (k === i ? { ...x, qty: qtyText(l, next) } : x));
            const rest = ls.filter((_, k) => k !== i);
            return rest.length ? rest : [blank()];
          })
        }
        onPick={(p) =>
          setLines((ls) => {
            const existing = ls.findIndex((l) => l.productId === p.id);
            if (existing >= 0) {
              const l = ls[existing];
              return ls.map((x, i) => (i === existing ? { ...x, qty: qtyText(l, qtyOf(l) + stepOf(l.unit)) } : x));
            }
            const line: Line = { key: ++seq, productId: p.id, name: p.name, unit: p.unit, priceOverride: null, qty: startQty(p.unit), kg: false };
            // A blank starter line is replaced instead of pushed down.
            return ls.length === 1 && !ls[0].name.trim() && ls[0].priceOverride === null ? [line] : [...ls, line];
          })
        }
      />

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Public Print — choose printer &amp; paper">
        <div className="space-y-4">
          <p className="text-[13px] text-slate-500">{rupee(calc.total)} · pick the printer, the bill is saved and sent to that printer at the same resolution.</p>
          <PrintFormats onPick={(fmt) => complete("print", fmt)} />
          <Btn kind="plain" size="sm" onClick={() => setSaveOpen(false)}>
            Cancel
          </Btn>
        </div>
      </Modal>
      <PrintModal bill={printBill} onClose={() => setPrintFor(null)} />
      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        title="Bill saved"
        footer={
          done && (
            <div className={cx("grid w-full gap-2", done.customerPhone ? "grid-cols-3" : "grid-cols-2")}>
              {done.customerPhone && (
                <a href={waLink(done.customerPhone, billText(wholesaleToBill(done), shop, s.settings.publicUrl))} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-3 text-[13px] font-semibold text-white hover:bg-[#16a34a]">
                  <WaIcon size={16} /> WhatsApp
                </a>
              )}
              <Btn icon="print" className="w-full" onClick={() => setPrintFor(done)}>
                Print receipt
              </Btn>
              <Btn kind="red" className="w-full" onClick={() => setDone(null)}>
                New bill
              </Btn>
            </div>
          )
        }
      >
        {done && (
          <div className="grid place-items-center gap-2 py-2 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <Icon name="check" size={28} stroke={2.6} />
            </span>
            <p className="font-bold text-slate-900">{done.id}</p>
            <p className="adm-num text-[32px] font-extrabold">{rupee(done.total)}</p>
            <p className="text-[13px] text-slate-500">
              Wholesale sale recorded.
              {done.payment === "cash" && done.received > done.total && ` Give back ${rupee(round3(done.received - done.total))} change.`}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* The wholesale catalogue picker. `multi` keeps it open so several products
   can be tapped onto the bill in a row; otherwise one tap picks and closes. */
function WholesaleCatalog({
  open, onClose, title, products, priceOf, onPick, onDec, multi, counts,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  products: WholesaleProduct[];
  priceOf: (p: WholesaleProduct) => { price: number; custom: boolean };
  onPick: (p: WholesaleProduct) => void;
  onDec?: (p: WholesaleProduct) => void;
  multi?: boolean;
  counts?: Record<string, number>;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => p.active && (!needle || p.name.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, q]);
  return (
    <Modal
      open={open}
      onClose={() => { setQ(""); onClose(); }}
      title={title}
      wide
      footer={multi ? <Btn kind="red" onClick={() => { setQ(""); onClose(); }}>Done</Btn> : undefined}
    >
      <div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="Search products…" /></div>
      {list.length === 0 ? (
        <Empty icon="box" title={products.length === 0 ? "No products" : "Nothing matches"}>
          {products.length === 0 ? "Add products in Wholesale inventory first." : "Try a different search."}
        </Empty>
      ) : (
        <div className="grid max-h-[55dvh] gap-2 overflow-y-auto adm-scroll sm:grid-cols-2">
          {list.map((p) => {
            const { price, custom } = priceOf(p);
            const n = counts?.[p.id] ?? 0;
            return (
              <div key={p.id} className={cx("flex items-center justify-between gap-2 rounded-xl border p-3 transition", n > 0 ? "border-red-200 bg-red-50/40" : "border-slate-100 hover:border-red-200 hover:bg-red-50/40")}>
                <button type="button" onClick={() => { onPick(p); if (!multi) setQ(""); }} className="min-w-0 flex-1 text-left">
                  <b className="block truncate text-[13.5px] text-slate-800">{p.name}</b>
                  <span className="text-[11px] text-slate-400">{rupee(price)} · {unitPriceLabel(p.unit)}{custom ? " · special" : ""}</span>
                </button>
                {multi && n > 0 ? (
                  <span className="flex shrink-0 items-center overflow-hidden rounded-xl border border-slate-300 bg-white">
                    <button type="button" onClick={() => onDec?.(p)} className="grid h-8 w-8 place-items-center text-[16px] font-bold text-slate-700 hover:bg-slate-50" aria-label="Less">−</button>
                    <span className="adm-num min-w-8 px-1 text-center text-[13px] font-bold text-slate-900">{p.unit === "gram" ? `${n}g` : n}</span>
                    <button type="button" onClick={() => onPick(p)} className="grid h-8 w-8 place-items-center text-[16px] font-bold text-slate-700 hover:bg-slate-50" aria-label="More">+</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => { onPick(p); if (!multi) setQ(""); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-50 text-red-600" aria-label="Add"><Icon name="plus" size={15} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
