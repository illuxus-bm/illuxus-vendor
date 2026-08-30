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

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Use at least 6 characters"),
});

type FormValues = z.infer<typeof schema>;

/** Guards the "next" URL to same-origin absolute paths only. */
function safeNext(candidate: string | null): string {
  if (!candidate) return "/vendor";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/vendor";
  return candidate;
}

export default function VendorLoginPage() {
  const { signIn, user } = useVendorAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in? Skip the form.
  React.useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, next, navigate]);

  const onSubmit = async (values: FormValues) => {
    const { error } = await signIn(values.email, values.password);
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    toast.success("Welcome back");
    navigate(next, { replace: true });
  };

  return (
    <AuthShell
      footer={
        <>
          New here?{" "}
          <Link to="/vendor/signup" className="font-medium text-foreground hover:underline">
            Create a vendor account
          </Link>
        </>
      }
    >
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Manage your services, quotes, and bookings.
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

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
        </Button>
      </form>
    </AuthShell>
  );
}
