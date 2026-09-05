import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * CRUD + read hooks for the vendor's venues (migration 106).
 *
 * Every write invalidates both `vendor-venues` (this tab) and
 * `venue-media-<venueId>` so the media grid re-renders after a name /
 * cover-photo change without a manual refresh.
 */

export type ClimateControl = "central_ac" | "split_ac" | "non_ac";
export type CateringPolicy = "in_house_only" | "outside_permitted" | "both";
export type DecorPolicy = "empanelled_only" | "client_choice" | "both";
export type AlcoholPolicy =
  | "in_house_only"
  | "outside_with_license"
  | "prohibited"
  | "both";

export type VenueMediaKind =
  | "empty_hall"
  | "setup"
  | "facility"
  | "floor_plan"
  | "other";

export interface Venue {
  id: string;
  vendor_id: string;

  name: string;
  space_type: string | null;
  description: string | null;
  is_active: boolean;

  area_sqft: number | null;
  length_ft: number | null;
  width_ft: number | null;
  ceiling_height_ft: number | null;

  capacity_floating: number | null;
  capacity_theater: number | null;
  capacity_banquet: number | null;
  capacity_ushape: number | null;
  capacity_classroom: number | null;

  climate_control: ClimateControl | null;
  has_stage: boolean;
  stage_dimensions: string | null;
  green_rooms_count: number | null;

  has_projector: boolean;
  has_screen: boolean;
  has_sound_system: boolean;
  has_microphones: boolean;
  has_power_backup: boolean;
  has_wifi: boolean;

  catering_policy: CateringPolicy | null;
  decor_policy: DecorPolicy | null;
  alcohol_policy: AlcoholPolicy | null;
  /** HH:MM:SS string as Postgres `time` renders in PostgREST. */
  music_curfew_time: string | null;
  noise_restrictions: string | null;

  parking_car_capacity: number | null;
  parking_two_wheeler_capacity: number | null;
  has_valet: boolean;
  wheelchair_accessible: boolean;
  has_elevator: boolean;

  created_at: string;
  updated_at: string;
}

export interface VenueMedia {
  id: string;
  venue_id: string;
  url: string;
  caption: string | null;
  media_kind: VenueMediaKind;
  is_cover: boolean;
  sort_order: number;
  created_at: string;
}

/** Fields the editor form is allowed to set. Everything else (id, vendor_id,
 *  timestamps) is server-managed. */
export type VenueDraft = Omit<Venue, "id" | "vendor_id" | "created_at" | "updated_at">;

/* ────────────────────────────────────────────────────────────────────── */
/* READ                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export function useMyVenues() {
  const { vendor } = useVendorAuth();
  return useQuery<Venue[]>({
    enabled: !!vendor?.id,
    queryKey: ["vendor-venues", vendor?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("venues")
        .select("*")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Venue[];
    },
  });
}

export function useVenueMedia(venueId: string | null | undefined) {
  return useQuery<VenueMedia[]>({
    enabled: !!venueId,
    queryKey: ["venue-media", venueId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("venue_media")
        .select("*")
        .eq("venue_id", venueId!)
        .order("is_cover", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as VenueMedia[];
    },
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/* WRITE — venues                                                         */
/* ────────────────────────────────────────────────────────────────────── */

export function useSaveVenue() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  return useMutation<Venue, Error, { id?: string; draft: VenueDraft }>({
    mutationFn: async ({ id, draft }) => {
      if (!vendor?.id) throw new Error("Not signed in as a vendor.");

      // The DB requires a name and enforces enum-shaped columns via CHECK
      // constraints. Client-side we coerce empty strings to null so the
      // constraints see "unspecified" instead of a zero-length text.
      const payload = normaliseDraft(draft);

      if (id) {
        const { data, error } = await (supabase as any)
          .from("venues")
          .update(payload)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as Venue;
      } else {
        const { data, error } = await (supabase as any)
          .from("venues")
          .insert({ ...payload, vendor_id: vendor.id })
          .select()
          .single();
        if (error) throw error;
        return data as Venue;
      }
    },
    onSuccess: (v, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-venues", vendor?.id] });
      if (vars.id) {
        qc.invalidateQueries({ queryKey: ["venue-media", vars.id] });
      }
      toast.success(vars.id ? "Venue updated" : `Venue "${v.name}" added`);
    },
    onError: (err) => toast.error(err.message ?? "Could not save venue"),
  });
}

export function useDeleteVenue() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; name: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await (supabase as any).from("venues").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-venues", vendor?.id] });
      qc.invalidateQueries({ queryKey: ["venue-media", vars.id] });
      toast.success(`Deleted "${vars.name}"`);
    },
    onError: (err) => toast.error(err.message ?? "Could not delete venue"),
  });
}

export function useToggleVenueActive() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; nextActive: boolean }>({
    mutationFn: async ({ id, nextActive }) => {
      const { error } = await (supabase as any)
        .from("venues")
        .update({ is_active: nextActive })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["vendor-venues", vendor?.id] });
      toast.success(vars.nextActive ? "Venue listed" : "Venue hidden from marketplace");
    },
    onError: (err) => toast.error(err.message ?? "Could not update venue"),
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/* WRITE — venue media                                                    */
/* ────────────────────────────────────────────────────────────────────── */

export function useAddVenueMedia() {
  const qc = useQueryClient();
  return useMutation<
    VenueMedia,
    Error,
    { venue_id: string; url: string; caption?: string; media_kind: VenueMediaKind; is_cover?: boolean }
  >({
    mutationFn: async (input) => {
      const { data, error } = await (supabase as any)
        .from("venue_media")
        .insert({
          venue_id: input.venue_id,
          url: input.url,
          caption: input.caption ?? null,
          media_kind: input.media_kind,
          is_cover: input.is_cover ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as VenueMedia;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["venue-media", vars.venue_id] });
      toast.success("Media added");
    },
    onError: (err) => toast.error(err.message ?? "Could not add media"),
  });
}

export function useDeleteVenueMedia() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; venue_id: string }>({
    mutationFn: async ({ id }) => {
      const { error } = await (supabase as any).from("venue_media").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_v, vars) => {
      qc.invalidateQueries({ queryKey: ["venue-media", vars.venue_id] });
      toast.success("Media removed");
    },
    onError: (err) => toast.error(err.message ?? "Could not remove media"),
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                */
/* ────────────────────────────────────────────────────────────────────── */

function normaliseDraft(d: VenueDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d };
  // Blank strings → null so CHECK(length(x) between 1..N) and enum checks
  // don't fire on inputs the user just cleared.
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v === "string" && v.trim() === "") out[k] = null;
  }
  // A name of null slipped through would trip the NOT NULL constraint;
  // surface that as a client-side error instead of a Postgres 23502.
  if (!out.name) throw new Error("Venue name is required.");
  return out;
}

export const EMPTY_VENUE_DRAFT: VenueDraft = {
  name: "",
  space_type: null,
  description: null,
  is_active: true,

  area_sqft: null,
  length_ft: null,
  width_ft: null,
  ceiling_height_ft: null,

  capacity_floating: null,
  capacity_theater: null,
  capacity_banquet: null,
  capacity_ushape: null,
  capacity_classroom: null,

  climate_control: null,
  has_stage: false,
  stage_dimensions: null,
  green_rooms_count: null,

  has_projector: false,
  has_screen: false,
  has_sound_system: false,
  has_microphones: false,
  has_power_backup: false,
  has_wifi: false,

  catering_policy: null,
  decor_policy: null,
  alcohol_policy: null,
  music_curfew_time: null,
  noise_restrictions: null,

  parking_car_capacity: null,
  parking_two_wheeler_capacity: null,
  has_valet: false,
  wheelchair_accessible: false,
  has_elevator: false,
};
