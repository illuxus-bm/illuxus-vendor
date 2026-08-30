import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { VendorAuthProvider } from "@/contexts/VendorAuthContext";
import { RequireVendorAuth } from "@/components/auth/RequireVendorAuth";
import { VendorProfileGate } from "@/components/auth/VendorProfileGate";
import VendorLoginPage from "@/pages/vendor/VendorLoginPage";
import VendorSignupPage from "@/pages/vendor/VendorSignupPage";
import VendorDashboardPage from "@/pages/vendor/VendorDashboardPage";
import NotFound from "@/pages/NotFound";

// Tuned for a supplier dashboard: keep 30s of freshness so quickly
// tabbing between Inbox / Quotes / Bookings doesn't hammer the API.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <VendorAuthProvider>
        <BrowserRouter>
          <Toaster />
          <Routes>
            {/* Public auth surfaces */}
            <Route path="/vendor/login" element={<VendorLoginPage />} />
            <Route path="/vendor/signup" element={<VendorSignupPage />} />

            {/* Authenticated dashboard */}
            <Route
              path="/vendor"
              element={
                <RequireVendorAuth>
                  <VendorProfileGate>
                    <VendorDashboardPage />
                  </VendorProfileGate>
                </RequireVendorAuth>
              }
            />

            {/* Root → dashboard. Signed-out users bounce to /vendor/login via gate. */}
            <Route path="/" element={<Navigate to="/vendor" replace />} />

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </VendorAuthProvider>
    </QueryClientProvider>
  );
}
