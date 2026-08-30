import { ImageIcon, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyPortfolio } from "@/hooks/useMyPortfolio";

/**
 * Portfolio — grid of past-work media. Uploads land in the public
 * `vendor-media` bucket under `<vendor_id>/portfolio/…`. The full uploader
 * (file picker, progress, drag-reorder) is a follow-up.
 */
export default function PortfolioTab() {
  const { data: items = [], isLoading, error } = useMyPortfolio();

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Showcase your past work
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizers see this on your public profile. Upload photos of events
              you've delivered.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => toast.info("Uploader lands in the next iteration")}
          >
            <Upload className="h-4 w-4" />
            Upload photos
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : error ? (
        <EmptyState message="Couldn't load your portfolio." />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" />}
          message="Nothing here yet. A strong portfolio dramatically boosts win rate."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((it) => (
            <div
              key={it.id}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border/70 bg-secondary/40"
            >
              {it.media_type === "video" ? (
                <video src={it.url} className="h-full w-full object-cover" muted playsInline />
              ) : (
                <img
                  src={it.url}
                  alt={it.caption ?? ""}
                  className="h-full w-full object-cover"
                />
              )}
              {it.caption ? (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-xs text-white">
                  {it.caption}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
