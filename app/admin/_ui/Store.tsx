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
}

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
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    price: m.price,
    stock: m.stock ?? null,
    lowAt: m.lowStockThreshold ?? 5,
    description: m.description ?? "",
    image: m.image ?? "",
    eggless: false,
    tags: [
      ...(m.isPopular ? ["popular"] : []),
      ...(m.isChefSpecial ? ["chef"] : []),
      ...(m.isBestSeller ? ["bestseller"] : []),
    ],
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
    createdAt: o.createdAt,
    updatedAt: o.createdAt,
  };
}

function toSession(sess: RrSession): Session {
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
    couponCode: null,
  };
}

function toBill(b: RrBill): Bill {
  // The admin POS writes the full invoice payload to Supabase. When it's
  // there, trust it; otherwise reconstruct a thin bill from the row and
  // derive a human-readable INV number from the bill id.
  const p = (b.payload ?? null) as Partial<Bill> | null;
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
    sessionId: b.sessionId ?? null,
    customerName: "",
    customerPhone: "",
    items: [],
    itemCount: 0,
    subtotal: b.subtotal ?? 0,
    couponCode: b.couponCode ?? null,
    couponPercent: 0,
    couponDiscount: b.discount ?? 0,
    couponSource: null,
    manualType: "none",
    manualValue: 0,
    manualDiscount: 0,
    discount: b.discount ?? 0,
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
    note: "",
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

  /* Bills the admin has just completed in this session. Red Rose's `bills`
     table stores the thin, session-settling record; the admin's billing panel
     builds a richer Bill (items, GST split, discount, payment method, etc.)
     so we keep those extras here and merge them with what Supabase sends down
     for Orders, print and WhatsApp. They survive until the tab is refreshed. */
  const [extraBills, setExtraBills] = useState<Bill[]>([]);

  // Build the AdminState snapshot from Red Rose data
  const s: AdminState = useMemo(() => {
    const serverBills = rrBills.map(toBill);
    const serverIds = new Set(serverBills.map((b) => b.id));
    const localOnly = extraBills.filter((b) => !serverIds.has(b.id));
    return {
      ...initial,
      products: menu.map(toProduct),
      orders: rrOrders.map(toOrder),
      sessions: rrSessions.map(toSession),
      bills: [...localOnly, ...serverBills].sort((a, b) => b.createdAt - a.createdAt),
      coupons: rrCoupons.map(toCoupon),
    };
  }, [initial, menu, rrOrders, rrSessions, rrBills, rrCoupons, extraBills]);

  // Floor tabs — the open sessions, with their orders aggregated
  const floor: FloorTab[] = useMemo(() => {
    return s.sessions
      .filter((sess) => sess.status === "open")
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
              cancelled: "served",
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
            const payload: Partial<MenuItem> = {
              name: p.name,
              category: p.category ?? "Other",
              price: p.price ?? 0,
              description: p.description ?? "",
              image: p.image ?? "",
              lowStockThreshold: p.lowAt ?? undefined,
              status: p.active === false ? "inactive" : "active",
            };
            if (p.id) {
              const before = menu.find((m) => m.id === p.id)?.stock ?? null;
              // Switching tracking off (or on) is a product change; a changed
              // count is a stock movement and goes through /api/stock so the
              // ledger records who corrected it and by how much.
              if (wantStock === null) payload.stock = undefined;
              rrUpdateMenuItem(p.id, payload);
              if (wantStock !== null && wantStock !== before) {
                const r = await recordStockChange({
                  productId: p.id,
                  kind: "adjust",
                  set: wantStock,
                  reason: "Stock count in Inventory",
                });
                if (!r.ok) return { ok: false, error: r.error ?? "Saved, but the stock count didn't change." };
              }
            } else {
              // New products start empty and the opening count is booked in as
              // a movement, so the ledger balances from day one.
              const created = rrAddMenuItem({ ...(payload as MenuItem), stock: 0 });
              if (wantStock !== null && wantStock > 0) {
                await recordStockChange({
                  productId: created.id,
                  kind: "restock",
                  set: wantStock,
                  reason: "Opening stock",
                });
              }
            }
            return { ok: true, result: undefined as T };
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
            const isGst = Boolean(args.isGst);
            const gstPercent = Number(args.gstPercent ?? 0);
            const base = Math.max(0, subtotal - discount);
            const taxable = isGst ? Math.round((base / (1 + gstPercent / 100)) * 1000) / 1000 : base;
            const gstAmount = isGst ? Math.round((base - taxable) * 1000) / 1000 : 0;
            const total = Math.round((base + extra) * 1000) / 1000;
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
            const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
            const rrItems = items.map((i, idx) => ({
              id: `oi-${Date.now().toString(36)}-${idx}`,
              name: i.name,
              price: i.price,
              qty: i.qty,
            }));
            rrAddOrder({
              table: sess.tableNumber ?? 0,
              standingLabel: sess.standingLabel ?? undefined,
              mode: sess.mode,
              items: rrItems,
              priority: "normal",
              subtotal,
              tax: 0,
              total: subtotal,
              source: "admin",
              status: "pending",
              sessionId,
              customer: {
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
            return { ok: false, error: `This panel is read-only on Red Rose — "${op}" isn't wired up.` };
        }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
      }
    },
    [menu, rrCoupons, rrSessions]
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
      }}
    >
      {children}
    </C.Provider>
  );
}
