"use client";

// Admin-managed homepage media (photos + videos). One row in `app_settings`
// (id = 'home_media'), so every visitor's homepage reads the same list. Uploads
// go to the `homepage-media` storage bucket via POST /api/upload-media. The
// homepage falls back to its built-in images when a slot is empty, so it never
// looks broken before the admin sets anything.

import { createRealtimeStore } from './createRealtimeStore';
import { write } from './dbWrite';

export interface HomeMedia {
  gallery: string[];      // up to 4 photos — one row on the homepage
  videos: string[];       // up to 4 videos — one row on the homepage
  finest: string[];       // Kuwait's Finest Flavours — 4 photos
  celebrations: string;   // "Made for Celebrations" photo
  /** Caption shown on a gallery photo ("Our counter", "Fresh from the oven").
   *  Keyed by the photo's URL rather than its position, so reordering or
   *  deleting one never moves somebody else's caption onto it. */
  captions: Record<string, string>;
}

export const EMPTY_HOME_MEDIA: HomeMedia = { gallery: [], videos: [], finest: [], celebrations: '', captions: {} };

export const HOME_MEDIA_LIMITS = { gallery: 4, videos: 4, finest: 4 } as const;

interface Row { id: string; media: HomeMedia }

function fromRow(r: Record<string, unknown>): Row {
  const v = (r.value ?? {}) as Partial<HomeMedia>;
  return {
    id: String(r.id),
    media: {
      gallery: Array.isArray(v.gallery) ? v.gallery.filter(x => typeof x === 'string') : [],
      videos: Array.isArray(v.videos) ? v.videos.filter(x => typeof x === 'string') : [],
      finest: Array.isArray(v.finest) ? v.finest.filter(x => typeof x === 'string') : [],
      celebrations: typeof v.celebrations === 'string' ? v.celebrations : '',
      captions: v.captions && typeof v.captions === 'object'
        ? Object.fromEntries(
            Object.entries(v.captions as Record<string, unknown>)
              .filter(([, t]) => typeof t === 'string')
              .map(([k, t]) => [k, String(t)]),
          )
        : {},
    },
  };
}

const store = createRealtimeStore<Row>({ table: 'app_settings', fromRow });

export function subscribeToHomeMedia(cb: () => void): () => void {
  store.ensureHydrated();
  return store.subscribe(cb);
}
export function getHomeMediaSnapshot(): Row[] {
  return store.getSnapshot();
}
export function getHomeMediaServerSnapshot(): Row[] {
  return store.getServerSnapshot();
}

/** The current homepage media (from the store rows), or empty. */
export function homeMediaFrom(rows: Row[]): HomeMedia {
  return rows.find(r => r.id === 'home_media')?.media ?? EMPTY_HOME_MEDIA;
}

export function getHomeMedia(): HomeMedia {
  store.ensureHydrated();
  return homeMediaFrom(store.get());
}

export function saveHomeMedia(next: HomeMedia) {
  const row: Row = { id: 'home_media', media: next };
  store.patchLocal((cur) => {
    const exists = cur.some(r => r.id === 'home_media');
    return exists ? cur.map(r => (r.id === 'home_media' ? row : r)) : [row, ...cur];
  });
  void write({ table: 'app_settings', op: 'update', values: { value: next }, match: { id: 'home_media' } }).then(async ({ error }) => {
    if (error) {
      const ins = await write({ table: 'app_settings', op: 'insert', values: { id: 'home_media', value: next } });
      if (ins.error) console.warn('[home-media] save failed — apply supabase/app_settings.sql to persist homepage media.', ins.error.message);
    }
  });
}
