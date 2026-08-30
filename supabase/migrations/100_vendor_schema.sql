-- =============================================================================
-- illuxus-vendor · RLS, RPCs, triggers, and infra
-- =============================================================================
-- The vendor / rfq / quote / booking / etc. tables already exist in the shared
-- Illuxus Supabase project (created by Lovable). This migration installs
-- everything the vendor app needs *on top* of that schema:
--
--   • is_vendor_member(vendor_id)  — RLS helper
--   • vendor_can_read_org(org_id)  — RLS helper for organizer-side access
--   • create_vendor_business(name) — atomic signup: vendors + vendor_members
--   • accept_vendor_quote(quote_id) — atomic quote acceptance
--   • get_or_create_vendor_thread(...) — messaging bootstrap
--   • get_marketplace_vendors(...)  — organizer marketplace list
--   • Trigger: recompute_vendor_rating (org→vendor reviews only)
--   • Trigger: vendor_bookings_sync_availability (auto-block on confirm)
--   • Trigger: rfq_invitees_touch_responded_at (mark responded on quote send)
--   • RLS policies for every vendor_* / rfq / quote / booking / review table
--   • vendor-media storage bucket + object policies
--   • Realtime publication additions
--
-- Idempotent — safe to re-run. DOES NOT create or alter any table columns.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0 · Cleanup from any earlier attempt
-- -----------------------------------------------------------------------------
-- 0.1 · Drop any unused enum types the previous attempt created. They aren't
-- referenced by anything in the real schema (which uses text + CHECK), so
-- these DROPs are safe. IF EXISTS makes them no-ops on fresh installs.
DROP TYPE IF EXISTS public.vendor_member_role     CASCADE;
DROP TYPE IF EXISTS public.service_price_model    CASCADE;
DROP TYPE IF EXISTS public.rfq_status             CASCADE;
DROP TYPE IF EXISTS public.quote_status           CASCADE;
DROP TYPE IF EXISTS public.vendor_booking_status  CASCADE;
DROP TYPE IF EXISTS public.milestone_status       CASCADE;
DROP TYPE IF EXISTS public.review_direction       CASCADE;
DROP TYPE IF EXISTS public.availability_status    CASCADE;
DROP TYPE IF EXISTS public.message_sender         CASCADE;

-- 0.2 · Drop every overload of the functions we're about to (re)create.
-- Postgres refuses to change input-parameter *names* through CREATE OR
-- REPLACE FUNCTION, so we can't just replace what Lovable pre-installed —
-- we have to drop and recreate. CASCADE also removes any policies /
-- triggers that referenced them; sections 3 + 5 recreate all of those
-- from scratch, so nothing is orphaned.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'is_vendor_member',
         'vendor_can_read_org',
         'create_vendor_business',
         'accept_vendor_quote',
         'get_or_create_vendor_thread',
         'get_marketplace_vendors',
         'recompute_vendor_rating',
         'vendor_bookings_sync_availability',
         'rfq_invitees_touch_responded',
         'vendor_set_updated_at'
       ])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
                   r.proname, r.args);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 1 · Helper functions
-- -----------------------------------------------------------------------------

-- Parameter-naming convention: every function uses `p_` prefix, matching
-- what Lovable's baseline uses. Consistent naming avoids future "cannot
-- change name of input parameter" errors when we CREATE OR REPLACE.

-- 1.1 · Vendor membership check (SECURITY DEFINER so it works inside RLS).
CREATE OR REPLACE FUNCTION public.is_vendor_member(p_vendor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.vendor_members
     WHERE vendor_id = p_vendor_id
       AND user_id   = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(uuid) TO authenticated, anon;

-- 1.2 · Organizer-side read helper. Owns the org OR is in org_members.
-- Named with a `vendor_` prefix to avoid colliding with any existing
-- is_org_member helper the main illuxus schema may already define.
CREATE OR REPLACE FUNCTION public.vendor_can_read_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
     WHERE o.id = p_org_id AND o.owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.org_members m
     WHERE m.org_id = p_org_id AND m.user_id = auth.uid()
  );
$$;
GRANT EXECUTE ON FUNCTION public.vendor_can_read_org(uuid) TO authenticated, anon;


-- -----------------------------------------------------------------------------
-- 2 · Trigger functions
-- -----------------------------------------------------------------------------

-- 2.1 · Timestamp maintenance (safe to add — no-ops if triggers already exist).
CREATE OR REPLACE FUNCTION public.vendor_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2.2 · Recompute vendors.rating_avg + rating_count on review changes.
-- The reviews table has no vendor_id column, so we look it up via the
-- booking. Only organizer→vendor reviews (reviewer_type='organizer') count.
CREATE OR REPLACE FUNCTION public.recompute_vendor_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT b.vendor_id INTO v_id
    FROM public.vendor_bookings b
   WHERE b.id = COALESCE(NEW.booking_id, OLD.booking_id);

  IF v_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.vendors v
     SET rating_avg = COALESCE((
           SELECT ROUND(AVG(r.rating)::numeric, 2)
             FROM public.vendor_reviews r
             JOIN public.vendor_bookings b ON b.id = r.booking_id
            WHERE b.vendor_id = v_id
              AND r.reviewer_type = 'organizer'
         ), 0),
         rating_count = (
           SELECT COUNT(*)
             FROM public.vendor_reviews r
             JOIN public.vendor_bookings b ON b.id = r.booking_id
            WHERE b.vendor_id = v_id
              AND r.reviewer_type = 'organizer'
         )
   WHERE v.id = v_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2.3 · When a booking flips to `confirmed`, insert a row into
-- vendor_availability so the marketplace hides that date. When it flips
-- back to cancelled, release the block. Uses booking_id as the FK so we
-- can find our own row later without racing manual blocks on the same day.
CREATE OR REPLACE FUNCTION public.vendor_bookings_sync_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Confirmed for the first time → insert a booked row (idempotent guard).
  IF NEW.status = 'confirmed' AND NEW.event_date IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.status <> 'confirmed')
     AND NOT EXISTS (
       SELECT 1 FROM public.vendor_availability
        WHERE booking_id = NEW.id AND status = 'booked'
     ) THEN
    INSERT INTO public.vendor_availability (vendor_id, date, status, note, booking_id)
    VALUES (NEW.vendor_id, NEW.event_date, 'booked', 'Confirmed booking', NEW.id);
  END IF;

  -- Cancelled after being confirmed → release the auto-block.
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' AND OLD.status = 'confirmed' THEN
    DELETE FROM public.vendor_availability
     WHERE booking_id = NEW.id AND status = 'booked';
  END IF;

  RETURN NEW;
END;
$$;

-- 2.4 · Mark an rfq_invitee's responded_at whenever the vendor sends
-- (or updates) a quote for that RFQ. Keeps the Inbox "Responded" segment
-- correct without the client having to remember to touch the row.
CREATE OR REPLACE FUNCTION public.rfq_invitees_touch_responded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IN ('sent', 'accepted', 'declined') THEN
    UPDATE public.rfq_invitees
       SET responded_at = COALESCE(responded_at, now())
     WHERE rfq_id = NEW.rfq_id
       AND vendor_id = NEW.vendor_id;
  END IF;
  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 3 · Triggers (drop + create so re-runs are safe)
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_vendor_reviews_rating         ON public.vendor_reviews;
  CREATE TRIGGER trg_vendor_reviews_rating
    AFTER INSERT OR UPDATE OR DELETE ON public.vendor_reviews
    FOR EACH ROW EXECUTE FUNCTION public.recompute_vendor_rating();

  DROP TRIGGER IF EXISTS trg_vendor_bookings_availability  ON public.vendor_bookings;
  CREATE TRIGGER trg_vendor_bookings_availability
    AFTER INSERT OR UPDATE ON public.vendor_bookings
    FOR EACH ROW EXECUTE FUNCTION public.vendor_bookings_sync_availability();

  DROP TRIGGER IF EXISTS trg_quotes_touch_invitee          ON public.quotes;
  CREATE TRIGGER trg_quotes_touch_invitee
    AFTER INSERT OR UPDATE OF status ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.rfq_invitees_touch_responded();

  -- updated_at maintenance for the two tables that have the column
  -- (vendors, quotes, vendor_bookings). These triggers are safe to add
  -- even if Lovable's baseline already installed similar ones.
  DROP TRIGGER IF EXISTS trg_vendors_updated               ON public.vendors;
  CREATE TRIGGER trg_vendors_updated BEFORE UPDATE ON public.vendors
    FOR EACH ROW EXECUTE FUNCTION public.vendor_set_updated_at();

  DROP TRIGGER IF EXISTS trg_quotes_updated                ON public.quotes;
  CREATE TRIGGER trg_quotes_updated BEFORE UPDATE ON public.quotes
    FOR EACH ROW EXECUTE FUNCTION public.vendor_set_updated_at();

  DROP TRIGGER IF EXISTS trg_vendor_bookings_updated       ON public.vendor_bookings;
  CREATE TRIGGER trg_vendor_bookings_updated BEFORE UPDATE ON public.vendor_bookings
    FOR EACH ROW EXECUTE FUNCTION public.vendor_set_updated_at();
END $$;


-- -----------------------------------------------------------------------------
-- 4 · RPCs
-- -----------------------------------------------------------------------------

-- 4.1 · Atomic signup — creates the vendors row + owner vendor_members in
-- one call. The client uses this instead of two separate inserts so we
-- never leave orphaned vendors rows around.
CREATE OR REPLACE FUNCTION public.create_vendor_business(p_business_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  new_vendor_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_business_name IS NULL OR length(trim(p_business_name)) < 2 THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;

  -- One vendor per user for now. Support multi-vendor tenants later.
  IF EXISTS (SELECT 1 FROM public.vendor_members WHERE user_id = uid) THEN
    RAISE EXCEPTION 'You already belong to a vendor business';
  END IF;

  INSERT INTO public.vendors (business_name)
  VALUES (trim(p_business_name))
  RETURNING id INTO new_vendor_id;

  INSERT INTO public.vendor_members (vendor_id, user_id, role)
  VALUES (new_vendor_id, uid, 'owner');

  RETURN new_vendor_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_vendor_business(text) TO authenticated;

-- 4.2 · Atomic quote acceptance. Called by the organizer's "Accept" button.
CREATE OR REPLACE FUNCTION public.accept_vendor_quote(p_quote_id uuid)
RETURNS uuid   -- returns the new vendor_bookings.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  q_row public.quotes%ROWTYPE;
  r_row public.rfqs%ROWTYPE;
  v_commission_rate numeric;
  v_commission_amount bigint;
  new_booking_id uuid;
BEGIN
  SELECT * INTO q_row FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found'; END IF;
  IF q_row.status <> 'sent' THEN
    RAISE EXCEPTION 'Quote is not in a state that can be accepted (status=%)', q_row.status;
  END IF;

  SELECT * INTO r_row FROM public.rfqs WHERE id = q_row.rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  -- Authorization: caller must have access to the organizer side of this RFQ.
  IF NOT public.vendor_can_read_org(r_row.org_id) THEN
    RAISE EXCEPTION 'Not authorized to accept quotes on this RFQ';
  END IF;

  -- Copy commission from the vendor row so bookings capture the rate that
  -- was in effect at accept-time.
  SELECT commission_rate INTO v_commission_rate
    FROM public.vendors WHERE id = q_row.vendor_id;
  v_commission_rate := COALESCE(v_commission_rate, 10.00);
  v_commission_amount := ROUND(q_row.total::numeric * v_commission_rate / 100)::bigint;

  -- Winning quote
  UPDATE public.quotes
     SET status = 'accepted', updated_at = now()
   WHERE id = p_quote_id;

  -- Siblings on the same RFQ → expired
  UPDATE public.quotes
     SET status = 'expired', updated_at = now()
   WHERE rfq_id = q_row.rfq_id
     AND id <> p_quote_id
     AND status IN ('draft', 'sent');

  -- Close the RFQ
  UPDATE public.rfqs
     SET status = 'accepted'
   WHERE id = q_row.rfq_id;

  -- Create the booking
  INSERT INTO public.vendor_bookings (
    quote_id, rfq_id, org_id, vendor_id, event_id,
    total, currency, commission_rate, commission_amount,
    event_date, status
  ) VALUES (
    q_row.id, q_row.rfq_id, r_row.org_id, q_row.vendor_id, r_row.event_id,
    q_row.total, q_row.currency, v_commission_rate, v_commission_amount,
    r_row.event_date, 'pending'
  ) RETURNING id INTO new_booking_id;

  -- Seed the standard milestone checklist (30/70 default split).
  -- Values are in the same minor-unit basis as `total`.
  INSERT INTO public.booking_milestones (booking_id, label, amount, sort_order)
  VALUES
    (new_booking_id, 'Deposit',        ROUND(q_row.total::numeric * 0.30)::bigint, 1),
    (new_booking_id, 'Balance',        ROUND(q_row.total::numeric * 0.70)::bigint, 2),
    (new_booking_id, 'Event delivered',                                    0,      3);

  RETURN new_booking_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.accept_vendor_quote(uuid) TO authenticated;

-- 4.3 · Idempotent thread bootstrap keyed on (org, vendor, rfq?, booking?).
CREATE OR REPLACE FUNCTION public.get_or_create_vendor_thread(
  p_org_id     uuid,
  p_vendor_id  uuid,
  p_rfq_id     uuid DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing uuid;
  new_id   uuid;
BEGIN
  IF NOT (public.is_vendor_member(p_vendor_id) OR public.vendor_can_read_org(p_org_id)) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  SELECT id INTO existing
    FROM public.vendor_message_threads
   WHERE org_id    = p_org_id
     AND vendor_id = p_vendor_id
     AND COALESCE(rfq_id,     '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_rfq_id,   '00000000-0000-0000-0000-000000000000'::uuid)
     AND COALESCE(booking_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(p_booking_id,'00000000-0000-0000-0000-000000000000'::uuid)
   LIMIT 1;

  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  INSERT INTO public.vendor_message_threads (org_id, vendor_id, rfq_id, booking_id, last_message_at)
  VALUES (p_org_id, p_vendor_id, p_rfq_id, p_booking_id, now())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_or_create_vendor_thread(uuid, uuid, uuid, uuid) TO authenticated;

-- 4.4 · Ranked marketplace list for the organizer side.
-- Ranks by verified first, then rating, then review count. Filterable by
-- category slug + city substring + minimum rating.
CREATE OR REPLACE FUNCTION public.get_marketplace_vendors(
  p_category_slug text DEFAULT NULL,
  p_city          text DEFAULT NULL,
  p_min_rating    numeric DEFAULT NULL,
  p_limit         integer DEFAULT 24,
  p_offset        integer DEFAULT 0
)
RETURNS TABLE (
  id             uuid,
  business_name  text,
  tagline        text,
  city           text,
  country        text,
  logo_url       text,
  cover_url      text,
  rating_avg     numeric,
  rating_count   integer,
  default_currency text,
  verification_status text,
  response_time_hours integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    v.id, v.business_name, v.tagline, v.city, v.country,
    v.logo_url, v.cover_url, v.rating_avg, v.rating_count,
    v.default_currency, v.verification_status, v.response_time_hours
  FROM public.vendors v
  LEFT JOIN public.vendor_category_map m ON m.vendor_id = v.id
  LEFT JOIN public.vendor_categories   c ON c.id        = m.category_id
  WHERE (p_category_slug IS NULL OR c.slug = p_category_slug)
    AND (p_city          IS NULL OR v.city ILIKE '%' || p_city || '%')
    AND (p_min_rating    IS NULL OR COALESCE(v.rating_avg, 0) >= p_min_rating)
  GROUP BY v.id
  ORDER BY (v.verification_status = 'verified') DESC,
           COALESCE(v.rating_avg, 0) DESC,
           v.rating_count DESC
  LIMIT  GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, p_offset);
$$;
GRANT EXECUTE ON FUNCTION public.get_marketplace_vendors(text, text, numeric, integer, integer) TO authenticated, anon;


-- -----------------------------------------------------------------------------
-- 5 · Row-level security
-- -----------------------------------------------------------------------------
-- Enable RLS (idempotent — no-op if already enabled).
ALTER TABLE public.vendors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_category_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_service_areas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_portfolio      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_availability   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfqs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_invitees          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_line_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_bookings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_reviews        ENABLE ROW LEVEL SECURITY;

-- Drop every policy we own on these tables so re-runs are safe. We match by
-- prefix so a partially-applied previous run doesn't leave broken policies.
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'vendors','vendor_members','vendor_categories','vendor_category_map',
         'vendor_services','vendor_service_addons','vendor_service_areas',
         'vendor_portfolio','vendor_availability','rfqs','rfq_invitees',
         'quotes','quote_line_items','vendor_bookings','booking_milestones',
         'vendor_message_threads','vendor_messages','vendor_reviews'
       )
       AND (
         policyname LIKE 'vendors\_%' ESCAPE '\'
         OR policyname LIKE 'vendor\_%' ESCAPE '\'
         OR policyname LIKE 'rfq\_%'    ESCAPE '\'
         OR policyname LIKE 'rfqs\_%'   ESCAPE '\'
         OR policyname LIKE 'quotes\_%' ESCAPE '\'
         OR policyname LIKE 'quote\_%'  ESCAPE '\'
         OR policyname LIKE 'booking\_%' ESCAPE '\'
       )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- vendors ---------------------------------------------------------------
CREATE POLICY "vendors_public_read"
  ON public.vendors FOR SELECT
  USING (true);
CREATE POLICY "vendors_member_update"
  ON public.vendors FOR UPDATE TO authenticated
  USING (public.is_vendor_member(id))
  WITH CHECK (public.is_vendor_member(id));
-- Inserts are only allowed via the create_vendor_business() RPC, so no
-- direct INSERT policy is defined. The RPC is SECURITY DEFINER and does
-- the insert with elevated privileges.

-- vendor_members --------------------------------------------------------
CREATE POLICY "vendor_members_self_read"
  ON public.vendor_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_vendor_member(vendor_id));
CREATE POLICY "vendor_members_owner_manage"
  ON public.vendor_members FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- vendor_categories (taxonomy — read-only for everyone) -----------------
CREATE POLICY "vendor_categories_read"
  ON public.vendor_categories FOR SELECT
  USING (true);

-- vendor_category_map ---------------------------------------------------
CREATE POLICY "vendor_category_map_public_read"
  ON public.vendor_category_map FOR SELECT
  USING (true);
CREATE POLICY "vendor_category_map_member_write"
  ON public.vendor_category_map FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- vendor_services -------------------------------------------------------
CREATE POLICY "vendor_services_public_read_active"
  ON public.vendor_services FOR SELECT
  USING (is_active = true);
CREATE POLICY "vendor_services_member_read"
  ON public.vendor_services FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id));
CREATE POLICY "vendor_services_member_write"
  ON public.vendor_services FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- vendor_service_addons -------------------------------------------------
CREATE POLICY "vendor_service_addons_public_read"
  ON public.vendor_service_addons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.vendor_services s
     WHERE s.id = service_id AND s.is_active = true
  ));
CREATE POLICY "vendor_service_addons_member_write"
  ON public.vendor_service_addons FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_services s
     WHERE s.id = service_id AND public.is_vendor_member(s.vendor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendor_services s
     WHERE s.id = service_id AND public.is_vendor_member(s.vendor_id)
  ));

-- vendor_service_areas --------------------------------------------------
CREATE POLICY "vendor_service_areas_public_read"
  ON public.vendor_service_areas FOR SELECT
  USING (true);
CREATE POLICY "vendor_service_areas_member_write"
  ON public.vendor_service_areas FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- vendor_portfolio ------------------------------------------------------
CREATE POLICY "vendor_portfolio_public_read"
  ON public.vendor_portfolio FOR SELECT
  USING (true);
CREATE POLICY "vendor_portfolio_member_write"
  ON public.vendor_portfolio FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- vendor_availability ---------------------------------------------------
CREATE POLICY "vendor_availability_auth_read"
  ON public.vendor_availability FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "vendor_availability_member_write"
  ON public.vendor_availability FOR ALL TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- rfqs ------------------------------------------------------------------
CREATE POLICY "rfqs_org_read"
  ON public.rfqs FOR SELECT TO authenticated
  USING (public.vendor_can_read_org(org_id));
CREATE POLICY "rfqs_invitee_read"
  ON public.rfqs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rfq_invitees i
     WHERE i.rfq_id = rfqs.id AND public.is_vendor_member(i.vendor_id)
  ));
CREATE POLICY "rfqs_org_write"
  ON public.rfqs FOR INSERT TO authenticated
  WITH CHECK (public.vendor_can_read_org(org_id));
CREATE POLICY "rfqs_org_update"
  ON public.rfqs FOR UPDATE TO authenticated
  USING (public.vendor_can_read_org(org_id))
  WITH CHECK (public.vendor_can_read_org(org_id));

-- rfq_invitees ----------------------------------------------------------
CREATE POLICY "rfq_invitees_org_read"
  ON public.rfq_invitees FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rfqs r
     WHERE r.id = rfq_id AND public.vendor_can_read_org(r.org_id)
  ));
CREATE POLICY "rfq_invitees_vendor_read"
  ON public.rfq_invitees FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id));
CREATE POLICY "rfq_invitees_org_write"
  ON public.rfq_invitees FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.rfqs r
     WHERE r.id = rfq_id AND public.vendor_can_read_org(r.org_id)
  ));
CREATE POLICY "rfq_invitees_vendor_update"
  ON public.rfq_invitees FOR UPDATE TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- quotes ----------------------------------------------------------------
CREATE POLICY "quotes_org_read"
  ON public.quotes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.rfqs r
     WHERE r.id = rfq_id AND public.vendor_can_read_org(r.org_id)
  ));
CREATE POLICY "quotes_vendor_read"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id));
CREATE POLICY "quotes_vendor_insert"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_vendor_member(vendor_id)
    AND EXISTS (
      SELECT 1 FROM public.rfq_invitees i
       WHERE i.rfq_id = quotes.rfq_id AND i.vendor_id = quotes.vendor_id
    )
  );
CREATE POLICY "quotes_vendor_update"
  ON public.quotes FOR UPDATE TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));

-- quote_line_items -------------------------------------------------------
CREATE POLICY "quote_line_items_participant_read"
  ON public.quote_line_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
      LEFT JOIN public.rfqs r ON r.id = q.rfq_id
     WHERE q.id = quote_id
       AND (public.is_vendor_member(q.vendor_id) OR public.vendor_can_read_org(r.org_id))
  ));
CREATE POLICY "quote_line_items_vendor_write"
  ON public.quote_line_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_id AND public.is_vendor_member(q.vendor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_id AND public.is_vendor_member(q.vendor_id)
  ));

-- vendor_bookings --------------------------------------------------------
CREATE POLICY "vendor_bookings_org_read"
  ON public.vendor_bookings FOR SELECT TO authenticated
  USING (public.vendor_can_read_org(org_id));
CREATE POLICY "vendor_bookings_vendor_read"
  ON public.vendor_bookings FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id));
CREATE POLICY "vendor_bookings_vendor_update"
  ON public.vendor_bookings FOR UPDATE TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));
CREATE POLICY "vendor_bookings_org_update"
  ON public.vendor_bookings FOR UPDATE TO authenticated
  USING (public.vendor_can_read_org(org_id))
  WITH CHECK (public.vendor_can_read_org(org_id));

-- booking_milestones -----------------------------------------------------
CREATE POLICY "booking_milestones_participant_read"
  ON public.booking_milestones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_bookings b
     WHERE b.id = booking_id
       AND (public.is_vendor_member(b.vendor_id) OR public.vendor_can_read_org(b.org_id))
  ));
CREATE POLICY "booking_milestones_vendor_write"
  ON public.booking_milestones FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_bookings b
     WHERE b.id = booking_id AND public.is_vendor_member(b.vendor_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.vendor_bookings b
     WHERE b.id = booking_id AND public.is_vendor_member(b.vendor_id)
  ));

-- vendor_message_threads -------------------------------------------------
CREATE POLICY "vendor_threads_participant_read"
  ON public.vendor_message_threads FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id) OR public.vendor_can_read_org(org_id));

-- vendor_messages --------------------------------------------------------
CREATE POLICY "vendor_messages_participant_read"
  ON public.vendor_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_message_threads t
     WHERE t.id = thread_id
       AND (public.is_vendor_member(t.vendor_id) OR public.vendor_can_read_org(t.org_id))
  ));
CREATE POLICY "vendor_messages_participant_insert"
  ON public.vendor_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.vendor_message_threads t
       WHERE t.id = thread_id
         AND (public.is_vendor_member(t.vendor_id) OR public.vendor_can_read_org(t.org_id))
    )
  );

-- vendor_reviews ---------------------------------------------------------
CREATE POLICY "vendor_reviews_public_read"
  ON public.vendor_reviews FOR SELECT
  USING (true);
CREATE POLICY "vendor_reviews_participant_insert"
  ON public.vendor_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.vendor_bookings b
       WHERE b.id = booking_id
         AND b.status = 'completed'
         AND (
           (reviewer_type = 'organizer' AND public.vendor_can_read_org(b.org_id))
           OR
           (reviewer_type = 'vendor'    AND public.is_vendor_member(b.vendor_id))
         )
    )
  );


-- -----------------------------------------------------------------------------
-- 6 · Storage bucket + object policies
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-media', 'vendor-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Drop pre-existing policies so re-runs are safe.
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname LIKE 'vendor_media_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "vendor_media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-media');

CREATE POLICY "vendor_media_member_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-media'
    AND public.is_vendor_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "vendor_media_member_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vendor-media'
    AND public.is_vendor_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "vendor_media_member_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vendor-media'
    AND public.is_vendor_member(((storage.foldername(name))[1])::uuid)
  );


-- -----------------------------------------------------------------------------
-- 7 · Realtime publication
-- -----------------------------------------------------------------------------
-- Add each table one at a time so a "duplicate" on one doesn't skip the rest.
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rfqs;             EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rfq_invitees;     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.quotes;           EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vendor_bookings;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vendor_messages;  EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.vendor_reviews;   EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;


-- =============================================================================
-- End of migration
-- =============================================================================
