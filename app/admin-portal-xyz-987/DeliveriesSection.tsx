"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Phone } from 'lucide-react';
import { staffCall } from './staffApi';
import { Pagination, usePagination } from '../components/Pagination';
import { formatKWD } from '../lib/currency';
import { addressLine, type DeliveryDto } from '../lib/delivery/shared';

interface Driver { id: string; name: string; phone: string; active: boolean }

const card = 'bg-white rounded-3xl border border-black/5 shadow-sm';
const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', assigned: 'bg-blue-100 text-blue-700', out_for_delivery: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-emerald-100 text-emerald-700', failed: 'bg-red-100 text-brand-red', cancelled: 'bg-black/10 text-black/60',
};
const KITCHEN: Record<string, string> = { pending: 'Kitchen: new', cooking: 'Kitchen: cooking', ready: 'Kitchen: READY', served: 'Kitchen: done' };

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

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(id); setError(null);
    try { await staffCall(action, { deliveryId: id, ...extra }); await load(); }
    catch (e) { setError((e as Error).message); }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className={`${card} p-5 flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="text-xl font-black">Deliveries</h2>
          <p className="text-xs text-black/50">Updates every few seconds. Assign a driver once the kitchen marks the order ready.</p>
        </div>
        <div className="flex bg-black/5 rounded-full p-1">
          {(['active', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 rounded-full text-xs font-bold ${filter === f ? 'bg-white shadow text-brand-red' : 'text-black/50'}`}>
              {f === 'active' ? 'In progress' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
      {!rows && !error && <div className="flex justify-center py-16"><Loader2 className="animate-spin text-brand-red" /></div>}
      {rows && shown.length === 0 && <div className={`${card} p-12 text-center text-black/40 font-bold`}>No deliveries here yet.</div>}

      <div className="flex flex-col gap-4">
        {pager.items.map((d) => {
          const open = ['pending', 'assigned', 'out_for_delivery'].includes(d.status);
          return (
            <div key={d.id} className={`${card} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-brand-red">{d.orderId} <span className="text-black/30 font-medium text-xs">· {d.id}</span></p>
                  <p className="text-xs text-black/50">{new Date(d.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {d.distanceSource === 'area' ? d.areaName : `${d.distanceKm.toFixed(1)} km${d.distanceSource === 'estimated' ? ' (est.)' : ''}`}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${STATUS_TONE[d.status]}`}>{d.statusLabel}</span>
                  {open && <span className={`px-3 py-1 rounded-full text-xs font-bold ${d.kitchenStatus === 'ready' ? 'bg-emerald-500 text-white' : 'bg-black/5 text-black/60'}`}>{KITCHEN[d.kitchenStatus] ?? d.kitchenStatus}</span>}
                </div>
              </div>

              <div className="mt-3 grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-bold">{d.customerName}</p>
                  <a href={`tel:${d.customerPhone}`} className="inline-flex items-center gap-1 text-black/60 hover:text-brand-red"><Phone size={13} /> {d.customerPhone}</a>
                  <p className="mt-1 text-black/70">{addressLine(d.address as never)}</p>
                  {typeof d.address.landmark === 'string' && d.address.landmark && <p className="text-xs text-black/50">Landmark: {d.address.landmark}</p>}
                  <a href={`https://www.google.com/maps/search/?api=1&query=${d.lat !== null && d.lng !== null ? `${d.lat},${d.lng}` : encodeURIComponent(`${addressLine(d.address as never)}, Kuwait`)}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-blue-600"><ExternalLink size={12} /> Open in Google Maps</a>
                </div>
                <div>
                  <p className="text-black/70">{d.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>
                  <p className="font-black mt-1">{formatKWD(d.total)} <span className="text-xs font-medium text-black/50">(delivery {d.fee > 0 ? formatKWD(d.fee) : 'free'})</span></p>
                  <p className="text-xs text-black/50">{d.paymentMethod === 'cod' ? `Cash on delivery${d.status === 'delivered' ? ` · collected ${formatKWD(d.codCollected ?? 0)}` : ''}` : `Online · ${d.paymentStatus}`}</p>
                  {d.driver && <p className="text-xs mt-1">Driver: <b>{d.driver.name}</b> · {d.driver.phone}</p>}
                  {d.callAttempts.length > 0 && <p className="text-xs text-black/50">Calls logged: {d.callAttempts.length}</p>}
                  {d.failedReason && <p className="text-xs font-bold text-brand-red mt-1">{d.failedReason}</p>}
                  {d.otpLocked && <p className="text-xs font-bold text-brand-red mt-1">Code locked after wrong attempts.</p>}
                </div>
              </div>

              {open && (
                <div className="mt-4 pt-4 border-t border-black/5 flex flex-wrap items-center gap-2">
                  {(d.status === 'pending' || d.status === 'assigned') && (
                    <>
                      <select value={pick[d.id] ?? d.driver?.id ?? ''} onChange={(e) => setPick({ ...pick, [d.id]: e.target.value })}
                        className="px-3 py-2 rounded-xl border border-black/10 text-sm bg-white">
                        <option value="">Choose driver…</option>
                        {drivers.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <button disabled={busy === d.id || !(pick[d.id] ?? d.driver?.id)} onClick={() => act(d.id, 'assign', { driverId: pick[d.id] ?? d.driver?.id })}
                        className="px-4 py-2 rounded-xl bg-brand-red text-white text-sm font-bold disabled:opacity-50">{d.status === 'assigned' ? 'Reassign' : 'Assign'}</button>
                    </>
                  )}
                  {d.status === 'out_for_delivery' && (
                    <button disabled={busy === d.id} onClick={() => act(d.id, 'unlockOtp', {}, 'Issue a fresh code and unlock this delivery? The old code stops working.')}
                      className="px-4 py-2 rounded-xl border border-black/15 text-sm font-bold">{d.otpLocked ? 'Unlock & new code' : 'Issue new code'}</button>
                  )}
                  <button disabled={busy === d.id} onClick={() => act(d.id, 'cancel', {}, 'Cancel this delivery? The customer will not be charged.')}
                    className="px-4 py-2 rounded-xl text-sm font-bold text-brand-red hover:bg-brand-red/5 ml-auto">Cancel delivery</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className={card}><Pagination p={pager} label="deliveries" /></div>
    </div>
  );
}
