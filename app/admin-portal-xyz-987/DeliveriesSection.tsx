"use client";
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ExternalLink, Loader2, Phone } from 'lucide-react';
import { staffCall } from './staffApi';
import { Pagination, usePagination } from '../components/Pagination';
import { formatKWD } from '../lib/currency';
import { addressLine, type DeliveryDto } from '../lib/delivery/shared';
import {
  getOrdersSnapshot, getOrdersServerSnapshot, subscribeToOrders,
  approveOrder, rejectOrder, updateOrderStatus, type Order, type DeliveryAddress,
} from '../lib/orderStore';
import { invoiceNumber } from '../lib/invoice';
import { Page, PageHead, Card, Btn, Badge, Pills, Empty, toast, inputCls, cx, type BadgeTone } from './_ui/kit';

interface Driver { id: string; name: string; phone: string; active: boolean }

const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'amber', assigned: 'sky', out_for_delivery: 'violet',
  delivered: 'green', failed: 'red', cancelled: 'slate',
};
const KITCHEN: Record<string, string> = { pending: 'Kitchen: new', cooking: 'Kitchen: cooking', ready: 'Kitchen: READY', served: 'Kitchen: done' };

// Order-store delivery orders (placed from the menu / counter) — their kitchen
// lifecycle, shown so the admin can see every delivery waiting to go out.
const ORDER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  awaiting_admin: { label: 'Awaiting approval', tone: 'amber' },
  pending: { label: 'Approved · queued', tone: 'sky' },
  cooking: { label: 'Cooking', tone: 'violet' },
  ready: { label: 'Ready to dispatch', tone: 'green' },
  served: { label: 'Delivered', tone: 'slate' },
};

function fmtAddress(a?: DeliveryAddress): string {
  if (!a) return '';
  return [a.area, a.street && `St ${a.street}`, a.building && `Bldg ${a.building}`, a.governorate]
    .filter(Boolean).join(', ');
}

export default function DeliveriesSection() {
  const [rows, setRows] = useState<DeliveryDto[] | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await staffCall<{ deliveries: DeliveryDto[]; drivers: Driver[] }>('list');
      setRows(r.deliveries); setDrivers(r.drivers); setError(null);
    } catch (e) { setError((e as Error).message); }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 6000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [load]);

  const shown = useMemo(
    () => (rows ?? []).filter((d) => filter === 'all' || ['pending', 'assigned', 'out_for_delivery'].includes(d.status)),
    [rows, filter]
  );
  const pager = usePagination(shown, 8, filter);

  // Delivery orders from the live order store (menu + counter). "In progress"
  // hides delivered ones; "All" shows everything.
  const allOrders = useSyncExternalStore(subscribeToOrders, getOrdersSnapshot, getOrdersServerSnapshot);
  const deliveryOrders = useMemo(
    () => allOrders
      .filter(o => o.mode === 'delivery' && (filter === 'all' || o.status !== 'served'))
      .sort((a, b) => b.createdAt - a.createdAt),
    [allOrders, filter]
  );

  const advance = (o: Order) => {
    if (o.status === 'awaiting_admin') { approveOrder(o.id); toast.success('Approved — sent to the kitchen.'); }
    else if (o.status === 'ready') { updateOrderStatus(o.id, 'served'); toast.success('Marked delivered.'); }
  };
  const reject = (o: Order) => {
    if (!confirm('Reject this delivery order? The customer will be notified it was declined.')) return;
    rejectOrder(o.id); toast.success('Order rejected.');
  };

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(id);
    try { await staffCall(action, { deliveryId: id, ...extra }); await load(); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(null);
  };

  return (
    <Page>
      <PageHead
        title="Deliveries"
        sub="Updates every few seconds. Assign a driver once the kitchen marks the order ready."
        bar
        right={<Pills value={filter} onChange={setFilter} options={[{ v: 'active', t: 'In progress' }, { v: 'all', t: 'All' }]} />}
      />

      {error && <p className="mb-4 text-sm font-bold text-red-600">{error}</p>}

      {/* Customer delivery orders (from the menu / counter) */}
      {deliveryOrders.length > 0 && (
        <div className="mb-4 flex flex-col gap-4">
          {deliveryOrders.map((o) => {
            const st = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'slate' as BadgeTone };
            const addr = fmtAddress(o.deliveryAddress);
            return (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-red-600">{invoiceNumber(o.sessionId ?? o.id, o.createdAt)}</p>
                    <p className="text-xs text-slate-500">{new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>

                <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="font-bold text-slate-800">{o.customer?.name || 'Guest'}</p>
                    {o.customer?.phone && <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600"><Phone size={13} /> {o.customer.phone}</a>}
                    {addr && <p className="mt-1 text-slate-600">{addr}</p>}
                    {o.deliveryAddress?.landmark && <p className="text-xs text-slate-500">Landmark: {o.deliveryAddress.landmark}</p>}
                    {addr && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addr}, Kuwait`)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-sky-600"><ExternalLink size={12} /> Search address in Google Maps</a>}
                  </div>
                  <div>
                    <p className="text-slate-600">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                    <p className="adm-num mt-1 font-black text-slate-800">{formatKWD(o.total)} <span className="text-xs font-medium text-slate-500">(cash on delivery)</span></p>
                  </div>
                </div>

                {o.status !== 'served' && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                    {o.status === 'awaiting_admin' && <Btn kind="red" size="sm" icon="check" onClick={() => advance(o)}>Approve → Kitchen</Btn>}
                    {(o.status === 'pending' || o.status === 'cooking') && <span className="text-xs font-bold text-slate-400">Kitchen is preparing this order…</span>}
                    {o.status === 'ready' && <Btn kind="red" size="sm" icon="check" onClick={() => advance(o)}>Mark delivered</Btn>}
                    {o.status === 'awaiting_admin' && <Btn kind="plain" size="sm" className="ml-auto text-red-600" onClick={() => reject(o)}>Reject</Btn>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!rows && !error && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-red-600" /></div>}
      {rows && shown.length === 0 && deliveryOrders.length === 0 && <Card><Empty icon="cart" title="No deliveries here yet." /></Card>}

      <div className="flex flex-col gap-4">
        {pager.items.map((d) => {
          const open = ['pending', 'assigned', 'out_for_delivery'].includes(d.status);
          return (
            <Card key={d.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-red-600">{d.orderId} <span className="text-xs font-medium text-slate-400">· {d.id}</span></p>
                  <p className="text-xs text-slate-500">{new Date(d.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {d.distanceSource === 'area' ? d.areaName : `${d.distanceKm.toFixed(1)} km${d.distanceSource === 'estimated' ? ' (est.)' : ''}`}</p>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge tone={STATUS_TONE[d.status] ?? 'slate'}>{d.statusLabel}</Badge>
                  {open && (
                    d.kitchenStatus === 'ready'
                      ? <Badge tone="green">{KITCHEN[d.kitchenStatus] ?? d.kitchenStatus}</Badge>
                      : <Badge tone="slate">{KITCHEN[d.kitchenStatus] ?? d.kitchenStatus}</Badge>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="font-bold text-slate-800">{d.customerName}</p>
                  <a href={`tel:${d.customerPhone}`} className="inline-flex items-center gap-1 text-slate-500 hover:text-red-600"><Phone size={13} /> {d.customerPhone}</a>
                  <p className="mt-1 text-slate-600">{addressLine(d.address as never)}</p>
                  {typeof d.address.landmark === 'string' && d.address.landmark && <p className="text-xs text-slate-500">Landmark: {d.address.landmark}</p>}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${d.lat !== null && d.lng !== null ? `${d.lat},${d.lng}` : encodeURIComponent(`${addressLine(d.address as never)}, Kuwait`)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-sky-600"><ExternalLink size={12} /> {d.lat !== null && d.lng !== null ? 'Open exact location' : 'Search address in Google Maps'}</a>
                </div>
                <div>
                  <p className="text-slate-600">{d.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                  <p className="adm-num mt-1 font-black text-slate-800">{formatKWD(d.total)} <span className="text-xs font-medium text-slate-500">(delivery {d.fee > 0 ? formatKWD(d.fee) : 'free'})</span></p>
                  <p className="text-xs text-slate-500">{d.paymentMethod === 'cod' ? `Cash on delivery${d.status === 'delivered' ? ` · collected ${formatKWD(d.codCollected ?? 0)}` : ''}` : `Online · ${d.paymentStatus}`}</p>
                  {d.driver && <p className="mt-1 text-xs text-slate-600">Driver: <b>{d.driver.name}</b> · {d.driver.phone}</p>}
                  {d.callAttempts.length > 0 && <p className="text-xs text-slate-500">Calls logged: {d.callAttempts.length}</p>}
                  {d.failedReason && <p className="mt-1 text-xs font-bold text-red-600">{d.failedReason}</p>}
                  {d.otpLocked && <p className="mt-1 text-xs font-bold text-red-600">Code locked after wrong attempts.</p>}
                </div>
              </div>

              {open && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                  {(d.status === 'pending' || d.status === 'assigned') && (
                    <>
                      <select value={pick[d.id] ?? d.driver?.id ?? ''} onChange={(e) => setPick({ ...pick, [d.id]: e.target.value })} className={cx(inputCls, 'h-9 w-auto')}>
                        <option value="">Choose driver…</option>
                        {drivers.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <Btn kind="red" size="sm" disabled={busy === d.id || !(pick[d.id] ?? d.driver?.id)} onClick={() => act(d.id, 'assign', { driverId: pick[d.id] ?? d.driver?.id })}>
                        {d.status === 'assigned' ? 'Reassign' : 'Assign'}
                      </Btn>
                    </>
                  )}
                  {d.status === 'out_for_delivery' && (
                    <Btn kind="ghost" size="sm" disabled={busy === d.id} onClick={() => act(d.id, 'unlockOtp', {}, 'Issue a fresh code and unlock this delivery? The old code stops working.')}>
                      {d.otpLocked ? 'Unlock & new code' : 'Issue new code'}
                    </Btn>
                  )}
                  <Btn kind="plain" size="sm" className="ml-auto text-red-600" disabled={busy === d.id} onClick={() => act(d.id, 'cancel', {}, 'Cancel this delivery? The customer will not be charged.')}>
                    Cancel delivery
                  </Btn>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {pager.pages > 1 && <Card className="mt-4 !p-0"><Pagination p={pager} label="deliveries" /></Card>}
    </Page>
  );
}
