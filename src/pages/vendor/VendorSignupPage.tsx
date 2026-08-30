import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
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

/**
 * Vendor signup handles three shapes:
 *
 *   1. New user, brand-new email — signUp() creates the auth user and the
 *      vendor row in one atomic RPC.
 *
 *   2. Existing Illuxus account (organizer) wants to also be a vendor —
 *      user checks "I already have an Illuxus account", we call
 *      linkExistingAccount() which signs them in and adds the vendor row.
 *      This is the ONLY path an existing Illuxus user can enter the vendor
 *      portal, because /vendor/login rejects non-vendors.
 *
 *   3. Already-signed-in user with no vendor row (e.g. they got here from
 *      the ProfileGate consent screen) — we skip the credential fields and
 *      just prompt for business name, then call createBusiness().
 */
const newAccountSchema = z.object({
  businessName: z
    .string()
    .min(2, "Business name is required")
    .max(80, "Keep it under 80 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

const existingAccountSchema = newAccountSchema;

const businessOnlySchema = z.object({
  businessName: newAccountSchema.shape.businessName,
});

type NewAccountValues = z.infer<typeof newAccountSchema>;
type BusinessOnlyValues = z.infer<typeof businessOnlySchema>;

type Mode = "new" | "existing";

export default function VendorSignupPage() {
  const { signUp, user, vendor, createBusiness, linkExistingAccount } = useVendorAuth();
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<Mode>("new");

  // Already fully set up? Skip the whole page.
  React.useEffect(() => {
    if (user && vendor) navigate("/vendor", { replace: true });
  }, [user, vendor, navigate]);

  // Case 3: already signed in, no vendor row yet. Only ask for business name.
  if (user && !vendor) {
    return <BusinessOnlyForm />;
  }

  return (
    <AuthShell
      footer={
        <>
          Already have an account?{" "}
          <Link to="/vendor/login" className="font-medium text-foreground hover:underline">
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

      {/* Mode toggle — "New account" vs "I have an Illuxus account already" */}
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
          ? "Signs up as a brand-new user."
          : "Add a vendor business to your existing Illuxus login."}
      </p>

      {mode === "new" ? (
        <NewAccountForm signUp={signUp} navigate={navigate} switchMode={setMode} />
      ) : (
        <ExistingAccountForm linkExistingAccount={linkExistingAccount} navigate={navigate} />
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
            You're signed in as {user?.email}. Name your vendor business to finish setup.
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
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create business"}
          </Button>
        </form>
      </AuthShell>
    );
  }
}

/* -------------------------------------------------------------------------- */

function NewAccountForm({
  signUp,
  navigate,
  switchMode,
}: {
  signUp: ReturnType<typeof useVendorAuth>["signUp"];
  navigate: ReturnType<typeof useNavigate>;
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
    const { error } = await signUp(values.email, values.password, values.businessName);
    if (error) {
      // If Supabase says this email is already registered, nudge the user
      // toward the "Existing Illuxus account" mode instead of leaving them
      // stuck on a generic error.
      if (/already (registered|exists)|user_exists/i.test(error.message)) {
        toast.error(
          "This email is already registered on Illuxus. Switch to \"Existing Illuxus account\" to link a vendor business.",
        );
        switchMode("existing");
        return;
      }
      toast.error(error.message ?? "Signup failed");
      return;
    }
    toast.success("Business created");
    navigate("/vendor", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <FieldRow label="Business name" htmlFor="businessName" error={errors.businessName?.message}>
        <Input id="businessName" placeholder="Averance Events" autoComplete="organization" {...register("businessName")} />
      </FieldRow>
      <FieldRow label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" placeholder="you@business.com" {...register("email")} />
      </FieldRow>
      <FieldRow label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" placeholder="At least 6 characters" {...register("password")} />
      </FieldRow>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create business"}
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
  linkExistingAccount: ReturnType<typeof useVendorAuth>["linkExistingAccount"];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewAccountValues>({
    resolver: zodResolver(existingAccountSchema),
    defaultValues: { businessName: "", email: "", password: "" },
  });

  const onSubmit = async (values: NewAccountValues) => {
    const { error } = await linkExistingAccount(
      values.email,
      values.password,
      values.businessName,
    );
    if (error) {
      // Common cases:
      //   • wrong password → "Invalid login credentials"
      //   • already a vendor → "You already belong to a vendor business"
      toast.error(error.message ?? "Could not add vendor business");
      return;
    }
    toast.success("Vendor business added");
    navigate("/vendor", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
      <FieldRow label="Business name" htmlFor="businessName_existing" error={errors.businessName?.message}>
        <Input id="businessName_existing" placeholder="Averance Events" autoComplete="organization" {...register("businessName")} />
      </FieldRow>
      <FieldRow label="Illuxus email" htmlFor="email_existing" error={errors.email?.message}>
        <Input id="email_existing" type="email" autoComplete="email" placeholder="you@business.com" {...register("email")} />
      </FieldRow>
      <FieldRow label="Illuxus password" htmlFor="password_existing" error={errors.password?.message}>
        <Input id="password_existing" type="password" autoComplete="current-password" {...register("password")} />
      </FieldRow>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add vendor business"}
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
