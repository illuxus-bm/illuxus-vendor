import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Vendor = Database["public"]["Tables"]["vendors"]["Row"];

interface VendorAuthState {
  /** True until the very first session probe completes. */
  loading: boolean;
  /** True while we're fetching (or refetching) the vendor row. */
  vendorLoading: boolean;
  session: Session | null;
  user: User | null;
  /** The vendor row this user is a member of, if any. */
  vendor: Vendor | null;
  /**
   * Signs the user in and enforces vendor-membership. If the email is a
   * valid Supabase user but has no matching `vendor_members` row (e.g.
   * an Illuxus organizer trying to use vendor portal), the session is
   * torn down and an error is returned. Vendor auth is quarantined from
   * the shared auth.users pool by this gate.
   */
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /**
   * Fresh-account signup. Creates the auth user and, when the project has
   * email confirmation disabled, also creates the vendor row via the
   * `create_vendor_business` RPC.
   */
  signUp: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  /**
   * "Existing Illuxus account" path — signs in with the given creds
   * (bypassing the vendor-membership check) then immediately creates the
   * vendor row. Used by the signup page's "I already have an Illuxus
   * account" mode.
   */
  linkExistingAccount: (
    email: string,
    password: string,
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  /** Explicit business-creation path used when the user is already signed in. */
  createBusiness: (
    businessName: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshVendor: () => Promise<void>;
}

const VendorAuthContext = React.createContext<VendorAuthState | undefined>(
  undefined,
);

/**
 * Central auth + vendor-row provider. Every /vendor/* route lives inside this
 * so the auth session and the linked vendor business are one source of truth.
 *
 * Ownership is expressed exclusively through `vendor_members` — the vendors
 * table has no owner_user_id column in the shared Illuxus schema.
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
      // A user can only be a member of one vendor at a time in the current
      // model. If they own multiple later, we add a workspace switcher.
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

  // Boot: probe existing session and subscribe to auth state changes.
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error };

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

  /**
   * "Existing Illuxus account" flow. Used by the signup page when a user
   * already has an Illuxus login and wants to add a vendor business. We
   * bypass the vendor-membership check in signIn() because the vendor row
   * doesn't exist yet — we're about to create it in the same atomic call.
   */
  const linkExistingAccount = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return { error };
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
        // Rollback the session so the user isn't half-in.
        await supabase.auth.signOut();
        return { error: rpcErr };
      }
      await loadVendor(uid);
      return { error: null };
    },
    [loadVendor],
  );

  const createBusiness = React.useCallback(
    async (businessName: string) => {
      const { error } = await supabase.rpc("create_vendor_business", {
        p_business_name: businessName,
      });
      if (error) return { error };
      // Reload the vendor row so the app leaves the signup gate.
      const { data } = await supabase.auth.getUser();
      if (data.user?.id) await loadVendor(data.user.id);
      return { error: null };
    },
    [loadVendor],
  );

  const signUp = React.useCallback(
    async (email: string, password: string, businessName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { business_name: businessName },
        },
      });
      if (error) return { error };

      // If email confirmation is off, a session is returned right away and we
      // can create the vendor row immediately. If confirmation is on, the
      // signup page will call createBusiness() after the user completes it.
      if (data.session && data.user?.id) {
        const { error: rpcErr } = await supabase.rpc(
          "create_vendor_business",
          { p_business_name: businessName },
        );
        if (rpcErr) return { error: rpcErr };
        await loadVendor(data.user.id);
      }
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
