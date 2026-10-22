import 'server-only';
import { HttpError } from '../server/http';

// =============================================================================
// PAYMENT HOOKS  -  every place the app needs a real payment gateway.
//
// Delivery works today with CASH ON DELIVERY only. Online payment (KNET, cards,
// Apple Pay) is deliberately NOT wired: the client has not chosen a gateway.
// When one is chosen, implement the functions below and flip the switches.
// Search the codebase for "PAYMENT:" to find every call site.
// Full checklist: docs/PAYMENTS-TODO.md
// =============================================================================

export type PaymentMethod = 'cod' | 'online';

export interface StartPaymentInput {
  orderId: string;
  deliveryId: string;
  amount: number; // KWD, 3 decimals, ALREADY computed by our server
  customer: { name: string; phone: string; email: string | null };
  /** Where the gateway should send the customer afterwards (our tracking page). */
  returnUrl: string;
}

export interface StartPaymentResult {
  redirectUrl: string; // the gateway's hosted payment page
  paymentRef: string;  // the gateway's payment / charge / invoice id
}

/** PAYMENT: return true once a gateway is configured (keys present, sandbox tested). */
export function onlinePaymentAvailable(): boolean {
  return false;
}

/**
 * PAYMENT: create the charge/invoice at the gateway and return its hosted page URL.
 * Called from /api/delivery/customer (action "checkout") when paymentMethod === 'online'.
 *  - UPayments : POST Add Charge (notificationUrl is mandatory)
 *  - MyFatoorah: InitiatePayment -> ExecutePayment
 *  - Tap       : create a charge with a redirect
 * Amounts must be sent in KWD with 3 decimals. Never accept an amount from the browser.
 */
export async function startOnlinePayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  void input;
  throw new HttpError(501, 'Online payment is not set up yet. Please choose cash on delivery.');
}

/**
 * PAYMENT: refund (full or partial) a payment that was already captured.
 * Called when an admin cancels a delivery whose payment_status is 'paid', and for
 * a failed delivery when the failed_policy says the customer is refunded.
 */
export async function refundPayment(paymentRef: string, amount: number): Promise<void> {
  void paymentRef; void amount;
  throw new HttpError(501, 'Refunds are not set up yet.');
}
