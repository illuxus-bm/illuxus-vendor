-- =============================================================================
-- illuxus-vendor · Email OTP for vendor login (2FA)
-- =============================================================================
-- The `vendor_email_otps` table already exists in the shared Illuxus Supabase
-- project. This migration:
--   • widens the purpose CHECK to allow 'login' (currently only signup,
--     reverify, password_reset are permitted)
--   • enables RLS with no policies, so only the service_role key (used by
--     the send-/verify-vendor-otp edge functions) can read or write it
--   • adds a partial index for the hot-path lookup by (email, purpose)
--
-- Idempotent — safe to re-run.
-- =============================================================================

-- 1 · Widen the purpose enum so vendor login OTPs can be stored here alongside
--     signup / password reset codes.
ALTER TABLE public.vendor_email_otps
  DROP CONSTRAINT IF EXISTS vendor_email_otps_purpose_check;

ALTER TABLE public.vendor_email_otps
  ADD CONSTRAINT vendor_email_otps_purpose_check
  CHECK (purpose = ANY (ARRAY['signup', 'login', 'reverify', 'password_reset']));


-- 2 · Lock the table down. No policies means the anon / authenticated JWT
--     roles cannot see or modify OTP rows. The edge functions bypass RLS
--     via the service_role key.
ALTER TABLE public.vendor_email_otps ENABLE ROW LEVEL SECURITY;

-- Drop any stray policies from earlier attempts on this table so re-runs
-- don't accumulate them.
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'vendor_email_otps'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.vendor_email_otps', r.policyname);
  END LOOP;
END $$;

-- Revoke any earlier grants — belt-and-suspenders defense in depth.
REVOKE ALL ON TABLE public.vendor_email_otps FROM anon, authenticated;


-- 3 · Hot-path index: "latest unconsumed OTP for (email, purpose)".
CREATE INDEX IF NOT EXISTS idx_vendor_email_otps_lookup
  ON public.vendor_email_otps (email, purpose, created_at DESC)
  WHERE consumed_at IS NULL;

-- Also index for cleanup / expiry jobs.
CREATE INDEX IF NOT EXISTS idx_vendor_email_otps_expires
  ON public.vendor_email_otps (expires_at)
  WHERE consumed_at IS NULL;
