import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";

/**
 * Vendor portal signup is invite-only. This page used to host the
 * new-account / existing-Illuxus-account forms; both were removed
 * along with migration 105 (server-side email allowlist enforcement).
 *
 * The route is intentionally still mounted so external bookmarks and
 * marketing links land on a clear "invite-only" message instead of a
 * generic 404. Anyone who was going to succeed at signup previously
 * wouldn't have anyway — the allowlist trigger blocks the
 * vendor_members INSERT at the DB layer.
 *
 * To onboard a new vendor:
 *   1. Add their email to public.vendor_email_allowlist in Supabase
 *      SQL editor.
 *   2. Create their auth.users row via Supabase Dashboard → Auth →
 *      Users → Add user (Auto-Confirm ticked).
 *   3. Run the provisioning query to insert their vendors +
 *      vendor_members rows. Migration 105 documents the flow at the
 *      top of the file.
 */
export default function VendorSignupPage() {
  return (
    <AuthShell
      footer={
        <>
          Already a vendor?{" "}
          <Link
            to="/vendor/login"
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">
            Vendor accounts are invite-only
          </h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            The Illuxus vendor portal isn't open to public signup. If you
            were expecting an invite and haven't received one, reach out
            to your Illuxus contact.
          </p>
        </div>

        <div className="pt-4 flex flex-col items-stretch gap-2">
          <Button asChild variant="default">
            <Link to="/vendor/login">Sign in with an invited account</Link>
          </Button>
          <Button asChild variant="outline">
            <a href="mailto:support@illuxus.com?subject=Vendor%20portal%20access">
              Request access
            </a>
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
