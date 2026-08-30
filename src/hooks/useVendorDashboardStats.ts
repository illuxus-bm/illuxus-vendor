import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Aggregate counts + revenue shown on the Overview KPI row.
 *
 * Each metric fires as its own count-only query so the dashboard degrades
 * gracefully — one failing table doesn't wipe out the whole KPI row.
 *
 * `revenueThisMonth` is stored in the same minor-unit basis as
 * vendor_bookings.total (bigint cents/paise) and should be rendered via
 * formatMoneyCents(...) in the UI.
 */
export interface VendorStats {
  openRequests: number;
  pendingQuotes: number;
  bookings: number;
  revenueThisMonth: number;
  currency: string;
}

export function useVendorDashboardStats() {
  const { vendor } = useVendorAuth();
  const vendorId = vendor?.id;
  const currency = vendor?.default_currency ?? "USD";

  return useQuery<VendorStats>({
    enabled: !!vendorId,
    queryKey: ["vendor-stats", vendorId],
    queryFn: async () => {
      if (!vendorId) throw new Error("no vendor");

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10);

      const [openRfqs, pendingQuotes, bookings, revenueRows] = await Promise.all([
        // Open RFQs = invited to this vendor, not declined, not yet responded, rfq still open.
        (supabase as any)
          .from("rfq_invitees")
          .select("rfq_id, rfqs!inner(id,status)", {
            count: "exact",
            head: true,
          })
          .eq("vendor_id", vendorId)
          .eq("declined", false)
          .is("responded_at", null)
          .eq("rfqs.status", "open"),

        // Pending quotes = sent quotes still awaiting a decision.
        (supabase as any)
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId)
          .eq("status", "sent"),

        // Bookings tile — confirmed + in_progress + completed all count.
        (supabase as any)
          .from("vendor_bookings")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId)
          .in("status", ["confirmed", "in_progress", "completed"]),

        // Revenue this month — sum(total) on completed bookings whose
        // updated_at (proxy for "completed at") is in the current month.
        (supabase as any)
          .from("vendor_bookings")
          .select("total, currency, updated_at")
          .eq("vendor_id", vendorId)
          .eq("status", "completed")
          .gte("updated_at", monthStart),
      ]);

      const revenueThisMonth = (revenueRows.data ?? []).reduce(
        (sum: number, row: { total: number | string | null }) =>
          sum + Number(row.total ?? 0),
        0,
      );

      return {
        openRequests: openRfqs.count ?? 0,
        pendingQuotes: pendingQuotes.count ?? 0,
        bookings: bookings.count ?? 0,
        revenueThisMonth,
        currency,
      };
    },
  });
}
