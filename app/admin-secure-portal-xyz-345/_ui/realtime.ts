// The old admin pushed version bumps over Postgres LISTEN/NOTIFY. Red Rose's
// Supabase Realtime already pushes the raw rows into each store, and the
// Store adapter re-runs its mapping on every emit — so there's nothing left
// here to subscribe to. A no-op keeps the ported page files happy.
export function subscribeChanges(_cb: () => void): () => void {
  return () => {};
}
