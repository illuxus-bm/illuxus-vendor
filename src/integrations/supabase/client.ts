import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Shared with the main illuxus app — same URL, same anon key, same auth.users.
// The two apps are separated by routes + RLS, not by different backends.
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder-anon-key";

export const SUPABASE_ENV_MISSING =
  !import.meta.env.VITE_SUPABASE_URL ||
  !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (SUPABASE_ENV_MISSING) {
  // Fail loudly at boot so a misconfigured .env doesn't turn into a silent
  // "why is nothing loading" bug later. The app still boots on placeholder
  // values so /vendor/login renders and the user can see the notice banner.
  console.error(
    "Missing Supabase env. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env",
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      // Namespaced storage key so the vendor app's session doesn't collide
      // with the main illuxus app when both are open in the same browser.
      storageKey: "illuxus-vendor.auth",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
