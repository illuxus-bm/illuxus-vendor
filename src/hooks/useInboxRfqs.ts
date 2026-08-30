import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type RfqStatus = "open" | "quoted" | "accepted" | "expired" | "cancelled";

export interface InboxRfq {
  invitee_id: string;
  rfq_id: string;
  requirements: string;
  event_city: string | null;
  event_date: string | null;
  expected_guests: number | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  status: RfqStatus;
  invited_at: string;
  responded_at: string | null;
  declined: boolean;
  category_slug: string | null;
  category_name: string | null;
}

/**
 * Every RFQ the current vendor has been invited to, newest first.
 * Segmentation into New / Responded / Expired happens in the tab component
 * so we only make one round-trip.
 */
export function useInboxRfqs() {
  const { vendor } = useVendorAuth();

  return useQuery<InboxRfq[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-inbox", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("rfq_invitees")
        .select(
          `id, invited_at, responded_at, declined,
           rfqs!inner (
             id, requirements, event_city, event_date, expected_guests,
             budget_min, budget_max, currency, status,
             vendor_categories ( slug, name )
           )`,
        )
        .eq("vendor_id", vendor!.id)
        .order("invited_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        invitee_id: row.id,
        rfq_id: row.rfqs.id,
        requirements: row.rfqs.requirements ?? "",
        event_city: row.rfqs.event_city,
        event_date: row.rfqs.event_date,
        expected_guests: row.rfqs.expected_guests,
        budget_min: row.rfqs.budget_min,
        budget_max: row.rfqs.budget_max,
        currency: row.rfqs.currency,
        status: row.rfqs.status,
        invited_at: row.invited_at,
        responded_at: row.responded_at,
        declined: row.declined,
        category_slug: row.rfqs.vendor_categories?.slug ?? null,
        category_name: row.rfqs.vendor_categories?.name ?? null,
      })) as InboxRfq[];
    },
  });
}
