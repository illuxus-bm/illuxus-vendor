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

  const filtered = bookings.filter(
    (b) => filter === "all" || b.status === filter,
  );

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
        <EmptyState message="No bookings yet." />
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
