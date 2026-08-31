import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useVendorAuth } from "@/contexts/VendorAuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { MyService } from "@/hooks/useMyServices";

const CURRENCIES = ["USD", "INR", "EUR", "GBP", "AUD", "CAD", "SGD", "AED"] as const;
const UNITS = [
  { value: "per_event", label: "Per event" },
  { value: "per_hour", label: "Per hour" },
  { value: "per_day", label: "Per day" },
  { value: "per_person", label: "Per person" },
  { value: "flat", label: "Flat fee" },
] as const;

const schema = z.object({
  title: z.string().trim().min(2, "Title is required").max(120),
  description: z.string().max(500).optional().or(z.literal("")),
  // Whole-unit price in the user's currency (e.g. 150 for $150 or ₹150).
  // We multiply by 100 on submit to store as bigint minor units.
  base_price: z.coerce.number().min(0, "Price must be zero or positive"),
  currency: z.enum(CURRENCIES),
  unit: z.enum(["per_hour", "per_event", "per_person", "per_day", "flat"]),
  duration: z.string().max(80).optional().or(z.literal("")),
  is_instant_book: z.boolean(),
  quote_on_request: z.boolean(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface ServiceEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing service to edit. Pass `null` (or omit) to add a new one. */
  service?: MyService | null;
}

/**
 * Add / edit / delete for the vendor's rate card. Prices are collected in
 * whole currency units for the user's convenience and stored as minor
 * units (bigint) in `vendor_services.base_price`.
 */
export function ServiceEditorDialog({
  open,
  onOpenChange,
  service,
}: ServiceEditorDialogProps) {
  const { vendor } = useVendorAuth();
  const qc = useQueryClient();
  const isEdit = !!service;
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(service ?? null, vendor?.default_currency),
  });

  // Reset the form whenever the dialog opens with a different service.
  React.useEffect(() => {
    if (open) {
      reset(buildDefaults(service ?? null, vendor?.default_currency));
    }
  }, [open, service, vendor?.default_currency, reset]);

  const currency = watch("currency");
  const unit = watch("unit");
  const isInstant = watch("is_instant_book");
  const isActive = watch("is_active");
  const quoteOnRequest = watch("quote_on_request");

  const onSubmit = async (values: FormValues) => {
    if (!vendor) return;
    setSaving(true);
    try {
      const payload = {
        vendor_id: vendor.id,
        title: values.title,
        description: values.description?.trim() || null,
        base_price: Math.round(values.base_price * 100),
        currency: values.currency,
        unit: values.unit,
        duration: values.duration?.trim() || null,
        is_instant_book: values.is_instant_book,
        quote_on_request: values.quote_on_request,
        is_active: values.is_active,
      };

      let error;
      if (isEdit && service) {
        ({ error } = await (supabase as any)
          .from("vendor_services")
          .update(payload)
          .eq("id", service.id));
      } else {
        ({ error } = await (supabase as any)
          .from("vendor_services")
          .insert(payload));
      }

      if (error) {
        toast.error(error.message ?? "Could not save service");
        return;
      }
      qc.invalidateQueries({ queryKey: ["vendor-services", vendor.id] });
      toast.success(isEdit ? "Service updated" : "Service added");
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!service || !vendor) return;
    if (
      !window.confirm(
        `Delete "${service.title}"? Organizers won't see it anymore.`,
      )
    )
      return;
    setDeleting(true);
    try {
      const { error } = await (supabase as any)
        .from("vendor_services")
        .delete()
        .eq("id", service.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      qc.invalidateQueries({ queryKey: ["vendor-services", vendor.id] });
      toast.success("Service deleted");
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit service" : "Add service"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the details organizers see on your rate card."
              : "Publish a service so organizers can book it or request a quote."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Title" htmlFor="title" error={errors.title?.message}>
            <Input
              id="title"
              placeholder="Full-day event photography"
              {...register("title")}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors.description?.message}
            hint="Shown on your public profile and in quote suggestions."
          >
            <Textarea
              id="description"
              rows={3}
              placeholder="What's included, deliverables, style…"
              {...register("description")}
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
            <Field
              label="Price"
              htmlFor="base_price"
              error={errors.base_price?.message}
              hint={`Whole units — e.g. 150 for ${symbol(currency)}150`}
            >
              <Input
                id="base_price"
                type="number"
                min={0}
                step="1"
                placeholder="0"
                {...register("base_price")}
              />
            </Field>

            <Field label="Currency" htmlFor="currency">
              <select
                id="currency"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                {...register("currency")}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Pricing unit" htmlFor="unit">
              <select
                id="unit"
                className={cn(
                  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                {...register("unit")}
              >
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Duration"
              htmlFor="duration"
              hint="Free-form — 3 hours, half day, etc."
            >
              <Input id="duration" placeholder="Optional" {...register("duration")} />
            </Field>
          </div>

          <div className="space-y-3 rounded-md border border-border/70 bg-secondary/40 p-3">
            <ToggleRow
              label="Instant book"
              hint="Organizers can book this directly without a custom quote."
              checked={isInstant}
              onChange={(v) => setValue("is_instant_book", v, { shouldDirty: true })}
            />
            <ToggleRow
              label="Accept custom quotes"
              hint="Organizers can send an RFQ for this service even if instant book is on."
              checked={quoteOnRequest}
              onChange={(v) => setValue("quote_on_request", v, { shouldDirty: true })}
            />
            <ToggleRow
              label="Published"
              hint="Uncheck to hide this service from the marketplace without deleting it."
              checked={isActive}
              onChange={(v) => setValue("is_active", v, { shouldDirty: true })}
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div>
              {isEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={handleDelete}
                  disabled={deleting || saving}
                >
                  {deleting ? "Deleting…" : "Delete"}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isEdit ? (
                  "Save changes"
                ) : (
                  "Add service"
                )}
              </Button>
            </div>
          </DialogFooter>
        </form>

        {/* Silence "unused" warnings from watches used only for reactivity above */}
        <span className="sr-only">{unit}</span>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function buildDefaults(
  service: MyService | null,
  vendorDefaultCurrency?: string,
): FormValues {
  const fallbackCurrency = (vendorDefaultCurrency ??
    "USD") as (typeof CURRENCIES)[number];
  return {
    title: service?.title ?? "",
    description: service?.description ?? "",
    base_price: service ? Number(service.base_price) / 100 : 0,
    currency:
      (service?.currency as (typeof CURRENCIES)[number]) ??
      (CURRENCIES.includes(fallbackCurrency) ? fallbackCurrency : "USD"),
    unit: (service?.unit as FormValues["unit"]) ?? "per_event",
    duration: service?.duration ?? "",
    is_instant_book: service?.is_instant_book ?? false,
    quote_on_request: service?.quote_on_request ?? true,
    is_active: service?.is_active ?? true,
  };
}

function symbol(currency: string): string {
  switch (currency) {
    case "USD":
    case "AUD":
    case "CAD":
    case "SGD":
      return "$";
    case "INR":
      return "₹";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "AED":
      return "د.إ ";
    default:
      return "";
  }
}
