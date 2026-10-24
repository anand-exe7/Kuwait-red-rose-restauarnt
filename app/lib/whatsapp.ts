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
}

export function buildOrderMessage({ order, mode, customer, address }: WhatsAppOrderInput): string {
  const header =
    mode === 'delivery'
      ? '🌹 New DELIVERY order — Red Rose'
      : '🌹 New TAKEAWAY order — Red Rose';

  const lines: string[] = [
    header,
    `Order #${order.id}`,
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
  lines.push(`Tax: ${formatKWD(order.tax)}`);
  lines.push(`Total: ${formatKWD(order.total)}`);
  lines.push('Payment: Cash on ' + (mode === 'delivery' ? 'delivery' : 'pickup'));

  lines.push('', '— Customer —');
  if (customer.name) lines.push(`Name: ${customer.name}`);
  if (customer.phone) lines.push(`Phone: ${customer.phone}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);

  if (mode === 'delivery' && address) {
    lines.push('', '— Delivery address —', formatAddress(address));
  }

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
