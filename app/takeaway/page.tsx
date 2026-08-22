import CustomerDashboard from '../customer/page';

export const metadata = { title: 'Takeaway' };

// Dedicated takeaway URL — reuses the customer experience in takeaway mode.
export default function TakeawayPage() {
  return <CustomerDashboard />;
}
