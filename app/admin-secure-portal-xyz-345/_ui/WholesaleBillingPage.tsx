"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot,
  subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot,
  subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot,
  saveWholesaleBill, computeWholesaleBill, priceFor, lineTotal, normPhone, unitPriceLabel,
  PAYMENTS, PAYMENT_LABEL,
  type WholesaleProduct, type WholesaleBillItem, type WholesaleCharges, type WholesalePayment,
} from "../../lib/wholesaleStore";
import { useAdmin } from "./Store";
import { printWholesaleReceipt, sendWholesaleBillWhatsApp, type WholesalePrintFormat } from "./wholesalePrint";
import { rupee } from "./money";
import {
  Page, PageHead, Card, Btn, Field, Badge, Empty, SearchBox, Icon,
  inputCls, labelCls, cx,
} from "./kit";

type CartLine = { productId: string; qty: string };
type DiscountType = WholesaleCharges["discountType"];

export default function WholesaleBillingPage() {
  const { toast } = useAdmin();
  const products = useSyncExternalStore(subscribeToWholesaleProducts, getWholesaleProductsSnapshot, getWholesaleProductsServerSnapshot);
  const customers = useSyncExternalStore(subscribeToWholesaleCustomers, getWholesaleCustomersSnapshot, getWholesaleCustomersServerSnapshot);
  const prices = useSyncExternalStore(subscribeToWholesalePrices, getWholesalePricesSnapshot, getWholesalePricesServerSnapshot);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);

  // charges
  const [discType, setDiscType] = useState<DiscountType>("none");
  const [discVal, setDiscVal] = useState("");
  const [delivery, setDelivery] = useState("");
  const [extra, setExtra] = useState("");
  const [vatOn, setVatOn] = useState(false);
  const [vatPct, setVatPct] = useState("5");
  const [payment, setPayment] = useState<WholesalePayment>("cash");
  const [format, setFormat] = useState<WholesalePrintFormat>("thermal");

  const matched = useMemo(() => {
    const digits = normPhone(phone);
    if (digits.length < 3) return null;
    return customers.find((c) => normPhone(c.phone) && normPhone(c.phone) === digits) ?? null;
  }, [phone, customers]);

  const effectiveName = matched && !nameTouched ? matched.name : name;
  const customerId = matched ? matched.id : null;

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const pickable = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const inCart = new Set(cart.map((l) => l.productId));
    return products
      .filter((p) => p.active && !inCart.has(p.id))
      .filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.category.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, cart, q]);

  const add = (p: WholesaleProduct) => { setCart((c) => [...c, { productId: p.id, qty: p.unit === "gram" ? "100" : "1" }]); setQ(""); };
  const setQty = (productId: string, qty: string) => setCart((c) => c.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  const bump = (productId: string, unit: "piece" | "gram", by: number) =>
    setCart((c) => c.map((l) => {
      if (l.productId !== productId) return l;
      const step = unit === "gram" ? 50 : 1;
      const next = Math.max(0, (parseFloat(l.qty) || 0) + by * step);
      return { ...l, qty: String(next) };
    }));
  const removeLine = (productId: string) => setCart((c) => c.filter((l) => l.productId !== productId));

  const items: WholesaleBillItem[] = useMemo(() => {
    const out: WholesaleBillItem[] = [];
    for (const l of cart) {
      const p = byId.get(l.productId);
      if (!p) continue;
      const qty = parseFloat(l.qty) || 0;
      const { price } = priceFor(p, customerId, prices);
      out.push({ productId: p.id, name: p.name, unit: p.unit, unitPrice: price, cost: p.cost, qty, lineTotal: lineTotal(p.unit, price, qty) });
    }
    return out;
  }, [cart, byId, customerId, prices]);

  const charges: WholesaleCharges = useMemo(() => ({
    discountType: discType,
    discountValue: parseFloat(discVal) || 0,
    deliveryFee: parseFloat(delivery) || 0,
    extra: parseFloat(extra) || 0,
    gstPercent: vatOn ? (parseFloat(vatPct) || 0) : 0,
  }), [discType, discVal, delivery, extra, vatOn, vatPct]);

  const bill = useMemo(() => computeWholesaleBill(items, charges), [items, charges]);
  const canSave = items.some((i) => i.qty > 0);

  const reset = () => {
    setPhone(""); setName(""); setNameTouched(false); setCart([]); setQ("");
    setDiscType("none"); setDiscVal(""); setDelivery(""); setExtra(""); setVatOn(false); setVatPct("5"); setPayment("cash");
  };

  const saveBill = async (action: "print" | "whatsapp" | "none") => {
    if (!canSave) { toast({ kind: "err", title: "Add at least one product with a quantity." }); return; }
    setBusy(true);
    const res = await saveWholesaleBill({
      customerId,
      customerName: effectiveName,
      customerPhone: matched ? matched.phone : phone,
      items: items.filter((i) => i.qty > 0),
      charges,
      payment,
    });
    setBusy(false);
    if (!res.ok || !res.bill) { toast({ kind: "err", title: "Couldn't save bill", body: res.error }); return; }
    toast({ kind: "bill", title: `Bill saved · ${rupee(res.bill.total)}`, body: res.bill.id });
    if (action === "print") printWholesaleReceipt(res.bill, format);
    if (action === "whatsapp") sendWholesaleBillWhatsApp(res.bill);
    reset();
  };

  const sumLine = (label: string, value: string, opts?: { minus?: boolean; muted?: boolean }) => (
    <div className="flex items-center justify-between text-[13px]">
      <span className={opts?.muted ? "text-slate-400" : "text-slate-500"}>{label}</span>
      <span className={cx("adm-num tabular-nums", opts?.minus ? "text-red-600" : "text-slate-700")}>{opts?.minus ? "−" : ""}{value}</span>
    </div>
  );

  return (
    <Page>
      <PageHead
        bar
        title="Wholesale billing"
        sub="Enter the customer's phone to autofill their name and their prices. Unknown numbers are billed at wholesale price."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left: customer + product picker */}
        <div className="space-y-4">
          <Card title="Customer">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone" hint={matched ? "Matched a saved customer." : "Not in the book — billed at wholesale."}>
                <input className={inputCls} value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 55512345" />
              </Field>
              <Field label="Name">
                <input className={inputCls} value={effectiveName} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="Walk-in customer" />
              </Field>
            </div>
            <div className="mt-3">
              {matched
                ? <Badge tone="violet"><Icon name="check" size={12} /> Saved customer — their prices apply</Badge>
                : <Badge tone="slate">Walk-in — wholesale prices apply</Badge>}
            </div>
          </Card>

          <Card title="Add products">
            <div className="mb-3"><SearchBox value={q} onChange={setQ} placeholder="Search products…" /></div>
            {pickable.length === 0 ? (
              <Empty icon="box" title={products.length === 0 ? "No products" : "Nothing to add"}>
                {products.length === 0 ? "Add products in Wholesale inventory first." : "Everything matching is already on the bill."}
              </Empty>
            ) : (
              <div className="grid max-h-[340px] gap-2 overflow-y-auto adm-scroll sm:grid-cols-2">
                {pickable.map((p) => {
                  const { price, custom } = priceFor(p, customerId, prices);
                  return (
                    <button key={p.id} type="button" onClick={() => add(p)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 text-left transition hover:border-red-200 hover:bg-red-50/40">
                      <span className="min-w-0">
                        <b className="block truncate text-[13.5px] text-slate-800">{p.name}</b>
                        <span className="text-[11px] text-slate-400">{rupee(price)} · {unitPriceLabel(p.unit)}{custom ? " · special" : ""}</span>
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><Icon name="plus" size={15} /></span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: the bill */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <Card
            title="Bill"
            right={cart.length > 0 ? <button type="button" className="text-[12px] font-semibold text-slate-400 hover:text-red-600" onClick={reset}>Clear</button> : undefined}
          >
            {items.length === 0 ? (
              <Empty icon="billing" title="No items yet">Pick products on the left.</Empty>
            ) : (
              <div className="space-y-2">
                {items.map((i) => (
                  <div key={i.productId} className="rounded-xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <b className="block truncate text-[13.5px] text-slate-800">{i.name}</b>
                        <span className="text-[11px] text-slate-400">{rupee(i.unitPrice)} {i.unit === "gram" ? "/100g" : "/pc"}</span>
                      </div>
                      <button type="button" onClick={() => removeLine(i.productId)} className="text-slate-300 hover:text-red-600" aria-label="Remove"><Icon name="x" size={15} /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Stepper
                        unit={i.unit}
                        value={cart.find((l) => l.productId === i.productId)?.qty ?? ""}
                        onDec={() => bump(i.productId, i.unit, -1)}
                        onInc={() => bump(i.productId, i.unit, 1)}
                        onType={(v) => setQty(i.productId, v)}
                      />
                      <b className="adm-num tabular-nums text-[15px] font-extrabold text-slate-900">{rupee(i.lineTotal)}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* charges */}
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <div>
                <span className={labelCls}>Discount</span>
                <Seg
                  full
                  options={[{ v: "none", t: "None" }, { v: "percent", t: "Percent %" }, { v: "amount", t: "Amount KD" }]}
                  value={discType}
                  onChange={(v) => setDiscType(v as DiscountType)}
                />
                {discType !== "none" && (
                  <input className={cx(inputCls, "mt-2 h-10 w-full")} type="number" min={0} step="0.001" inputMode="decimal"
                    value={discVal} onChange={(e) => setDiscVal(e.target.value)} placeholder={discType === "percent" ? "Discount percent, e.g. 10" : "Discount amount, e.g. 0.500"} />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Delivery" labelNowrap>
                  <input className={cx(inputCls, "h-9")} type="number" min={0} step="0.001" inputMode="decimal" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="0.000" />
                </Field>
                <Field label="Other charge" labelNowrap>
                  <input className={cx(inputCls, "h-9")} type="number" min={0} step="0.001" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0.000" />
                </Field>
              </div>

              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                  <input type="checkbox" checked={vatOn} onChange={(e) => setVatOn(e.target.checked)} className="h-4 w-4 accent-red-600" />
                  Add VAT invoice
                </label>
                {vatOn && (
                  <div className="flex items-center gap-1">
                    <input className={cx(inputCls, "h-9 w-16 text-right")} type="number" min={0} max={100} step="0.1" inputMode="decimal" value={vatPct} onChange={(e) => setVatPct(e.target.value)} />
                    <span className="text-[13px] text-slate-400">%</span>
                  </div>
                )}
              </div>

              <div>
                <span className={labelCls}>Payment</span>
                <Seg
                  full
                  options={PAYMENTS.map((p) => ({ v: p, t: PAYMENT_LABEL[p] }))}
                  value={payment}
                  onChange={(v) => setPayment(v as WholesalePayment)}
                />
              </div>
            </div>

            {/* summary */}
            <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
              {sumLine("Subtotal", rupee(bill.subtotal))}
              {bill.discount > 0 && sumLine("Discount", rupee(bill.discount), { minus: true })}
              {bill.deliveryFee > 0 && sumLine("Delivery charge", rupee(bill.deliveryFee))}
              {bill.extra > 0 && sumLine("Other charges", rupee(bill.extra))}
              {bill.gstAmount > 0 && sumLine(`VAT (${bill.gstPercent}%)`, rupee(bill.gstAmount))}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2">
                <span className="text-[13px] font-bold uppercase tracking-wide text-slate-500">Total</span>
                <span className="adm-num tabular-nums text-[22px] font-extrabold text-slate-900">{rupee(bill.total)}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div>
                <span className={labelCls}>Print as</span>
                <Seg
                  full
                  options={[{ v: "thermal", t: "Thermal receipt" }, { v: "invoice", t: "A4 invoice" }]}
                  value={format}
                  onChange={(v) => setFormat(v as WholesalePrintFormat)}
                />
              </div>
              <Btn kind="red" size="lg" icon="print" className="w-full" disabled={busy || !canSave} onClick={() => saveBill("print")}>{busy ? "Saving…" : "Save & print"}</Btn>
              <Btn kind="green" className="w-full" disabled={busy || !canSave} onClick={() => saveBill("whatsapp")}>Save & send on WhatsApp</Btn>
              <Btn kind="ghost" className="w-full" disabled={busy || !canSave} onClick={() => saveBill("none")}>Save without printing</Btn>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* A −/value/+ quantity stepper. */
function Stepper({ unit, value, onDec, onInc, onType }: { unit: "piece" | "gram"; value: string; onDec: () => void; onInc: () => void; onType: (v: string) => void }) {
  const btn = "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 active:scale-95";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={onDec} aria-label="Decrease"><Icon name="minus" size={14} /></button>
      <div className="relative">
        <input
          className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 pr-7 text-center text-[13px] font-semibold text-slate-900 outline-none focus:border-slate-400"
          type="number" min={0} step={unit === "gram" ? "1" : "1"} inputMode="decimal"
          value={value} onChange={(e) => onType(e.target.value)}
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase text-slate-400">{unit === "gram" ? "g" : "pc"}</span>
      </div>
      <button type="button" className={btn} onClick={onInc} aria-label="Increase"><Icon name="plus" size={14} /></button>
    </div>
  );
}

/* A small segmented control. */
function Seg<T extends string>({ options, value, onChange, full }: { options: { v: T; t: string }[]; value: T; onChange: (v: T) => void; full?: boolean }) {
  return (
    <div className={cx("inline-flex rounded-xl bg-slate-100 p-1", full && "flex w-full")}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cx(
            "h-9 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-bold transition",
            full && "flex-1",
            value === o.v ? "bg-white text-red-600 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.t}
        </button>
      ))}
    </div>
  );
}
