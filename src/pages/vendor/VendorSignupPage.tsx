import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
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

/**
 * Vendor signup handles three shapes:
 *
 *   1. New user, brand-new email — signUp() creates the auth user and
 *      sends a confirmation email. The vendors + vendor_members rows are
 *      created by the on_vendor_email_confirmed DB trigger the moment the
 *      user clicks the link. We show a "check your email" screen while
 *      they do that.
 *
 *   2. Existing Illuxus account (organizer) wants to also be a vendor —
 *      user checks "I already have an Illuxus account", we call
 *      linkExistingAccount() which signs them in and adds the vendor row.
 *      No new confirmation email — the Illuxus account is already
 *      confirmed.
 *
 *   3. Already-signed-in user with no vendor row (e.g. arrived here from
 *      the ProfileGate consent screen) — we skip the credential fields
 *      and just prompt for business name.
 */

const newAccountSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name is required")
    .max(80, "Keep it under 80 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

const businessOnlySchema = z.object({
  businessName: newAccountSchema.shape.businessName,
});

type NewAccountValues = z.infer<typeof newAccountSchema>;
type BusinessOnlyValues = z.infer<typeof businessOnlySchema>;

type Mode = "new" | "existing";

export default function VendorSignupPage() {
  const { signUp, user, vendor, createBusiness, linkExistingAccount } =
    useVendorAuth();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<Mode>("new");
  const [pendingEmail, setPendingEmail] = React.useState<string | null>(null);

  // Already fully set up? Skip the whole page.
  React.useEffect(() => {
    if (user && vendor) navigate("/vendor", { replace: true });
  }, [user, vendor, navigate]);

  // Case 3: already signed in, no vendor row yet.
  if (user && !vendor) {
    return <BusinessOnlyForm />;
  }

  // Case 1 (post-signup): confirmation link is out, waiting on the user
  // to click it.
  if (pendingEmail) {
    return <PendingConfirmation email={pendingEmail} />;
  }

  return (
    <AuthShell
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/vendor/login"
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your business
        </h1>
        <p className="text-sm text-muted-foreground">
          Start receiving requests from organizers.
        </p>
      </div>

      <div className="mt-6 flex rounded-md border border-border/70 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setMode("new")}
          className={
            mode === "new"
              ? "flex-1 rounded-sm bg-foreground px-3 py-1.5 font-medium text-background"
              : "flex-1 rounded-sm px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
          }
        >
          New account
        </button>
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={
            mode === "existing"
              ? "flex-1 rounded-sm bg-foreground px-3 py-1.5 font-medium text-background"
              : "flex-1 rounded-sm px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"
          }
        >
          Existing Illuxus account
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-muted-foreground">
        {mode === "new"
          ? "We'll email a confirmation link to activate your account."
          : "Add a vendor business to your existing Illuxus login."}
      </p>

      {mode === "new" ? (
        <NewAccountForm
          signUp={signUp}
          navigate={navigate}
          onNeedsConfirmation={setPendingEmail}
          switchMode={setMode}
        />
      ) : (
        <ExistingAccountForm
          linkExistingAccount={linkExistingAccount}
          navigate={navigate}
        />
      )}
    </AuthShell>
  );

  function BusinessOnlyForm() {
    const {
      register,
      handleSubmit,
      formState: { errors, isSubmitting },
    } = useForm<BusinessOnlyValues>({
      resolver: zodResolver(businessOnlySchema),
      defaultValues: { businessName: "" },
    });

    const onSubmit = async (values: BusinessOnlyValues) => {
      const { error } = await createBusiness(values.businessName);
      if (error) {
        toast.error(error.message ?? "Could not create business");
        return;
      }
      toast.success("Business created");
      navigate("/vendor", { replace: true });
    };

    return (
      <AuthShell>
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add a vendor business
          </h1>
          <p className="text-sm text-muted-foreground">
            You're signed in as {user?.email}. Name your vendor business to
            finish setup.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business name</Label>
            <Input
              id="businessName"
              placeholder="Averance Events"
              autoComplete="organization"
              {...register("businessName")}
            />
            {errors.businessName ? (
              <p className="text-xs text-destructive">
                {errors.businessName.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Create business"
            )}
          </Button>
        </form>
      </AuthShell>
    );
  }
}

/* -------------------------------------------------------------------------- */

function PendingConfirmation({ email }: { email: string }) {
  const { resendConfirmation } = useVendorAuth();
  const [resending, setResending] = React.useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const { error } = await resendConfirmation(email);
      if (error) {
        toast.error(error.message ?? "Could not send another email");
        return;
      }
      toast.success("New confirmation email sent");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      footer={
        <>
          Back to{" "}
          <Link
            to="/vendor/login"
            className="font-medium text-foreground hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-foreground">
          <Mail className="h-4 w-4" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link from{" "}
          <span className="font-medium text-foreground">Illuxus Vendor</span> to{" "}
          <span className="font-medium text-foreground">{email}</span>. Click
          the link in that email to activate your account. Your business will
          be created the moment you confirm — then you can sign in.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-center text-xs text-muted-foreground">
          Didn't receive it? Check your spam folder or resend the email.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Resend confirmation email"
          )}
        </Button>
      </div>
    </AuthShell>
  );
}

/* -------------------------------------------------------------------------- */

function NewAccountForm({
  signUp,
  navigate,
  onNeedsConfirmation,
  switchMode,
}: {
  signUp: ReturnType<typeof useVendorAuth>["signUp"];
  navigate: ReturnType<typeof useNavigate>;
  onNeedsConfirmation: (email: string) => void;
  switchMode: (m: Mode) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountValues>({
    resolver: zodResolver(newAccountSchema),
    defaultValues: { businessName: "", email: "", password: "" },
  });

  const onSubmit = async (values: NewAccountValues) => {
    const { error, needsConfirmation } = await signUp(
      values.email,
      values.password,
      values.businessName,
    );
    if (error) {
      if (/already (registered|exists)|user_exists/i.test(error.message)) {
        toast.error(
          "This email is already registered. Switch to \"Existing Illuxus account\" to link a vendor business.",
        );
        switchMode("existing");
        return;
      }
      toast.error(error.message ?? "Signup failed");
      return;
    }
    if (needsConfirmation) {
      // Move to the "check your inbox" screen. The vendor row will be
      // created by the DB trigger the moment the user clicks the link.
      onNeedsConfirmation(values.email.trim().toLowerCase());
      return;
    }
    // Fallback: confirmation is disabled for this Supabase project and we
    // already have a session. The INSERT trigger created the vendor row.
    toast.success("Business created");
    navigate("/vendor", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <FieldRow
        label="Business name"
        htmlFor="businessName"
        error={errors.businessName?.message}
      >
        <Input
          id="businessName"
          placeholder="Averance Events"
          autoComplete="organization"
          {...register("businessName")}
        />
      </FieldRow>
      <FieldRow label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          {...register("email")}
        />
      </FieldRow>
      <FieldRow
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          {...register("password")}
        />
      </FieldRow>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Create account and email confirmation"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        By continuing you agree to the Illuxus terms and privacy policy.
      </p>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function ExistingAccountForm({
  linkExistingAccount,
  navigate,
}: {
  linkExistingAccount: ReturnType<
    typeof useVendorAuth
  >["linkExistingAccount"];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountValues>({
    resolver: zodResolver(newAccountSchema),
    defaultValues: { businessName: "", email: "", password: "" },
  });

  const onSubmit = async (values: NewAccountValues) => {
    const { error } = await linkExistingAccount(
      values.email,
      values.password,
      values.businessName,
    );
    if (error) {
      toast.error(error.message ?? "Could not add vendor business");
      return;
    }
    toast.success("Vendor business added");
    navigate("/vendor", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <FieldRow
        label="Business name"
        htmlFor="businessName_existing"
        error={errors.businessName?.message}
      >
        <Input
          id="businessName_existing"
          placeholder="Averance Events"
          autoComplete="organization"
          {...register("businessName")}
        />
      </FieldRow>
      <FieldRow
        label="Illuxus email"
        htmlFor="email_existing"
        error={errors.email?.message}
      >
        <Input
          id="email_existing"
          type="email"
          autoComplete="email"
          placeholder="you@business.com"
          {...register("email")}
        />
      </FieldRow>
      <FieldRow
        label="Illuxus password"
        htmlFor="password_existing"
        error={errors.password?.message}
      >
        <Input
          id="password_existing"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
      </FieldRow>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "Add vendor business"
        )}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function FieldRow({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
