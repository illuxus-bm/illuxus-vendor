import { ChevronDown, LogOut, Store, User } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StarRating } from "@/components/StarRating";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Sticky top bar for the vendor dashboard.
 *
 *   [ Vendor Connect ]          [ ★ 0.0 (0)  |  Avatar ▾ ]
 *
 * The avatar opens a proper user menu with business identity, email, and
 * a Sign out action — the previous single icon-button had no affordance
 * that this was where you found the sign-out.
 */
export function VendorHeader() {
  const { vendor, user, signOut } = useVendorAuth();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
  };

  const initials =
    vendor?.business_name
      ?.split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "V";

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Store className="h-4 w-4" />
          Vendor Connect
        </div>

        {vendor ? (
          <div className="flex items-center gap-3">
            <StarRating
              value={vendor.rating_avg ?? 0}
              count={vendor.rating_count ?? 0}
              className="hidden sm:inline-flex"
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 pr-2"
                  aria-label="Account menu"
                >
                  <Avatar className="h-7 w-7">
                    {vendor.logo_url ? (
                      <AvatarImage src={vendor.logo_url} alt="" />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-[140px] truncate text-sm font-medium text-foreground sm:inline">
                    {vendor.business_name}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground">
                      {vendor.business_name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email ?? ""}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    toast.info(
                      "Public profile pages ship with the organizer marketplace.",
                    )
                  }
                >
                  <User className="h-4 w-4" />
                  View public profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>
    </header>
  );
}
