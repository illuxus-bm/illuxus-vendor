import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

const PENDING_EMAIL_KEY = "illuxus-vendor.pending-otp-email";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

/** Guards `?next=` to same-origin paths, blocks open-redirect. */
function safeNext(candidate: string | null): string {
  if (!candidate) return "/vendor";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/vendor";
  return candidate;
}

function isNotAVendorError(message: string): boolean {
  return /isn'?t registered as a vendor/i.test(message);
}

export default function VendorLoginPage() {
  const { signIn, user, vendor } = useVendorAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Already fully signed in AND a vendor? Skip the form.
  React.useEffect(() => {
    if (user && vendor) navigate(next, { replace: true });
  }, [user, vendor, next, navigate]);

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const result = await signIn(values.email, values.password);
    if (result.error) {
      const msg = result.error.message ?? "Sign in failed";
      setFormError(msg);
      if (!isNotAVendorError(msg)) toast.error(msg);
      return;
    }
    // Password + vendor-membership were both valid; signIn tore the
    // temporary session down and dispatched an email OTP. Move on to the
    // verify step — real session only exists after that succeeds.
    sessionStorage.setItem(PENDING_EMAIL_KEY, result.email);
    toast.success("Code sent to your email");
    const params = new URLSearchParams({ email: result.email, next });
    navigate(`/vendor/verify-otp?${params.toString()}`, { replace: true });
  };

  return (
    <AuthShell
      footer={
        <>
          New here?{" "}
          <Link
            to="/vendor/signup"
            className="font-medium text-foreground hover:underline"
          >
            Create a vendor account
          </Link>
        </>
      }
    >
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          We'll email you a code to confirm it's you.
        </p>
      </div>

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
            {formError}{" "}
            <Link
              to="/vendor/signup"
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Create a vendor account →
            </Link>
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Send verification code"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
