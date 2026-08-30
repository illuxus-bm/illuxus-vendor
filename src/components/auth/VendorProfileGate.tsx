import { Navigate } from "react-router-dom";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";

/**
 * Sits under <RequireVendorAuth> and ensures the signed-in user has a linked
 * `vendors` row. If not (e.g. their signup half-completed, or they were
 * invited but haven't finished onboarding), send them to signup to create it.
 */
export function VendorProfileGate({ children }: { children: React.ReactNode }) {
  const { loading, vendorLoading, user, vendor } = useVendorAuth();

  if (loading || vendorLoading) return <FullPageLoader />;

  // Belt-and-suspenders: RequireVendorAuth should catch this first.
  if (!user) return <Navigate to="/vendor/login" replace />;

  if (!vendor) return <Navigate to="/vendor/signup" replace />;

  return <>{children}</>;
}
