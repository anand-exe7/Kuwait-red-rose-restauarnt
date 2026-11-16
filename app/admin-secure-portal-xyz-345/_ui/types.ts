import { shopName } from "../../lib/shop";
import type { DeliveryAddress, OrderMode, OrderStatus as LiveOrderStatus } from "../../lib/orderStore";
import type { MenuVariant } from "../../lib/menuStore";

export type { DeliveryAddress, OrderMode };
/** The real order lifecycle, as the kitchen and the customer see it. The
 *  admin's own `OrderStatus` below is a coarser, display-only roll-up kept for
 *  the ported pages; anything that has to act on an order (approve, send to
 *  the chef, bill it) reads `Order.live` instead. */
export type LiveStatus = LiveOrderStatus;

// Type surface the Red Rose admin pages import through `./types`.
// Everything here is the shape the pages EXPECT; the Store in this folder
// adapts Red Rose's live Supabase data to this shape.

export type Role = "admin" | "staff";

export type SessionStatus = "open" | "bill_requested" | "closed";
export type OrderStatus = "new" | "preparing" | "ready" | "served" | "cancelled";
export type OrderSource = "customer" | "waiter" | "admin" | "counter";
export type BillSource = "tab" | "counter";
export type DiscountType = "percent" | "amount" | "none";
export type CouponSource = "customer" | "admin" | "guest";
export type PayMethod = "cash" | "upi" | "card" | "split" | "none";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  /** What one of these weighs, in grams — delivery is priced by basket weight.
   *  null = not set, so it counts as 0 g. */
  weightGrams: number | null;
  lowAt: number;
  description: string;
  image: string;
  eggless: boolean;
  tags: string[];
  active: boolean;
  /** Sizes this product is sold in (500 g, 1 kg…). Empty = sold as one thing.
   *  When it is not empty, `price` and `stock` above are summaries of the
   *  sizes, not figures anyone edits directly. */
  variants: MenuVariant[];
  createdAt: number;
}

export interface Session {
  id: string;
  status: SessionStatus;
  /** Where this visit happens — a table, a walk-in, a takeaway or a delivery.
   *  Home orders (takeaway/delivery) take extra items like any other tab, but
   *  only the admin bills them, so every surface needs to tell them apart. */
  mode: OrderMode;
  tableNumber: number | null;
  standingLabel: string;
  openedAt: number;
  closedAt: number | null;
  customerName: string;
  customerPhone: string;
  billRequestedAt: number | null;
  billId: string | null;
  couponCode: string | null;
}

export interface OrderItem {
  productId: string | null;
  name: string;
  price: number;
  qty: number;
  /** Per-line remark the customer typed ("less sweet"). */
  notes?: string;
}

export interface Order {
  id: string;
  no: number;
  sessionId: string;
  /** Where the order goes. */
  mode: OrderMode;
  /** The true lifecycle position — `status` collapses awaiting_admin and
   *  pending into "new", which is exactly the distinction the online-orders
   *  queue is about. */
  live: LiveStatus;
  total: number;
  billed: boolean;
  customerEmail: string;
  deliveryAddress?: DeliveryAddress;
  items: OrderItem[];
  note: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  source: OrderSource;
  subtotal: number;
  /** Discount already applied to this ticket (a coupon the guest used). */
  discount: number;
  couponCode: string | null;
  /** Delivery charge on this ticket — 0 for anything but a delivery. */
  deliveryFee: number;
  createdAt: number;
  updatedAt: number;
}

export type BillStatus = "completed" | "void";
export type Payment = "cash" | "upi" | "card" | "split" | "none";

export interface Bill {
  id: string;
  invoiceNo: string;
  source: BillSource;
  /** How the food left the shop. Analytics splits income by this, so a bill
   *  always carries it, rebuilt from the session's orders for older rows. */
  mode: OrderMode;
  sessionId: string | null;
  customerName: string;
  customerPhone: string;
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  couponCode: string | null;
  couponPercent: number;
  couponDiscount: number;
  couponSource: CouponSource | null;
  manualType: DiscountType;
  manualValue: number;
  manualDiscount: number;
  discount: number;         // total discount applied (coupon + manual)
  /** Delivery charge billed on top of the goods. */
  deliveryFee: number;
  /** Third-party delivery partner who took a counter delivery ("" = none).
   *  Used only by Analytics — it is never printed or sent to the customer. */
  deliveryPartner?: string;
  total: number;
  createdAt: number;
  tax: number;
  taxRate: number;
  status: BillStatus;
  // GST breakdown — stubbed for Red Rose (KWD market, no GST) so the ported
  // GST report still compiles and simply shows zeros.
  isGst: boolean;
  gstAmount: number;
  gstPercent: number;
  taxableAmount: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  payment: PayMethod;
  received: number;
  change: number;
  extra: number;
  note: string;
}

// Per-item stock history isn't tracked in Red Rose, so this is a stub
// used only to keep the ported StockMovementsPage compiling.
export interface StockLedger {
  id: string;
  productId: string;
  kind: "sale" | "restock" | "adjust" | "waste";
  qty: number;
  at: number;
  note: string;
  balance: number;
}

export interface Coupon {
  id: string;
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null;
  limit: number | null;
  used: number;
  active: boolean;
  createdAt: number;
}

export interface Settings {
  shopName: string;
  publicUrl: string;
  walkInsOnly: boolean;
  kotEnabled: boolean;
  orderingEnabled: boolean;
}

// Stubbed types for pages that still reference them (expenses/ingredients were
// stripped per the Red Rose brief, but the Analytics page keeps the field).
export interface Expense {
  id: string;
  amount: number;
  at: number;
  title: string;
  notes: string;
  category: string;
  expenseDate: string;
}
export interface ExpenseCategory { id: string; name: string }
export interface Ingredient { id: string; name: string; unit: string; stock: number }
export interface Batch { id: string; ingredientId: string; qty: number; at: number }
export interface Recipe { id: string; productId: string; ingredients: { id: string; qty: number }[] }
export interface PublicUser { id: string; name: string; role: Role }

export interface AdminState {
  version: number;
  seq: { order: number };
  settings: Settings;
  products: Product[];
  sessions: Session[];
  orders: Order[];
  bills: Bill[];
  coupons: Coupon[];
  users: PublicUser[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  ingredients: Ingredient[];
  batches: Batch[];
  recipes: Recipe[];
}

export function emptyAdminState(): AdminState {
  return {
    version: 0,
    seq: { order: 0 },
    settings: {
      shopName: shopName(),
      publicUrl: "",
      walkInsOnly: false,
      kotEnabled: true,
      orderingEnabled: true,
    },
    products: [],
    sessions: [],
    orders: [],
    bills: [],
    coupons: [],
    users: [],
    expenses: [],
    expenseCategories: [],
    ingredients: [],
    batches: [],
    recipes: [],
  };
}
