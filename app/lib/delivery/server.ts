import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SETTINGS, type DeliveryArea, type DeliverySettings, type PricingMode, areaIsPriced, feeForDistance, feeForWeight,
  haversineKm, hoursLabel, isOpenNow, rowToArea, rowToSettings,
} from './shared';

// ---------------------------------------------------------------------------
// Settings (cached briefly; falls back to defaults if the table is missing)
// ---------------------------------------------------------------------------
let cached: { at: number; value: DeliverySettings } | null = null;

export function clearSettingsCache() { cached = null; }

export async function loadSettings(sb: SupabaseClient): Promise<DeliverySettings> {
  if (cached && Date.now() - cached.at < 10_000) return cached.value;
  const { data, error } = await sb.from('delivery_settings').select('*').eq('id', 1).maybeSingle();
  const value = error || !data ? DEFAULT_SETTINGS : rowToSettings(data);
  cached = { at: Date.now(), value };
  return value;
}

// ---------------------------------------------------------------------------
// Road distance: Google Routes API when a key is set, otherwise an estimate
// ---------------------------------------------------------------------------
const distanceCache = new Map<string, { at: number; km: number; source: 'google' | 'estimated' }>();
const ROAD_FACTOR = 1.3; // straight line -> typical road distance

export async function roadDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<{ km: number; source: 'google' | 'estimated' }> {
  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = distanceCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { km: hit.km, source: hit.source };

  const estimate = () => ({ km: haversineKm(from.lat, from.lng, to.lat, to.lng) * ROAD_FACTOR, source: 'estimated' as const });
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  let result: { km: number; source: 'google' | 'estimated' };
  if (!apiKey) {
    result = estimate();
  } else {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
          destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
          travelMode: 'DRIVE',
        }),
      });
      clearTimeout(timer);
      const json = (await res.json()) as { routes?: { distanceMeters?: number }[] };
      const meters = json.routes?.[0]?.distanceMeters;
      result = res.ok && typeof meters === 'number' ? { km: meters / 1000, source: 'google' } : estimate();
    } catch {
      result = estimate(); // Google down or slow: checkout must still work
    }
  }
  result.km = Math.round(result.km * 100) / 100;
  if (distanceCache.size > 2000) distanceCache.clear();
  distanceCache.set(key, { at: Date.now(), ...result });
  return result;
}

// ---------------------------------------------------------------------------
// Quote: everything the customer needs to know before ordering
// ---------------------------------------------------------------------------
export interface Quote {
  ok: boolean;
  reason?: string;       // why delivery is not possible right now
  pricingMode: PricingMode;
  areaId: string | null;
  areaName: string;
  distanceKm: number;
  distanceSource: 'google' | 'estimated' | 'area';
  fee: number;
  free: boolean;
  freeKm: number;
  maxKm: number;
  minOrder: number;
  hoursText: string;
  codEnabled: boolean;
  codMax: number;
  onlinePaymentEnabled: boolean; // PAYMENT
  taxOnFee: boolean;
}

/** Areas the admin created. `onlyActive` is what the customer may pick from. */
export async function loadAreas(sb: SupabaseClient, onlyActive = true): Promise<DeliveryArea[]> {
  let q = sb.from('delivery_areas').select('*');
  if (onlyActive) q = q.eq('active', true);
  const { data, error } = await q.order('sort', { ascending: true }).order('name', { ascending: true });
  if (error || !data) return []; // table missing (SQL not run yet): no areas to offer
  return data.map((r) => rowToArea(r as Record<string, unknown>));
}

/** Where the order is going: an area id (areas mode) or a map pin (distance mode). */
export interface QuoteTarget { areaId?: string; lat?: number; lng?: number }

export async function buildQuote(
  sb: SupabaseClient,
  target: QuoteTarget,
  subtotal?: number,
  /** Weight of the basket in grams — decides which of the area's weight
   *  brackets applies. 0 when we don't know it yet (a quote before the basket
   *  exists), which lands on the lightest bracket. */
  grams = 0
): Promise<{ quote: Quote; settings: DeliverySettings; area: DeliveryArea | null }> {
  const s = await loadSettings(sb);

  let fee = 0;
  let km = 0;
  let source: Quote['distanceSource'] = 'area';
  let area: DeliveryArea | null = null;
  let minOrder = s.minOrder;
  let reason: string | undefined;
  let missingTarget: string | undefined;

  if (s.pricingMode === 'areas') {
    const areas = target.areaId ? await loadAreas(sb, true) : [];
    area = areas.find((a) => a.id === target.areaId) ?? null;
    if (!area) missingTarget = 'Please choose your delivery area.';
    else if (!areaIsPriced(area)) {
      // No weight brackets means nobody has said what delivery there costs.
      // Refusing is the only safe answer: there is no flat fee to fall back on.
      missingTarget = `Delivery to ${area.name} is not priced yet — please call the shop.`;
    } else {
      fee = feeForWeight(area, grams);
      minOrder = area.minOrder ?? s.minOrder;
    }
  } else if (typeof target.lat === 'number' && typeof target.lng === 'number') {
    const r = await roadDistance({ lat: s.shopLat, lng: s.shopLng }, { lat: target.lat, lng: target.lng });
    km = r.km; source = r.source; fee = feeForDistance(s, km);
  } else {
    missingTarget = 'Please mark your delivery location on the map.';
  }

  if (!s.enabled) reason = 'Delivery is not available right now.';
  else if (s.busy) reason = "We're too busy to deliver right now. Please try again later or choose takeaway.";
  else if (!isOpenNow(s.hours)) reason = `We're outside delivery hours. ${hoursLabel(s.hours)}.`;
  else if (missingTarget) reason = missingTarget;
  else if (s.pricingMode === 'distance' && km > s.maxKm) reason = `Sorry, we deliver up to ${s.maxKm} km. You are about ${km.toFixed(1)} km away.`;
  else if (subtotal !== undefined && subtotal < minOrder) reason = `Minimum order for delivery is KD ${minOrder.toFixed(3)}.`;

  return {
    settings: s,
    area,
    quote: {
      ok: !reason,
      reason,
      pricingMode: s.pricingMode,
      areaId: area?.id ?? null,
      areaName: area?.name ?? '',
      distanceKm: km,
      distanceSource: source,
      fee,
      free: fee === 0,
      freeKm: s.freeKm,
      maxKm: s.maxKm,
      minOrder,
      hoursText: hoursLabel(s.hours),
      codEnabled: s.codEnabled,
      codMax: s.codMax,
      onlinePaymentEnabled: s.onlinePaymentEnabled,
      taxOnFee: s.taxOnFee,
    },
  };
}

/**
 * Delivery charge for an order placed from /menu.
 *
 * That checkout picks an area by NAME (the "governorate" field on the address),
 * not by id, so this looks the area up by name and prices it the same way the
 * browser did — the basket's weight against the area's brackets, falling back
 * to the area's flat fee. Returns 0 when the shop has no matching area, which
 * is the old flat-rate behaviour.
 *
 * The point is that the fee is decided HERE: the browser's number is only ever
 * a preview, so nobody can post a delivery order with the fee set to zero.
 */
export async function feeForAreaName(sb: SupabaseClient, name: unknown, grams = 0): Promise<number> {
  const wanted = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!wanted) return 0;
  const areas = await loadAreas(sb, true);
  const area = areas.find((a) => a.name.trim().toLowerCase() === wanted);
  if (!area) return 0;
  return Math.round(feeForWeight(area, grams) * 1000) / 1000;
}
