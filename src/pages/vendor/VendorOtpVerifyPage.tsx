import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

import { AuthShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useVendorAuth } from "@/contexts/VendorAuthContext";

const PENDING_EMAIL_KEY = "illuxus-vendor.pending-otp-email";

const schema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your email"),
});

type FormValues = z.infer<typeof schema>;

/**
 * Second step of the login flow.
 *
 * The login page validated the password server-side, immediately signed the
 * temporary session out, and asked send-vendor-otp to email a 6-digit code.
 * This page collects that code and exchanges it (via verify-vendor-otp +
 * supabase.auth.verifyOtp) for the real session.
 */
export default function VendorOtpVerifyPage() {
  const { verifyOtp, sendOtp, user, vendor } = useVendorAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Prefer the URL param (survives full refresh + shareable across the flow),
  // fall back to sessionStorage. If neither has an email, we can't verify —
  // punt back to the login page.
  const email = React.useMemo(() => {
    const fromQuery = params.get("email");
    if (fromQuery) return fromQuery.toLowerCase();
    const fromStorage =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(PENDING_EMAIL_KEY)
        : null;
    return fromStorage?.toLowerCase() ?? "";
  }, [params]);

  const [resending, setResending] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  });

  // No email in state → user landed here directly. Send them back.
  React.useEffect(() => {
    if (!email) {
      navigate("/vendor/login", { replace: true });
    }
  }, [email, navigate]);

  // Already fully signed in → skip.
  React.useEffect(() => {
    if (user && vendor) navigate("/vendor", { replace: true });
  }, [user, vendor, navigate]);

  const onSubmit = async (values: FormValues) => {
    const { error } = await verifyOtp(email, values.code, "login");
    if (error) {
      toast.error(error.message ?? "Invalid code");
      return;
    }
    sessionStorage.removeItem(PENDING_EMAIL_KEY);
    toast.success("Verified — welcome back");
    navigate("/vendor", { replace: true });
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await sendOtp(email, "login");
      if (error) {
        toast.error(error.message ?? "Could not send a new code");
        return;
      }
      toast.success("New code sent");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      footer={
        <>
          Wrong email?{" "}
          <Link
            to="/vendor/login"
            className="font-medium text-foreground hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em] num"
            {...register("code")}
          />
          {errors.code ? (
            <p className="text-xs text-destructive">{errors.code.message}</p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Verify and sign in"
          )}
        </Button>

        <div className="text-center text-xs text-muted-foreground">
          Didn't receive it?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="font-medium text-foreground underline underline-offset-2 disabled:opacity-50"
          >
            {resending ? "Sending..." : "Send another code"}
          </button>
        </div>
      </form>
    </AuthShell>
  );
}
