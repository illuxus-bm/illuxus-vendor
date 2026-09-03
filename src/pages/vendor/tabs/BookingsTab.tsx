import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  MoreHorizontal,
  PlayCircle,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { useMyBookings, type MyBooking } from "@/hooks/useMyBookings";
import {
  useInboxVenueRequests,
  type InboxVenueRequest,
} from "@/hooks/useInboxVenueRequests";
import { formatMoneyCents } from "@/lib/utils";
import { Building2, ListChecks, MapPin, Users } from "lucide-react";

const FILTERS: { value: MyBooking["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Bookings pipeline with real status transitions:
 *   pending  →  confirmed  →  in_progress  →  completed
 *      └────────────────── cancelled  (any status)
 *
 * Deposit tracking is independent: pending → received → refunded.
 */
export default function BookingsTab() {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["value"]>(
    "all",
  );
  const { data: bookings = [], isLoading, error } = useMyBookings();
  // Venue bookings live in a separate table (event_venue_selections) with a
  // different lifecycle to vendor_bookings — there's no pending / quoted
  // negotiation step, and the vendor already accepted or declined via the
  // Inbox. Show them here as a first-class booking anyway so the vendor
  // has one home for "here's what I'm on the hook for". Kept in a distinct
  // section because the transition actions (Confirm / In progress /
  // Completed) don't apply.
  const { data: venueRequests = [], isLoading: venueLoading } =
    useInboxVenueRequests();
  const venueBookings = React.useMemo(
    () => venueRequests.filter((r) => r.status === "accepted"),
    [venueRequests],
  );

  if (isLoading || venueLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <EmptyState message="Couldn't load your bookings." />;
  }

  const filtered = bookings.filter(
    (b) => filter === "all" || b.status === filter,
  );
  // Venue bookings only show under All + Confirmed (they're effectively
  // confirmed the moment the vendor accepts the request). Filter Pending /
  // In progress / Completed / Cancelled hides them so the pipeline view
  // stays honest to the RFQ→booking flow.
  const showVenueSection =
    (filter === "all" || filter === "confirmed") && venueBookings.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? "rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
                : "rounded-full border border-border/70 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {showVenueSection && (
        <section className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Venue bookings ({venueBookings.length})
          </h3>
          <div className="space-y-3">
            {venueBookings.map((r) => (
              <VenueBookingRow key={r.selection_id} request={r} />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && !showVenueSection ? (
        <EmptyState message="No bookings yet." />
      ) : filtered.length > 0 ? (
        <section className="space-y-2">
          {showVenueSection && (
            <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Service bookings ({filtered.length})
            </h3>
          )}
          <div className="space-y-3">
            {filtered.map((b) => (
              <BookingRow key={b.id} b={b} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Venue booking row — read-only view of an accepted event_venue_selections   */
/* row. No transition menu; if the vendor wants to back out they cancel the   */
/* row (that's a separate flow we haven't wired yet — reach the organizer     */
/* out-of-band via Contact venue on their side for now).                      */
/* -------------------------------------------------------------------------- */

function VenueBookingRow({ request }: { request: InboxVenueRequest }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="border-sky-200 bg-sky-50 text-sky-700"
            >
              <Building2 className="mr-1 h-3 w-3" />
              Venue booking
            </Badge>
            <Badge
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              Accepted
            </Badge>
          </div>

          <p className="mt-2 truncate text-sm font-medium text-foreground">
            {request.event_title || "(untitled event)"}
          </p>
          {request.notes ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {request.notes}
            </p>
          ) : null}

          {request.requested_services.length > 0 ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3 w-3" />
                Requested
              </span>
              {request.requested_services.map((s) => (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="border-primary/30 bg-primary/5 text-foreground"
                >
                  {s.title}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {request.event_city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {request.event_city}
              </span>
            ) : null}
            {request.event_date ? (
              <span>{new Date(request.event_date).toLocaleDateString()}</span>
            ) : null}
            {request.event_capacity ? (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {request.event_capacity} capacity
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function BookingRow({ b }: { b: MyBooking }) {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const transition = async (
    patch: Partial<MyBooking>,
    successMsg: string,
  ) => {
    if (!vendor) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("vendor_bookings")
        .update(patch)
        .eq("id", b.id);
      if (error) {
        toast.error(error.message ?? "Could not update booking");
        return;
      }
      qc.invalidateQueries({ queryKey: ["vendor-bookings", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
      toast.success(successMsg);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (
      !window.confirm(
        "Cancel this booking? The date will be released on your calendar.",
      )
    )
      return;
    await transition({ status: "cancelled" }, "Booking cancelled");
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm text-foreground">{b.summary}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="num font-medium text-foreground">
              {formatMoneyCents(b.total, b.currency)}
            </span>
            {b.event_date ? <span>{b.event_date}</span> : null}
            <DepositBadge status={b.deposit_status} />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={b.status} />
          {b.status !== "completed" && b.status !== "cancelled" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="Booking actions"
                  disabled={busy}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Update status</DropdownMenuLabel>
                {b.status === "pending" ? (
                  <DropdownMenuItem
                    onClick={() =>
                      transition(
                        { status: "confirmed" },
                        "Booking confirmed — calendar locked",
                      )
                    }
                  >
                    <ThumbsUp className="h-4 w-4" />
                    Confirm booking
                  </DropdownMenuItem>
                ) : null}
                {b.status === "confirmed" ? (
                  <DropdownMenuItem
                    onClick={() =>
                      transition({ status: "in_progress" }, "Marked in progress")
                    }
                  >
                    <PlayCircle className="h-4 w-4" />
                    Mark in progress
                  </DropdownMenuItem>
                ) : null}
                {b.status === "in_progress" || b.status === "confirmed" ? (
                  <DropdownMenuItem
                    onClick={() =>
                      transition({ status: "completed" }, "Marked completed")
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark completed
                  </DropdownMenuItem>
                ) : null}

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Deposit</DropdownMenuLabel>
                {b.deposit_status === "pending" ? (
                  <DropdownMenuItem
                    onClick={() =>
                      transition(
                        { deposit_status: "received" },
                        "Deposit marked received",
                      )
                    }
                  >
                    Mark deposit received
                  </DropdownMenuItem>
                ) : b.deposit_status === "received" ? (
                  <DropdownMenuItem
                    onClick={() =>
                      transition(
                        { deposit_status: "refunded" },
                        "Deposit refunded",
                      )
                    }
                  >
                    Mark deposit refunded
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>Refunded</DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={cancel}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban className="h-4 w-4" />
                  Cancel booking
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: MyBooking["status"] }) {
  const cls =
    status === "confirmed"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : status === "in_progress"
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : status === "completed"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : status === "cancelled"
            ? "bg-rose-50 text-rose-700 border-rose-200"
            : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <Badge variant="outline" className={`${cls} capitalize`}>
      {status.replace("_", " ")}
    </Badge>
  );
}

function DepositBadge({
  status,
}: {
  status: MyBooking["deposit_status"];
}) {
  const label =
    status === "pending"
      ? "Deposit pending"
      : status === "received"
        ? "Deposit received"
        : "Deposit refunded";
  const cls =
    status === "received"
      ? "text-emerald-700"
      : status === "refunded"
        ? "text-rose-700"
        : "text-muted-foreground";
  return <span className={`${cls} capitalize`}>{label}</span>;
}
