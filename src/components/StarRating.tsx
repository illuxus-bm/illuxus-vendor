import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

interface StarRatingProps {
  /** Rating from 0 to 5. Fractional values fill the star partially. */
  value: number;
  /** Number of ratings, shown in parentheses next to the value. */
  count?: number;
  className?: string;
}

/**
 * Compact star + numeric rating shown in the header and on review lists.
 * Renders "★ 4.7 (12)" style, using a single filled star so it stays small.
 */
export function StarRating({ value, count, className }: StarRatingProps) {
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm text-foreground",
        className,
      )}
    >
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="num font-medium">{safe.toFixed(1)}</span>
      {typeof count === "number" ? (
        <span className="num text-muted-foreground">({count})</span>
      ) : null}
    </span>
  );
}
