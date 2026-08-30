import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

export interface PortfolioItem {
  id: string;
  url: string;
  media_type: "image" | "video";
  caption: string | null;
  is_cover: boolean;
  sort_order: number;
}

export function useMyPortfolio() {
  const { vendor } = useVendorAuth();

  return useQuery<PortfolioItem[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-portfolio", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vendor_portfolio")
        .select("id, url, media_type, caption, is_cover, sort_order")
        .eq("vendor_id", vendor!.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as PortfolioItem[]) ?? [];
    },
  });
}
