import * as React from "react";
import {
  Building2,
  EyeOff,
  ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

import { VenueEditorDialog } from "@/components/vendor/VenueEditorDialog";
import { VenueMediaManager } from "@/components/vendor/VenueMediaManager";
import {
  useDeleteVenue,
  useMyVenues,
  useToggleVenueActive,
  type Venue,
} from "@/hooks/useMyVenues";

/**
 * Venues tab — one row per venue the vendor rents out. Each row surfaces
 * enough info at a glance (name, space type, largest seated capacity,
 * active/hidden) to spot the venue the vendor wants to edit without
 * opening the editor.
 *
 * The row-level actions live in a dropdown so the card can stay clean
 * for the primary use case (a vendor with one or two venues). Media
 * management is a separate dialog to keep the editor form focused on
 * text fields.
 */
export default function VenuesTab() {
  const { data: venues = [], isLoading, error } = useMyVenues();
  const [editorFor, setEditorFor] = React.useState<Venue | "new" | null>(null);
  const [mediaFor, setMediaFor] = React.useState<Venue | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <EmptyState message="Couldn't load your venues." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Your venues</h2>
          <p className="text-[11px] text-muted-foreground">
            Each venue is one physical space. A hotel with three halls should
            list three separate venues so organizers can pick the right one.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditorFor("new")}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add venue
        </Button>
      </div>

      {venues.length === 0 ? (
        <EmptyState message="No venues yet. Add the first one to appear in the Illuxus marketplace." />
      ) : (
        <div className="space-y-3">
          {venues.map((v) => (
            <VenueRow
              key={v.id}
              venue={v}
              onEdit={() => setEditorFor(v)}
              onManageMedia={() => setMediaFor(v)}
            />
          ))}
        </div>
      )}

      {/* Editor dialog — same one for create + edit, driven by editorFor. */}
      <VenueEditorDialog
        open={editorFor !== null}
        onOpenChange={(open) => {
          if (!open) setEditorFor(null);
        }}
        venue={editorFor && editorFor !== "new" ? editorFor : undefined}
      />

      {/* Media manager — one per venue at a time. */}
      {mediaFor && (
        <VenueMediaManager
          open
          onOpenChange={(open) => {
            if (!open) setMediaFor(null);
          }}
          venueId={mediaFor.id}
          venueName={mediaFor.name}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function VenueRow({
  venue,
  onEdit,
  onManageMedia,
}: {
  venue: Venue;
  onEdit: () => void;
  onManageMedia: () => void;
}) {
  const toggleActive = useToggleVenueActive();
  const del = useDeleteVenue();
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const largestCapacity = maxCapacity(venue);
  const spaceType = venue.space_type
    ? venue.space_type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
    : null;

  return (
    <Card className={venue.is_active ? "" : "opacity-70"}>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm font-semibold truncate">{venue.name}</p>
            {spaceType && (
              <Badge variant="secondary" className="text-[10px]">
                {spaceType}
              </Badge>
            )}
            {!venue.is_active && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700 text-[10px]"
              >
                <EyeOff className="h-3 w-3 mr-1" />
                Hidden
              </Badge>
            )}
          </div>
          {venue.description && (
            <p className="text-[12px] text-muted-foreground line-clamp-2">
              {venue.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {venue.area_sqft ? <span>{venue.area_sqft.toLocaleString()} sq ft</span> : null}
            {largestCapacity ? (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                Up to {largestCapacity.value} · {largestCapacity.layout}
              </span>
            ) : null}
            {venue.has_stage ? <span>Stage</span> : null}
            {venue.has_wifi ? <span>Wi-Fi</span> : null}
            {venue.has_power_backup ? <span>Backup power</span> : null}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={onManageMedia}>
            <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
            Media
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="More actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() =>
                  toggleActive.mutate({
                    id: venue.id,
                    nextActive: !venue.is_active,
                  })
                }
              >
                {venue.is_active ? (
                  <>
                    <EyeOff className="h-4 w-4 mr-2" />
                    Hide from marketplace
                  </>
                ) : (
                  <>
                    <Building2 className="h-4 w-4 mr-2" />
                    List on marketplace
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete venue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Confirm delete — inline mini-confirm so we don't need a whole
            AlertDialog for what's usually a one-tap accidental click. */}
        {confirmingDelete && (
          <div className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <p className="text-[12px]">
              Delete <span className="font-medium">{venue.name}</span>?
              Photos and floor plans attached to it will be removed too.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
                disabled={del.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  del.mutate({ id: venue.id, name: venue.name });
                  setConfirmingDelete(false);
                }}
                disabled={del.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Pick the largest-labeled capacity so the card can say "Up to 400 · Banquet"
 *  at a glance instead of listing every arrangement. */
function maxCapacity(v: Venue): { value: number; layout: string } | null {
  const options: Array<{ value: number | null; layout: string }> = [
    { value: v.capacity_floating,  layout: "Floating" },
    { value: v.capacity_theater,   layout: "Theater" },
    { value: v.capacity_banquet,   layout: "Banquet" },
    { value: v.capacity_ushape,    layout: "U-Shape" },
    { value: v.capacity_classroom, layout: "Classroom" },
  ];
  let best: { value: number; layout: string } | null = null;
  for (const opt of options) {
    if (opt.value != null && (best === null || opt.value > best.value)) {
      best = { value: opt.value, layout: opt.layout };
    }
  }
  return best;
}
