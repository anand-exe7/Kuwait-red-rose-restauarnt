"use client";
import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pagination, usePagination } from '../components/Pagination';
import { Armchair, MapPin } from 'lucide-react';
import {
  RestaurantTable,
  getTablesSnapshot,
  getTablesServerSnapshot,
  subscribeToTables,
  addTable,
  updateTable,
  deleteTable,
  isNumberTaken,
} from '../lib/tableStore';
import { Page, PageHead, Card, Btn, Badge, Icon, Empty, Modal, Field, inputCls, cx } from './_ui/kit';

// Table Management — just the floor plan. QR flows were removed because the
// waiter now opens the table from the Waiter Dashboard directly, and dine-in
// customers who want to self-order simply visit the public menu.

export default function TablesSection() {
  const tables = useSyncExternalStore(subscribeToTables, getTablesSnapshot, getTablesServerSnapshot);
  const sorted = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const pager = usePagination(sorted, 12);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (t: RestaurantTable) => { setEditing(t); setFormOpen(true); };

  return (
    <Page>
      <PageHead
        title="Table management"
        sub="Add, edit and remove tables. Waiters pick a table from their dashboard to open its tab."
        bar
        right={<Btn kind="red" icon="plus" onClick={openAdd}>Add table</Btn>}
      />

      {sorted.length === 0 ? (
        <Card><Empty icon="tables" title="No tables yet">Add your first table above.</Empty></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pager.items.map(t => (
            <Card key={t.id} className={cx('flex flex-col', !t.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xl font-black text-slate-900">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm font-black text-red-600">{t.number}</span>
                    <span className="truncate">{t.label || `Table ${t.number}`}</span>
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {t.zone}</span>
                    <span className="inline-flex items-center gap-1"><Armchair size={12} /> {t.seats} seats</span>
                    {!t.active && <Badge tone="slate">Off</Badge>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => openEdit(t)} title="Edit" className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100">
                    <Icon name="edit" size={15} />
                  </button>
                  {confirmDeleteId === t.id ? (
                    <div className="flex items-center gap-1 text-xs font-bold">
                      <button type="button" onClick={() => { deleteTable(t.id); setConfirmDeleteId(null); }} className="rounded bg-red-600 px-2 py-1 text-white">Yes</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded bg-slate-100 px-2 py-1 text-slate-700">No</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(t.id)} title="Delete" className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50">
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {pager.pages > 1 && (
        <Card className="mt-5 !p-0">
          <Pagination p={pager} label="tables" />
        </Card>
      )}

      {formOpen && <TableFormModal table={editing} onClose={() => setFormOpen(false)} />}
    </Page>
  );
}

function TableFormModal({ table, onClose }: { table: RestaurantTable | null; onClose: () => void }) {
  const [number, setNumber] = useState(table ? String(table.number) : '');
  const [label, setLabel] = useState(table?.label || '');
  const [seats, setSeats] = useState(table ? String(table.seats) : '4');
  const [zone, setZone] = useState(table?.zone || 'Indoor');
  const [active, setActive] = useState(table?.active ?? true);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(number);
    if (!Number.isInteger(num) || num <= 0) { setError('Enter a valid table number.'); return; }
    if (isNumberTaken(num, table?.id)) { setError(`Table number ${num} is already used.`); return; }
    const seatsNum = Math.max(1, Number(seats) || 1);
    const payload = { number: num, label: label.trim() || `Table ${num}`, seats: seatsNum, zone: zone.trim() || 'Indoor', active };
    if (table) updateTable(table.id, payload);
    else addTable(payload);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={table ? 'Edit table' : 'Add table'}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="red" onClick={() => { const f = document.getElementById('table-form') as HTMLFormElement | null; f?.requestSubmit(); }}>
            {table ? 'Save changes' : 'Add table'}
          </Btn>
        </>
      }
    >
      <form id="table-form" onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Table number">
            <input value={number} onChange={e => setNumber(e.target.value)} type="number" min="1" required className={inputCls} placeholder="e.g. 13" />
          </Field>
          <Field label="Seats">
            <input value={seats} onChange={e => setSeats(e.target.value)} type="number" min="1" className={inputCls} placeholder="4" />
          </Field>
        </div>
        <Field label="Label (optional)">
          <input value={label} onChange={e => setLabel(e.target.value)} className={inputCls} placeholder="e.g. Window 1" />
        </Field>
        <Field label="Zone">
          <select value={zone} onChange={e => setZone(e.target.value)} className={inputCls}>
            {['Indoor', 'Terrace', 'Outdoor', 'Family', 'VIP'].map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="accent-red-600" />
          Active (available for seating)
        </label>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
      </form>
    </Modal>
  );
}
