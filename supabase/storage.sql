-- Red Rose — public storage bucket for menu photos.
--
-- Run ONCE in the Supabase SQL editor (safe to re-run). The app has probably created
-- this bucket already; this file is the record of how it is set up.
--
-- * Public bucket: anyone can VIEW a photo by its link (customers see the menu).
-- * No insert/update/delete policies: only the server (service-role key, through
--   POST /api/upload, admin login required) can add or remove files.
-- * Only WebP, max 400 KB per file, enforced here as well as in the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 409600, array['image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 409600, allowed_mime_types = array['image/webp'];
