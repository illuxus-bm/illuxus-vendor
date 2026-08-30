import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export type ServiceUnit =
  | "per_hour"
  | "per_event"
  | "per_person"
  | "per_day"
  | "flat";

export interface MyService {
  id: string;
  title: string;
  description: string | null;
  /** Minor units — format with formatMoneyCents. */
  base_price: number;
  currency: string;
  unit: ServiceUnit;
  duration: string | null;
  is_instant_book: boolean;
  quote_on_request: boolean;
  is_active: boolean;
}

export function useMyServices() {
  const { vendor } = useVendorAuth();

  return useQuery<MyService[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-services", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_services")
        .select(
          "id, title, description, base_price, currency, unit, duration, is_instant_book, quote_on_request, is_active",
        )
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((s: any) => ({
        ...s,
        base_price: Number(s.base_price),
      })) as MyService[];
    },
  });
}
