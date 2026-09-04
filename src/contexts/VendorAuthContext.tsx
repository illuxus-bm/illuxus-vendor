import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

// ─────────────────────────────────────────────────────────────────────────────
// Email allowlist — vendor portal is invite-only.
// ─────────────────────────────────────────────────────────────────────────────
// The vendor portal shares its Supabase project with the main Illuxus app, so
// anyone with an auth.users row could otherwise try to sign in here. We gate
// every entry point (sign-in, sign-up, existing-account link) behind an
// explicit email allowlist. The default list ships one address so the portal
// works out of the box for the seed vendor; production deployments can
// override with `VITE_VENDOR_ALLOWED_EMAILS` (comma-separated) without a
// code change.
//
// This is a UX gate, not a security boundary. RLS on vendor_* tables is what
// actually protects the data; a determined attacker with valid credentials
// could hit the REST API directly. But that user still wouldn't have a
// vendor_members row and would see nothing — the allowlist just shortens
// the failure path and shows a clean message instead of the misleading
// "This email isn't registered as a vendor" that we surface for members-
// missing accounts.
const DEFAULT_ALLOWLIST = ["aman@bizmillennium.com"];

const VENDOR_EMAIL_ALLOWLIST: ReadonlySet<string> = new Set(
  (
    (import.meta.env.VITE_VENDOR_ALLOWED_EMAILS as string | undefined) ??
    DEFAULT_ALLOWLIST.join(",")
  )
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0),
);

function isEmailAllowlisted(email: string): boolean {
  // Empty allowlist === explicitly opt-out (falls back to the vendor_members
  // check). Non-empty === strict allowlist.
  if (VENDOR_EMAIL_ALLOWLIST.size === 0) return true;
  return VENDOR_EMAIL_ALLOWLIST.has(email.trim().toLowerCase());
}

const ALLOWLIST_REJECTION = new Error(
  "This email isn't authorized to access the vendor portal. Contact support if you should have access.",
);

interface SignUpResult {
  error: Error | null;
  /** True when Supabase returned no session — the user must click the
   *  confirmation link in their inbox before signing in. */
  needsConfirmation?: boolean;
}

interface VendorAuthState {
  /** True until the first session probe finishes. */
  loading: boolean;
  /** True while we're fetching (or refetching) the vendor row. */
  vendorLoading: boolean;
  session: Session | null;
  user: User | null;
  vendor: Vendor | null;
  /**
   * Signs the user in with email + password and enforces vendor-membership.
   * If Supabase reports "Email not confirmed", surfaces a clear message so
   * the login page can tell the user to check their inbox.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  /**
   * Creates the auth user, stashes `business_name` in raw_user_meta_data,
   * and Supabase sends a confirmation email using the project's SMTP.
   *
   * The corresponding vendors + vendor_members rows are created later by
   * the on_vendor_email_confirmed() DB trigger, the moment the user clicks
   * the link. Nothing to do client-side after this call.
   */
  signUp: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<SignUpResult>;
  /** Resend the "confirm signup" email if the user lost the first one. */
  resendConfirmation: (email: string) => Promise<{ error: Error | null }>;
  /**
   * "Existing Illuxus account" path — signs in with the given creds
   * (bypassing the vendor-membership check) then immediately creates the
   * vendor row. Only usable for accounts that are already email-confirmed.
   */
  linkExistingAccount: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  /** Explicit business-creation path used when the user is already signed in
   *  but has no vendor row (e.g. after clicking through from the "Not a
   *  vendor" consent screen). */
  createBusiness: (
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshVendor: () => Promise<void>;
}

const VendorAuthContext = React.createContext<VendorAuthState | undefined>(
  undefined,
);

/** Detects Supabase's "Email not confirmed" AuthApiError so we can render
 *  the "confirmation not done" hint instead of the raw error string. */
function isEmailNotConfirmed(msg: string | undefined | null): boolean {
  if (!msg) return false;
  return /email\s*(is|has|)\s*not\s*(been\s*)?confirmed/i.test(msg)
    || /confirm your email/i.test(msg);
}

function confirmationRedirectUrl(): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/vendor/login?confirmed=1`;
}

/**
 * Central auth + vendor-row provider. Every /vendor/* route lives inside
 * this so the auth session and the linked vendor business are one source
 * of truth.
 */
export function VendorAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [vendorLoading, setVendorLoading] = React.useState(false);

  const loadVendor = React.useCallback(async (uid: string) => {
    setVendorLoading(true);
    try {
      const { data: memberRow } = await supabase
        .from("vendor_members")
        .select("vendor_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (!memberRow?.vendor_id) {
        setVendor(null);
        return;
      }

      const { data: vendorRow } = await supabase
        .from("vendors")
        .select("*")
        .eq("id", memberRow.vendor_id)
        .maybeSingle();

      setVendor((vendorRow as Vendor | null) ?? null);
    } finally {
      setVendorLoading(false);
    }
  }, []);

  // Boot: probe existing session + subscribe to auth-state changes. When the
  // user clicks the confirmation link, Supabase's detectSessionInUrl parses
  // the returned tokens and fires SIGNED_IN here — we then load the vendor
  // row that the DB trigger created moments before.
  React.useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user?.id) {
        void loadVendor(data.session.user.id);
      }
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user?.id) {
        void loadVendor(sess.user.id);
      } else {
        setVendor(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadVendor]);

  const signIn = React.useCallback(
    async (email: string, password: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Allowlist gate — short-circuit before we hit Supabase Auth so a
      // non-allowlisted email never gets a real login attempt (and so we
      // don't count against auth rate limits for people we're going to
      // reject anyway).
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (isEmailNotConfirmed(error.message)) {
          return {
            error: new Error(
              "Confirmation not done. Check your inbox for the confirmation link and click it before signing in.",
            ),
          };
        }
        return { error };
      }

      // auth.users is shared with the main Illuxus app, so a valid credential
      // does NOT automatically grant access to the vendor portal. Enforce
      // vendor membership explicitly and undo the session if the user isn't
      // registered as a vendor.
      const uid = data.user?.id;
      if (!uid) {
        await supabase.auth.signOut();
        return { error: new Error("Sign-in failed. Please try again.") };
      }

      const { data: member, error: memberErr } = await supabase
        .from("vendor_members")
        .select("vendor_id")
        .eq("user_id", uid)
        .maybeSingle();

      if (memberErr) {
        await supabase.auth.signOut();
        return { error: memberErr };
      }

      if (!member) {
        await supabase.auth.signOut();
        return {
          error: new Error(
            "This email isn't registered as a vendor. Sign up to create a vendor business.",
          ),
        };
      }

      return { error: null };
    },
    [],
  );

  const signUp = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Signup is disabled for anyone not on the invite list. The DB
      // trigger on auth.users would happily provision a vendor row
      // otherwise (see migration 103); this gate is what makes the
      // portal actually invite-only.
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { business_name: businessName.trim() },
          emailRedirectTo: confirmationRedirectUrl(),
        },
      });
      if (error) return { error };
      // When email confirmation is required, Supabase returns { user, session: null }.
      // The on_vendor_email_confirmed() trigger runs the moment the user clicks
      // the confirmation link, so we don't need any client-side follow-up.
      return { error: null, needsConfirmation: !data.session };
    },
    [],
  );

  const resendConfirmation = React.useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: confirmationRedirectUrl(),
      },
    });
    return { error };
  }, []);

  const createBusiness = React.useCallback(
    async (businessName: string) => {
      const { error } = await supabase.rpc("create_vendor_business", {
        p_business_name: businessName,
      });
      if (error) return { error };
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) await loadVendor(data.user.id);
      return { error: null };
    },
    [loadVendor],
  );

  const linkExistingAccount = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Same allowlist gate as signIn / signUp — the "link existing Illuxus
      // account" path would otherwise let any main-app user claim a vendor
      // profile just by knowing their own password.
      if (!isEmailAllowlisted(normalizedEmail)) {
        return { error: ALLOWLIST_REJECTION };
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) {
        if (isEmailNotConfirmed(error.message)) {
          return {
            error: new Error(
              "This Illuxus account hasn't confirmed its email yet. Confirm it from the main Illuxus app first, then come back.",
            ),
          };
        }
        return { error };
      }
      const uid = data.user?.id;
      if (!uid) {
        await supabase.auth.signOut();
        return { error: new Error("Sign-in failed") };
      }
      const { error: rpcErr } = await supabase.rpc(
        "create_vendor_business",
        { p_business_name: businessName },
      );
      if (rpcErr) {
        await supabase.auth.signOut();
        return { error: rpcErr };
      }
      await loadVendor(uid);
      return { error: null };
    },
    [loadVendor],
  );

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setVendor(null);
  }, []);

  const refreshVendor = React.useCallback(async () => {
    if (user?.id) await loadVendor(user.id);
  }, [user?.id, loadVendor]);

  const value: VendorAuthState = {
    loading,
    vendorLoading,
    session,
    user,
    vendor,
    signIn,
    signUp,
    resendConfirmation,
    linkExistingAccount,
    createBusiness,
    signOut,
    refreshVendor,
  };

  return (
    <VendorAuthContext.Provider value={value}>
      {children}
    </VendorAuthContext.Provider>
  );
}

export function useVendorAuth(): VendorAuthState {
  const ctx = React.useContext(VendorAuthContext);
  if (!ctx) {
    throw new Error("useVendorAuth must be used inside <VendorAuthProvider>");
  }
  return ctx;
}
