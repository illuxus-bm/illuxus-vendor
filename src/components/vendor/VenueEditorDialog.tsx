import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import {
  EMPTY_VENUE_DRAFT,
  useSaveVenue,
  type AlcoholPolicy,
  type CateringPolicy,
  type ClimateControl,
  type DecorPolicy,
  type Venue,
  type VenueDraft,
} from "@/hooks/useMyVenues";

/**
 * The one dialog where the vendor captures everything about a venue.
 * Wide but not deep — sections are pinned to what the marketplace shows
 * the organizer, so if a field disappears from here it also disappears
 * from the buyer side.
 *
 * The form uses controlled state (not react-hook-form) because most
 * fields are numeric-nullable or boolean-with-default; RHF's default
 * schemas fight that pretty hard for what would be minor validation
 * savings. Server-side CHECK constraints (migration 106) catch bad
 * enum / length values, so the form only has to worry about "did the
 * user leave the name blank".
 */

const SPACE_TYPES = [
  { value: "indoor_hall",     label: "Indoor Hall" },
  { value: "outdoor_lawn",    label: "Outdoor Lawn" },
  { value: "terrace",         label: "Terrace" },
  { value: "poolside",        label: "Poolside" },
  { value: "conference_room", label: "Conference Room" },
  { value: "ballroom",        label: "Ballroom" },
  { value: "banquet_hall",    label: "Banquet Hall" },
  { value: "rooftop",         label: "Rooftop" },
  { value: "other",           label: "Other" },
] as const;

const CLIMATE_OPTIONS: Array<{ value: ClimateControl; label: string }> = [
  { value: "central_ac", label: "Central AC" },
  { value: "split_ac",   label: "Split AC" },
  { value: "non_ac",     label: "Non-AC" },
];

const CATERING_OPTIONS: Array<{ value: CateringPolicy; label: string }> = [
  { value: "in_house_only",     label: "In-house catering only" },
  { value: "outside_permitted", label: "Outside caterers permitted" },
  { value: "both",              label: "Both allowed" },
];

const DECOR_OPTIONS: Array<{ value: DecorPolicy; label: string }> = [
  { value: "empanelled_only", label: "Empanelled decorators only" },
  { value: "client_choice",   label: "Client can bring their own" },
  { value: "both",            label: "Both allowed" },
];

const ALCOHOL_OPTIONS: Array<{ value: AlcoholPolicy; label: string }> = [
  { value: "in_house_only",         label: "In-house only" },
  { value: "outside_with_license",  label: "Outside permitted with license" },
  { value: "prohibited",            label: "Not allowed" },
  { value: "both",                  label: "Both allowed" },
];

export function VenueEditorDialog({
  open,
  onOpenChange,
  venue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-populate when editing an existing venue; leave undefined for a fresh row. */
  venue?: Venue;
}) {
  const save = useSaveVenue();

  // Copy on open so Cancel truly discards edits. Re-copy when the caller
  // swaps `venue` (e.g. clicking Edit on a different row without closing).
  const [draft, setDraft] = React.useState<VenueDraft>(
    venue ? toDraft(venue) : EMPTY_VENUE_DRAFT,
  );
  React.useEffect(() => {
    if (open) {
      setDraft(venue ? toDraft(venue) : EMPTY_VENUE_DRAFT);
    }
  }, [open, venue]);

  const set = <K extends keyof VenueDraft>(key: K, value: VenueDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    if (!draft.name.trim()) return;
    try {
      await save.mutateAsync({ id: venue?.id, draft });
      onOpenChange(false);
    } catch {
      // Toast surfaced by the hook.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{venue ? `Edit ${venue.name}` : "Add a venue"}</DialogTitle>
          <DialogDescription>
            Everything below is shown to organizers on the marketplace card
            and detail page. Blank fields hide their row instead of showing
            an empty value.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-6 py-2">
            {/* ─── Section 1: Identity ─── */}
            <FieldSet title="1 · Identity" hint="Name and headline description of this specific space.">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Venue name"
                  value={draft.name}
                  onChange={(v) => set("name", v)}
                  placeholder="Grand Ballroom"
                  required
                />
                <SelectField
                  label="Space type"
                  value={draft.space_type}
                  onChange={(v) => set("space_type", v)}
                  options={SPACE_TYPES.map((s) => ({ value: s.value, label: s.label }))}
                  placeholder="Pick a type"
                />
              </div>
              <TextField
                label="Description"
                value={draft.description ?? ""}
                onChange={(v) => set("description", v)}
                placeholder="A short pitch — mood, best-fit event type, standout features."
                multiline
              />
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="is-active"
                  checked={draft.is_active}
                  onCheckedChange={(c: boolean) => set("is_active", c)}
                />
                <Label htmlFor="is-active" className="text-sm cursor-pointer">
                  List this venue on the Illuxus marketplace
                </Label>
              </div>
            </FieldSet>

            {/* ─── Section 2: Dimensions ─── */}
            <FieldSet
              title="2 · Dimensions & physical space"
              hint="Helps decorators plan lighting, drapes, and stage layouts."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Total area (sq ft)"
                  value={draft.area_sqft}
                  onChange={(v) => set("area_sqft", v)}
                  placeholder="e.g. 3500"
                />
                <NumberField
                  label="Ceiling height (ft)"
                  value={draft.ceiling_height_ft}
                  onChange={(v) => set("ceiling_height_ft", v)}
                  step={0.5}
                  placeholder="e.g. 14"
                />
                <NumberField
                  label="Length (ft)"
                  value={draft.length_ft}
                  onChange={(v) => set("length_ft", v)}
                  step={0.5}
                />
                <NumberField
                  label="Width (ft)"
                  value={draft.width_ft}
                  onChange={(v) => set("width_ft", v)}
                  step={0.5}
                />
              </div>
            </FieldSet>

            {/* ─── Section 3: Capacity by arrangement ─── */}
            <FieldSet
              title="3 · Seating capacity by arrangement"
              hint="Maximum guest count comfortable for each layout. Leave blank if the layout doesn't apply to this space."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Floating / reception"
                  value={draft.capacity_floating}
                  onChange={(v) => set("capacity_floating", v)}
                />
                <NumberField
                  label="Theater"
                  value={draft.capacity_theater}
                  onChange={(v) => set("capacity_theater", v)}
                />
                <NumberField
                  label="Banquet"
                  value={draft.capacity_banquet}
                  onChange={(v) => set("capacity_banquet", v)}
                />
                <NumberField
                  label="Classroom"
                  value={draft.capacity_classroom}
                  onChange={(v) => set("capacity_classroom", v)}
                />
                <NumberField
                  label="U-Shape"
                  value={draft.capacity_ushape}
                  onChange={(v) => set("capacity_ushape", v)}
                />
              </div>
            </FieldSet>

            {/* ─── Section 4: Amenities ─── */}
            <FieldSet
              title="4 · Amenities & facilities"
              hint="What comes bundled with the venue rental."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Climate control"
                  value={draft.climate_control}
                  onChange={(v) => set("climate_control", v as ClimateControl | null)}
                  options={CLIMATE_OPTIONS}
                  placeholder="Pick one"
                />
                <NumberField
                  label="Green rooms (count)"
                  value={draft.green_rooms_count}
                  onChange={(v) => set("green_rooms_count", v)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleField
                  label="Built-in stage"
                  checked={draft.has_stage}
                  onChange={(c) => set("has_stage", c)}
                />
                {draft.has_stage && (
                  <TextField
                    label="Stage dimensions"
                    value={draft.stage_dimensions ?? ""}
                    onChange={(v) => set("stage_dimensions", v)}
                    placeholder="e.g. 20x15 ft"
                  />
                )}
              </div>

              <p className="text-[11px] uppercase tracking-wider text-muted-foreground pt-2">
                Tech & essentials
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <ToggleField label="Projector"     checked={draft.has_projector}    onChange={(c) => set("has_projector", c)} />
                <ToggleField label="Screen"        checked={draft.has_screen}       onChange={(c) => set("has_screen", c)} />
                <ToggleField label="Sound system"  checked={draft.has_sound_system} onChange={(c) => set("has_sound_system", c)} />
                <ToggleField label="Microphones"   checked={draft.has_microphones}  onChange={(c) => set("has_microphones", c)} />
                <ToggleField label="Power backup"  checked={draft.has_power_backup} onChange={(c) => set("has_power_backup", c)} />
                <ToggleField label="Wi-Fi"         checked={draft.has_wifi}         onChange={(c) => set("has_wifi", c)} />
              </div>
            </FieldSet>

            {/* ─── Section 5: Policies ─── */}
            <FieldSet
              title="5 · Policies & vendor rules"
              hint="What the organizer can and can't bring in."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  label="Catering policy"
                  value={draft.catering_policy}
                  onChange={(v) => set("catering_policy", v as CateringPolicy | null)}
                  options={CATERING_OPTIONS}
                  placeholder="Pick one"
                />
                <SelectField
                  label="Decor policy"
                  value={draft.decor_policy}
                  onChange={(v) => set("decor_policy", v as DecorPolicy | null)}
                  options={DECOR_OPTIONS}
                  placeholder="Pick one"
                />
                <SelectField
                  label="Alcohol policy"
                  value={draft.alcohol_policy}
                  onChange={(v) => set("alcohol_policy", v as AlcoholPolicy | null)}
                  options={ALCOHOL_OPTIONS}
                  placeholder="Pick one"
                />
                <TextField
                  label="Music curfew (HH:MM, 24h)"
                  value={draft.music_curfew_time?.slice(0, 5) ?? ""}
                  onChange={(v) =>
                    set(
                      "music_curfew_time",
                      /^\d{2}:\d{2}$/.test(v) ? `${v}:00` : v || null,
                    )
                  }
                  placeholder="22:00"
                />
              </div>
              <TextField
                label="Other restrictions"
                value={draft.noise_restrictions ?? ""}
                onChange={(v) => set("noise_restrictions", v)}
                placeholder="e.g. No loud music after 10 PM in the terrace area."
                multiline
              />
            </FieldSet>

            {/* ─── Section 6: Logistics ─── */}
            <FieldSet title="6 · Logistics & accessibility">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumberField
                  label="Parking (cars)"
                  value={draft.parking_car_capacity}
                  onChange={(v) => set("parking_car_capacity", v)}
                />
                <NumberField
                  label="Parking (two-wheelers)"
                  value={draft.parking_two_wheeler_capacity}
                  onChange={(v) => set("parking_two_wheeler_capacity", v)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <ToggleField label="Valet service"        checked={draft.has_valet}             onChange={(c) => set("has_valet", c)} />
                <ToggleField label="Wheelchair accessible" checked={draft.wheelchair_accessible} onChange={(c) => set("wheelchair_accessible", c)} />
                <ToggleField label="Elevator access"      checked={draft.has_elevator}          onChange={(c) => set("has_elevator", c)} />
              </div>
            </FieldSet>

            {/* ─── Section 7: Media placeholder ─── */}
            <FieldSet
              title="7 · Media & visuals"
              hint="Photos and floor plans are managed on the Venues tab after Save. Add empty-hall shots, setup examples, facility photos, and a floor plan."
            >
              {venue ? (
                <p className="text-[12px] text-muted-foreground">
                  Close this dialog and use the Media menu on the venue card
                  to upload photos and a floor plan.
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  Save this venue first, then add media from the Venues tab.
                </p>
              )}
            </FieldSet>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!draft.name.trim() || save.isPending}
          >
            {save.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {venue ? "Save changes" : "Add venue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Field building blocks                                                  */
/* ────────────────────────────────────────────────────────────────────── */

function FieldSet({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {hint && (
          <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
      <Separator className="mt-2" />
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px]">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          placeholder={placeholder}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 text-sm"
        />
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px]">{label}</Label>
      <Input
        type="number"
        step={step}
        min={0}
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === "") return onChange(null);
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }}
        placeholder={placeholder}
        className="h-9 text-sm"
      />
    </div>
  );
}

function SelectField<V extends string>({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: V | null;
  onChange: (v: V | null) => void;
  options: ReadonlyArray<{ value: V; label: string }>;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[12px]">{label}</Label>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? undefined}
          onValueChange={(v) => onChange((v as V) ?? null)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {value && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:border-primary/40 transition-colors">
      <Checkbox checked={checked} onCheckedChange={(c: boolean) => onChange(c)} />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Type helpers                                                           */
/* ────────────────────────────────────────────────────────────────────── */

function toDraft(v: Venue): VenueDraft {
  const {
    id: _id,
    vendor_id: _vid,
    created_at: _c,
    updated_at: _u,
    ...rest
  } = v;
  return rest;
}
