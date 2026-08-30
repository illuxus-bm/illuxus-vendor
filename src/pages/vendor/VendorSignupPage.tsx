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

const schema = z.object({
  businessName: z
    .string()
    .min(2, "Business name is required")
    .max(80, "Keep it under 80 characters"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function VendorSignupPage() {
  const { signUp, user, vendor, createBusiness } = useVendorAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { businessName: "", email: "", password: "" },
  });

  // Already fully set up? Go home.
  React.useEffect(() => {
    if (user && vendor) navigate("/vendor", { replace: true });
  }, [user, vendor, navigate]);

  const onSubmit = async (values: FormValues) => {
    // Case A: no session yet. Create the auth user; signUp() will also try
    // to create the vendor row atomically if the project returns a session
    // immediately (email confirmation off).
    if (!user) {
      const { error } = await signUp(
        values.email,
        values.password,
        values.businessName,
      );
      if (error) {
        toast.error(error.message ?? "Signup failed");
        return;
      }
      toast.success("Business created");
      navigate("/vendor", { replace: true });
      return;
    }

    // Case B: signed in but no vendor row yet (email-confirmation flow, or
    // partial signup). Call the RPC directly.
    const { error } = await createBusiness(values.businessName);
    if (error) {
      toast.error(error.message ?? "Could not create business");
      return;
    }
    toast.success("Business created");
    navigate("/vendor", { replace: true });
  };

  const showEmailFields = !user;

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
          {showEmailFields
            ? "Start receiving requests from organizers."
            : "Finish setting up your vendor profile."}
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

        {showEmailFields ? (
          <>
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
                <p className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 6 characters"
                {...register("password")}
              />
              {errors.password ? (
                <p className="text-xs text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>
          </>
        ) : null}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create business"}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the Illuxus terms and privacy policy.
        </p>
      </form>
    </AuthShell>
  );
}
