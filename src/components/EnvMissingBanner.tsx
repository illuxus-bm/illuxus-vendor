import { AlertTriangle } from "lucide-react";

import { SUPABASE_ENV_MISSING } from "@/integrations/supabase/client";

/**
 * Rendered at the top of every page when the Supabase env vars aren't set.
 * Prevents the "nothing works and I don't know why" experience the first
 * time someone clones the repo without copying `.env.example` → `.env`.
 */
export function EnvMissingBanner() {
  if (!SUPABASE_ENV_MISSING) return null;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <div className="mx-auto flex w-full max-w-6xl items-start gap-2 px-4 py-2 text-xs sm:px-6">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <strong>Supabase not configured.</strong>{" "}
          Copy <code className="rounded bg-amber-100 px-1">.env.example</code> to{" "}
          <code className="rounded bg-amber-100 px-1">.env</code> and paste{" "}
          <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> from the main illuxus
          project. The app will keep running but no data will load.
        </div>
      </div>
    </div>
  );
}
