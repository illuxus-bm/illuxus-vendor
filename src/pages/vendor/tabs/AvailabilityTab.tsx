import * as React from "react";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBlockDate,
  useMyAvailability,
  useUnblockDate,
} from "@/hooks/useMyAvailability";

/**
 * Availability — vendor holds unbookable dates so the marketplace hides them
 * from organizer date pickers.
 *
 * Two kinds of blocks live in vendor_availability:
 *   • status='held'   — a manual block the vendor added here.
 *   • status='booked' — an automatic block written by the availability
 *                       trigger when a booking confirms; can only be
 *                       released by cancelling the booking itself.
 */
export default function AvailabilityTab() {
  const [date, setDate] = React.useState("");
  const [note, setNote] = React.useState("");
  const { data: blocks = [], isLoading } = useMyAvailability();
  const blockDate = useBlockDate();
  const unblockDate = useUnblockDate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("Pick a date to block");
      return;
    }
    try {
      await blockDate.mutateAsync({ date, note });
      setDate("");
      setNote("");
      toast.success("Date blocked");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not block date");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Block a date</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={submit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr_auto] sm:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="block-date">Date</Label>
              <Input
                id="block-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="block-note">Reason (optional)</Label>
              <Input
                id="block-note"
                placeholder="Existing booking, holiday, etc."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={blockDate.isPending}>
              <Plus className="h-4 w-4" />
              Block
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : blocks.length === 0 ? (
        <EmptyState message="No blocked dates. Organizers see you as fully available." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border/60">
              {blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <CalendarX className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="num font-medium text-foreground">{b.date}</div>
                      <div className="text-xs text-muted-foreground">
                        {b.note ??
                          (b.status === "booked" ? "Confirmed booking" : "Blocked")}
                      </div>
                    </div>
                  </div>
                  {b.status === "held" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unblockDate.mutate(b.id)}
                      disabled={unblockDate.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
