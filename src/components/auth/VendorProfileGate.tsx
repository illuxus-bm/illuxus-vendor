import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { FullPageLoader } from "@/components/FullPageLoader";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Sits under <RequireVendorAuth>. The signIn guard in VendorAuthContext
 * already blocks non-vendors at login, but this component defends against
 * the case where a user has an active Illuxus session (from the main app,
 * cross-tab) and navigates directly to /vendor without ever hitting our
 * login page.
 *
 * In that scenario we do NOT silently auto-onboard them. We show an
 * explicit consent screen instead: they either choose to create a vendor
 * business or sign out.
 */
export function VendorProfileGate({ children }: { children: React.ReactNode }) {
  const { loading, vendorLoading, user, vendor, signOut } = useVendorAuth();
  const navigate = useNavigate();

  if (loading || vendorLoading) return <FullPageLoader />;

  // Belt-and-suspenders: RequireVendorAuth handles this too.
  if (!user) return <Navigate to="/vendor/login" replace />;

  if (vendor) return <>{children}</>;

  const handleSignOut = async () => {
    await signOut();
    navigate("/vendor/login", { replace: true });
  };

  return (
    <AuthShell>
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertCircle className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          Not registered as a vendor
        </h1>
        <p className="text-sm text-muted-foreground">
          You're signed in as{" "}
          <span className="font-medium text-foreground">{user.email}</span>, but
          this account isn't registered on Vendor Connect yet. Vendor
          businesses are separate from Illuxus organizer accounts.
        </p>
      </div>

      <div className="mt-8 space-y-2">
        <Button
          className="w-full"
          onClick={() => navigate("/vendor/signup")}
        >
          Create a vendor business
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleSignOut}
        >
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}
