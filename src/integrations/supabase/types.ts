/**
 * Supabase Database type for illuxus-vendor.
 *
 * Only the tables the auth flow touches directly (vendors + vendor_members)
 * are typed strongly here. Every other query in the app is cast through
 * `(supabase as any).from(...)` inside its hook and shaped into a typed DTO
 * at the hook boundary.
 *
 * When you want full type inference, regenerate from the real schema:
 *
 *   npx supabase gen types typescript --project-id <ID> --schema public \
 *     > src/integrations/supabase/types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Verification lifecycle stored on `vendors.verification_status`. */
export type VerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

export type VendorMemberRole = "owner" | "manager" | "staff";

export type Database = {
  public: {
    Tables: {
      vendors: {
        Row: {
          id: string;
          business_name: string;
          tagline: string | null;
          bio: string | null;
          website: string | null;
          city: string | null;
          country: string | null;
          logo_url: string | null;
          cover_url: string | null;
          years_experience: number | null;
          response_time_hours: number | null;
          socials: Record<string, string> | null;
          notify_email: boolean;
          auto_reply: string | null;
          default_currency: string;
          rating_avg: number | null;
          rating_count: number;
          verification_status: VerificationStatus;
          commission_rate: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["vendors"]["Row"]> & {
          business_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Row"]>;
      };
      vendor_members: {
        Row: {
          id: string;
          vendor_id: string;
          user_id: string;
          role: VendorMemberRole;
          created_at: string;
        };
        Insert: {
          vendor_id: string;
          user_id: string;
          role?: VendorMemberRole;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_members"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_vendor_business: {
        Args: { p_business_name: string };
        Returns: string;
      };
      is_vendor_member: {
        Args: { p_vendor_id: string };
        Returns: boolean;
      };
      accept_vendor_quote: {
        Args: { p_quote_id: string };
        Returns: string;
      };
      get_or_create_vendor_thread: {
        Args: {
          p_org_id: string;
          p_vendor_id: string;
          p_rfq_id?: string | null;
          p_booking_id?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
