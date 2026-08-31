-- =============================================================================
-- illuxus-vendor · Auto-map vendors to the 'venue' category
-- =============================================================================
-- The illuxus main app queries the venue marketplace by joining
-- `vendors` through `vendor_category_map` filtered on the 'venue' slug
-- (see illuxus/src/hooks/useVenueVendors.ts). Two problems today:
--
--   1. `vendor_categories` doesn't have a 'venue' row — migration 100 only
--      seeded photography, catering, AV, decor, entertainment, planning,
--      staffing, transport, printing, videography.
--   2. Neither the signup trigger (migration 103) nor
--      create_vendor_business() (migration 100) writes a row into
--      vendor_category_map, so no vendor is ever linked to any category.
--
-- Combined effect: the illuxus venue marketplace returns [] and your
-- brand-new vendor never appears.
--
-- Fix (idempotent, safe to re-run):
--   • INSERT the 'venue' category
--   • Backfill vendor_category_map for every existing vendor
--   • Update on_vendor_email_confirmed() to attach the 'venue' category
--     when the auth trigger creates a new vendor row
--   • Update create_vendor_business() to do the same for the "existing
--     Illuxus account adds a vendor" flow
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Ensure the 'venue' category exists
-- -----------------------------------------------------------------------------
INSERT INTO public.vendor_categories (slug, name, icon)
VALUES ('venue', 'Venue', 'building')
ON CONFLICT (slug) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 2 · Backfill every existing vendor into the 'venue' category
-- -----------------------------------------------------------------------------
INSERT INTO public.vendor_category_map (vendor_id, category_id)
SELECT v.id, c.id
  FROM public.vendors v
  CROSS JOIN public.vendor_categories c
 WHERE c.slug = 'venue'
ON CONFLICT DO NOTHING;


-- -----------------------------------------------------------------------------
-- 3 · Update the signup-confirmation trigger to also add the mapping
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.on_vendor_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_name text;
  new_vendor_id   uuid;
  v_venue_cat_id  uuid;
BEGIN
  v_business_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), '');
  IF v_business_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.vendors (business_name)
  VALUES (v_business_name)
  RETURNING id INTO new_vendor_id;

  INSERT INTO public.vendor_members (vendor_id, user_id, role)
  VALUES (new_vendor_id, NEW.id, 'owner');

  -- Attach to the 'venue' category so the illuxus main marketplace
  -- picks it up. If more categories are added later (photography,
  -- catering, etc.), the Profile tab can offer a multi-select.
  SELECT id INTO v_venue_cat_id
    FROM public.vendor_categories
   WHERE slug = 'venue';
  IF v_venue_cat_id IS NOT NULL THEN
    INSERT INTO public.vendor_category_map (vendor_id, category_id)
    VALUES (new_vendor_id, v_venue_cat_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 4 · Update create_vendor_business() for the "existing Illuxus account
--     adds a vendor" and "signed-in user completes signup" flows
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_vendor_business(p_business_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid            uuid := auth.uid();
  new_vendor_id  uuid;
  v_venue_cat_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_business_name IS NULL OR length(trim(p_business_name)) < 2 THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = uid) THEN
    RAISE EXCEPTION 'You already belong to a vendor business';
  END IF;

  INSERT INTO public.vendors (business_name)
  VALUES (trim(p_business_name))
  RETURNING id INTO new_vendor_id;

  INSERT INTO public.vendor_members (vendor_id, user_id, role)
  VALUES (new_vendor_id, uid, 'owner');

  SELECT id INTO v_venue_cat_id
    FROM public.vendor_categories
   WHERE slug = 'venue';
  IF v_venue_cat_id IS NOT NULL THEN
    INSERT INTO public.vendor_category_map (vendor_id, category_id)
    VALUES (new_vendor_id, v_venue_cat_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN new_vendor_id;
END;
$$;


-- =============================================================================
-- End of migration
-- =============================================================================
