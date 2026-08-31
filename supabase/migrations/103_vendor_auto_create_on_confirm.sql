-- =============================================================================
-- illuxus-vendor · Auto-create vendor row on email confirmation
-- =============================================================================
-- Vendor signup is a two-step flow:
--
--   1. Client calls supabase.auth.signUp with { data: { business_name } }.
--      Because email confirmation is enabled, the auth.users row is inserted
--      with email_confirmed_at = null and a confirmation email is sent.
--
--   2. User clicks the link in the email → Supabase sets email_confirmed_at.
--
-- This migration installs a trigger that fires on step 2 and creates the
-- corresponding vendors + vendor_members rows atomically, using the
-- business_name stashed in raw_user_meta_data.
--
-- The trigger is guarded so it ONLY fires for signups originating from the
-- vendor portal. Illuxus organizer signups (no business_name in metadata)
-- are ignored — they still share auth.users but don't get vendor rows.
--
-- Two trigger paths exist:
--   • AFTER INSERT     — for projects that have email confirmation OFF,
--                        auth.users are created with email_confirmed_at
--                        already populated. This trigger catches that case.
--   • AFTER UPDATE OF  — for the normal confirmation flow: email_confirmed_at
--     email_confirmed_at transitions from null to a timestamp when the link
--                        is clicked.
--
-- The handler is idempotent — running it twice on the same user is a no-op
-- because we skip if a vendor_members row already exists.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Handler
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
BEGIN
  -- Only continue if the metadata says "vendor signup".
  v_business_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'business_name'), '');
  IF v_business_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Defense in depth — never create a second vendor for the same user.
  IF EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.vendors (business_name)
  VALUES (v_business_name)
  RETURNING id INTO new_vendor_id;

  INSERT INTO public.vendor_members (vendor_id, user_id, role)
  VALUES (new_vendor_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- Triggers — drop-and-recreate so re-runs are safe
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_vendor_signup_insert  ON auth.users;
DROP TRIGGER IF EXISTS on_vendor_signup_confirm ON auth.users;

-- Case A: project has email confirmation DISABLED. auth.users is inserted
-- with email_confirmed_at already set. Fire the handler immediately.
CREATE TRIGGER on_vendor_signup_insert
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (
    NEW.email_confirmed_at IS NOT NULL
    AND NEW.raw_user_meta_data ? 'business_name'
  )
  EXECUTE FUNCTION public.on_vendor_email_confirmed();

-- Case B: project has email confirmation ENABLED (our target setup).
-- email_confirmed_at transitions from NULL to a timestamp when the user
-- clicks the link. That's when we create the vendor rows.
CREATE TRIGGER on_vendor_signup_confirm
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (
    OLD.email_confirmed_at IS NULL
    AND NEW.email_confirmed_at IS NOT NULL
    AND NEW.raw_user_meta_data ? 'business_name'
  )
  EXECUTE FUNCTION public.on_vendor_email_confirmed();


-- =============================================================================
-- End of migration
-- =============================================================================
