import {
  Armchair,
  Building,
  CalendarClock,
  DoorOpen,
  Link as LinkIcon,
  Sparkles,
  Star,
  Users,
} from "lucide-react";

import type { InboxVenueRequest } from "@/hooks/useInboxVenueRequests";

/**
 * Compact table of the venue-booking brief the organizer captured on
 * step 2 of the main app's Quick Create wizard (migration 035). Any
 * unset field is skipped so old requests predating that migration
 * render identically to how they always did — no empty rows or dashes.
 *
 * Kept as a pure display component with no interactions; the vendor's
 * decision path (Accept / Decline) lives on the parent card.
 */
export function VenueBriefSummary({ request }: { request: InboxVenueRequest }) {
  const rows = buildBriefRows(request);
  const chips = buildBriefChips(request);
  if (rows.length === 0 && chips.length === 0 && !request.venue_link) return null;

  return (
    <div className="mt-3 rounded-md border border-border/70 bg-muted/30 p-3 space-y-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        Venue brief
      </p>

      {rows.length > 0 && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[12px]">
          {rows.map(({ icon: Icon, label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground inline-flex items-center gap-1 text-[11px]">
                <Icon className="h-3 w-3" />
                {label}
              </dt>
              <dd className="font-medium text-foreground truncate">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-[11px] text-foreground"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              {chip}
            </span>
          ))}
        </div>
      )}

      {request.venue_link && (
        <a
          href={request.venue_link}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline break-all"
        >
          <LinkIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{request.venue_link}</span>
        </a>
      )}
    </div>
  );
}

/** Builds the ordered list of labelled scalar values worth rendering.
 *  Skips anything the organizer left blank so the grid is dense. */
function buildBriefRows(r: InboxVenueRequest) {
  const rows: Array<{
    icon: typeof Users;
    label: string;
    value: string;
  }> = [];

  if (r.event_type) {
    rows.push({ icon: Building, label: "Event type", value: r.event_type });
  }
  if (r.event_duration_hours != null) {
    const h = r.event_duration_hours;
    rows.push({
      icon: CalendarClock,
      label: "Duration",
      value: `${h}${h === 1 ? " hour" : " hours"}`,
    });
  }
  if (r.expected_attendees != null) {
    rows.push({
      icon: Users,
      label: "Expected attendees",
      value: r.expected_attendees.toLocaleString(),
    });
  }
  if (r.seating_capacity != null) {
    rows.push({
      icon: Armchair,
      label: "Seats needed",
      value: r.seating_capacity.toLocaleString(),
    });
  }
  if (r.seating_arrangement) {
    rows.push({
      icon: Armchair,
      label: "Layout",
      value: r.seating_arrangement,
    });
  }

  return rows;
}

/** Boolean requirements collapse into inline "chips" instead of taking
 *  a full row each — three tri-state toggles that only render when TRUE. */
function buildBriefChips(r: InboxVenueRequest): string[] {
  const chips: string[] = [];
  if (r.needs_pre_function_area) chips.push("Pre-function area");
  if (r.needs_vip_area) chips.push("VIP area");
  if (r.needs_additional_rooms) chips.push("Additional rooms");
  return chips;
}

// Unused import guard for the tree-shaker — pulled in to keep the
// module coherent even if only two icons render.
void Star;
void DoorOpen;
