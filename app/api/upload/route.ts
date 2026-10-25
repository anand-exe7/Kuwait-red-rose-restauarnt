import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../lib/session';
import { getServerSupabase, hasServiceKey } from '../../lib/supabaseServer';
import { HttpError, bad, clientIp, deny, respond, throttle, unauthorized } from '../../lib/server/http';

// Menu photo upload (admin only). The browser has already resized and converted the
// picture to WebP (app/lib/compressImage.ts); this route re-checks everything because
// the browser is never trusted, then stores the file in the public Supabase Storage
// bucket and returns its link. The public key cannot write to the bucket at all.

const BUCKET = 'menu-images';
// Per-image cap after client-side compression. The browser (compressImage.ts)
// shrinks to a WebP of ~900px on the long side, which almost always fits well
// under this ceiling. The ceiling itself is the "3 MB per image" limit the
// shop asked for.
const MAX_BYTES = 3 * 1024 * 1024;

/** WebP files start with "RIFF", a 4-byte size, then "WEBP". */
function looksLikeWebp(b: Uint8Array): boolean {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  return b.length > 12 && at(0, 'RIFF') && at(8, 'WEBP');
}

export async function POST(request: NextRequest) {
  return respond(async () => {
    const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!role) throw unauthorized('Staff sign-in required');
    if (role !== 'admin') throw deny('Only the admin can upload photos');
    throttle(`up:${clientIp(request)}`, 30);

    if (!hasServiceKey) throw new HttpError(503, 'Uploads need SUPABASE_SERVICE_ROLE_KEY');
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');

    let form: FormData;
    try { form = await request.formData(); } catch { throw bad('Send the photo as form data'); }
    const file = form.get('file');
    if (!(file instanceof File)) throw bad('No photo received');
    if (file.size === 0) throw bad('The photo is empty');
    if (file.size > MAX_BYTES) throw bad(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB per image.`);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeWebp(bytes)) throw bad('Only WebP photos are accepted');

    // Random name: never the uploaded filename, so nothing can overwrite or guess another file.
    const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.webp`;
    const { error } = await sb.storage.from(BUCKET).upload(name, bytes, {
      contentType: 'image/webp',
      cacheControl: '31536000', // names never repeat, so browsers and the CDN can keep it for a year
      upsert: false,
    });
    if (error) {
      console.error('[upload] storage error', error.message);
      throw new HttpError(500, /not found|bucket/i.test(error.message)
        ? `Storage bucket "${BUCKET}" is missing. Run supabase/storage.sql.`
        : 'Could not save the photo');
    }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(name);
    return { url: data.publicUrl, bytes: bytes.length };
  });
}
