import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyBookings, type MyBooking } from "@/hooks/useMyBookings";
import { formatMoneyCents } from "@/lib/utils";

const FILTERS: { value: MyBooking["status"] | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Bookings — real status enum: pending / confirmed / in_progress / completed / cancelled.
 */
export default function BookingsTab() {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["value"]>("all");
  const { data: bookings = [], isLoading, error } = useMyBookings();

  if (isLoading) {
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

  const filtered = bookings.filter((b) => filter === "all" || b.status === filter);

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

      {filtered.length === 0 ? (
        <EmptyState message="No bookings confirmed yet." />
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BookingRow key={b.id} b={b} />
          ))}
        </div>
      )}
    </div>
  );
}

function BookingRow({ b }: { b: MyBooking }) {
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
            <span className="capitalize">Deposit: {b.deposit_status}</span>
          </div>
        </div>
        <StatusPill status={b.status} />
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
