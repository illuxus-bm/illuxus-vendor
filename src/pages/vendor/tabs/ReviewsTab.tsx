import { formatDistanceToNow } from "date-fns";
import { Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyReviews, type MyReview } from "@/hooks/useMyReviews";

/**
 * Reviews — organizer→vendor reviews (reviewer_type='organizer').
 * Aggregates feed vendors.rating_avg / rating_count via a trigger.
 */
export default function ReviewsTab() {
  const { data: reviews = [], isLoading, error } = useMyReviews();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <EmptyState message="Couldn't load your reviews." />;
  }
  if (reviews.length === 0) {
    return <EmptyState message="No reviews yet. Complete bookings to collect ratings." />;
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <ReviewRow key={r.id} r={r} />
      ))}
    </div>
  );
}

function ReviewRow({ r }: { r: MyReview }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="flex items-center gap-1 pt-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={
                i < r.rating
                  ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                  : "h-3.5 w-3.5 text-muted-foreground/30"
              }
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          {r.comment ? (
            <p className="text-sm text-foreground">{r.comment}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground">No comment</p>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {r.booking_event_date
              ? `Event on ${r.booking_event_date}`
              : "Booking"}
            {" · "}
            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
