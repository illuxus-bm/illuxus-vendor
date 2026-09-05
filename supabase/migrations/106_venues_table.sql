-- ═══════════════════════════════════════════════════════════════════════════
-- 106_venues_table.sql
--
-- Introduces the concept of a Venue (a physical space) distinct from a
-- Vendor (the business entity). Before this migration the two were
-- conflated: a "vendor with the venue category" was the venue. That
-- worked for the initial one-vendor-one-venue seed, but breaks the
-- moment a single vendor (e.g. a hotel) wants to rent out multiple
-- spaces — ballroom, terrace, poolside, conference room — each with
-- its own capacity, amenities, and photos.
--
-- Model:
--   • vendors        — business identity (untouched)
--   • venues         — physical spaces the vendor rents out (NEW)
--   • venue_media    — photos + floor plans per venue (NEW)
--
-- The vendor-side app gets a "Venues" tab where the owner (aman for
-- Bizmillennium today) can create / edit each venue and upload its
-- media. The main app's marketplace will (in a follow-up migration and
-- code change) shift from listing vendors to listing venues so the
-- organizer's "seat count needed / seating layout" filters can actually
-- filter against the physical space's numbers.
--
-- Existing schema left alone: vendor_services / vendor_portfolio /
-- vendor_availability continue to work at the vendor level. Callers
-- that were checking "is this vendor in the venue category" keep
-- working — this migration is additive.
--
-- Idempotent throughout (CREATE TABLE IF NOT EXISTS, DROP POLICY IF
-- EXISTS, CREATE OR REPLACE). Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. venues ─────────────────────────────────────────────────────────
create table if not exists public.venues (
  id                 uuid primary key default gen_random_uuid(),
  vendor_id          uuid not null references public.vendors(id) on delete cascade,

  -- Identity
  name               text not null,
  -- Space taxonomy: 'indoor_hall', 'outdoor_lawn', 'terrace', 'poolside',
  -- 'conference_room', 'ballroom', 'banquet_hall', 'rooftop', 'other'.
  -- Kept as free text (with a length cap below) so we can iterate on the
  -- picker options without another migration.
  space_type         text,
  description        text,
  is_active          boolean not null default true,

  -- ─ Dimensions & physical space ─
  area_sqft          int,
  length_ft          numeric(6,1),
  width_ft           numeric(6,1),
  ceiling_height_ft  numeric(4,1),

  -- ─ Seating capacity by arrangement ─
  -- Each column is the maximum guest count the space comfortably
  -- supports for that layout. Null = "not applicable / not measured".
  capacity_floating  int,   -- standing reception
  capacity_theater   int,   -- rows of chairs facing front
  capacity_banquet   int,   -- round tables with chairs
  capacity_ushape    int,   -- corporate U-shape
  capacity_classroom int,   -- classroom rows with tables

  -- ─ Amenities: climate + stage ─
  -- 'central_ac' | 'split_ac' | 'non_ac' — free text with CHECK.
  climate_control    text,
  has_stage          boolean not null default false,
  stage_dimensions   text,  -- e.g. "20x15 ft"; free text, capped.
  green_rooms_count  int,

  -- ─ Amenities: tech & essentials ─
  has_projector      boolean not null default false,
  has_screen         boolean not null default false,
  has_sound_system   boolean not null default false,
  has_microphones    boolean not null default false,
  has_power_backup   boolean not null default false,
  has_wifi           boolean not null default false,

  -- ─ Policies ─
  catering_policy    text,  -- 'in_house_only' | 'outside_permitted' | 'both'
  decor_policy       text,  -- 'empanelled_only' | 'client_choice' | 'both'
  alcohol_policy     text,  -- 'in_house_only' | 'outside_with_license' | 'prohibited' | 'both'
  music_curfew_time  time,  -- e.g. 22:00 = music off by 10 PM
  noise_restrictions text,

  -- ─ Logistics & accessibility ─
  parking_car_capacity          int,
  parking_two_wheeler_capacity  int,
  has_valet                     boolean not null default false,
  wheelchair_accessible         boolean not null default false,
  has_elevator                  boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Basic length + enum guards. Free text is fine but the columns should
-- never store megabytes and the enum-shaped columns should hold known
-- values so the app can safely render them in dropdowns.
alter table public.venues
  drop constraint if exists venues_climate_control_check;
alter table public.venues
  add  constraint venues_climate_control_check
    check (climate_control is null
           or climate_control in ('central_ac','split_ac','non_ac'));

alter table public.venues
  drop constraint if exists venues_catering_policy_check;
alter table public.venues
  add  constraint venues_catering_policy_check
    check (catering_policy is null
           or catering_policy in ('in_house_only','outside_permitted','both'));

alter table public.venues
  drop constraint if exists venues_decor_policy_check;
alter table public.venues
  add  constraint venues_decor_policy_check
    check (decor_policy is null
           or decor_policy in ('empanelled_only','client_choice','both'));

alter table public.venues
  drop constraint if exists venues_alcohol_policy_check;
alter table public.venues
  add  constraint venues_alcohol_policy_check
    check (alcohol_policy is null
           or alcohol_policy in ('in_house_only','outside_with_license','prohibited','both'));

alter table public.venues
  drop constraint if exists venues_name_length;
alter table public.venues
  add  constraint venues_name_length
    check (length(name) between 1 and 120);

alter table public.venues
  drop constraint if exists venues_space_type_length;
alter table public.venues
  add  constraint venues_space_type_length
    check (space_type is null or length(space_type) <= 60);

create index if not exists venues_vendor_id_idx on public.venues (vendor_id);
create index if not exists venues_is_active_idx on public.venues (is_active);


-- ── 2. venue_media ────────────────────────────────────────────────────
create table if not exists public.venue_media (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  url        text not null,
  caption    text,
  -- 'empty_hall' | 'setup' | 'facility' | 'floor_plan' | 'other'
  media_kind text not null default 'empty_hall',
  is_cover   boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.venue_media
  drop constraint if exists venue_media_kind_check;
alter table public.venue_media
  add  constraint venue_media_kind_check
    check (media_kind in ('empty_hall','setup','facility','floor_plan','other'));

create index if not exists venue_media_venue_id_idx on public.venue_media (venue_id);


-- ── 3. updated_at auto-touch ──────────────────────────────────────────
-- Reuses vendor_set_updated_at() from migration 100. That function just
-- sets NEW.updated_at = now(); safe to call from any BEFORE UPDATE trigger.
drop trigger if exists trg_venues_touch_updated_at on public.venues;
create trigger trg_venues_touch_updated_at
  before update on public.venues
  for each row execute function public.vendor_set_updated_at();


-- ── 4. RLS ────────────────────────────────────────────────────────────
alter table public.venues     enable row level security;
alter table public.venue_media enable row level security;

-- Public read on active venues so the main app marketplace can list
-- them without an authenticated session (embed.js, share cards, etc).
drop policy if exists "venues_public_read" on public.venues;
create policy "venues_public_read"
  on public.venues for select
  using (is_active = true);

-- Vendor members see their own venues regardless of active flag (they
-- need to edit drafts). Uses the SECURITY DEFINER is_vendor_member
-- helper from migration 100, single-arg form.
drop policy if exists "venues_member_read_own" on public.venues;
create policy "venues_member_read_own"
  on public.venues for select to authenticated
  using (public.is_vendor_member(vendor_id));

drop policy if exists "venues_member_manage" on public.venues;
create policy "venues_member_manage"
  on public.venues for all to authenticated
  using (public.is_vendor_member(vendor_id))
  with check (public.is_vendor_member(vendor_id));

-- Media inherits the venue's visibility: anyone can read, only the
-- venue's vendor members can write.
drop policy if exists "venue_media_public_read" on public.venue_media;
create policy "venue_media_public_read"
  on public.venue_media for select
  using (true);

drop policy if exists "venue_media_member_manage" on public.venue_media;
create policy "venue_media_member_manage"
  on public.venue_media for all to authenticated
  using (exists (
    select 1 from public.venues v
    where v.id = venue_media.venue_id
      and public.is_vendor_member(v.vendor_id)
  ))
  with check (exists (
    select 1 from public.venues v
    where v.id = venue_media.venue_id
      and public.is_vendor_member(v.vendor_id)
  ));


-- ── 5. Grants ─────────────────────────────────────────────────────────
grant select                              on public.venues     to anon, authenticated;
grant insert, update, delete              on public.venues     to authenticated;
grant select                              on public.venue_media to anon, authenticated;
grant insert, update, delete              on public.venue_media to authenticated;


-- ── 6. Comments (for the Supabase table editor + PgHero) ──────────────
comment on table public.venues is
  'Physical spaces a vendor rents out. A single vendor may own many venues (e.g. a hotel with ballroom + terrace + conference room). Distinct from `vendors` which is the business identity.';
comment on table public.venue_media is
  'Photos and floor plans attached to a venue. media_kind slots the asset into the marketplace card sections (empty hall / setup / facility / floor plan).';
