import CustomerDashboard from '../customer/page';

export const metadata = { title: 'Delivery' };

// Delivery menu: the same experience as the customer page, but the cart
// continues to /delivery/checkout (sign-in, address, map pin).
export default function DeliveryPage() {
  return <CustomerDashboard />;
}
