-- CG Logo Storage bucket (2026-09-25)
--
-- Why: the overlay (/o/:token) polls tyapp_cg_get_output_by_token every
-- CG_OVERLAY_POLL_MS (300ms), by design, for as long as it's open in OBS.
-- That RPC returns the full layer row via to_jsonb(l), including
-- `payload`. Logo images used to be embedded as base64 data: URLs directly
-- in `payload.imageUrl` ("Choose local image" -> readImageFileAsDataUrl),
-- so every single poll re-transmitted the whole image via PostgREST
-- (uncached egress). Confirmed as the likely cause of a ~9.9GB egress
-- spike over 2026-09-23/24 (99.9-100% PostgREST, near-zero other days).
--
-- Fix: Logo images now upload to a public Storage bucket; `payload.imageUrl`
-- only ever holds a short URL string. Storage-served files are fetched once
-- by the browser (cached after) and benefit from Supabase's cheaper cached
-- egress, instead of being re-sent raw on every poll.
--
-- Run this once in the Supabase SQL editor. Safe to re-run (idempotent).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cg-logo',
  'cg-logo',
  true,
  1500000,
  array['image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public URL reads work without a SELECT policy, but keep one so the
-- Storage API and the overlay <img> both stay readable if that changes.
drop policy if exists "cg-logo select public" on storage.objects;
create policy "cg-logo select public"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'cg-logo');

drop policy if exists "cg-logo insert authenticated" on storage.objects;
create policy "cg-logo insert authenticated"
on storage.objects for insert
to authenticated
with check (bucket_id = 'cg-logo');

-- Accepted data loss (user confirmed 2026-09-25): clear any already-embedded
-- base64 Logo images so nothing keeps re-transmitting a full image on every
-- overlay poll while this ships. Re-upload via "Choose local image" once
-- the app is on the Storage-backed code path.
update public.tyapp_cg_layer
set payload = (payload - 'fileName') || jsonb_build_object('imageUrl', '')
where payload->>'imageUrl' like 'data:image%';

notify pgrst, 'reload schema';
