// Delivery rules shared by the server (quotes, checkout) and the browser (admin
// settings form, checkout display). No secrets and no server-only imports here.

export interface DaySchedule {
  closed: boolean;
  open: string;  // "HH:MM" 24h, Kuwait time
  close: string; // "HH:MM"; a close earlier than open means "after midnight"
}

export interface FeeTier { upToKm: number; fee: number }
export type FeeMode = 'per_km' | 'fixed' | 'tiers';
export type FailedPolicy = 'customer_pays_all' | 'customer_pays_fee' | 'restaurant_absorbs';

/** areas = admin-defined areas with a fee each (default); distance = map pin + km. */
export type PricingMode = 'areas' | 'distance';

/** One weight bracket: everything from minG up to (and including) maxG costs
 *  `fee` to deliver. maxG === null means "and anything heavier". */
export interface WeightTier {
  minG: number;
  maxG: number | null;
  fee: number;
}

export interface DeliveryArea {
  id: string;
  name: string;
  /** Legacy flat fee. Nothing charges it any more — an area is priced by its
   *  weight brackets and nothing else. Kept only so an old row still parses
   *  and the column can stay in the database. */
  fee: number;
  /** Weight brackets, lightest first. An area with none is not priced yet and
   *  cannot be delivered to. */
  tiers: WeightTier[];
  /** Legacy per-area minimum order. No longer set by the admin. */
  minOrder: number | null;
  active: boolean;
  sort: number;
}

/** An area can only be ordered to once the admin has given it at least one
 *  weight bracket. There is no flat fee to fall back on. */
export function areaIsPriced(area: Pick<DeliveryArea, 'tiers'>): boolean {
  return (area.tiers?.length ?? 0) > 0;
}

/** "750 g" / "1.5 kg" — one weight, written the way a customer reads it. */
export function gramsLabel(g: number): string {
  if (g <= 0) return '0 g';
  if (g < 1000) return `${Math.round(g)} g`;
  const kg = g / 1000;
  return `${kg % 1 === 0 ? kg : kg.toFixed(kg < 10 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '')} kg`;
}

/** "Up to 1 kg" · "1 kg – 2 kg" · "2 kg and above" — one bracket as a label. */
export function tierLabel(t: WeightTier): string {
  if (t.maxG === null) return `${gramsLabel(t.minG)} and above`;
  if (t.minG <= 0) return `Up to ${gramsLabel(t.maxG)}`;
  return `${gramsLabel(t.minG)} – ${gramsLabel(t.maxG)}`;
}

/** The bracket a basket of this weight falls into, or null when the area has
 *  no brackets at all. */
export function tierForWeight(tiers: WeightTier[], grams: number): WeightTier | null {
  if (!tiers || tiers.length === 0) return null;
  const hit = tiers.find((t) => grams >= t.minG && (t.maxG === null || grams <= t.maxG));
  if (hit) return hit;
  // Lighter than the lightest bracket → the lightest one; heavier than every
  // bracket → the heaviest, so an order can never slip through unpriced.
  return grams < tiers[0].minG ? tiers[0] : tiers[tiers.length - 1];
}

export function parseTiers(raw: unknown): WeightTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      const o = (t ?? {}) as Record<string, unknown>;
      const minG = Number(o.minG ?? o.min_g ?? 0);
      const maxRaw = o.maxG ?? o.max_g;
      const maxG = maxRaw === null || maxRaw === undefined || maxRaw === '' ? null : Number(maxRaw);
      const fee = Number(o.fee ?? 0);
      if (!Number.isFinite(minG) || !Number.isFinite(fee)) return null;
      if (maxG !== null && !Number.isFinite(maxG)) return null;
      return { minG: Math.max(0, minG), maxG, fee: Math.max(0, fee) };
    })
    .filter((t): t is WeightTier => t !== null)
    .sort((a, b) => a.minG - b.minG);
}

/** What delivery costs for a basket of this weight in this area. 0 when the
 *  area has no brackets — such an area is not offered at checkout at all
 *  (see areaIsPriced), so this never silently gives away a free delivery. */
export function feeForWeight(area: Pick<DeliveryArea, 'tiers'>, grams: number): number {
  return tierForWeight(area.tiers ?? [], grams)?.fee ?? 0;
}

export function rowToArea(r: Record<string, unknown>): DeliveryArea {
  const fee = Number(r.fee ?? 0);
  /* Areas created before delivery was priced by weight carry a single flat
     `fee` and no brackets — and a database without the `tiers` column gives
     us none either. Reading that old fee as one open bracket (0 g and above)
     keeps those areas deliverable at exactly the price they already charged,
     until the admin sets real brackets. An area with neither brackets nor a
     fee stays unpriced, and the checkout refuses it. */
  const stored = parseTiers(r.tiers);
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    fee,
    tiers: stored.length > 0 ? stored : fee > 0 ? [{ minG: 0, maxG: null, fee }] : [],
    minOrder: r.min_order === null || r.min_order === undefined ? null : Number(r.min_order),
    active: r.active !== false,
    sort: Number(r.sort ?? 0),
  };
}

export interface DeliverySettings {
  enabled: boolean;
  busy: boolean;
  pricingMode: PricingMode;
  shopLat: number;
  shopLng: number;
  shopLabel: string;
  freeKm: number;
  maxKm: number;
  feeMode: FeeMode;
  feePerKm: number;
  feeFixed: number;
  feeTiers: FeeTier[];
  minOrder: number;
  taxOnFee: boolean;
  hours: Record<string, DaySchedule>; // "0" = Sunday ... "6" = Saturday
  codEnabled: boolean;
  codMax: number; // 0 = no limit
  onlinePaymentEnabled: boolean; // PAYMENT: only true once a gateway is wired
  failedCallAttempts: number;
  failedWaitMinutes: number;
  failedPolicy: FailedPolicy;
  otpLength: number;
  otpExpiryMinutes: number;
  otpMaxAttempts: number;
}

export const DEFAULT_DAY: DaySchedule = { closed: false, open: '10:00', close: '23:00' };

export const DEFAULT_SETTINGS: DeliverySettings = {
  enabled: true,
  busy: false,
  pricingMode: 'areas',
  shopLat: 29.3759,
  shopLng: 47.9774,
  shopLabel: 'Red Rose Sweets',
  freeKm: 5,
  maxKm: 15,
  feeMode: 'per_km',
  feePerKm: 0.25,
  feeFixed: 1,
  feeTiers: [],
  minOrder: 3,
  taxOnFee: false,
  hours: Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, { ...DEFAULT_DAY }])),
  codEnabled: true,
  codMax: 0,
  onlinePaymentEnabled: false,
  failedCallAttempts: 2,
  failedWaitMinutes: 10,
  failedPolicy: 'customer_pays_all',
  otpLength: 6,
  otpExpiryMinutes: 120,
  otpMaxAttempts: 3,
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const n = (v: unknown, d: number) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));

/** DB row (snake_case) -> settings, falling back to defaults for anything missing. */
export function rowToSettings(r: Record<string, unknown> | null | undefined): DeliverySettings {
  if (!r) return DEFAULT_SETTINGS;
  const D = DEFAULT_SETTINGS;
  const hoursRaw = (r.hours && typeof r.hours === 'object' ? r.hours : {}) as Record<string, Partial<DaySchedule>>;
  const hours: Record<string, DaySchedule> = {};
  for (let d = 0; d < 7; d++) {
    const h = hoursRaw[String(d)] ?? {};
    hours[String(d)] = {
      closed: h.closed === true,
      open: typeof h.open === 'string' ? h.open : DEFAULT_DAY.open,
      close: typeof h.close === 'string' ? h.close : DEFAULT_DAY.close,
    };
  }
  const tiers = Array.isArray(r.fee_tiers)
    ? (r.fee_tiers as unknown[])
        .map((t) => ({ upToKm: n((t as FeeTier)?.upToKm, NaN), fee: n((t as FeeTier)?.fee, NaN) }))
        .filter((t) => Number.isFinite(t.upToKm) && Number.isFinite(t.fee))
        .sort((a, b) => a.upToKm - b.upToKm)
    : [];
  return {
    enabled: r.enabled !== false,
    busy: r.busy === true,
    pricingMode: r.pricing_mode === 'distance' ? 'distance' : 'areas',
    shopLat: n(r.shop_lat, D.shopLat),
    shopLng: n(r.shop_lng, D.shopLng),
    shopLabel: typeof r.shop_label === 'string' ? r.shop_label : D.shopLabel,
    freeKm: n(r.free_km, D.freeKm),
    maxKm: n(r.max_km, D.maxKm),
    feeMode: (['per_km', 'fixed', 'tiers'] as const).includes(r.fee_mode as FeeMode) ? (r.fee_mode as FeeMode) : D.feeMode,
    feePerKm: n(r.fee_per_km, D.feePerKm),
    feeFixed: n(r.fee_fixed, D.feeFixed),
    feeTiers: tiers,
    minOrder: n(r.min_order, D.minOrder),
    taxOnFee: r.tax_on_fee === true,
    hours,
    codEnabled: r.cod_enabled !== false,
    codMax: n(r.cod_max, D.codMax),
    onlinePaymentEnabled: r.online_payment_enabled === true,
    failedCallAttempts: n(r.failed_call_attempts, D.failedCallAttempts),
    failedWaitMinutes: n(r.failed_wait_minutes, D.failedWaitMinutes),
    failedPolicy: (['customer_pays_all', 'customer_pays_fee', 'restaurant_absorbs'] as const).includes(r.failed_policy as FailedPolicy)
      ? (r.failed_policy as FailedPolicy) : D.failedPolicy,
    otpLength: Math.min(6, Math.max(4, n(r.otp_length, D.otpLength))),
    otpExpiryMinutes: n(r.otp_expiry_minutes, D.otpExpiryMinutes),
    otpMaxAttempts: n(r.otp_max_attempts, D.otpMaxAttempts),
  };
}

export function settingsToRow(s: DeliverySettings): Record<string, unknown> {
  return {
    enabled: s.enabled, busy: s.busy, pricing_mode: s.pricingMode,
    shop_lat: s.shopLat, shop_lng: s.shopLng, shop_label: s.shopLabel,
    free_km: s.freeKm, max_km: s.maxKm,
    fee_mode: s.feeMode, fee_per_km: s.feePerKm, fee_fixed: s.feeFixed, fee_tiers: s.feeTiers,
    min_order: s.minOrder, tax_on_fee: s.taxOnFee, hours: s.hours,
    cod_enabled: s.codEnabled, cod_max: s.codMax, online_payment_enabled: s.onlinePaymentEnabled,
    failed_call_attempts: s.failedCallAttempts, failed_wait_minutes: s.failedWaitMinutes, failed_policy: s.failedPolicy,
    otp_length: s.otpLength, otp_expiry_minutes: s.otpExpiryMinutes, otp_max_attempts: s.otpMaxAttempts,
    updated_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Distance and fee
// ---------------------------------------------------------------------------

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Delivery fee (KD) for a road distance. Free inside the free radius. */
export function feeForDistance(s: DeliverySettings, km: number): number {
  if (km <= s.freeKm) return 0;
  let fee: number;
  if (s.feeMode === 'fixed') fee = s.feeFixed;
  else if (s.feeMode === 'tiers' && s.feeTiers.length) {
    const tier = s.feeTiers.find((t) => km <= t.upToKm) ?? s.feeTiers[s.feeTiers.length - 1];
    fee = tier.fee;
  } else fee = (km - s.freeKm) * s.feePerKm;
  return Math.round(fee * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Opening hours (Kuwait has no daylight saving: always UTC+3)
// ---------------------------------------------------------------------------

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
};

function kuwaitNow(now: Date): { day: number; minutes: number } {
  const ms = now.getTime() + 3 * 60 * 60 * 1000;
  const d = new Date(ms);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function isOpenNow(hours: Record<string, DaySchedule>, now: Date = new Date()): boolean {
  const { day, minutes } = kuwaitNow(now);
  const today = hours[String(day)];
  if (today && !today.closed) {
    const o = toMin(today.open), c = toMin(today.close);
    if (c > o ? minutes >= o && minutes < c : minutes >= o) return true; // same day, or opened before midnight
  }
  const prev = hours[String((day + 6) % 7)];
  if (prev && !prev.closed) {
    const o = toMin(prev.open), c = toMin(prev.close);
    if (c <= o && minutes < c) return true; // yesterday's shift runs past midnight
  }
  return false;
}

/** "Today 10:00 - 23:00" style text for the customer. */
export function hoursLabel(hours: Record<string, DaySchedule>, now: Date = new Date()): string {
  const { day } = kuwaitNow(now);
  const t = hours[String(day)];
  return !t || t.closed ? 'Closed today' : `Today ${t.open} - ${t.close}`;
}

// ---------------------------------------------------------------------------
// Statuses (shown to customers, drivers and staff)
// ---------------------------------------------------------------------------

export type DeliveryStatus = 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'failed' | 'cancelled';

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: 'Waiting for a driver',
  assigned: 'Driver assigned',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  failed: 'Delivery failed',
  cancelled: 'Cancelled',
};

export interface AddressInput {
  label?: string;
  name: string;
  phone: string;
  area: string;
  block: string;
  street: string;
  jadda?: string;
  building: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  note?: string;
}

export function addressLine(a: Partial<AddressInput>): string {
  const parts = [
    a.area,
    a.block ? `Block ${a.block}` : '',
    a.street ? `Street ${a.street}` : '',
    a.jadda ? `Jadda ${a.jadda}` : '',
    a.building ? `Building ${a.building}` : '',
    a.floor ? `Floor ${a.floor}` : '',
    a.apartment ? `Apt ${a.apartment}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** A delivery as sent to the browser (customer, staff or driver). */
export interface DeliveryDto {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  statusLabel: string;
  createdAt: number;
  customerName: string;
  customerPhone: string;
  address: Record<string, unknown>;
  areaName: string;
  lat: number | null;
  lng: number | null;
  distanceKm: number;
  distanceSource: string;
  fee: number;
  driver: { id: string; name: string; phone: string } | null;
  kitchenStatus: string;
  items: { name: string; qty: number; price: number; notes?: string }[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  couponCode: string | null;
  paymentMethod: string;
  paymentStatus: string;
  codExpected: number;
  codCollected: number | null;
  codSettled: boolean;
  callAttempts: number[];
  pickedUpAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
  failedReason: string | null;
  otpLocked: boolean;
  note: string;
}

