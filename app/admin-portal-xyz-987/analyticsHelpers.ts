// Shared period-filtering used by both the Orders table and the Analytics
// tabs — kept out of either component file so neither has to import the other.

export type Period = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom';

export function isInPeriod(createdAt: number, period: Period, from?: string, to?: string): boolean {
  if (period === 'all') return true;
  const d = new Date(createdAt);
  const now = new Date();
  if (period === 'today') return d.toDateString() === now.toDateString();
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === 'year') return d.getFullYear() === now.getFullYear();
  if (period === 'custom') {
    if (!from || !to) return true;
    const start = new Date(from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return d >= start && d <= end;
  }
  return true;
}
