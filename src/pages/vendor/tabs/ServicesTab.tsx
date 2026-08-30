import { Plus, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyServices, type MyService } from "@/hooks/useMyServices";
import { formatMoneyCents } from "@/lib/utils";

/**
 * Services (rate card). Add / edit dialog will land in a follow-up — the
 * button surfaces a toast for now so the empty-state matches the design.
 */
export default function ServicesTab() {
  const { data: services = [], isLoading, error } = useMyServices();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">Your rate card</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Publish standard services with pricing. Organizers can book them instantly or
              request a custom quote.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => toast.info("Service editor lands in the next iteration")}
          >
            <Plus className="h-4 w-4" />
            Add service
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : error ? (
        <EmptyState message="Couldn't load your services." />
      ) : services.length === 0 ? (
        <EmptyState message="No services yet. Add your first package to start receiving bookings." />
      ) : (
        <div className="space-y-3">
          {services.map((s) => (
            <ServiceRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceRow({ s }: { s: MyService }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {s.title}
            </h3>
            {s.is_instant_book ? (
              <Badge variant="secondary" className="gap-1">
                <Zap className="h-3 w-3" />
                Instant
              </Badge>
            ) : null}
            {!s.is_active ? <Badge variant="outline">Inactive</Badge> : null}
            {s.quote_on_request ? (
              <Badge variant="outline">Quote-on-request</Badge>
            ) : null}
          </div>
          {s.description ? (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {s.description}
            </p>
          ) : null}
        </div>
        <div className="num text-sm font-medium text-foreground">
          {formatMoneyCents(s.base_price, s.currency)}
          <span className="ml-1 text-xs text-muted-foreground">
            / {s.unit.replace("_", " ")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
