import { LogOut, Store } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Sticky top bar for the vendor dashboard:
 *   [ Vendor Connect ]              [ Business name  ★ 0.0 (0) ]
 * Matches the layout shown in the design screenshots.
 */
export function VendorHeader() {
  const { vendor, signOut } = useVendorAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Store className="h-4 w-4" />
          Vendor Connect
        </div>

        {vendor ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-semibold text-foreground sm:inline">
              {vendor.business_name}
            </span>
            <StarRating
              value={vendor.rating_avg ?? 0}
              count={vendor.rating_count ?? 0}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              title="Sign out"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
