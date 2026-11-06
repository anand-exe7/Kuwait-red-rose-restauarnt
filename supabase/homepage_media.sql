-- Red Rose — public storage bucket for admin-managed homepage media.
--
-- Run ONCE in the Supabase SQL editor (safe to re-run). Holds the homepage
-- gallery photos (WebP) and short videos (MP4) the admin uploads.
--
-- * Public bucket: anyone can VIEW by link (the homepage shows them).
-- * Only the server (service-role key, via POST /api/upload-media, admin login)
--   can add or remove files.
-- * Allowed: WebP images and MP4 video, up to 10 MB per file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homepage-media', 'homepage-media', true, 10485760, array['image/webp', 'video/mp4'])
on conflict (id) do update
  set public = true, file_size_limit = 10485760, allowed_mime_types = array['image/webp', 'video/mp4'];
