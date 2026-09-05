-- ═══════════════════════════════════════════════════════════════════════════
-- 105_vendor_email_allowlist.sql
--
-- Enforces at the database layer that only allowlisted emails can ever
-- become vendors. The client-side gate in VendorAuthContext hides the
-- UI paths, but a curl against Supabase Auth signup + a call to
-- create_vendor_business (or a race with the on_vendor_email_confirmed
-- trigger) could otherwise still create a vendor row. This migration
-- shuts that off by putting the check on the vendor_members INSERT
-- itself, which every vendor-creation path funnels through.
--
-- Layout:
--   1. `vendor_email_allowlist` table — add/remove rows by hand as
--      new vendors are invited.
--   2. `enforce_vendor_email_allowlist` trigger function on
--      vendor_members BEFORE INSERT — hard-blocks non-allowlisted
--      users with a clear error.
--   3. `on_vendor_email_confirmed` and `create_vendor_business` are
--      patched to check the allowlist BEFORE attempting the insert.
--      Without this, the trigger's RAISE would roll back the auth
--      email-confirmation itself (Supabase's confirm link would 500).
--
-- Idempotent throughout: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO
-- NOTHING on the seed row, CREATE OR REPLACE on the functions, and
-- DROP TRIGGER IF EXISTS before the trigger definition. Safe to
-- re-run.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Allowlist table ─────────────────────────────────────────────────
create table if not exists public.vendor_email_allowlist (
  email      text primary key,
  notes      text,
  created_at timestamptz not null default now()
);

comment on table public.vendor_email_allowlist is
  'Whitelist of email addresses permitted to hold a vendor_members row. Enforced by the enforce_vendor_email_allowlist trigger. To invite a new vendor, INSERT their email here (lowercased) before they sign up.';

-- Seed the initial vendor. Add more rows here (or via a follow-up INSERT)
-- when new vendors are invited.
insert into public.vendor_email_allowlist (email, notes)
values ('aman@bizmillennium.com', 'Initial vendor')
on conflict (email) do nothing;

-- Grants — only the postgres role can add / remove entries from SQL editor,
-- which is what we want. RLS is not enabled on this table because it's
-- never queried by end-user roles; the trigger function is SECURITY DEFINER.
revoke all on table public.vendor_email_allowlist from anon, authenticated;


-- ── 2. Enforcement trigger ─────────────────────────────────────────────
create or replace function public.enforce_vendor_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  _email text;
begin
  select lower(email) into _email
    from auth.users
   where id = new.user_id;

  if _email is null then
    raise exception
      'Cannot create vendor_members row: auth user % not found.', new.user_id
      using errcode = '23503';  -- foreign_key_violation-flavored
  end if;

  if not exists (
    select 1 from public.vendor_email_allowlist a
    where lower(a.email) = _email
  ) then
    raise exception
      'Vendor portal access is invite-only. Email % is not on the allowlist. '
      'Add it via INSERT INTO public.vendor_email_allowlist (email) VALUES (...) if intentional.',
      _email
      using errcode = '42501';  -- insufficient_privilege
  end if;

  return new;
end;
$$;

comment on function public.enforce_vendor_email_allowlist() is
  'BEFORE INSERT trigger on vendor_members: rejects any row whose user_id resolves to an auth.users email not present in vendor_email_allowlist.';

drop trigger if exists trg_enforce_vendor_email_allowlist on public.vendor_members;
create trigger trg_enforce_vendor_email_allowlist
  before insert on public.vendor_members
  for each row execute function public.enforce_vendor_email_allowlist();


-- ── 3. Patch on_vendor_email_confirmed to skip non-allowlisted users ───
--
-- Without this patch, the enforce_* trigger would RAISE inside the
-- email-confirmation trigger, rolling back the whole auth.users UPDATE.
-- The user's email would appear "unconfirmed" and clicking the link
-- again would 500. Cleaner UX: silently skip vendor row creation for
-- non-allowlisted signups. They can still confirm their auth account
-- (which they might legitimately use on the main Illuxus app); they
-- just don't get a vendor profile.
create or replace function public.on_vendor_email_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_business_name text;
  new_vendor_id   uuid;
  v_venue_cat_id  uuid;
begin
  v_business_name := nullif(trim(new.raw_user_meta_data->>'business_name'), '');
  if v_business_name is null then
    return new;
  end if;

  if exists (select 1 from public.vendor_members where user_id = new.id) then
    return new;
  end if;

  -- ── ALLOWLIST GATE (migration 105) ──
  -- Skip the entire vendor provisioning path when the email isn't on
  -- the allowlist. The email still gets confirmed on auth.users so
  -- the user can log into the main app if they have access there.
  if not exists (
    select 1 from public.vendor_email_allowlist a
    where lower(a.email) = lower(new.email)
  ) then
    return new;
  end if;

  insert into public.vendors (business_name)
  values (v_business_name)
  returning id into new_vendor_id;

  insert into public.vendor_members (vendor_id, user_id, role)
  values (new_vendor_id, new.id, 'owner');

  select id into v_venue_cat_id
    from public.vendor_categories
   where slug = 'venue';
  if v_venue_cat_id is not null then
    insert into public.vendor_category_map (vendor_id, category_id)
    values (new_vendor_id, v_venue_cat_id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;


-- ── 4. Patch create_vendor_business — RPC used by the "existing Illuxus
--     account adds a vendor" and "signed-in user completes signup" paths.
--     Raises a clean, human-readable error when the caller isn't
--     allowlisted, instead of letting the enforce_* trigger's SQL error
--     bubble up to the client.
create or replace function public.create_vendor_business(p_business_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid            uuid := auth.uid();
  new_vendor_id  uuid;
  v_venue_cat_id uuid;
  _caller_email  text;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_business_name is null or length(trim(p_business_name)) < 2 then
    raise exception 'Business name is required';
  end if;

  if exists (select 1 from public.vendor_members where user_id = uid) then
    raise exception 'You already belong to a vendor business';
  end if;

  -- ── ALLOWLIST GATE (migration 105) ──
  select lower(email) into _caller_email
    from auth.users
   where id = uid;
  if not exists (
    select 1 from public.vendor_email_allowlist a
    where lower(a.email) = _caller_email
  ) then
    raise exception
      'Vendor portal access is invite-only. Contact support if you should have access.'
      using errcode = '42501';
  end if;

  insert into public.vendors (business_name)
  values (trim(p_business_name))
  returning id into new_vendor_id;

  insert into public.vendor_members (vendor_id, user_id, role)
  values (new_vendor_id, uid, 'owner');

  select id into v_venue_cat_id
    from public.vendor_categories
   where slug = 'venue';
  if v_venue_cat_id is not null then
    insert into public.vendor_category_map (vendor_id, category_id)
    values (new_vendor_id, v_venue_cat_id)
    on conflict do nothing;
  end if;

  return new_vendor_id;
end;
$$;


-- ── End of migration ──────────────────────────────────────────────────
