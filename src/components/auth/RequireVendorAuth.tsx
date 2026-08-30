import { Navigate, useLocation } from "react-router-dom";

import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { FullPageLoader } from "@/components/FullPageLoader";

/**
 * Wraps any /vendor/* route that requires the user to be signed in.
 * Missing session → bounce to /vendor/login with `?next=<path>` so the user
 * lands back where they were trying to go after they sign in.
 */
export function RequireVendorAuth({ children }: { children: React.ReactNode }) {
  const { loading, user } = useVendorAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;

  if (!user) {
    const target = `${location.pathname}${location.search || ""}`;
    const next =
      target && target.startsWith("/") && !target.startsWith("//")
        ? `?next=${encodeURIComponent(target)}`
        : "";
    return <Navigate to={`/vendor/login${next}`} replace />;
  }

  return <>{children}</>;
}
