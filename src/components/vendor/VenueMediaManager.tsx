import * as React from "react";
import { Image as ImageIcon, Loader2, Star, StarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import {
  useAddVenueMedia,
  useDeleteVenueMedia,
  useVenueMedia,
  type VenueMediaKind,
} from "@/hooks/useMyVenues";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

/**
 * Media manager for a single venue. Two responsibilities:
 *   1. Show the existing photos + floor plan grouped by media_kind.
 *   2. Upload new files → Supabase Storage → insert a venue_media row.
 *
 * Uses the `venue-media` public bucket (created by migration 107) with
 * paths shaped like `<venue_id>/<uuid>.<ext>`. Public read on the bucket
 * so the main app's marketplace can render URLs directly; per-object
 * update / delete guarded by owner in storage RLS.
 */

const KIND_OPTIONS: Array<{ value: VenueMediaKind; label: string; hint: string }> = [
  { value: "empty_hall", label: "Empty hall",   hint: "Wide shots without furniture" },
  { value: "setup",      label: "Setup",         hint: "The space fully decorated" },
  { value: "facility",   label: "Facility",      hint: "Entrance, changing rooms, dining" },
  { value: "floor_plan", label: "Floor plan",    hint: "2D layout, exits, plug points" },
  { value: "other",      label: "Other",         hint: "Anything else worth showing" },
];

const STORAGE_BUCKET = "venue-media";

export function VenueMediaManager({
  open,
  onOpenChange,
  venueId,
  venueName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  venueName: string;
}) {
  const { data: media = [], isLoading } = useVenueMedia(open ? venueId : null);
  const addMedia = useAddVenueMedia();
  const removeMedia = useDeleteVenueMedia();
  const { vendor } = useVendorAuth();

  const [uploading, setUploading] = React.useState(false);
  // Batch progress: "3 / 8" while multiple files are working through.
  // Null when no batch is running so the label falls back to "Uploading…".
  const [uploadProgress, setUploadProgress] =
    React.useState<{ done: number; total: number } | null>(null);
  const [pendingKind, setPendingKind] = React.useState<VenueMediaKind>("empty_hall");
  const [caption, setCaption] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const grouped = React.useMemo(() => {
    const buckets: Record<VenueMediaKind, typeof media> = {
      empty_hall: [],
      setup: [],
      facility: [],
      floor_plan: [],
      other: [],
    };
    for (const m of media) buckets[m.media_kind].push(m);
    return buckets;
  }, [media]);

  /**
   * Upload one or many files in a single batch. Every file in the batch
   * gets the same media_kind and caption (that's how the OS file picker
   * lets you multi-select — it's implicitly one intent, one label).
   *
   * Sequential rather than parallel: keeps the "first upload becomes
   * cover" logic simple (no race between two uploads racing to be
   * cover) and gives progress reporting a clean tick. Individual
   * failures don't abort the batch — they're toasted and skipped.
   */
  const uploadFiles = async (files: FileList) => {
    if (!vendor?.id) return;
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    setUploadProgress({ done: 0, total: list.length });

    // Track cover assignment as we go: only the very first successfully-
    // uploaded file in the batch becomes cover, and only when the venue
    // has no existing cover. Reading the local `media` snapshot is fine
    // here since a) it's fresh from the react-query cache and b) each
    // subsequent addMedia invalidates the query so future opens see it.
    let alreadyHasCover = media.some((m) => m.is_cover);
    let failures = 0;

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        // Path shape: `<venue_id>/<uuid>.<ext>`. Keeps files grouped per
        // venue for easy inspection in the Storage dashboard and matches
        // the storage RLS that scopes writes by object owner.
        const objectName = `${venueId}/${crypto.randomUUID()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(objectName, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type || undefined,
          });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message ?? "Upload failed"}`);
          failures += 1;
          continue;
        }

        const { data: publicUrl } = supabase.storage
          .from(STORAGE_BUCKET)
          .getPublicUrl(objectName);

        const shouldCover = !alreadyHasCover;
        await addMedia.mutateAsync({
          venue_id: venueId,
          url: publicUrl.publicUrl,
          media_kind: pendingKind,
          caption: caption.trim() || undefined,
          is_cover: shouldCover,
        });
        if (shouldCover) alreadyHasCover = true;
      } finally {
        setUploadProgress({ done: i + 1, total: list.length });
      }
    }

    setUploading(false);
    setUploadProgress(null);

    // Only clear the caption on a fully-successful batch so a partial
    // failure doesn't force the user to retype what they had.
    if (failures === 0) setCaption("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Single summary toast covers both the all-success and partial
    // failure paths. Per-file success toasts are suppressed in the hook
    // to avoid a stack of them on a large batch.
    const succeeded = list.length - failures;
    if (succeeded > 0 && failures === 0) {
      toast.success(
        succeeded === 1
          ? "Media added"
          : `Added ${succeeded} media`,
      );
    } else if (succeeded > 0 && failures > 0) {
      toast.success(
        `Added ${succeeded} of ${list.length} — ${failures} failed`,
      );
    }
  };

  const toggleCover = async (id: string, nextIsCover: boolean) => {
    if (nextIsCover) {
      // Unset the current cover(s) first so we don't have two.
      const current = media.filter((m) => m.is_cover && m.id !== id);
      await Promise.all(
        current.map((m) =>
          (supabase as any)
            .from("venue_media")
            .update({ is_cover: false })
            .eq("id", m.id),
        ),
      );
    }
    const { error } = await (supabase as any)
      .from("venue_media")
      .update({ is_cover: nextIsCover })
      .eq("id", id);
    if (error) {
      toast.error(error.message ?? "Could not update cover");
      return;
    }
    toast.success(nextIsCover ? "Set as cover photo" : "Removed cover flag");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl flex flex-col p-0 gap-0 max-h-[85vh]"
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle>Media · {venueName}</DialogTitle>
          <DialogDescription>
            Upload empty-hall shots, setup examples, facility photos, and a
            floor plan. Marketplace cards use the marked cover photo; detail
            views show every image.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* ─── Upload row ─── */}
        <div className="rounded-lg border border-dashed border-border p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[12px]">Media kind</Label>
              <Select
                value={pendingKind}
                onValueChange={(v) => setPendingKind(v as VenueMediaKind)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <div className="flex flex-col">
                        <span>{o.label}</span>
                        <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[12px]">Caption (optional)</Label>
              <Input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Ballroom set for wedding reception"
                className="h-9 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              disabled={uploading}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadFiles(e.target.files);
                }
              }}
              className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:cursor-pointer"
            />
            {uploading && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {uploadProgress
                  ? `Uploading ${uploadProgress.done} / ${uploadProgress.total}…`
                  : "Uploading…"}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pick multiple files at once — every file in the batch is saved
            with the same kind and caption. PDF works for floor plans;
            images are recommended for hall / setup / facility.
          </p>
        </div>

        {/* ─── Media list, grouped ─── */}
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 mr-1 animate-spin" /> Loading media…
          </p>
        ) : media.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No media yet. Upload the first photo above.
          </p>
        ) : (
          <div className="space-y-4">
            {KIND_OPTIONS.filter((o) => grouped[o.value].length > 0).map((o) => (
              <section key={o.value} className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {o.label} ({grouped[o.value].length})
                </p>
                <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
                  {grouped[o.value].map((m) => (
                    <div
                      key={m.id}
                      className="rounded-md border border-border overflow-hidden bg-card group"
                    >
                      <div className="aspect-square bg-muted/40 relative">
                        {isImageUrl(m.url) ? (
                          <img
                            src={m.url}
                            alt={m.caption ?? o.label}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground text-[11px] gap-1">
                            <ImageIcon className="h-6 w-6" />
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              Open file
                            </a>
                          </div>
                        )}
                        {m.is_cover && (
                          <Badge className="absolute top-1 left-1 text-[9px] bg-primary text-primary-foreground">
                            Cover
                          </Badge>
                        )}
                      </div>
                      <div className="p-2 space-y-1">
                        {m.caption && (
                          <p className="text-[11px] truncate">{m.caption}</p>
                        )}
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1.5 text-[11px]"
                            onClick={() => toggleCover(m.id, !m.is_cover)}
                            aria-label={m.is_cover ? "Remove cover" : "Set as cover"}
                          >
                            {m.is_cover ? (
                              <>
                                <StarOff className="h-3 w-3 mr-1" /> Unmark
                              </>
                            ) : (
                              <>
                                <Star className="h-3 w-3 mr-1" /> Cover
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              removeMedia.mutate({ id: m.id, venue_id: venueId })
                            }
                            aria-label="Delete media"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}
