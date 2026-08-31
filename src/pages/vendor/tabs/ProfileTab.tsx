import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ImageIcon, Loader2, Save, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  pathFromPublicUrl,
  removeVendorObject,
  uploadVendorImage,
} from "@/lib/uploads";

const DEFAULT_AUTO_REPLY =
  "Thanks for reaching out! I'll review your brief and respond within 24 hours.";

const urlish = z
  .string()
  .trim()
  .max(200)
  .refine(
    (v) => v === "" || /^https?:\/\//i.test(v),
    { message: "Include http:// or https://" },
  )
  .optional()
  .or(z.literal(""));

const schema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  website: urlish,
  city: z.string().max(80).optional().or(z.literal("")),
  country: z.string().max(80).optional().or(z.literal("")),
  years_experience: z.union([z.string(), z.number()]).optional(),
  response_time_hours: z.union([z.string(), z.number()]).optional(),
  tagline: z.string().max(160).optional().or(z.literal("")),
  bio: z.string().max(2000).optional().or(z.literal("")),
  instagram_url: urlish,
  linkedin_url: urlish,
  facebook_url: urlish,
  youtube_url: urlish,
  notify_email: z.boolean(),
  auto_reply: z.string().max(500).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

/**
 * Profile tab — the biggest form in the app.
 *
 * Sections (top to bottom):
 *   1. Cover & logo         — media uploads to vendor-media bucket
 *   2. Business details     — name, website, city, country, YoE, response time, tagline, bio
 *   3. Social links         — Instagram, LinkedIn, Facebook, YouTube (packed into socials jsonb)
 *   4. Preferences          — notify_email toggle + auto-reply textarea
 *   5. Save profile
 */
export default function ProfileTab() {
  const { vendor, refreshVendor } = useVendorAuth();
  const [saving, setSaving] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(vendor),
  });

  React.useEffect(() => {
    reset(buildDefaults(vendor));
  }, [vendor, reset]);

  const emailOn = watch("notify_email");

  const onSubmit = async (values: FormValues) => {
    if (!vendor) {
      toast.error("Vendor profile not loaded");
      return;
    }
    setSaving(true);
    try {
      const socials: Record<string, string> = {};
      if (values.instagram_url) socials.instagram = values.instagram_url;
      if (values.linkedin_url) socials.linkedin = values.linkedin_url;
      if (values.facebook_url) socials.facebook = values.facebook_url;
      if (values.youtube_url) socials.youtube = values.youtube_url;

      const patch = {
        business_name: values.business_name,
        website: normalize(values.website),
        city: normalize(values.city),
        country: normalize(values.country),
        years_experience: toNullableInt(values.years_experience),
        response_time_hours: toNullableInt(values.response_time_hours),
        tagline: normalize(values.tagline),
        bio: normalize(values.bio),
        socials,
        notify_email: values.notify_email,
        auto_reply: normalize(values.auto_reply) ?? DEFAULT_AUTO_REPLY,
      };
      const { error } = await supabase
        .from("vendors")
        .update(patch)
        .eq("id", vendor.id);
      if (error) throw error;
      await refreshVendor();
      toast.success("Profile saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <CoverAndLogoCard />

      {/* -------- Business details -------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Business details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Business name" htmlFor="business_name" error={errors.business_name?.message}>
              <Input id="business_name" {...register("business_name")} />
            </Field>
            <Field label="Website" htmlFor="website" error={errors.website?.message}>
              <Input id="website" placeholder="https://" {...register("website")} />
            </Field>
            <Field label="City" htmlFor="city">
              <Input id="city" {...register("city")} />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input id="country" {...register("country")} />
            </Field>
            <Field label="Years experience" htmlFor="years_experience">
              <Input id="years_experience" type="number" min={0} {...register("years_experience")} />
            </Field>
            <Field label="Avg response time (hours)" htmlFor="response_time_hours">
              <Input
                id="response_time_hours"
                type="number"
                min={0}
                placeholder="e.g. 2"
                {...register("response_time_hours")}
              />
            </Field>
            <Field label="Short tagline" htmlFor="tagline" className="sm:col-span-2">
              <Input id="tagline" placeholder="One-liner shown on marketplace card" {...register("tagline")} />
            </Field>
            <Field label="About / bio" htmlFor="bio" className="sm:col-span-2">
              <Textarea
                id="bio"
                rows={5}
                placeholder="Tell organizers about your team, style, and what makes you different."
                {...register("bio")}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* -------- Social links -------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Social links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Instagram" htmlFor="instagram_url">
              <Input id="instagram_url" placeholder="https://" {...register("instagram_url")} />
            </Field>
            <Field label="Linkedin" htmlFor="linkedin_url">
              <Input id="linkedin_url" placeholder="https://" {...register("linkedin_url")} />
            </Field>
            <Field label="Facebook" htmlFor="facebook_url">
              <Input id="facebook_url" placeholder="https://" {...register("facebook_url")} />
            </Field>
            <Field label="Youtube" htmlFor="youtube_url">
              <Input id="youtube_url" placeholder="https://" {...register("youtube_url")} />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* -------- Preferences -------- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                Email me when a new request comes in
              </Label>
              <p className="text-xs text-muted-foreground">
                Turn off if you check the dashboard often.
              </p>
            </div>
            <Switch
              checked={emailOn}
              onCheckedChange={(v) => setValue("notify_email", v, { shouldDirty: true })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="auto_reply">Auto-reply on new requests</Label>
            <Textarea
              id="auto_reply"
              rows={3}
              placeholder={DEFAULT_AUTO_REPLY}
              {...register("auto_reply")}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save profile
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*  Cover + Logo — real uploads to the vendor-media bucket                   */
/* -------------------------------------------------------------------------- */

function CoverAndLogoCard() {
  const { vendor, refreshVendor } = useVendorAuth();
  const [uploadingCover, setUploadingCover] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  const upload = async (kind: "logo" | "cover", file: File) => {
    if (!vendor) {
      toast.error("Vendor profile not loaded");
      return;
    }
    const setBusy = kind === "logo" ? setUploadingLogo : setUploadingCover;
    setBusy(true);
    try {
      const result = await uploadVendorImage(file, vendor.id, kind);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const column = kind === "logo" ? "logo_url" : "cover_url";
      const previousUrl =
        kind === "logo" ? vendor.logo_url : vendor.cover_url;

      const { error } = await supabase
        .from("vendors")
        .update({ [column]: result.url })
        .eq("id", vendor.id);
      if (error) {
        toast.error(error.message);
        return;
      }

      // Best-effort cleanup of the previous file so orphans don't accumulate.
      const oldPath = pathFromPublicUrl(previousUrl);
      if (oldPath && oldPath !== result.path) {
        void removeVendorObject(oldPath);
      }

      await refreshVendor();
      toast.success(kind === "logo" ? "Logo updated" : "Cover updated");
    } finally {
      setBusy(false);
    }
  };

  const onCoverChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await upload("cover", file);
    // Reset so selecting the same file again re-fires onChange.
    e.target.value = "";
  };

  const onLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await upload("logo", file);
    e.target.value = "";
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Cover &amp; logo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden inputs triggered by the buttons below. */}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onCoverChange}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onLogoChange}
        />

        <div className="relative flex aspect-[16/5] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/70 bg-secondary/40">
          {vendor?.cover_url ? (
            <img
              src={vendor.cover_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="h-4 w-4" />
              No cover image
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute bottom-3 right-3 bg-background"
            onClick={() => coverInputRef.current?.click()}
            disabled={uploadingCover}
          >
            {uploadingCover ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploadingCover ? "Uploading…" : "Change cover"}
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-secondary/40">
            {vendor?.logo_url ? (
              <img
                src={vendor.logo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
          >
            {uploadingLogo ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploadingLogo ? "Uploading…" : "Upload logo"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          JPG, PNG, or WEBP · max 5 MB.
        </p>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <div className="space-y-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

function buildDefaults(
  vendor: ReturnType<typeof useVendorAuth>["vendor"],
): FormValues {
  const socials = (vendor?.socials ?? {}) as Record<string, string>;
  return {
    business_name: vendor?.business_name ?? "",
    website: vendor?.website ?? "",
    city: vendor?.city ?? "",
    country: vendor?.country ?? "",
    years_experience: vendor?.years_experience ?? "",
    response_time_hours: vendor?.response_time_hours ?? "",
    tagline: vendor?.tagline ?? "",
    bio: vendor?.bio ?? "",
    instagram_url: socials.instagram ?? "",
    linkedin_url: socials.linkedin ?? "",
    facebook_url: socials.facebook ?? "",
    youtube_url: socials.youtube ?? "",
    notify_email: vendor?.notify_email ?? true,
    auto_reply: vendor?.auto_reply ?? DEFAULT_AUTO_REPLY,
  };
}

function normalize(v?: string | null): string | null {
  if (v == null) return null;
  const trimmed = String(v).trim();
  return trimmed.length ? trimmed : null;
}

function toNullableInt(v: string | number | undefined): number | null {
  if (v === undefined || v === "" || v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
}
