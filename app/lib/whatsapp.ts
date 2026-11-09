"use client";

// WhatsApp order dispatch — builds the pre-filled message and opens
// https://wa.me/<number>?text=<encoded> in a new tab. The shop's number lives
// in NEXT_PUBLIC_SHOP_WHATSAPP (digits only, no + or spaces).
//
// This is a client-side deep link, not an API send: the customer sees the
// message in their own WhatsApp and taps Send. The order has already been
// written to Supabase at this point so the chef sees it either way.

import type { Order, OrderItem, DeliveryAddress, CustomerInfo } from './orderStore';
import { formatKWD } from './currency';
import { shopName } from './shop';
import { resolveOrderNo } from './invoice';

export function shopWhatsAppNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_SHOP_WHATSAPP;
  if (!raw) return null;
  // Keep digits only — strip anything the operator may have put in by mistake.
  const digits = raw.replace(/\D/g, '');
  return digits.length ? digits : null;
}

export function isWhatsAppConfigured(): boolean {
  return shopWhatsAppNumber() !== null;
}

function formatItems(items: OrderItem[]): string {
  return items
    .map((i) => {
      const line = `• ${i.qty} × ${i.name} — ${formatKWD(i.price * i.qty)}`;
      return i.notes ? `${line}\n   (${i.notes})` : line;
    })
    .join('\n');
}

function formatAddress(a: DeliveryAddress): string {
  const parts = [
    a.governorate && `${a.governorate}`,
    a.area && `${a.area}`,
    a.street && `Street ${a.street}`,
    a.avenue && `Avenue ${a.avenue}`,
    a.building && `Building ${a.building}`,
    a.floor && `Floor ${a.floor}`,
    a.apartment && `Apt ${a.apartment}`,
  ].filter(Boolean);
  const lines = [parts.join(', ')];
  if (a.landmark) lines.push(`Landmark: ${a.landmark}`);
  return lines.join('\n');
}

export interface WhatsAppOrderInput {
  order: Order;
  mode: 'takeaway' | 'delivery';
  customer: CustomerInfo;
  address?: DeliveryAddress;
  /** Delivery charge added on top of the goods total (delivery mode only). */
  deliveryFee?: number;
  /** Customer's preferred pick-up time (takeaway mode only), "HH:MM". */
  pickupTime?: string;
  /** The customer's remark for the whole order. */
  note?: string;
}

export function buildOrderMessage({ order, mode, customer, address, deliveryFee = 0, pickupTime, note }: WhatsAppOrderInput): string {
  const header =
    mode === 'delivery'
      ? `🌹 New DELIVERY order — ${shopName()}`
      : `🌹 New TAKEAWAY order — ${shopName()}`;

  // Not an invoice yet. The shop still has to accept this order and the
  // kitchen still has to cook it, so the customer gets an ORDER number — the
  // same 5 digits that become the tail of their INV-YYYY-##### once the bill
  // is settled and the real invoice is sent.
  const orderNo = resolveOrderNo({ sessionId: order.sessionId, id: order.id, createdAt: order.createdAt });

  const lines: string[] = [
    header,
    `Order no. ${orderNo}`,
    `Ticket ${order.id}`,
    '',
    '— Items —',
    formatItems(order.items),
    '',
    `Subtotal: ${formatKWD(order.subtotal)}`,
  ];
  if (order.discount && order.discount > 0) {
    lines.push(
      `Discount${order.couponCode ? ` (${order.couponCode})` : ''}: -${formatKWD(order.discount)}`
    );
  }
  // The delivery charge is already part of order.total — it is stored on the
  // order so the tab, the bill and the invoice all agree with this message.
  const fee = mode === 'delivery' ? (order.deliveryFee ?? deliveryFee) : 0;
  if (fee > 0) lines.push(`Delivery: ${formatKWD(fee)}`);
  lines.push(`Grand total: ${formatKWD(order.total)}`);
  lines.push('Payment: Cash on ' + (mode === 'delivery' ? 'delivery' : 'pickup'));
  if (mode === 'takeaway' && pickupTime) {
    lines.push(`Pick-up time: ${pickupTime}`);
  }

  lines.push('', '— Customer —');
  if (customer.name) lines.push(`Name: ${customer.name}`);
  if (customer.phone) lines.push(`Phone: ${customer.phone}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);

  if (mode === 'delivery' && address) {
    lines.push('', '— Delivery address —', formatAddress(address));
  }

  const remark = (note ?? order.note ?? '').trim();
  if (remark) {
    lines.push('', '— Remark —', remark);
  }

  lines.push(
    '',
    'We will confirm this order shortly. Your invoice is sent once it is ready and billed.',
  );

  return lines.join('\n');
}

/** Open wa.me in a new tab with the pre-filled message. Returns false if the
 *  shop number isn't configured — caller should surface that to the user. */
export function sendOrderToShop(input: WhatsAppOrderInput): boolean {
  const number = shopWhatsAppNumber();
  if (!number) return false;
  const text = buildOrderMessage(input);
  const url = `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  // Open in a new tab so the order confirmation page stays visible.
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
