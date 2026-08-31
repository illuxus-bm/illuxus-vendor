import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Users } from "lucide-react";
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
import { formatMoneyCents } from "@/lib/utils";

type Filter = "new" | "responded" | "expired";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "responded", label: "Responded" },
  { value: "expired", label: "Expired" },
];

/**
 * Inbox — incoming RFQ invitations with real actions:
 *   • Decline    → UPDATE rfq_invitees.declined = true
 *   • Reply w/ quote → SendQuoteDialog which INSERTs a `quotes` row
 */
export default function InboxTab() {
  const [filter, setFilter] = React.useState<Filter>("new");
  const [quoteDialogFor, setQuoteDialogFor] = React.useState<InboxRfq | null>(
    null,
  );
  const { data: rfqs = [], isLoading, error } = useInboxRfqs();

  if (isLoading) return <ListSkeleton />;
  if (error) {
    return <EmptyState message="Couldn't load your inbox. Try again in a moment." />;
  }

  const filtered = rfqs.filter((r) => matchesFilter(r, filter));

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
          {filtered.map((r) => (
            <InboxRow
              key={r.invitee_id}
              rfq={r}
              onReply={() => setQuoteDialogFor(r)}
            />
          ))}
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

function matchesFilter(r: InboxRfq, filter: Filter): boolean {
  const closed =
    r.status === "expired" || r.status === "accepted" || r.status === "cancelled";
  if (r.declined || closed) return filter === "expired";
  if (r.responded_at) return filter === "responded";
  return filter === "new";
}

function InboxRow({
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

function ListSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}
