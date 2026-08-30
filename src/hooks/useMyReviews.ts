import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  reviewer_type: "organizer" | "vendor";
  created_at: string;
  booking_event_date: string | null;
}

/**
 * Reviews received by this vendor (reviewer_type = 'organizer').
 * `vendor_reviews` has no vendor_id column, so we join through
 * `vendor_bookings` and filter by its vendor_id.
 */
export function useMyReviews() {
  const { vendor } = useVendorAuth();

  return useQuery<MyReview[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-reviews", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_reviews")
        .select(
          "id, rating, comment, reviewer_type, created_at, vendor_bookings!inner(vendor_id, event_date)",
        )
        .eq("vendor_bookings.vendor_id", vendor!.id)
        .eq("reviewer_type", "organizer")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        reviewer_type: row.reviewer_type,
        created_at: row.created_at,
        booking_event_date: row.vendor_bookings?.event_date ?? null,
      })) as MyReview[];
    },
  });
}
