import type { NextRequest } from 'next/server';
import { getServerSupabase } from '../../../lib/supabaseServer';
import { HttpError, clientIp, num, readJson, respond, throttle } from '../../../lib/server/http';
import { buildQuote, loadAreas, loadSettings, type QuoteTarget } from '../../../lib/delivery/server';
import { rowToSettings } from '../../../lib/delivery/shared';

// Public (no sign-in): the delivery areas, a quote for an area (or a map pin in
// distance mode), and the public delivery rules. Rate-limited per IP because a
// distance quote can cost one Google Routes lookup.
export async function POST(request: NextRequest) {
  return respond(async () => {
    const body = await readJson(request);
    throttle(`dq:${clientIp(request)}`, 30);
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');

    if (body.action === 'quote') {
      const target: QuoteTarget = {};
      if (typeof body.areaId === 'string') target.areaId = body.areaId.slice(0, 40);
      if (body.lat !== undefined && body.lng !== undefined) {
        target.lat = num(body.lat, -90, 90, 'latitude');
        target.lng = num(body.lng, -180, 180, 'longitude');
      }
      const subtotal = body.subtotal === undefined ? undefined : num(body.subtotal, 0, 100000, 'subtotal');
      const { quote } = await buildQuote(sb, target, subtotal);
      return { quote };
    }

    // How the checkout should look: the fee mode and the areas the customer may pick.
    if (body.action === 'areas') {
      const s = await loadSettings(sb);
      const areas = s.pricingMode === 'areas' ? await loadAreas(sb, true) : [];
      return {
        pricingMode: s.pricingMode,
        areas: areas.map((a) => ({ id: a.id, name: a.name, fee: a.fee, minOrder: a.minOrder })),
      };
    }

    if (body.action === 'rules') {
      const { data } = await sb.from('delivery_settings').select('*').eq('id', 1).maybeSingle();
      const s = rowToSettings(data);
      return {
        rules: {
          enabled: s.enabled, busy: s.busy, pricingMode: s.pricingMode, shopLat: s.shopLat, shopLng: s.shopLng,
          freeKm: s.freeKm, maxKm: s.maxKm, minOrder: s.minOrder,
          codEnabled: s.codEnabled, onlinePaymentEnabled: s.onlinePaymentEnabled, // PAYMENT
        },
      };
    }
    throw new HttpError(400, 'Unknown action');
  });
}
