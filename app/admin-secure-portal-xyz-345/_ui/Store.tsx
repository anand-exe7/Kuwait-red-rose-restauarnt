"use client";

// Admin data store — the Red Rose admin pages all read through useAdmin(), so this
// is the adapter layer: Red Rose's live Supabase stores on one side, the
// AdminState shape on the other.
//
// Writes: each `act("op", args)`
// routes to the matching Red Rose store mutation. Anything Red Rose doesn't
// have (ingredients, recipes, expenses) short-circuits to a "not available"
// error so the page still renders but no stale write is attempted.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import type {
  AdminState,
  Bill,
  Expense,
  OrderMode,
  Coupon,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  Session,
  SessionStatus,
} from "./types";
import { emptyAdminState } from "./types";

import {
  subscribeToMenu,
  getMenuSnapshot,
  getMenuServerSnapshot,
  addMenuItem as rrAddMenuItem,
  updateMenuItem as rrUpdateMenuItem,
  deleteMenuItem as rrDeleteMenuItem,
  menuSchemaIsOutdated,
  MENU_MIGRATION_HINT,
  type MenuItem,
} from "../../lib/menuStore";
import {
  subscribeToOrders,
  getOrdersSnapshot,
  getOrdersServerSnapshot,
  updateOrderStatus as rrUpdateOrderStatus,
  approveOrder as rrApproveOrder,
  rejectOrder as rrRejectOrder,
  addOrder as rrAddOrder,
  markSessionBilled as rrMarkSessionBilled,
  cancelSession as rrCancelSession,
  type Order as RrOrder,
  type OrderStatus as RrOrderStatus,
} from "../../lib/orderStore";
import {
  subscribeToSessions,
  getSessionsSnapshot,
  getSessionsServerSnapshot,
  closeSession as rrCloseSession,
  voidSession as rrVoidSession,
  type Session as RrSession,
} from "../../lib/sessionStore";
import {
  subscribeToBills,
  getBillsSnapshot,
  getBillsServerSnapshot,
  createBill as rrCreateBill,
  type Bill as RrBill,
} from "../../lib/billStore";
import { invoiceNumber, issueInvoiceNumber, resolveInvoiceNo } from "../../lib/invoice";
import { recordStockChange } from "../../lib/stockStore";
import {
  subscribeToCategories,
  getCategoriesSnapshot,
  getCategoriesServerSnapshot,
  categoriesFrom,
  addCategory as rrAddCategory,
  renameCategory as rrRenameCategory,
  deleteCategory as rrDeleteCategory,
} from "../../lib/categoryStore";
import {
  subscribeToExpenses,
  getExpensesSnapshot,
  getExpensesServerSnapshot,
  saveExpense as rrSaveExpense,
  deleteExpense as rrDeleteExpense,
  type Expense as RrExpense,
} from "../../lib/expenseStore";
import {
  subscribeToCoupons,
  getCouponsSnapshot,
  getCouponsServerSnapshot,
  addCoupon as rrAddCoupon,
  updateCoupon as rrUpdateCoupon,
  deleteCoupon as rrDeleteCoupon,
  type Coupon as RrCoupon,
} from "../../lib/couponStore";

export type Toast = {
  id: number;
  kind: "ok" | "err" | "order" | "bill" | "info";
  title: string;
  body?: string;
  href?: string;
};
type ConfirmReq = { title: string; body?: React.ReactNode; ok?: string; danger?: boolean };
export type ActResult<T = unknown> = { ok: true; result: T } | { ok: false; error: string };
export type ActOpts = { optimistic?: (s: AdminState) => AdminState };

export interface FloorTab {
  session: Session;
  /** Resolved mode — the order's, falling back to the session's. */
  mode: OrderMode;
  orders: Order[];
  total: number;
  items: number;
  fresh: number;
  cooking: number;
  billRequested: boolean;
  /** When the guest (or the waiter on their behalf) asked to pay. */
  billRequestedAt: number | null;
  /** The coupon the guest already used, and what it took off. Billing opens
   *  with these filled in so the admin bills what the customer was shown. */
  couponCode: string | null;
  discount: number;
  /** Delivery charge on this tab. */
  deliveryFee: number;
  /** Takeaway / delivery — a home order, not a seated tab. Items can never be
   *  added to one: the customer ordered exactly what they ordered. */
  home: boolean;
  /** A home order still waiting for the admin to accept it. */
  awaitingApproval: boolean;
  /** Every ticket is cooked. For a home order this is the moment the admin is
   *  meant to bill it and send the invoice. */
  readyToBill: boolean;
  /** The remark the customer typed at checkout, if any. */
  note: string;
}

interface Ctx {
  s: AdminState;
  role: "admin" | "staff";
  act: <T = unknown>(op: string, args?: Record<string, unknown>, opts?: ActOpts) => Promise<ActResult<T>>;
  refresh: () => Promise<void>;
  toast: (t: Omit<Toast, "id">) => void;
  toasts: Toast[];
  dismiss: (id: number) => void;
  confirm: (c: ConfirmReq) => Promise<boolean>;
  pending: ConfirmReq | null;
  answer: (v: boolean) => void;
  print: (node: React.ReactNode) => void;
  printNode: React.ReactNode;
  sound: boolean;
  setSound: (v: boolean) => void;
  base: string;
  now: number;
  floor: FloorTab[];
  /** Every category the shop has — saved ones plus any a product still uses. */
  categories: string[];
}

/** The landing page has room for exactly four best sellers. One number, used
 *  by the admin form, by this store and by both pages that render them. */
export const BEST_SELLER_SLOTS = 4;

export const whoIs = (x: { customerName: string; customerPhone: string }) =>
  x.customerName || x.customerPhone || "Guest";

const C = createContext<Ctx | null>(null);
export function useAdmin() {
  const c = useContext(C);
  if (!c) throw new Error("useAdmin outside AdminProvider");
  return c;
}

// -----------------------------------------------------------------------------
// Red Rose → AdminState type mapping
// -----------------------------------------------------------------------------

function toProduct(m: MenuItem): Product {
  const variants = m.variants ?? [];
  /* With sizes on it, the product's own price and stock stop being things
     anybody sets: the price is what the cheapest size costs ("from KD 4.500")
     and the stock is every size added up. Showing the old single-product
     numbers next to a list of sizes is how a shelf count goes wrong. */
  const price = variants.length ? Math.min(...variants.map((v) => v.price)) : m.price;
  const tracked = variants.filter((v) => v.stock != null);
  const stock = variants.length
    ? (tracked.length ? tracked.reduce((a, v) => a + (v.stock ?? 0), 0) : null)
    : (m.stock ?? null);
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price,
    stock,
    variants,
    weightGrams: m.weightGrams ?? null,
    lowAt: m.lowStockThreshold ?? 5,
    description: m.description ?? "",
    image: m.image ?? "",
    eggless: false,
    /* "Best seller" is the only tag the shop uses. Popular and Chef's pick
       were decoration that nothing chose deliberately — a product picked them
       up on its own and then wore a badge the owner never asked for. */
    tags: m.isBestSeller ? ["bestseller"] : [],
    active: (m.status ?? "active") === "active",
    createdAt: m.createdAt ?? Date.now(),
  };
}

const ORDER_STATUS_MAP: Record<RrOrderStatus, OrderStatus> = {
  awaiting_admin: "new",
  pending: "new",
  cooking: "preparing",
  ready: "ready",
  served: "served",
  cancelled: "cancelled",
};

function toOrderItem(it: RrOrder["items"][number]): OrderItem {
  return {
    productId: it.id ?? null,
    name: it.name,
    price: it.price,
    qty: it.qty,
    notes: it.notes ?? "",
  };
}

function toOrder(o: RrOrder, index: number): Order {
  return {
    id: o.id,
    no: index + 1,
    sessionId: o.sessionId ?? "",
    mode: o.mode ?? "table",
    live: o.status,
    total: o.total,
    billed: o.billed ?? false,
    customerEmail: o.customer?.email ?? "",
    deliveryAddress: o.deliveryAddress,
    items: o.items.map(toOrderItem),
    note: o.note ?? "",
    customerName: o.customer?.name ?? "",
    customerPhone: o.customer?.phone ?? "",
    status: ORDER_STATUS_MAP[o.status] ?? "new",
    source:
      o.source === "customer" ? "customer"
      : o.source === "admin" ? "admin"
      : o.source === "waiter" ? "waiter"
      : "counter",
    subtotal: o.subtotal,
    discount: o.discount ?? 0,
    couponCode: o.couponCode ?? null,
    deliveryFee: o.deliveryFee ?? 0,
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  };
}

/** orders grouped by session id — built once per snapshot. Rebuilding it per
 *  session and per bill turned an admin render into sessions x orders work,
 *  which a busy month of history would feel. */
function indexBySession(orders: RrOrder[]): Map<string, RrOrder[]> {
  const m = new Map<string, RrOrder[]>();
  for (const o of orders) {
    if (!o.sessionId) continue;
    const cur = m.get(o.sessionId);
    if (cur) cur.push(o);
    else m.set(o.sessionId, [o]);
  }
  return m;
}

function toSession(sess: RrSession, bySession: Map<string, RrOrder[]>): Session {
  const own = (bySession.get(sess.id) ?? []).filter((o) => o.status !== 'cancelled');
  const status: SessionStatus =
    sess.status === "open"
      ? (sess.billRequestedAt ? "bill_requested" : "open")
      : "closed";
  return {
    id: sess.id,
    status,
    mode: sess.mode ?? "table",
    tableNumber: sess.tableNumber ?? null,
    standingLabel: sess.standingLabel ?? "",
    openedAt: sess.openedAt,
    closedAt: sess.closedAt ?? null,
    customerName: sess.customerName ?? "",
    customerPhone: sess.customerPhone ?? "",
    billRequestedAt: sess.billRequestedAt ?? null,
    billId: sess.billId ?? null,
    // The guest's coupon lives on the ticket they used it on. Reading it back
    // here is what lets the billing panel open with the discount already in —
    // it used to be hard-coded to null, so the admin billed the full price.
    couponCode: own.map((o) => o.couponCode).find(Boolean) ?? null,
  };
}

/** What a bill was for, rebuilt from the session's own orders. Used when the
 *  bill row has no payload — an older bill, or a database that hasn't had
 *  supabase/add_bill_payload.sql applied. Without this the Orders page, the
 *  invoice and every analytics tab show a bill with no items and no customer,
 *  which is exactly what they were doing. */
function fromSessionOrders(sessionId: string | null | undefined, bySession: Map<string, RrOrder[]>, sessions: Map<string, RrSession>) {
  if (!sessionId) return null;
  const own = (bySession.get(sessionId) ?? []).filter((o) => o.status !== "cancelled");
  if (own.length === 0) return null;
  const sess = sessions.get(sessionId);
  const lines = new Map<string, OrderItem>();
  for (const o of own) {
    for (const it of o.items) {
      const key = `${it.id ?? it.name}@@${it.price}`;
      const cur = lines.get(key);
      if (cur) cur.qty += it.qty;
      else lines.set(key, { productId: it.id ?? null, name: it.name, price: it.price, qty: it.qty, notes: it.notes ?? "" });
    }
  }
  const items = [...lines.values()];
  return {
    items,
    itemCount: items.reduce((a, i) => a + i.qty, 0),
    customerName: sess?.customerName || own.map((o) => o.customer?.name).find(Boolean) || "",
    customerPhone: sess?.customerPhone || own.map((o) => o.customer?.phone).find(Boolean) || "",
    note: own.map((o) => o.note).find(Boolean) ?? "",
    couponCode: own.map((o) => o.couponCode).find(Boolean) ?? null,
    discount: own.reduce((a, o) => a + (o.discount ?? 0), 0),
    deliveryFee: own.reduce((a, o) => a + (o.deliveryFee ?? 0), 0),
    mode: (own[0]?.mode ?? sess?.mode ?? "table") as OrderMode,
  };
}

/** How a bill's sale reached the customer. Older bills have no mode of their
 *  own, so it is read back off the session's orders — that is what lets
 *  Analytics split income into dine-in, takeaway and delivery retroactively. */
function billMode(b: RrBill, bySession: Map<string, RrOrder[]>, sessions: Map<string, RrSession>): OrderMode {
  if (!b.sessionId) return "standing"; // a counter walk-in
  const own = bySession.get(b.sessionId) ?? [];
  return (own[0]?.mode ?? sessions.get(b.sessionId)?.mode ?? "table") as OrderMode;
}

function toBill(b: RrBill, bySession: Map<string, RrOrder[]>, sessions: Map<string, RrSession>): Bill {
  // The admin POS writes the full invoice payload to Supabase. When it's
  // there, trust it; otherwise rebuild what we can from the session's orders,
  // and only then fall back to the bare numbers on the row.
  const p = (b.payload ?? null) as Partial<Bill> | null;
  const rebuilt = fromSessionOrders(b.sessionId, bySession, sessions);
  const mode = billMode(b, bySession, sessions);
  const payment: Bill["payment"] =
    b.paidMethod === "cash" || b.paidMethod === "upi" || b.paidMethod === "card" || b.paidMethod === "split"
      ? b.paidMethod
      : (p?.payment ?? "cash");
  const invoiceNo = resolveInvoiceNo({ invoiceNo: b.invoiceNo || p?.invoiceNo, sessionId: b.sessionId, id: b.id, createdAt: b.createdAt });
  if (p) {
    return {
      id: b.id,
      invoiceNo,
      source: p.source ?? (b.sessionId ? "tab" : "counter"),
      mode: p.mode ?? mode,
      sessionId: b.sessionId ?? null,
      customerName: p.customerName ?? "",
      customerPhone: p.customerPhone ?? "",
      items: p.items ?? [],
      itemCount: p.itemCount ?? 0,
      subtotal: p.subtotal ?? b.subtotal ?? 0,
      couponCode: p.couponCode ?? b.couponCode ?? null,
      couponPercent: p.couponPercent ?? 0,
      couponDiscount: p.couponDiscount ?? 0,
      couponSource: p.couponSource ?? null,
      manualType: p.manualType ?? "none",
      manualValue: p.manualValue ?? 0,
      manualDiscount: p.manualDiscount ?? 0,
      discount: p.discount ?? b.discount ?? 0,
      deliveryFee: p.deliveryFee ?? rebuilt?.deliveryFee ?? 0,
      deliveryPartner: typeof p.deliveryPartner === "string" ? p.deliveryPartner : "",
      total: p.total ?? b.total ?? 0,
      createdAt: b.createdAt,
      tax: p.tax ?? b.tax ?? 0,
      taxRate: p.taxRate ?? 0,
      status: p.status ?? "completed",
      isGst: p.isGst ?? false,
      gstAmount: p.gstAmount ?? 0,
      gstPercent: p.gstPercent ?? 0,
      taxableAmount: p.taxableAmount ?? 0,
      cashAmount: p.cashAmount ?? 0,
      upiAmount: p.upiAmount ?? 0,
      cardAmount: p.cardAmount ?? 0,
      payment,
      received: p.received ?? (b.total ?? 0),
      change: p.change ?? 0,
      extra: p.extra ?? 0,
      note: p.note ?? "",
    };
  }
  return {
    id: b.id,
    invoiceNo,
    source: b.sessionId ? "tab" : "counter",
    mode,
    sessionId: b.sessionId ?? null,
    customerName: rebuilt?.customerName ?? "",
    customerPhone: rebuilt?.customerPhone ?? "",
    items: rebuilt?.items ?? [],
    itemCount: rebuilt?.itemCount ?? 0,
    subtotal: b.subtotal ?? 0,
    couponCode: b.couponCode ?? rebuilt?.couponCode ?? null,
    couponPercent: 0,
    // No payload to split the discount, so the row's discount IS the coupon's
    // when a coupon was used. Without this the coupon analytics read zero.
    couponDiscount: (b.couponCode ?? rebuilt?.couponCode) ? (b.discount ?? rebuilt?.discount ?? 0) : 0,
    couponSource: (b.couponCode ?? rebuilt?.couponCode) ? "guest" : null,
    manualType: "none",
    manualValue: 0,
    manualDiscount: 0,
    discount: b.discount ?? 0,
    deliveryFee: rebuilt?.deliveryFee ?? 0,
    total: b.total ?? 0,
    createdAt: b.createdAt,
    tax: b.tax ?? 0,
    taxRate: 0,
    status: "completed",
    isGst: false,
    gstAmount: 0,
    gstPercent: 0,
    taxableAmount: 0,
    cashAmount: payment === "cash" ? (b.total ?? 0) : 0,
    upiAmount: payment === "upi" ? (b.total ?? 0) : 0,
    cardAmount: payment === "card" ? (b.total ?? 0) : 0,
    payment,
    received: b.total ?? 0,
    change: 0,
    extra: 0,
    note: rebuilt?.note ?? "",
  };
}

function toExpense(e: RrExpense): Expense {
  return {
    id: e.id,
    amount: e.amount,
    at: e.createdAt,
    title: e.title,
    notes: e.notes,
    category: e.category,
    expenseDate: e.expenseDate,
  };
}

function toCoupon(c: RrCoupon): Coupon {
  return {
    id: c.id,
    code: c.code,
    percent: c.discountPercent ?? 0,
    minOrder: c.minOrder ?? 0,
    expiresAt: c.expiry || null,
    limit: c.usageLimit > 0 ? c.usageLimit : null,
    used: c.usedCount ?? 0,
    active: c.active ?? true,
    createdAt: c.createdAt ?? Date.now(),
  };
}

// -----------------------------------------------------------------------------
// Provider
// -----------------------------------------------------------------------------

const soundSubs = new Set<() => void>();
const soundPref = {
  subscribe: (cb: () => void) => {
    soundSubs.add(cb);
    return () => void soundSubs.delete(cb);
  },
  get: () => {
    try {
      return localStorage.getItem("rr-admin-sound") !== "0";
    } catch {
      return true;
    }
  },
  set: (v: boolean) => {
    try {
      localStorage.setItem("rr-admin-sound", v ? "1" : "0");
    } catch {}
    soundSubs.forEach((f) => f());
  },
};

export function AdminProvider({
  initial,
  role,
  children,
}: {
  initial: AdminState;
  role: "admin" | "staff";
  children: React.ReactNode;
}) {
  const router = useRouter();

  // Live Red Rose stores
  const menu = useSyncExternalStore(subscribeToMenu, getMenuSnapshot, getMenuServerSnapshot);
  const rrOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const rrSessions = useSyncExternalStore(subscribeToSessions, getSessionsSnapshot, getSessionsServerSnapshot);
  const rrBills = useSyncExternalStore(subscribeToBills, getBillsSnapshot, getBillsServerSnapshot);
  const rrCoupons = useSyncExternalStore(subscribeToCoupons, getCouponsSnapshot, getCouponsServerSnapshot);
  const rrExpenses = useSyncExternalStore(subscribeToExpenses, getExpensesSnapshot, getExpensesServerSnapshot);
  const rrCategoryRows = useSyncExternalStore(subscribeToCategories, getCategoriesSnapshot, getCategoriesServerSnapshot);
  /* Saved categories first, then anything a product still carries that isn't
     in the saved list — so nothing disappears from the pickers if the settings
     row is missing or a product was filed under an old name. */
  const savedCategories = useMemo(() => categoriesFrom(rrCategoryRows), [rrCategoryRows]);
  const categories = useMemo(() => {
    const used = menu.map((m) => m.category).filter(Boolean);
    return [...new Set([...savedCategories, ...used])];
  }, [savedCategories, menu]);

  /* Bills the admin has just completed in this session. Red Rose's `bills`
     table stores the thin, session-settling record; the admin's billing panel
     builds a richer Bill (items, GST split, discount, payment method, etc.)
     so we keep those extras here and merge them with what Supabase sends down
     for Orders, print and WhatsApp. They survive until the tab is refreshed. */
  const [extraBills, setExtraBills] = useState<Bill[]>([]);

  // Build the AdminState snapshot from Red Rose data
  const s: AdminState = useMemo(() => {
    const bySession = indexBySession(rrOrders);
    const sessionById = new Map(rrSessions.map((x) => [x.id, x]));
    const serverBills = rrBills.map((b) => toBill(b, bySession, sessionById));
    const serverIds = new Set(serverBills.map((b) => b.id));
    const localOnly = extraBills.filter((b) => !serverIds.has(b.id));
    return {
      ...initial,
      products: menu.map(toProduct),
      orders: rrOrders.map(toOrder),
      sessions: rrSessions.map((x) => toSession(x, bySession)),
      bills: [...localOnly, ...serverBills].sort((a, b) => b.createdAt - a.createdAt),
      coupons: rrCoupons.map(toCoupon),
      expenses: rrExpenses.map(toExpense),
      expenseCategories: [...new Set(rrExpenses.map((e) => e.category).filter(Boolean))].map((name) => ({ id: name, name })),
    };
  }, [initial, menu, rrOrders, rrSessions, rrBills, rrCoupons, rrExpenses, extraBills]);

  // Floor tabs — the open sessions, with their orders aggregated
  const floor: FloorTab[] = useMemo(() => {
    return s.sessions
      // "bill_requested" is still an OPEN tab — the guest has asked to pay, not
      // paid. Filtering it out here is what made a tab vanish from the billing
      // panel the moment somebody tapped "Request bill": Open tabs still listed
      // it, but "Complete in Billing" opened an empty counter sale.
      .filter((sess) => sess.status === "open" || sess.status === "bill_requested")
      .map((sess) => {
        // A cancelled ticket is not on the tab: it must not add items, money or
        // a "new order" badge to what the admin or the waiter sees.
        const sessOrders = s.orders.filter((o) => o.sessionId === sess.id && o.status !== "cancelled");
        const items = sessOrders.reduce(
          (sum, o) => sum + o.items.reduce((is, it) => is + it.qty, 0),
          0
        );
        const total = sessOrders.reduce((sum, o) => sum + o.subtotal, 0);
        const fresh = sessOrders.filter((o) => o.status === "new").length;
        const cooking = sessOrders.filter((o) => o.status === "preparing").length;
        // The order's mode wins over the session's (older delivery sessions
        // were all written as 'takeaway').
        const mode = sessOrders[0]?.mode ?? sess.mode;
        const home = mode === "takeaway" || mode === "delivery";
        const live = sessOrders.filter((o) => !o.billed);
        return {
          session: sess,
          mode: mode ?? "table",
          orders: sessOrders,
          total,
          items,
          fresh,
          cooking,
          billRequested: sess.billRequestedAt !== null,
          billRequestedAt: sess.billRequestedAt,
          couponCode: sessOrders.map((o) => o.couponCode).find(Boolean) ?? null,
          discount: sessOrders.reduce((sum, o) => sum + (o.discount ?? 0), 0),
          deliveryFee: sessOrders.reduce((sum, o) => sum + (o.deliveryFee ?? 0), 0),
          home,
          awaitingApproval: live.some((o) => o.live === "awaiting_admin"),
          readyToBill: items > 0 && live.length > 0 && live.every((o) => o.live === "ready" || o.live === "served"),
          note: sessOrders.map((o) => o.note).find(Boolean) ?? "",
        };
      });
  }, [s.sessions, s.orders]);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++tid.current;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      setTimeout(
        () => dismiss(id),
        t.kind === "order" || t.kind === "bill" ? 12000 : t.kind === "err" ? 7000 : 4000
      );
    },
    [dismiss]
  );

  // Confirm modal
  const [pending, setPending] = useState<ConfirmReq | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback(
    (c: ConfirmReq) =>
      new Promise<boolean>((resolve) => {
        setPending(c);
        resolver.current = resolve;
      }),
    []
  );
  const answer = useCallback((v: boolean) => {
    const r = resolver.current;
    resolver.current = null;
    setPending(null);
    if (r) r(v);
  }, []);

  // Print target
  const [printNode, setPrintNode] = useState<React.ReactNode>(null);
  const print = useCallback((node: React.ReactNode) => {
    setPrintNode(node);
    requestAnimationFrame(() => window.print());
    setTimeout(() => setPrintNode(null), 1500);
  }, []);

  // Sound
  const sound = useSyncExternalStore(soundPref.subscribe, soundPref.get, () => true);
  const setSound = useCallback((v: boolean) => soundPref.set(v), []);

  // Live clock for "ago" renders
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const base = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );

  // ---------------------------------------------------------------------------
  // act() — route admin ops to Red Rose store mutations
  // ---------------------------------------------------------------------------
  const act = useCallback(
    async <T = unknown>(op: string, args: Record<string, unknown> = {}): Promise<ActResult<T>> => {
      try {
        switch (op) {
          case "order.status": {
            const id = args.id as string;
            const status = args.status as OrderStatus;
            const inverse: Record<OrderStatus, RrOrderStatus> = {
              new: "pending",
              preparing: "cooking",
              ready: "ready",
              served: "served",
              cancelled: "cancelled",
            };
            rrUpdateOrderStatus(id, inverse[status] ?? "pending");
            return { ok: true, result: undefined as T };
          }
          case "order.approve": {
            // Admin accepted a customer's takeaway / delivery / dine-in order:
            // it leaves the queue and becomes a kitchen ticket.
            rrApproveOrder(args.id as string);
            return { ok: true, result: undefined as T };
          }
          case "order.reject": {
            rrRejectOrder(args.id as string);
            return { ok: true, result: undefined as T };
          }
          case "product.toggle": {
            const id = args.id as string;
            const item = menu.find((m) => m.id === id);
            if (!item) return { ok: false, error: "Product not found." };
            rrUpdateMenuItem(id, { status: item.status === "active" ? "inactive" : "active" });
            return { ok: true, result: undefined as T };
          }
          case "product.stock": {
            // Every stock change goes through /api/stock so it lands in the
            // ledger as well as on the product. (This used to read args.stock,
            // which the Inventory +/- buttons never send — so the buttons
            // silently did nothing.)
            const id = args.id as string;
            const delta = args.delta == null ? undefined : Number(args.delta);
            const set = args.set == null ? undefined : Number(args.set);
            const r = await recordStockChange({
              productId: id,
              kind: set !== undefined ? "adjust" : delta !== undefined && delta > 0 ? "restock" : "waste",
              delta,
              set,
              reason: set !== undefined ? "Stock count in Inventory" : "Inventory +/-",
            });
            if (!r.ok) return { ok: false, error: r.error ?? "Could not change the stock." };
            rrUpdateMenuItem(id, { stock: r.stock ?? undefined }, { localOnly: true });
            return { ok: true, result: undefined as T };
          }
          case "product.delete": {
            const id = args.id as string;
            rrDeleteMenuItem(id);
            return { ok: true, result: undefined as T };
          }
          case "product.save": {
            const p = args as Partial<Product> & { id?: string };
            const wantStock = p.stock === null || p.stock === undefined ? null : Number(p.stock);
            // The form's tag chips are the only way to set these flags, and
            // they were never mapped back onto the product — so "best seller"
            // looked like it saved and never did.
            const tags = Array.isArray(p.tags) ? p.tags : [];
            const wantsBestSeller = tags.includes("bestseller");
            if (wantsBestSeller) {
              const others = menu.filter((m) => m.isBestSeller && m.id !== p.id).length;
              if (others >= BEST_SELLER_SLOTS) {
                return {
                  ok: false,
                  error: `The landing page shows ${BEST_SELLER_SLOTS} best sellers. Take one off before adding another.`,
                };
              }
            }
            /* Sizes are the source of truth once a product has any, so the
               single price saved on the product becomes the cheapest size —
               what the menu shows as "from". The per-size stock lives in the
               sizes themselves and is never copied to menu_items.stock, or
               the two counts drift. */
            const variants = Array.isArray(p.variants) ? p.variants : [];
            const payload: Partial<MenuItem> = {
              name: p.name,
              category: p.category ?? "Other",
              price: variants.length ? Math.min(...variants.map((v) => v.price)) : p.price ?? 0,
              variants,
              description: p.description ?? "",
              image: p.image ?? "",
              lowStockThreshold: p.lowAt ?? undefined,
              weightGrams: p.weightGrams == null ? undefined : Number(p.weightGrams),
              isBestSeller: wantsBestSeller,
              // Never set on save, and cleared on every edit, so an old
              // product stops wearing a badge nobody chose.
              isPopular: false,
              isChefSpecial: false,
              status: p.active === false ? "inactive" : "active",
            };
            if (p.id) {
              const before = menu.find((m) => m.id === p.id)?.stock ?? null;
              // With sizes, there is no single count to adjust — each size
              // carries its own, saved inside `variants`.
              if (variants.length) payload.stock = undefined;
              // Switching tracking off (or on) is a product change; a changed
              // count is a stock movement and goes through /api/stock so the
              // ledger records who corrected it and by how much.
              if (wantStock === null) payload.stock = undefined;
              // Awaited: the toast must not say "saved" before the database
              // has agreed, or the change reappears undone a moment later.
              const up = await rrUpdateMenuItem(p.id, payload);
              if (up.error) return { ok: false, error: up.error.message };
              if (wantStock !== null && wantStock !== before) {
                const r = await recordStockChange({
                  productId: p.id,
                  kind: "adjust",
                  set: wantStock,
                  reason: "Stock count in Inventory",
                });
                if (!r.ok) return { ok: false, error: r.error ?? "Saved, but the stock count didn't change." };
              }
              if (wantsBestSeller && menuSchemaIsOutdated()) return { ok: false, error: MENU_MIGRATION_HINT };
              const saved = menu.find((m) => m.id === p.id);
              return { ok: true, result: toProduct({ ...(saved as MenuItem), ...payload } as MenuItem) as unknown as T };
            }
            // New products start empty and the opening count is booked in as
            // a movement, so the ledger balances from day one.
            const { item: created, saved: landed } = rrAddMenuItem({ ...(payload as MenuItem), stock: 0 });
            const res = await landed;
            if (res.error) return { ok: false, error: res.error.message };
            // A product with sizes books no opening stock of its own: the
            // counts are per size and were saved with the sizes.
            if (!variants.length && wantStock !== null && wantStock > 0) {
              // Only now — the row has to exist before /api/stock can find it.
              const r = await recordStockChange({
                productId: created.id,
                kind: "restock",
                set: wantStock,
                reason: "Opening stock",
              });
              if (!r.ok) return { ok: false, error: r.error ?? "Added, but the opening stock didn't save." };
            }
            if (wantsBestSeller && menuSchemaIsOutdated()) return { ok: false, error: MENU_MIGRATION_HINT };
            return { ok: true, result: toProduct({ ...created, stock: wantStock ?? undefined }) as unknown as T };
          }
          case "coupon.save": {
            const c = args as Partial<Coupon> & { id?: string };
            const payload = {
              code: (c.code ?? "").toUpperCase(),
              discountPercent: c.percent ?? 0,
              minOrder: c.minOrder ?? 0,
              expiry: c.expiresAt ?? "",
              usageLimit: c.limit ?? 0,
              active: c.active ?? true,
            };
            if (c.id) rrUpdateCoupon(c.id, payload as Partial<RrCoupon>);
            else rrAddCoupon(payload as unknown as RrCoupon);
            return { ok: true, result: undefined as T };
          }
          case "expense.save": {
            const e = args as Partial<Expense> & { id?: string };
            const r = await rrSaveExpense({
              id: e.id,
              title: e.title,
              category: e.category,
              amount: Number(e.amount ?? 0),
              expenseDate: e.expenseDate,
              notes: e.notes,
            });
            if (!r.ok) return { ok: false, error: r.error ?? "Could not save that expense." };
            return { ok: true, result: r.expense as unknown as T };
          }
          case "expense.delete": {
            const r = await rrDeleteExpense(args.id as string);
            if (!r.ok) return { ok: false, error: r.error ?? "Could not delete that expense." };
            return { ok: true, result: undefined as T };
          }
          case "category.create": {
            const r = await rrAddCategory(String(args.name ?? ""), savedCategories);
            if (!r.ok) return { ok: false, error: r.error ?? "Could not create that category." };
            return { ok: true, result: undefined as T };
          }
          case "category.delete": {
            const name = String(args.name ?? "");
            const inUse = menu.filter((m) => m.category === name).length;
            if (inUse > 0) {
              return { ok: false, error: `${inUse} product${inUse === 1 ? " is" : "s are"} still in "${name}". Move them first.` };
            }
            const r = await rrDeleteCategory(name, savedCategories);
            if (!r.ok) return { ok: false, error: r.error ?? "Could not delete that category." };
            return { ok: true, result: undefined as T };
          }
          case "category.rename": {
            // Categories aren't a table of their own — they are whatever the
            // products say they are, so renaming one re-tags every product in
            // it. Without this the Inventory rename button errored out.
            const from = String(args.from ?? "");
            const to = String(args.to ?? "").trim();
            if (!from || !to) return { ok: false, error: "Give the category a name." };
            // Rename it in the saved list AND re-tag every product in it, so a
            // category with no products yet can still be renamed.
            const r = await rrRenameCategory(from, to, savedCategories);
            if (!r.ok) return { ok: false, error: r.error ?? "Could not rename that category." };
            for (const m of menu.filter((x) => x.category === from)) {
              await rrUpdateMenuItem(m.id, { category: to });
            }
            return { ok: true, result: undefined as T };
          }
          case "coupon.delete": {
            const id = args.id as string;
            rrDeleteCoupon(id);
            return { ok: true, result: undefined as T };
          }
          case "bill.create": {
            const items = (args.items as OrderItem[]) ?? [];
            const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
            const couponCode = (args.couponCode as string | null) || null;
            const cp = couponCode ? rrCoupons.find((c) => c.code === couponCode) : null;
            const couponDiscount = cp ? Math.round((subtotal * cp.discountPercent) / 100 * 1000) / 1000 : 0;
            const manualType = (args.manualType as "amount" | "percent" | "none") ?? "none";
            const manualValue = Number(args.manualValue ?? 0);
            const manualDiscount =
              manualType === "percent" ? Math.round((subtotal * manualValue) / 100 * 1000) / 1000
              : manualType === "amount" ? Math.round(manualValue * 1000) / 1000
              : 0;
            const discount = Math.round((couponDiscount + manualDiscount) * 1000) / 1000;
            const extra = Number(args.extra ?? 0) || 0;
            // Delivery is money the shop collects on top of the goods, so it
            // is added after the discount and before the total — exactly the
            // way the customer was quoted it at checkout.
            const deliveryFee = Math.max(0, Number(args.deliveryFee ?? 0) || 0);
            const deliveryPartner = deliveryFee > 0 || args.isDelivery ? String(args.deliveryPartner ?? "").trim() : "";
            const isGst = Boolean(args.isGst);
            const gstPercent = Number(args.gstPercent ?? 0);
            /* Must match computeBill() in money.ts exactly, or the number the
               admin sees while taking the money is not the number on the
               invoice. Discount first, VAT on what is left, delivery on top
               (a service fee, not goods). */
            const taxable = Math.max(0, Math.round((subtotal - discount) * 1000) / 1000);
            const gstAmount = isGst ? Math.round((taxable * gstPercent) / 100 * 1000) / 1000 : 0;
            const total = Math.round((taxable + gstAmount + deliveryFee + extra) * 1000) / 1000;
            const payment = (args.payment as Bill["payment"]) ?? "cash";
            const received = Number(args.received ?? total);
            const cashAmount = payment === "split" ? Number(args.cashAmount ?? 0) : payment === "cash" ? total : 0;
            const cardAmount = payment === "split" ? Number(args.cardAmount ?? 0) : payment === "card" ? total : 0;
            const upiAmount = payment === "upi" ? total : 0;
            const change = payment === "cash" && received > total ? Math.round((received - total) * 1000) / 1000 : 0;
            const sessionId = (args.sessionId as string | undefined) ?? null;
            // Alphanumeric tail matching the API id regex (BL-… + alphanum).
            // 0/O and 1/I/L are left out so a printed id is unambiguous when
            // read back over the phone.
            const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
            let tail = "";
            for (let i = 0; i < 5; i++) tail += alpha[Math.floor(Math.random() * alpha.length)];
            const id = `BL-${Date.now().toString(36).toUpperCase()}${tail}`;
            // Session-keyed when the bill settles a tab, so the number matches
            // the one the guest already saw as their order number,
            // and probed forward if those digits are already in use.
            const invoiceNo = issueInvoiceNumber(
              sessionId ?? id,
              rrBills.map((x) => x.invoiceNo || "").filter(Boolean) as string[],
            );
            const bill: Bill = {
              id,
              invoiceNo,
              source: sessionId ? "tab" : "counter",
              mode: (args.mode as OrderMode) ?? (sessionId ? "table" : "standing"),
              sessionId,
              customerName: (args.customerName as string) || "",
              customerPhone: (args.customerPhone as string) || "",
              items,
              itemCount: items.reduce((a, i) => a + i.qty, 0),
              subtotal,
              couponCode,
              couponPercent: cp?.discountPercent ?? 0,
              couponDiscount,
              couponSource: null,
              manualType,
              manualValue,
              manualDiscount,
              discount,
              deliveryFee,
              deliveryPartner,
              total,
              createdAt: Date.now(),
              tax: gstAmount,
              taxRate: gstPercent,
              status: "completed",
              isGst,
              gstAmount,
              gstPercent,
              taxableAmount: taxable,
              cashAmount,
              upiAmount,
              cardAmount,
              payment,
              received,
              change,
              extra,
              note: typeof args.note === "string" ? args.note : "",
            };
            setExtraBills((cur) => [bill, ...cur.filter((b) => b.id !== id)]);
            // Serialise the rich bill into a Supabase-safe payload. Numbers,
            // strings and plain objects only — the admin uses this on the
            // public /invoice/INV-… page to re-render the same bill without
            // any URL blob.
            const payloadJson: Record<string, unknown> = JSON.parse(JSON.stringify(bill));
            if (sessionId) {
              try {
                // The in-house billSession writes its own bill row with the
                // thin fields; we want the rich bill persisted instead, with
                // the same id so the DB has one row per bill.
                rrCreateBill({
                  id,
                  sessionId,
                  subtotal,
                  tax: gstAmount,
                  discount,
                  total,
                  couponCode,
                  paidMethod: payment,
                  invoiceNo,
                  payload: payloadJson,
                });
                // Close the tickets out too. Without this the orders stay
                // billed=false, so a settled order kept showing up as
                // "ready to bill" on the online queue, the open tabs and the
                // waiter's board for ever.
                rrMarkSessionBilled(sessionId);
                rrCloseSession(sessionId, id);
              } catch (e) {
                console.warn("[bill] failed to close session", e);
              }
            } else {
              // Counter walk-in bills had no DB row until now. Persist the
              // rich payload so the short /invoice/… link works cross-device.
              rrCreateBill({
                id,
                sessionId: null,
                subtotal,
                tax: gstAmount,
                discount,
                total,
                couponCode,
                paidMethod: payment,
                invoiceNo,
                payload: payloadJson,
              });
            }
            return { ok: true, result: bill as unknown as T };
          }
          case "settings.update": {
            // Admin settings are locally-controlled defaults in Red Rose; a
            // write just no-ops so the UI can still save without erroring.
            return { ok: true, result: undefined as T };
          }
          case "session.addItems": {
            const sessionId = args.sessionId as string;
            const items = (args.items as OrderItem[]) ?? [];
            if (!items.length) return { ok: false, error: "No items to add." };
            const sess = rrSessions.find((x) => x.id === sessionId);
            if (!sess) return { ok: false, error: "That tab is no longer open." };
            // The guest has asked to pay. Adding to the tab now would charge
            // them for something they never agreed to, so it is refused here
            // as well as hidden in the UI.
            if (sess.billRequestedAt) {
              return { ok: false, error: "This guest has asked for the bill — nothing more can go on the tab. Bill it, then start a new one." };
            }
            const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
            // Keep the product id on the line. Without it the stock never
            // comes off for an admin-added item and the line is invisible to
            // the product analytics.
            const rrItems = items.map((i, idx) => ({
              id: i.productId ?? `oi-${Date.now().toString(36)}-${idx}`,
              name: i.name,
              price: i.price,
              qty: i.qty,
            }));
            // A takeaway or delivery is one order spread over several tickets.
            // The ticket we are about to write has to carry the same identity
            // and the same address as the first one, or the chef prints a
            // delivery with nowhere to send it and the driver gets half an
            // address. The ORDER's mode wins over the session's for the same
            // reason it does everywhere else: sessions opened before delivery
            // had its own mode were all filed as 'takeaway'.
            const prior = rrOrders
              .filter((o) => o.sessionId === sessionId)
              .sort((a, b) => a.createdAt - b.createdAt);
            const origin = prior[0];
            rrAddOrder({
              table: sess.tableNumber ?? 0,
              standingLabel: sess.standingLabel ?? undefined,
              mode: origin?.mode ?? sess.mode,
              items: rrItems,
              priority: "normal",
              subtotal,
              tax: 0,
              total: subtotal,
              source: "admin",
              status: "pending",
              sessionId,
              // The delivery charge was already billed on the first ticket —
              // adding a samosa does not mean paying for the van twice.
              deliveryAddress: origin?.deliveryAddress,
              customer: origin?.customer ?? {
                name: sess.customerName ?? "",
                phone: sess.customerPhone ?? "",
              },
            });
            return { ok: true, result: undefined as T };
          }
          case "session.cancel": {
            const sessionId = args.sessionId as string;
            // Cancel the tickets too, or they stay "live" for ever: the kitchen
            // keeps cooking them, the waiter keeps showing them, and the
            // customer's own order history never says what happened.
            rrCancelSession(sessionId);
            rrVoidSession(sessionId);
            return { ok: true, result: undefined as T };
          }
          default:
            return { ok: false, error: "That action isn't available here." };
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
      }
    },
    [menu, rrCoupons, rrOrders, rrSessions, savedCategories]
  );

  const refresh = useCallback(async () => {
    // Red Rose realtime keeps us in sync; nothing explicit to do.
    router.refresh();
  }, [router]);

  return (
    <C.Provider
      value={{
        s,
        role,
        act,
        refresh,
        toast,
        toasts,
        dismiss,
        confirm,
        pending,
        answer,
        print,
        printNode,
        sound,
        setSound,
        base,
        now,
        floor,
        categories,
      }}
    >
      {children}
    </C.Provider>
  );
}
