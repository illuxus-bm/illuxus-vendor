import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { SendQuoteDialog } from "@/components/vendor/SendQuoteDialog";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useInboxRfqs, type InboxRfq } from "@/hooks/useInboxRfqs";
import {
  useInboxVenueRequests,
  type InboxVenueRequest,
} from "@/hooks/useInboxVenueRequests";
import { formatMoneyCents } from "@/lib/utils";

type Filter = "new" | "responded" | "expired";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "responded", label: "Responded" },
  { value: "expired", label: "Expired" },
];

// Inbox items are the union of RFQ invitations and direct venue requests.
// Both surface here so the vendor doesn't need to check two places for
// "someone wants to book you". The discriminant `kind` drives which row
// component renders and which server-side action is available.
type InboxItem =
  | { kind: "rfq"; sortKey: string; rfq: InboxRfq }
  | { kind: "venue"; sortKey: string; venue: InboxVenueRequest };

/**
 * Inbox — incoming invitations (RFQs) + direct venue picks. Actions:
 *   RFQ    → Decline / Reply with quote
 *   Venue  → Decline / Accept  (writes event_venue_selections.status)
 */
export default function InboxTab() {
  const [filter, setFilter] = React.useState<Filter>("new");
  const [quoteDialogFor, setQuoteDialogFor] = React.useState<InboxRfq | null>(
    null,
  );
  const rfqQ = useInboxRfqs();
  const venueQ = useInboxVenueRequests();

  const isLoading = rfqQ.isLoading || venueQ.isLoading;
  const error = rfqQ.error ?? venueQ.error;

  if (isLoading) return <ListSkeleton />;
  if (error) {
    return <EmptyState message="Couldn't load your inbox. Try again in a moment." />;
  }

  const items: InboxItem[] = [
    ...(rfqQ.data ?? []).map<InboxItem>((r) => ({
      kind: "rfq",
      sortKey: r.invited_at,
      rfq: r,
    })),
    ...(venueQ.data ?? []).map<InboxItem>((v) => ({
      kind: "venue",
      sortKey: v.created_at,
      venue: v,
    })),
  ].sort((a, b) => b.sortKey.localeCompare(a.sortKey));

  const filtered = items.filter((it) =>
    it.kind === "rfq"
      ? rfqMatchesFilter(it.rfq, filter)
      : venueMatchesFilter(it.venue, filter),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
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

      {filtered.length === 0 ? (
        <EmptyState
          message={
            filter === "new"
              ? "No incoming requests yet."
              : filter === "responded"
                ? "No responded requests yet."
                : "No expired or declined requests."
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((it) =>
            it.kind === "rfq" ? (
              <RfqRow
                key={`rfq-${it.rfq.invitee_id}`}
                rfq={it.rfq}
                onReply={() => setQuoteDialogFor(it.rfq)}
              />
            ) : (
              <VenueRequestRow
                key={`venue-${it.venue.selection_id}`}
                request={it.venue}
              />
            ),
          )}
        </div>
      )}

      <SendQuoteDialog
        open={!!quoteDialogFor}
        onOpenChange={(open) => {
          if (!open) setQuoteDialogFor(null);
        }}
        rfq={quoteDialogFor}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter predicates                                                          */
/* -------------------------------------------------------------------------- */

function rfqMatchesFilter(r: InboxRfq, filter: Filter): boolean {
  const closed =
    r.status === "expired" || r.status === "accepted" || r.status === "cancelled";
  if (r.declined || closed) return filter === "expired";
  if (r.responded_at) return filter === "responded";
  return filter === "new";
}

function venueMatchesFilter(v: InboxVenueRequest, filter: Filter): boolean {
  // `contacted` = organizer picked us, we haven't responded → New
  // `accepted` / `declined` = we responded → Responded
  // `cancelled` = organizer withdrew → Expired
  if (v.status === "cancelled") return filter === "expired";
  if (v.status === "accepted" || v.status === "declined")
    return filter === "responded";
  return filter === "new";
}

/* -------------------------------------------------------------------------- */
/* RFQ row (unchanged from prior implementation)                              */
/* -------------------------------------------------------------------------- */

function RfqRow({
  rfq,
  onReply,
}: {
  rfq: InboxRfq;
  onReply: () => void;
}) {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const [declining, setDeclining] = React.useState(false);

  const canAct = !rfq.declined && rfq.status === "open" && !rfq.responded_at;

  const decline = async () => {
    if (!vendor) return;
    if (
      !window.confirm(
        "Decline this request? The organizer will see you're not available.",
      )
    )
      return;
    setDeclining(true);
    try {
      const { error } = await (supabase as any)
        .from("rfq_invitees")
        .update({ declined: true, responded_at: new Date().toISOString() })
        .eq("rfq_id", rfq.rfq_id)
        .eq("vendor_id", vendor.id);
      if (error) {
        toast.error(error.message ?? "Could not decline");
        return;
      }
      qc.invalidateQueries({ queryKey: ["vendor-inbox", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
      toast.success("Declined");
    } finally {
      setDeclining(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {rfq.category_name ? (
              <Badge variant="secondary" className="capitalize">
                {rfq.category_name}
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(rfq.invited_at), { addSuffix: true })}
            </span>
            {rfq.responded_at && !rfq.declined ? (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Responded
              </Badge>
            ) : null}
            {rfq.declined ? (
              <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                Declined
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-foreground">
            {rfq.requirements || "(no details provided)"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {rfq.event_city ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {rfq.event_city}
              </span>
            ) : null}
            {rfq.event_date ? <span>{rfq.event_date}</span> : null}
            {rfq.expected_guests ? (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {rfq.expected_guests} guests
              </span>
            ) : null}
            {rfq.budget_min || rfq.budget_max ? (
              <span className="num">
                {formatMoneyCents(rfq.budget_min ?? 0, rfq.currency)}
                {rfq.budget_max
                  ? ` – ${formatMoneyCents(rfq.budget_max, rfq.currency)}`
                  : ""}
              </span>
            ) : null}
          </div>
        </div>

        {canAct ? (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={decline}
              disabled={declining}
            >
              Decline
            </Button>
            <Button size="sm" onClick={onReply}>
              Reply with quote
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Venue request row (new)                                                    */
/* -------------------------------------------------------------------------- */

function VenueRequestRow({ request }: { request: InboxVenueRequest }) {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const canAct = request.status === "contacted";

  // Both Accept and Decline UPDATE the same row. Migration 031's BEFORE
  // trigger stamps `responded_at` on any status → (accepted|declined)
  // transition, so we don't need to set it client-side. The AFTER trigger
  // then dispatches notify-organizer-venue-response via pg_net.
  const setStatus = async (next: "accepted" | "declined") => {
    if (!vendor) return;
    const verb = next === "accepted" ? "Accept" : "Decline";
    if (
      !window.confirm(
        next === "accepted"
          ? "Accept this venue request? The organizer will be notified and the date will be marked booked on your calendar."
          : "Decline this venue request? The organizer will see you're not available.",
      )
    )
      return;
    setBusy(true);
    try {
      const { error } = await (supabase as any)
        .from("event_venue_selections")
        .update({ status: next })
        .eq("id", request.selection_id);
      if (error) {
        toast.error(error.message ?? `Could not ${verb.toLowerCase()}`);
        return;
      }
      qc.invalidateQueries({ queryKey: ["vendor-inbox-venues", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-stats", vendor.id] });
      qc.invalidateQueries({ queryKey: ["vendor-availability", vendor.id] });
      toast.success(next === "accepted" ? "Venue request accepted" : "Declined");
    } finally {
      setBusy(false);
    }
  };

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
              Venue request
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(request.created_at), {
                addSuffix: true,
              })}
            </span>
            {request.status === "accepted" ? (
              <Badge
                variant="outline"
                className="border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                Accepted
              </Badge>
            ) : null}
            {request.status === "declined" ? (
              <Badge
                variant="outline"
                className="border-rose-200 bg-rose-50 text-rose-700"
              >
                Declined
              </Badge>
            ) : null}
            {request.status === "cancelled" ? (
              <Badge
                variant="outline"
                className="border-muted-foreground/30 bg-muted text-muted-foreground"
              >
                Cancelled by organizer
              </Badge>
            ) : null}
          </div>

          <p className="mt-2 truncate text-sm font-medium text-foreground">
            {request.event_title || "(untitled event)"}
          </p>
          {request.notes ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {request.notes}
            </p>
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

        {canAct ? (
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatus("declined")}
              disabled={busy}
            >
              Decline
            </Button>
            <Button size="sm" onClick={() => setStatus("accepted")} disabled={busy}>
              Accept
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
