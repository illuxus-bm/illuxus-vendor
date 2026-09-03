import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * A row in the vendor Inbox that represents an organizer directly picking
 * this vendor from the main app's venue marketplace. Backed by
 * `event_venue_selections` (created in migration 027, RLS-fixed in
 * migration 031). Distinct from an RFQ: the organizer already committed
 * to a specific vendor, we just need Accept / Decline.
 *
 * Segmentation into New / Responded / Expired lives in the tab component
 * (mirrors InboxRfq) so we only round-trip once.
 *
 * Column note: `event_venue_selections` uses `created_at` for the moment
 * the organizer picked the vendor (there is NO `contacted_at` column —
 * an earlier draft of this hook referenced one and every query errored
 * out with 42703, silently draining the Inbox).
 */
export type VenueRequestStatus =
  | "contacted"
  | "accepted"
  | "declined"
  | "cancelled";

export interface InboxVenueRequest {
  selection_id: string;
  event_id: string;
  event_title: string | null;
  event_date: string | null;
  event_city: string | null;
  event_venue: string | null;
  event_capacity: number | null;
  notes: string | null;
  status: VenueRequestStatus;
  /** When the organizer picked this vendor. Sourced from
   *  `event_venue_selections.created_at`. */
  created_at: string;
  responded_at: string | null;
}

interface RawRow {
  id: string;
  event_id: string;
  notes: string | null;
  status: VenueRequestStatus;
  created_at: string;
  responded_at: string | null;
  events: {
    title: string | null;
    date: string | null;
    location: string | null;
    venue: string | null;
    capacity: number | null;
  } | null;
}

export function useInboxVenueRequests() {
  const { vendor } = useVendorAuth();

  return useQuery<InboxVenueRequest[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-inbox-venues", vendor?.id],
    queryFn: async () => {
      // event_venue_selections rows this vendor was picked for, joined to
      // the parent event for date / city / title / capacity. `events!inner`
      // means an accidentally orphan selection (parent event deleted) is
      // dropped instead of surfacing an empty card.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              order: (
                c: string,
                o: { ascending: boolean },
              ) => Promise<{ data: RawRow[] | null; error: Error | null }>;
            };
          };
        };
      })
        .from("event_venue_selections")
        .select(
          `id, event_id, notes, status, created_at, responded_at,
           events!inner ( title, date, location, venue, capacity )`,
        )
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => ({
        selection_id: row.id,
        event_id: row.event_id,
        event_title: row.events?.title ?? null,
        event_date: row.events?.date ?? null,
        // The main app's event form separates a machine-friendly `venue`
        // (e.g. "The Grand Ballroom") from a broader `location` (city or
        // full address). Surface both so the vendor knows *where*.
        event_city: row.events?.location ?? null,
        event_venue: row.events?.venue ?? null,
        event_capacity: row.events?.capacity ?? null,
        notes: row.notes,
        status: row.status,
        created_at: row.created_at,
        responded_at: row.responded_at,
      }));
    },
  });
}
