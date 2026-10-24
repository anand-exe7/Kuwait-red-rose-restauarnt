import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError, round3 } from '../server/http';
import { STATUS_LABEL, type DeliveryDto, type DeliveryStatus, type FailedPolicy } from './shared';

// Shared building blocks for the delivery API routes.

export function newId(prefix: string): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `${prefix}-${stamp}${rand}`;
}

export type Row = Record<string, unknown>;
export type { DeliveryDto };

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toDto(d: Row, order: Row | undefined, drivers: Map<string, Row>): DeliveryDto {
  const status = (d.status as DeliveryStatus) ?? 'pending';
  const drv = d.driver_id ? drivers.get(String(d.driver_id)) : undefined;
  return {
    id: String(d.id),
    orderId: String(d.order_id),
    status,
    statusLabel: STATUS_LABEL[status] ?? status,
    createdAt: Number(d.created_at),
    customerName: String(d.customer_name ?? ''),
    customerPhone: String(d.customer_phone ?? ''),
    address: (d.address as Row) ?? {},
    areaName: String(d.area_name || ((d.address as Row | null)?.area ?? '')),
    lat: numOrNull(d.lat),
    lng: numOrNull(d.lng),
    distanceKm: Number(d.distance_km),
    distanceSource: String(d.distance_source ?? 'estimated'),
    fee: Number(d.fee),
    driver: drv ? { id: String(drv.id), name: String(drv.name), phone: String(drv.phone) } : null,
    kitchenStatus: String(order?.status ?? 'pending'),
    items: Array.isArray(order?.items) ? (order!.items as DeliveryDto['items']) : [],
    subtotal: Number(order?.subtotal ?? 0),
    tax: Number(order?.tax ?? 0),
    discount: Number(order?.discount ?? 0),
    total: Number(order?.total ?? 0),
    couponCode: (order?.coupon_code as string) ?? null,
    paymentMethod: String(d.payment_method ?? 'cod'),
    paymentStatus: String(d.payment_status ?? 'unpaid'),
    codExpected: Number(d.cod_expected ?? 0),
    codCollected: numOrNull(d.cod_collected),
    codSettled: d.cod_settled === true,
    callAttempts: Array.isArray(d.call_attempts) ? (d.call_attempts as number[]) : [],
    pickedUpAt: numOrNull(d.picked_up_at),
    deliveredAt: numOrNull(d.delivered_at),
    failedAt: numOrNull(d.failed_at),
    failedReason: (d.failed_reason as string) ?? null,
    otpLocked: d.otp_locked === true,
    note: String(d.note ?? ''),
  };
}

/** Loads orders and drivers for a set of delivery rows and maps them to DTOs. */
export async function hydrate(sb: SupabaseClient, rows: Row[]): Promise<DeliveryDto[]> {
  if (rows.length === 0) return [];
  const orderIds = rows.map((r) => String(r.order_id));
  const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean).map(String))];
  const [{ data: orders }, { data: drivers }] = await Promise.all([
    sb.from('orders').select('id,status,items,subtotal,tax,discount,total,coupon_code').in('id', orderIds),
    driverIds.length ? sb.from('drivers').select('id,name,phone').in('id', driverIds) : Promise.resolve({ data: [] as Row[] }),
  ]);
  const orderMap = new Map((orders ?? []).map((o) => [String(o.id), o as Row]));
  const driverMap = new Map((drivers ?? []).map((d) => [String(d.id), d as Row]));
  return rows.map((r) => toDto(r, orderMap.get(String(r.order_id)), driverMap));
}

export async function getDeliveryRow(sb: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await sb.from('deliveries').select('*').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, 'Delivery lookup failed');
  if (!data) throw new HttpError(404, 'Delivery not found');
  return data as Row;
}

export async function getOrderRow(sb: SupabaseClient, id: string): Promise<Row> {
  const { data, error } = await sb.from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw new HttpError(500, 'Order lookup failed');
  if (!data) throw new HttpError(404, 'Order not found');
  return data as Row;
}

/**
 * How much of an ALREADY-PAID order is refunded when delivery fails, per the
 * restaurant's failed-delivery policy. Cash orders have nothing to refund.
 */
export function failedRefundAmount(policy: FailedPolicy, total: number, fee: number): number {
  if (policy === 'restaurant_absorbs') return round3(total);
  if (policy === 'customer_pays_fee') return round3(Math.max(0, total - fee));
  return 0; // customer_pays_all: no refund
}

/**
 * Marks a delivery's order as handed over and bills it (so it counts in the
 * admin Orders and Analytics). Used when the driver confirms the code.
 */
export async function billDeliveredOrder(sb: SupabaseClient, order: Row, deliveryId: string) {
  await sb.from('orders').update({ status: 'served', billed: true }).eq('id', String(order.id));
  const billId = newId('BL');
  const { error } = await sb.from('bills').insert({
    id: billId,
    session_id: `DL-${deliveryId}`,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    discount: Number(order.discount ?? 0),
    total: Number(order.total),
    coupon_code: (order.coupon_code as string) ?? null,
    paid_method: String(order.payment_method ?? 'cod'),
    created_at: Date.now(),
  });
  if (error) console.error('[delivery] bill insert failed', error.message);
}
