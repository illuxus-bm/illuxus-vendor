import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface MyBooking {
  id: string;
  /** vendor_bookings has no `title` field; fall back to rfq.requirements snippet. */
  summary: string;
  /** Minor units — format with formatMoneyCents. */
  total: number;
  currency: string;
  status: BookingStatus;
  event_date: string | null;
  deposit_status: "pending" | "received" | "refunded";
  created_at: string;
}

export function useMyBookings() {
  const { vendor } = useVendorAuth();

  return useQuery<MyBooking[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-bookings", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_bookings")
        .select(
          "id, total, currency, status, event_date, deposit_status, created_at, rfqs(requirements)",
        )
        .eq("vendor_id", vendor!.id)
        .order("event_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        summary: (row.rfqs?.requirements ?? "").slice(0, 120) || "Booking",
        total: Number(row.total),
        currency: row.currency,
        status: row.status,
        event_date: row.event_date,
        deposit_status: row.deposit_status,
        created_at: row.created_at,
      })) as MyBooking[];
    },
  });
}
