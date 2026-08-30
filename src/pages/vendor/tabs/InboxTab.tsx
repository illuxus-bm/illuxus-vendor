import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useInboxRfqs, type InboxRfq } from "@/hooks/useInboxRfqs";
import { formatMoneyCents } from "@/lib/utils";

type Filter = "new" | "responded" | "expired";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "new", label: "New" },
  { value: "responded", label: "Responded" },
  { value: "expired", label: "Expired" },
];

/**
 * Inbox — incoming RFQ invitations.
 *
 * Segmentation (all client-side):
 *   • New       → rfq.status='open' AND invitee.declined=false AND invitee.responded_at is null
 *   • Responded → invitee.responded_at is not null AND rfq.status in ('open','quoted')
 *   • Expired   → declined OR rfq.status in ('expired','accepted','cancelled')
 */
export default function InboxTab() {
  const [filter, setFilter] = React.useState<Filter>("new");
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
        <EmptyState message="No incoming requests yet." />
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <InboxRow key={r.invitee_id} rfq={r} />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function matchesFilter(r: InboxRfq, filter: Filter): boolean {
  const closed = r.status === "expired" || r.status === "accepted" || r.status === "cancelled";
  if (r.declined || closed) return filter === "expired";
  if (r.responded_at) return filter === "responded";
  return filter === "new";
}

function InboxRow({ rfq }: { rfq: InboxRfq }) {
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

        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm">
            Decline
          </Button>
          <Button size="sm">Reply with quote</Button>
        </div>
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
