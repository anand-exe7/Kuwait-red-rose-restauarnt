"use client";

// Read-only (browser) view of the admin-managed delivery areas/zones. The admin
// creates and prices these in Admin → Delivery Zones (AreasPanel, which writes
// through the staff API); the `delivery_areas` table is public-readable, so the
// customer menu can show the same list and charge the same fee at checkout.

import { createRealtimeStore } from './createRealtimeStore';
import { rowToArea, type DeliveryArea } from './delivery/shared';

const store = createRealtimeStore<DeliveryArea>({ table: 'delivery_areas', fromRow: rowToArea });

export function getAreasSnapshot(): DeliveryArea[] {
  return store.getSnapshot();
}
export function getAreasServerSnapshot(): DeliveryArea[] {
  return store.getServerSnapshot();
}
export function subscribeToAreas(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}

/** Active areas, in display order. */
export function activeAreas(list: DeliveryArea[]): DeliveryArea[] {
  return list.filter(a => a.active).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}
