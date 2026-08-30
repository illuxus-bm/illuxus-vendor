import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type AvailabilityStatus = "available" | "held" | "booked";

export interface BlockedDate {
  id: string;
  vendor_id: string;
  date: string;
  status: AvailabilityStatus;
  note: string | null;
  booking_id: string | null;
}

/** Every non-`available` row for this vendor, sorted by date. */
export function useMyAvailability() {
  const { vendor } = useVendorAuth();

  return useQuery<BlockedDate[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-availability", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_availability")
        .select("id, vendor_id, date, status, note, booking_id")
        .eq("vendor_id", vendor!.id)
        .in("status", ["held", "booked"])
        .order("date", { ascending: true });
      if (error) throw error;
      return (data as BlockedDate[]) ?? [];
    },
  });
}

/** Manually block a date. Uses status='held' so it's distinguishable from auto-blocks. */
export function useBlockDate() {
  const qc = useQueryClient();
  const { vendor } = useVendorAuth();

  return useMutation({
    mutationFn: async (args: { date: string; note?: string }) => {
      if (!vendor?.id) throw new Error("no vendor");
      const { error } = await (supabase as any)
        .from("vendor_availability")
        .insert({
          vendor_id: vendor.id,
          date: args.date,
          note: args.note || null,
          status: "held",
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor?.id] });
    },
  });
}

/** Release a manual block. `booked` rows come from confirmed bookings and
    must be cancelled by cancelling the booking itself. */
export function useUnblockDate() {
  const qc = useQueryClient();
  const { vendor } = useVendorAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("vendor_availability")
        .delete()
        .eq("id", id)
        .eq("status", "held");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor?.id] });
    },
  });
}
