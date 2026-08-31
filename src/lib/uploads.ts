import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads to the shared `vendor-media` bucket. The bucket's RLS policies
 * require the first folder in the object path to be a vendor_id the caller
 * is a member of, so every path here MUST start with `<vendorId>/`.
 *
 * Convention:
 *   • Logo     → `<vendor_id>/logo-<rand>.<ext>`
 *   • Cover    → `<vendor_id>/cover-<rand>.<ext>`
 *   • Portfolio→ `<vendor_id>/portfolio/<rand>.<ext>`
 *
 * We use a random suffix instead of a fixed name so re-uploads never hit
 * a stale CDN cache — the URL changes each time.
 */

export const VENDOR_MEDIA_BUCKET = "vendor-media";

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export type MediaKind = "logo" | "cover" | "portfolio";

export interface UploadOk {
  ok: true;
  /** Public URL suitable for storing in vendors.logo_url etc. */
  url: string;
  /** Storage path (`<vendor_id>/logo-…`) — keep this if you want to delete later. */
  path: string;
}

export interface UploadErr {
  ok: false;
  error: string;
}

export type UploadResult = UploadOk | UploadErr;

function extForFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  // Fall back on the MIME type.
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "bin";
}

function randomSuffix(): string {
  // 8-char slug from crypto.randomUUID() — good enough to avoid collisions.
  const uuid = crypto.randomUUID();
  return uuid.replace(/-/g, "").slice(0, 12);
}

function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Only JPG, PNG, or WEBP images are supported";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "File must be under 5 MB";
  }
  return null;
}

/**
 * Upload a single image for a vendor. Returns the public URL to persist on
 * whatever row is being edited (vendors.logo_url, vendors.cover_url, or a
 * vendor_portfolio row's url).
 */
export async function uploadVendorImage(
  file: File,
  vendorId: string,
  kind: MediaKind,
): Promise<UploadResult> {
  const validationErr = validateImage(file);
  if (validationErr) return { ok: false, error: validationErr };

  const ext = extForFile(file);
  const stem =
    kind === "portfolio"
      ? `portfolio/${randomSuffix()}`
      : `${kind}-${randomSuffix()}`;
  const path = `${vendorId}/${stem}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(VENDOR_MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadErr) {
    return { ok: false, error: uploadErr.message };
  }

  const { data } = supabase.storage
    .from(VENDOR_MEDIA_BUCKET)
    .getPublicUrl(path);

  return { ok: true, url: data.publicUrl, path };
}

/** Remove an object from the vendor-media bucket. Called when we replace a
 *  logo/cover so old files don't pile up. Failures are logged but not thrown
 *  — leaving a stray object isn't worth failing the user-facing action. */
export async function removeVendorObject(path: string): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage
    .from(VENDOR_MEDIA_BUCKET)
    .remove([path]);
  if (error) {
    // Non-fatal — old files just linger.
    // eslint-disable-next-line no-console
    console.warn("vendor-media cleanup failed", { path, error });
  }
}

/**
 * Given a full public URL previously returned by uploadVendorImage, extract
 * the storage path so we can delete the object. Returns null if the URL
 * doesn't match our bucket layout.
 */
export function pathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${VENDOR_MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}
