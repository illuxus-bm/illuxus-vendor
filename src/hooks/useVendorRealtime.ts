import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Subscribes to every table the vendor dashboard cares about and invalidates
 * the matching TanStack Query keys so all tabs reactively reflect changes
 * (a new RFQ lands in the inbox, an organizer accepts a quote, etc).
 *
 * The channel is torn down when the dashboard unmounts.
 */
export function useVendorRealtime() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();

  React.useEffect(() => {
    if (!vendor?.id) return;

    const channel = supabase
      .channel(`vendor:${vendor.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rfq_invitees", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-inbox", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-quotes", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_bookings", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-bookings", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
          qc.invalidateQueries({ queryKey: ["vendor-availability", vendor.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_reviews", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["vendor-reviews", vendor.id] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendor?.id, qc]);
}
