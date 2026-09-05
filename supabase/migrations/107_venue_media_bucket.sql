-- ═══════════════════════════════════════════════════════════════════════════
-- 107_venue_media_bucket.sql
--
-- Creates the Supabase Storage bucket that backs the Venues tab's media
-- uploader (empty-hall photos, setup shots, facility images, floor plans).
--
-- Before this migration the client tried to upload to a `vendor-portfolio`
-- bucket that never existed — every upload from the Media dialog blew up
-- with "Bucket not found" and the venue_media row was never inserted.
--
-- Bucket configuration:
--   • Public: true — object URLs must be reachable without a JWT so the
--     main app's marketplace can render <img src=""> without a signed URL.
--   • File size cap: 10 MB — big enough for hi-res architectural photos,
--     small enough to reject a phone's raw 100-MB PDF export.
--   • MIME allowlist: images + PDF (floor plans are frequently PDF).
--
-- RLS on storage.objects:
--   • SELECT — public. Anyone can view the URLs.
--   • INSERT — authenticated. Any signed-in user may upload; the app's
--     venue_media table has its own RLS that only exposes rows tied to
--     a venue the user owns, so orphan uploads (no venue_media insert)
--     are simply unreachable.
--   • UPDATE / DELETE — the uploading user only, matched via
--     storage.objects.owner.
--
-- Idempotent throughout — ON CONFLICT + DROP POLICY IF EXISTS. Safe to
-- re-run on any environment.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Create the bucket ─────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-media',
  'venue-media',
  true,
  10 * 1024 * 1024,           -- 10 MB per file
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml',
    'application/pdf'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ── 2. Storage RLS ──────────────────────────────────────────────────
-- Storage RLS lives on the `storage.objects` table (not on the bucket).
-- The bucket is already publicly readable via bucket-level flag; the
-- policies below control who can WRITE.

drop policy if exists "venue_media_public_read" on storage.objects;
create policy "venue_media_public_read"
  on storage.objects
  for select
  using (bucket_id = 'venue-media');

-- Any signed-in user can upload. The venue_media table's RLS is what
-- makes those objects reachable — an orphan file with no venue_media
-- row is invisible to the app and eventually pruned by ownership.
drop policy if exists "venue_media_auth_insert" on storage.objects;
create policy "venue_media_auth_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'venue-media');

-- Update / delete gated by the object's owner. Prevents a user from
-- clobbering another user's uploads even if they know the object path.
drop policy if exists "venue_media_owner_update" on storage.objects;
create policy "venue_media_owner_update"
  on storage.objects
  for update
  to authenticated
  using  (bucket_id = 'venue-media' and owner = auth.uid())
  with check (bucket_id = 'venue-media' and owner = auth.uid());

drop policy if exists "venue_media_owner_delete" on storage.objects;
create policy "venue_media_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'venue-media' and owner = auth.uid());
