import { emptyAdminState, type AdminState } from "./types";

// The old admin pulled the whole DB on the server before rendering. In Red Rose
// the live stores hydrate on the client (Supabase channels), so this is a
// starting-point snapshot — the Store adapter in Store.tsx fills it in from
// the browser on first subscribe.
export async function adminState(): Promise<AdminState> {
  return emptyAdminState();
}
