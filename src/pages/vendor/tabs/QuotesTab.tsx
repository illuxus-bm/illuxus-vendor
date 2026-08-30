import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyQuotes, type MyQuote } from "@/hooks/useMyQuotes";
import { formatMoneyCents } from "@/lib/utils";

/**
 * Quotes — every quote the vendor has submitted, newest first.
 * Real quotes.status enum is: draft / sent / accepted / declined / expired.
 */
export default function QuotesTab() {
  const { data: quotes = [], isLoading, error } = useMyQuotes();

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }
  if (error) {
    return <EmptyState message="Couldn't load your quotes." />;
  }
  if (quotes.length === 0) {
    return <EmptyState message="You haven't sent any quotes yet." />;
  }

  return (
    <div className="space-y-3">
      {quotes.map((q) => (
        <QuoteRow key={q.id} q={q} />
      ))}
    </div>
  );
}

function QuoteRow({ q }: { q: MyQuote }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-1 text-sm text-foreground">
            {q.rfq_summary || "Quote"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="num font-medium text-foreground">
              {formatMoneyCents(q.total, q.currency)}
            </span>
            {q.valid_until ? <span>Valid until {q.valid_until}</span> : null}
            <span>
              {formatDistanceToNow(new Date(q.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>
        <StatusPill status={q.status} />
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: MyQuote["status"] }) {
  const cls =
    status === "accepted"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "declined" || status === "expired"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : status === "draft"
          ? "bg-secondary text-muted-foreground"
          : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <Badge variant="outline" className={`${cls} capitalize`}>
      {status}
    </Badge>
  );
}
