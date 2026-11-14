"use client";

// Wholesale (B2B) module store.
//
// Four Supabase tables — products, customers, per-customer prices and bills —
// each behind the shared realtime store (createRealtimeStore). Reads come over
// the anon key and stay live; every write goes through /api/db, which only
// lets an admin touch these tables (see app/api/db/route.ts).
//
// Apply supabase/wholesale.sql once in the Supabase SQL editor to create the
// tables. Until then the stores fall back to an empty in-memory cache and the
// pages still render (they just have nothing in them).

import { createRealtimeStore } from "./createRealtimeStore";
import { write } from "./dbWrite";

/* ------------------------------------------------------------------ types */

export type WholesaleUnit = "piece" | "gram";
export type WholesalePayment = "cash" | "upi" | "card";

export const PAYMENT_LABEL: Record<WholesalePayment, string> = { cash: "Cash", upi: "UPI", card: "Card" };
export const PAYMENTS: WholesalePayment[] = ["cash", "upi", "card"];

export interface WholesaleProduct {
  id: string;
  name: string;
  category: string;
  unit: WholesaleUnit;
  /** Charged price. For a piece product it is per piece; for a gram product
   *  it is per 100 g. */
  wholesalePrice: number;
  /** Retail reference only — never charged on a bill. */
  retailPrice: number;
  /** What the product costs you, same basis as the price. 0 = not tracked.
   *  Used only to work out profit on the analytics page. */
  cost: number;
  active: boolean;
  createdAt: number;
}

export interface WholesaleCustomer {
  id: string;
  name: string;
  phone: string;
  note: string;
  createdAt: number;
}

export interface WholesalePrice {
  id: string;
  customerId: string;
  productId: string;
  /** Same basis as the product's price (per piece / per 100 g). */
  price: number;
  createdAt: number;
}

export interface WholesaleBillItem {
  productId: string;
  name: string;
  unit: WholesaleUnit;
  /** Unit price used for this line (per piece / per 100 g). */
  unitPrice: number;
  /** Cost per unit at the time of sale (per piece / per 100 g). 0 if untracked. */
  cost: number;
  /** Pieces for a piece product; grams for a gram product. */
  qty: number;
  lineTotal: number;
}

export interface WholesaleBill {
  id: string;
  /** null for a walk-in / not-in-the-book buyer. */
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  items: WholesaleBillItem[];
  subtotal: number;
  /** Manual discount amount taken off the subtotal. */
  discount: number;
  deliveryFee: number;
  /** "Other" charge. */
  extra: number;
  /** 0 = no VAT invoice. */
  gstPercent: number;
  gstAmount: number;
  total: number;
  payment: WholesalePayment;
  createdAt: number;
}

/** A priced-up bill, before it is saved. */
export interface WholesaleBillComputed {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  extra: number;
  gstPercent: number;
  gstAmount: number;
  taxable: number;
  total: number;
  /** Your cost of the goods on this bill. */
  cost: number;
  /** Goods profit: (subtotal − discount) − cost. Excludes delivery/other/VAT. */
  profit: number;
}

export interface WholesaleCharges {
  discountType: "none" | "percent" | "amount";
  discountValue: number;
  deliveryFee: number;
  extra: number;
  gstPercent: number; // 0 = no VAT
}

export const emptyCharges: WholesaleCharges = { discountType: "none", discountValue: 0, deliveryFee: 0, extra: 0, gstPercent: 0 };

/* --------------------------------------------------------------- helpers */

/** KWD to 3 decimals (fils), matching the rest of the app. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

const num = (v: unknown, d = 0) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : d;
};
const unitOf = (v: unknown): WholesaleUnit => (v === "gram" ? "gram" : "piece");

/** A short, client-generated id — same spirit as the rest of the schema. */
export function wid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${rand}`;
}

/** Deterministic id for a (customer, product) price, so re-pricing updates
 *  the same row instead of piling up duplicates. */
export const priceId = (customerId: string, productId: string) =>
  `WPR_${customerId}_${productId}`;

/** Digits-only form of a phone, for matching a typed number to a customer. */
export const normPhone = (p: string) => (p || "").replace(/\D/g, "");

/** The price to charge for a product and (optional) customer:
 *   1. the customer's special price for this product, if one is set;
 *   2. otherwise the product's wholesale price.
 *  The retail price is never used here. */
export function priceFor(
  product: WholesaleProduct,
  customerId: string | null,
  prices: WholesalePrice[],
): { price: number; custom: boolean } {
  if (customerId) {
    const sp = prices.find((p) => p.customerId === customerId && p.productId === product.id);
    if (sp) return { price: sp.price, custom: true };
  }
  return { price: product.wholesalePrice, custom: false };
}

/** Line total for a quantity: pieces × price, or (grams ÷ 100) × price. The
 *  same maths is used for the cost of a line (pass the cost as the rate). */
export function lineTotal(unit: WholesaleUnit, unitPrice: number, qty: number): number {
  const raw = unit === "gram" ? unitPrice * (qty / 100) : unitPrice * qty;
  return round3(raw);
}

/** Price up a whole bill: subtotal, then the discount comes off, VAT is charged
 *  on what's left, and delivery + "other" are added after (never taxed). Cost
 *  and goods-profit are worked out alongside for the analytics page. */
export function computeWholesaleBill(items: WholesaleBillItem[], c: WholesaleCharges): WholesaleBillComputed {
  const paid = items.filter((i) => i.qty > 0);
  const subtotal = round3(paid.reduce((s, i) => s + i.lineTotal, 0));
  const discount =
    c.discountType === "percent" ? round3((subtotal * (c.discountValue || 0)) / 100)
    : c.discountType === "amount" ? round3(Math.min(subtotal, c.discountValue || 0))
    : 0;
  const taxable = Math.max(0, round3(subtotal - discount));
  const gstPercent = c.gstPercent > 0 ? c.gstPercent : 0;
  const gstAmount = gstPercent > 0 ? round3((taxable * gstPercent) / 100) : 0;
  const deliveryFee = round3(Math.max(0, c.deliveryFee || 0));
  const extra = round3(Math.max(0, c.extra || 0));
  const total = round3(taxable + gstAmount + deliveryFee + extra);
  const cost = round3(paid.reduce((s, i) => s + lineTotal(i.unit, i.cost, i.qty), 0));
  const profit = round3(taxable - cost);
  return { subtotal, discount, deliveryFee, extra, gstPercent, gstAmount, taxable, total, cost, profit };
}

/** How a unit price reads on screen, e.g. "KD / piece" or "KD / 100 g". */
export const unitPriceLabel = (unit: WholesaleUnit) => (unit === "gram" ? "per 100 g" : "per piece");
/** How a quantity reads, e.g. "10 pcs" or "500 g". */
export const qtyLabel = (unit: WholesaleUnit, qty: number) =>
  unit === "gram" ? `${qty} g` : `${qty} pc${qty === 1 ? "" : "s"}`;

/* ------------------------------------------------------------ row mappers */

function productFromRow(r: Record<string, unknown>): WholesaleProduct {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? ""),
    unit: unitOf(r.unit),
    wholesalePrice: num(r.wholesale_price),
    retailPrice: num(r.retail_price),
    cost: num(r.cost_price),
    active: r.active !== false,
    createdAt: num(r.created_at),
  };
}

function customerFromRow(r: Record<string, unknown>): WholesaleCustomer {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    phone: String(r.phone ?? ""),
    note: String(r.note ?? ""),
    createdAt: num(r.created_at),
  };
}

function priceFromRow(r: Record<string, unknown>): WholesalePrice {
  return {
    id: String(r.id),
    customerId: String(r.customer_id ?? ""),
    productId: String(r.product_id ?? ""),
    price: num(r.price),
    createdAt: num(r.created_at),
  };
}

function billFromRow(r: Record<string, unknown>): WholesaleBill {
  const rawItems = Array.isArray(r.items) ? r.items : [];
  const items: WholesaleBillItem[] = rawItems.map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    return {
      productId: String(i.productId ?? ""),
      name: String(i.name ?? ""),
      unit: unitOf(i.unit),
      unitPrice: num(i.unitPrice),
      cost: num(i.cost),
      qty: num(i.qty),
      lineTotal: num(i.lineTotal),
    };
  });
  const pay = String(r.payment ?? "cash");
  return {
    id: String(r.id),
    customerId: r.customer_id ? String(r.customer_id) : null,
    customerName: String(r.customer_name ?? ""),
    customerPhone: String(r.customer_phone ?? ""),
    items,
    subtotal: num(r.subtotal),
    discount: num(r.discount),
    deliveryFee: num(r.delivery_fee),
    extra: num(r.extra),
    gstPercent: num(r.gst_percent),
    gstAmount: num(r.gst_amount),
    total: num(r.total),
    payment: (pay === "upi" || pay === "card" ? pay : "cash") as WholesalePayment,
    createdAt: num(r.created_at),
  };
}

/* -------------------------------------------------------------- the stores */

const products = createRealtimeStore<WholesaleProduct>({ table: "wholesale_products", fromRow: productFromRow });
const customers = createRealtimeStore<WholesaleCustomer>({ table: "wholesale_customers", fromRow: customerFromRow });
const prices = createRealtimeStore<WholesalePrice>({ table: "wholesale_prices", fromRow: priceFromRow });
const bills = createRealtimeStore<WholesaleBill>({ table: "wholesale_bills", fromRow: billFromRow });

/* Products */
export function subscribeToWholesaleProducts(cb: () => void) { products.ensureHydrated(); return products.subscribe(cb); }
export const getWholesaleProductsSnapshot = () => products.getSnapshot();
export const getWholesaleProductsServerSnapshot = () => products.getServerSnapshot();

/* Customers */
export function subscribeToWholesaleCustomers(cb: () => void) { customers.ensureHydrated(); return customers.subscribe(cb); }
export const getWholesaleCustomersSnapshot = () => customers.getSnapshot();
export const getWholesaleCustomersServerSnapshot = () => customers.getServerSnapshot();

/* Prices */
export function subscribeToWholesalePrices(cb: () => void) { prices.ensureHydrated(); return prices.subscribe(cb); }
export const getWholesalePricesSnapshot = () => prices.getSnapshot();
export const getWholesalePricesServerSnapshot = () => prices.getServerSnapshot();

/* Bills */
export function subscribeToWholesaleBills(cb: () => void) { bills.ensureHydrated(); return bills.subscribe(cb); }
export const getWholesaleBillsSnapshot = () => bills.getSnapshot();
export const getWholesaleBillsServerSnapshot = () => bills.getServerSnapshot();

/* ------------------------------------------------------------ write result */

type Res = { ok: boolean; error?: string };

function schemaHint(msg: string | undefined): string {
  return /schema cache|does not exist|unknown table|PGRST205/i.test(msg || "")
    ? "Wholesale tables are missing — run supabase/wholesale.sql in the Supabase SQL editor."
    : msg || "Could not save.";
}

/* ------------------------------------------------------------ product CRUD */

export async function saveWholesaleProduct(
  input: { id?: string; name: string; category: string; unit: WholesaleUnit; wholesalePrice: number; retailPrice: number; cost: number; active?: boolean },
): Promise<Res> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the product a name." };
  const values = {
    name,
    category: input.category.trim(),
    unit: input.unit,
    wholesale_price: round3(Math.max(0, input.wholesalePrice || 0)),
    retail_price: round3(Math.max(0, input.retailPrice || 0)),
    cost_price: round3(Math.max(0, input.cost || 0)),
    active: input.active ?? true,
  };
  if (input.id) {
    const row: WholesaleProduct = { id: input.id, ...valuesToProduct(values), createdAt: products.get().find((p) => p.id === input.id)?.createdAt ?? Date.now() };
    products.patchLocal((cur) => cur.map((p) => (p.id === input.id ? row : p)));
    const { error } = await write({ table: "wholesale_products", op: "update", values, match: { id: input.id } });
    if (error) { void products.refetch(); return { ok: false, error: schemaHint(error.message) }; }
    return { ok: true };
  }
  const id = wid("WP");
  const createdAt = Date.now();
  const row: WholesaleProduct = { id, ...valuesToProduct(values), createdAt };
  products.patchLocal((cur) => [row, ...cur]);
  const { error } = await write({ table: "wholesale_products", op: "insert", values: { id, ...values, created_at: createdAt } });
  if (error) { void products.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true };
}

function valuesToProduct(v: { name: string; category: string; unit: WholesaleUnit; wholesale_price: number; retail_price: number; cost_price: number; active: boolean }) {
  return { name: v.name, category: v.category, unit: v.unit, wholesalePrice: v.wholesale_price, retailPrice: v.retail_price, cost: v.cost_price, active: v.active };
}

export async function deleteWholesaleProduct(id: string): Promise<Res> {
  products.patchLocal((cur) => cur.filter((p) => p.id !== id));
  const { error } = await write({ table: "wholesale_products", op: "delete", match: { id } });
  if (error) { void products.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true };
}

/* ----------------------------------------------------------- customer CRUD */

export async function saveWholesaleCustomer(
  input: { id?: string; name: string; phone: string; note?: string },
): Promise<Res> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the customer a name." };
  const values = { name, phone: input.phone.trim(), note: (input.note ?? "").trim() };
  if (input.id) {
    const createdAt = customers.get().find((c) => c.id === input.id)?.createdAt ?? Date.now();
    customers.patchLocal((cur) => cur.map((c) => (c.id === input.id ? { id: input.id!, ...values, createdAt } : c)));
    const { error } = await write({ table: "wholesale_customers", op: "update", values, match: { id: input.id } });
    if (error) { void customers.refetch(); return { ok: false, error: schemaHint(error.message) }; }
    return { ok: true };
  }
  const id = wid("WHC");
  const createdAt = Date.now();
  customers.patchLocal((cur) => [{ id, ...values, createdAt }, ...cur]);
  const { error } = await write({ table: "wholesale_customers", op: "insert", values: { id, ...values, created_at: createdAt } });
  if (error) { void customers.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true };
}

export async function deleteWholesaleCustomer(id: string): Promise<Res> {
  customers.patchLocal((cur) => cur.filter((c) => c.id !== id));
  // Drop that customer's special prices too (best-effort).
  const theirs = prices.get().filter((p) => p.customerId === id);
  prices.patchLocal((cur) => cur.filter((p) => p.customerId !== id));
  const { error } = await write({ table: "wholesale_customers", op: "delete", match: { id } });
  for (const p of theirs) void write({ table: "wholesale_prices", op: "delete", match: { id: p.id } });
  if (error) { void customers.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true };
}

/* -------------------------------------------------------------- price CRUD */

/** Set (or clear) a customer's special price for one product. A null/blank
 *  price removes the override, so the product falls back to wholesale. */
export async function setWholesalePrice(customerId: string, productId: string, price: number | null): Promise<Res> {
  const id = priceId(customerId, productId);
  if (price === null || !Number.isFinite(price)) {
    const existed = prices.get().some((p) => p.id === id);
    prices.patchLocal((cur) => cur.filter((p) => p.id !== id));
    if (!existed) return { ok: true };
    const { error } = await write({ table: "wholesale_prices", op: "delete", match: { id } });
    if (error) { void prices.refetch(); return { ok: false, error: schemaHint(error.message) }; }
    return { ok: true };
  }
  const value = round3(Math.max(0, price));
  const exists = prices.get().some((p) => p.id === id);
  const createdAt = prices.get().find((p) => p.id === id)?.createdAt ?? Date.now();
  const row: WholesalePrice = { id, customerId, productId, price: value, createdAt };
  prices.patchLocal((cur) => (exists ? cur.map((p) => (p.id === id ? row : p)) : [row, ...cur]));
  const { error } = exists
    ? await write({ table: "wholesale_prices", op: "update", values: { price: value }, match: { id } })
    : await write({ table: "wholesale_prices", op: "insert", values: { id, customer_id: customerId, product_id: productId, price: value, created_at: createdAt } });
  if (error) { void prices.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true };
}

/* --------------------------------------------------------------- bill save */

export async function saveWholesaleBill(input: {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  items: WholesaleBillItem[];
  charges: WholesaleCharges;
  payment: WholesalePayment;
}): Promise<{ ok: boolean; error?: string; bill?: WholesaleBill }> {
  const items = input.items.filter((i) => i.qty > 0);
  if (items.length === 0) return { ok: false, error: "Add at least one product." };
  const c = computeWholesaleBill(items, input.charges);
  const id = wid("WB");
  const createdAt = Date.now();
  const bill: WholesaleBill = {
    id,
    customerId: input.customerId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    items,
    subtotal: c.subtotal,
    discount: c.discount,
    deliveryFee: c.deliveryFee,
    extra: c.extra,
    gstPercent: c.gstPercent,
    gstAmount: c.gstAmount,
    total: c.total,
    payment: input.payment,
    createdAt,
  };
  bills.patchLocal((cur) => [bill, ...cur]);
  const { error } = await write({
    table: "wholesale_bills",
    op: "insert",
    values: {
      id,
      customer_id: input.customerId,
      customer_name: bill.customerName,
      customer_phone: bill.customerPhone,
      items,
      subtotal: c.subtotal,
      discount: c.discount,
      delivery_fee: c.deliveryFee,
      extra: c.extra,
      gst_percent: c.gstPercent,
      gst_amount: c.gstAmount,
      total: c.total,
      payment: input.payment,
      created_at: createdAt,
    },
  });
  if (error) { void bills.refetch(); return { ok: false, error: schemaHint(error.message) }; }
  return { ok: true, bill };
}
