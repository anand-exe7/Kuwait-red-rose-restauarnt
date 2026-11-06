import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../lib/session';
import { getServerSupabase, hasServiceKey } from '../../lib/supabaseServer';
import { HttpError, bad, clientIp, deny, respond, throttle, unauthorized } from '../../lib/server/http';

// Homepage media upload (admin only) — photos (WebP, already compressed in the
// browser) and short videos (MP4). Stored in the public `homepage-media` bucket
// and the public link returned. The public key cannot write to the bucket.

const BUCKET = 'homepage-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;  // 5 MB per photo
const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10 MB per video

/** WebP files start with "RIFF", a 4-byte size, then "WEBP". */
function looksLikeWebp(b: Uint8Array): boolean {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  return b.length > 12 && at(0, 'RIFF') && at(8, 'WEBP');
}
/** MP4/MOV files carry an "ftyp" box at bytes 4..7. */
function looksLikeMp4(b: Uint8Array): boolean {
  const at = (i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  return b.length > 12 && at(4, 'ftyp');
}

export async function POST(request: NextRequest) {
  return respond(async () => {
    const role = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!role) throw unauthorized('Staff sign-in required');
    if (role !== 'admin') throw deny('Only the admin can upload media');
    throttle(`upm:${clientIp(request)}`, 30);

    if (!hasServiceKey) throw new HttpError(503, 'Uploads need SUPABASE_SERVICE_ROLE_KEY');
    const sb = getServerSupabase();
    if (!sb) throw new HttpError(503, 'Database is not configured');

    let form: FormData;
    try { form = await request.formData(); } catch { throw bad('Send the file as form data'); }
    const file = form.get('file');
    const kind = String(form.get('kind') ?? 'image'); // 'image' | 'video'
    if (!(file instanceof File)) throw bad('No file received');
    if (file.size === 0) throw bad('The file is empty');

    const bytes = new Uint8Array(await file.arrayBuffer());
    let ext: string;
    let contentType: string;
    if (kind === 'video') {
      if (file.size > MAX_VIDEO_BYTES) throw bad(`Video is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 10 MB.`);
      if (!looksLikeMp4(bytes)) throw bad('Only MP4 videos are accepted');
      ext = 'mp4'; contentType = 'video/mp4';
    } else {
      if (file.size > MAX_IMAGE_BYTES) throw bad(`Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is 5 MB.`);
      if (!looksLikeWebp(bytes)) throw bad('Only WebP photos are accepted');
      ext = 'webp'; contentType = 'image/webp';
    }

    const name = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(name, bytes, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) {
      console.error('[upload-media] storage error', error.message);
      throw new HttpError(500, /not found|bucket/i.test(error.message)
        ? `Storage bucket "${BUCKET}" is missing. Run supabase/homepage_media.sql.`
        : 'Could not save the file');
    }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(name);
    return { url: data.publicUrl, kind, bytes: bytes.length };
  });
}
