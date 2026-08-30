import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired";

export interface MyQuote {
  id: string;
  rfq_id: string;
  /** Snippet from rfqs.requirements — vendor-side has no title field. */
  rfq_summary: string;
  /** Minor units — format with formatMoneyCents. */
  total: number;
  currency: string;
  status: QuoteStatus;
  valid_until: string;
  created_at: string;
}

export function useMyQuotes() {
  const { vendor } = useVendorAuth();

  return useQuery<MyQuote[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-quotes", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select(
          "id, rfq_id, total, currency, status, valid_until, created_at, rfqs!inner(requirements)",
        )
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        rfq_id: row.rfq_id,
        rfq_summary: (row.rfqs?.requirements ?? "").slice(0, 120),
        total: Number(row.total),
        currency: row.currency,
        status: row.status,
        valid_until: row.valid_until,
        created_at: row.created_at,
      })) as MyQuote[];
    },
  });
}
