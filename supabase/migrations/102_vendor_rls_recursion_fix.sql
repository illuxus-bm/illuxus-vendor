-- =============================================================================
-- illuxus-vendor · RLS recursion fix
-- =============================================================================
-- Some of the policies from migration 100 (and any Lovable baseline policies
-- on these tables) referenced each other through EXISTS subqueries. When
-- PostgREST tried to embed rfqs(requirements) into a vendor_bookings query,
-- RLS on rfqs called into rfq_invitees, which called back into rfqs, which
-- called into rfq_invitees again, until Postgres exhausted the recursion
-- stack — surfacing as a plain 500 in the browser.
--
-- Fix: put every cross-table lookup inside a SECURITY DEFINER helper that
-- bypasses RLS on the joined tables, then reference the helper from the
-- policy. No cycle.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1 · Helper functions that bypass RLS on the joined tables
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.vendor_visible_rfq_ids()     CASCADE;
DROP FUNCTION IF EXISTS public.vendor_visible_booking_ids() CASCADE;

-- rfq_ids the caller can read — as an org member of the rfq's org, OR as a
-- vendor invitee. Because this is SECURITY DEFINER, the inner SELECTs run
-- with elevated privileges and RLS on rfqs / rfq_invitees / vendor_members
-- is skipped, breaking the cycle.
CREATE OR REPLACE FUNCTION public.vendor_visible_rfq_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.id
    FROM public.rfqs r
   WHERE public.vendor_can_read_org(r.org_id)
  UNION
  SELECT i.rfq_id
    FROM public.rfq_invitees i
    JOIN public.vendor_members m ON m.vendor_id = i.vendor_id
   WHERE m.user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.vendor_visible_rfq_ids() TO authenticated;

-- booking_ids the caller can read — as vendor member or org member.
CREATE OR REPLACE FUNCTION public.vendor_visible_booking_ids()
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.id
    FROM public.vendor_bookings b
   WHERE public.is_vendor_member(b.vendor_id)
      OR public.vendor_can_read_org(b.org_id);
$$;
GRANT EXECUTE ON FUNCTION public.vendor_visible_booking_ids() TO authenticated;


-- -----------------------------------------------------------------------------
-- 2 · Wipe existing policies on the affected tables so we can start fresh
-- -----------------------------------------------------------------------------
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'rfqs',
         'rfq_invitees',
         'quotes',
         'quote_line_items',
         'vendor_bookings',
         'booking_milestones'
       )
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- 3 · Non-recursive policies
-- -----------------------------------------------------------------------------

-- rfqs ------------------------------------------------------------------
CREATE POLICY "rfqs_read"
  ON public.rfqs FOR SELECT TO authenticated
  USING (id IN (SELECT id FROM public.vendor_visible_rfq_ids()));

CREATE POLICY "rfqs_org_insert"
  ON public.rfqs FOR INSERT TO authenticated
  WITH CHECK (public.vendor_can_read_org(org_id));

CREATE POLICY "rfqs_org_update"
  ON public.rfqs FOR UPDATE TO authenticated
  USING (public.vendor_can_read_org(org_id))
  WITH CHECK (public.vendor_can_read_org(org_id));


-- rfq_invitees ----------------------------------------------------------
CREATE POLICY "rfq_invitees_read"
  ON public.rfq_invitees FOR SELECT TO authenticated
  USING (
    public.is_vendor_member(vendor_id)
    OR rfq_id IN (SELECT id FROM public.vendor_visible_rfq_ids())
  );

CREATE POLICY "rfq_invitees_org_insert"
  ON public.rfq_invitees FOR INSERT TO authenticated
  WITH CHECK (rfq_id IN (SELECT id FROM public.vendor_visible_rfq_ids()));

CREATE POLICY "rfq_invitees_vendor_update"
  ON public.rfq_invitees FOR UPDATE TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));


-- quotes ----------------------------------------------------------------
CREATE POLICY "quotes_org_read"
  ON public.quotes FOR SELECT TO authenticated
  USING (rfq_id IN (SELECT id FROM public.vendor_visible_rfq_ids()));

CREATE POLICY "quotes_vendor_read"
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_vendor_member(vendor_id));

CREATE POLICY "quotes_vendor_insert"
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (
    public.is_vendor_member(vendor_id)
    AND rfq_id IN (SELECT id FROM public.vendor_visible_rfq_ids())
  );

CREATE POLICY "quotes_vendor_update"
  ON public.quotes FOR UPDATE TO authenticated
  USING (public.is_vendor_member(vendor_id))
  WITH CHECK (public.is_vendor_member(vendor_id));


-- quote_line_items ------------------------------------------------------
-- The subquery on `quotes` is safe now — quotes RLS uses SECURITY DEFINER
-- helpers, no more recursion.
CREATE POLICY "quote_line_items_read"
  ON public.quote_line_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
     WHERE q.id = quote_id
       AND (
         public.is_vendor_member(q.vendor_id)
         OR q.rfq_id IN (SELECT id FROM public.vendor_visible_rfq_ids())
       )
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


-- vendor_bookings -------------------------------------------------------
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


-- booking_milestones ----------------------------------------------------
CREATE POLICY "booking_milestones_read"
  ON public.booking_milestones FOR SELECT TO authenticated
  USING (booking_id IN (SELECT id FROM public.vendor_visible_booking_ids()));

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


-- =============================================================================
-- End of migration
-- =============================================================================
