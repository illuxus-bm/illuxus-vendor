import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMyPortfolio, type PortfolioItem } from "@/hooks/useMyPortfolio";
import {
  pathFromPublicUrl,
  removeVendorObject,
  uploadVendorImage,
} from "@/lib/uploads";

/**
 * Portfolio — grid of past-work media. Uploads land in the `vendor-media`
 * bucket under `<vendor_id>/portfolio/…` and an accompanying row is
 * inserted into `vendor_portfolio`.
 *
 * Multi-file selection is supported: pick as many files as you want and
 * they upload sequentially with individual toasts for each failure.
 */
export default function PortfolioTab() {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const { data: items = [], isLoading, error } = useMyPortfolio();
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const onFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length || !vendor) return;

    setUploading(true);
    let succeeded = 0;
    try {
      // Upload sequentially so we can capture partial errors and preserve
      // the sort_order that matches the order the user picked them in.
      let nextOrder =
        items.reduce((max, it) => Math.max(max, it.sort_order), 0) + 1;

      for (const file of files) {
        const result = await uploadVendorImage(file, vendor.id, "portfolio");
        if (!result.ok) {
          toast.error(`${file.name}: ${result.error}`);
          continue;
        }
        const { error: insertErr } = await (supabase as any)
          .from("vendor_portfolio")
          .insert({
            vendor_id: vendor.id,
            url: result.url,
            media_type: file.type.startsWith("video/") ? "video" : "image",
            sort_order: nextOrder++,
          });
        if (insertErr) {
          // If we couldn't record the row, delete the orphan object.
          await removeVendorObject(result.path);
          toast.error(`${file.name}: ${insertErr.message}`);
          continue;
        }
        succeeded++;
      }

      if (succeeded > 0) {
        qc.invalidateQueries({ queryKey: ["vendor-portfolio", vendor.id] });
        toast.success(
          succeeded === 1 ? "Photo added" : `${succeeded} photos added`,
        );
      }
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (item: PortfolioItem) => {
    if (!vendor) return;
    if (!confirm("Remove this photo from your portfolio?")) return;

    const { error: dbErr } = await (supabase as any)
      .from("vendor_portfolio")
      .delete()
      .eq("id", item.id);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }
    // Best-effort — orphan stays if the delete on storage fails.
    const path = pathFromPublicUrl(item.url);
    if (path) void removeVendorObject(path);
    qc.invalidateQueries({ queryKey: ["vendor-portfolio", vendor.id] });
    toast.success("Removed");
  };

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={onFilesChange}
      />

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Showcase your past work
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Organizers see this on your public profile. JPG, PNG, or WEBP · up to 5 MB each.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? "Uploading…" : "Upload photos"}
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
              <button
                type="button"
                onClick={() => onDelete(it)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                aria-label="Remove photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
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
