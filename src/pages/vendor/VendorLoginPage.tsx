import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

/** Guards `?next=` to same-origin paths so a crafted `?next=//evil.com`
 *  can't turn our login into an open redirect. */
function safeNext(candidate: string | null): string {
  if (!candidate) return "/vendor";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/vendor";
  return candidate;
}

function isNotAVendorError(message: string): boolean {
  return /isn'?t registered as a vendor/i.test(message);
}

function isConfirmationPending(message: string): boolean {
  return /confirmation not done/i.test(message);
}

export default function VendorLoginPage() {
  const { signIn, user, vendor } = useVendorAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const justConfirmed = params.get("confirmed") === "1";

  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Already fully signed in AND a vendor? Skip the form (also covers the
  // moment right after clicking the confirmation link — Supabase parses
  // the returned session from the URL and we bounce straight to /vendor).
  React.useEffect(() => {
    if (user && vendor) navigate(next, { replace: true });
  }, [user, vendor, next, navigate]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const { error } = await signIn(values.email, values.password);
    if (error) {
      const msg = error.message ?? "Sign in failed";
      setFormError(msg);
      // Skip the toast when we're showing a rich inline hint — one clear
      // message per failure is enough.
      if (!isNotAVendorError(msg) && !isConfirmationPending(msg)) {
        toast.error(msg);
      }
      return;
    }
    toast.success("Welcome back");
    navigate(next, { replace: true });
  };

  return (
    <AuthShell
      footer={
        // Vendor portal is invite-only — no signup link. The signup route
        // is still mounted (as an invite-only stub) so people hitting an
        // old bookmark land on a clear message rather than a 404.
        <>
          Vendor accounts are invite-only. Please contact support if you
          should have access.
        </>
      }
    >
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Manage your services, quotes, and bookings.
        </p>
      </div>

      {justConfirmed ? (
        <div className="mt-6 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Email confirmed. Sign in below to finish setting up your business.
        </div>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@business.com"
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            {...register("password")}
          />
          {errors.password ? (
            <p className="text-xs text-destructive">{errors.password.message}</p>
          ) : null}
        </div>

        {formError && isNotAVendorError(formError) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {formError} If you should have vendor access, contact support.
          </div>
        ) : null}

        {formError && isConfirmationPending(formError) ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            {formError}
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Sign in"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
