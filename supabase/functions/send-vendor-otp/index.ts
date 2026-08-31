// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno edge function, imports are Deno-flavoured URL imports.
//
// send-vendor-otp
// ---------------
// Generates a 6-digit code, stores its SHA-256 hash in `vendor_email_otps`,
// and emails the plaintext code to the user via Resend. Called by the vendor
// app right after `signInWithPassword` succeeds so the session doesn't get
// re-established until `verify-vendor-otp` confirms the code.
//
// Input JSON:  { email: string, purpose: 'login' | 'signup' | 'reverify' | 'password_reset' }
// Output JSON: { ok: true, expires_at: string } | { error: string }
//
// Required env / Supabase secrets:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-populated by Supabase)
//   RESEND_API_KEY                           (from your Resend account)
//   RESEND_FROM_EMAIL                        (e.g. "Illuxus <no-reply@illuxus.com>")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS headers are inlined (not imported from ../_shared/) because the
// Supabase Dashboard bundler only uploads a single function directory —
// relative imports outside it fail with "Module not found". Keeping this
// file self-contained means either the CLI or the dashboard can ship it.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM_EMAIL =
  Deno.env.get("RESEND_FROM_EMAIL") ?? "Illuxus <onboarding@resend.dev>";

const VALID_PURPOSES = new Set([
  "login",
  "signup",
  "reverify",
  "password_reset",
]);

const OTP_TTL_MINUTES = 10;
const MAX_OTPS_PER_HOUR = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cryptographically random 6-digit numeric code, zero-padded. */
function generateOtp(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const num =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return (num % 1_000_000).toString().padStart(6, "0");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function otpEmailHtml(code: string, purpose: string): string {
  const heading =
    purpose === "signup"
      ? "Confirm your email"
      : purpose === "password_reset"
        ? "Reset your password"
        : "Verify your sign-in";
  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f6f7;margin:0;padding:32px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:32px;">
      <div style="font-size:12px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;">
        Illuxus Vendor Connect
      </div>
      <h1 style="margin:12px 0 8px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.02em;">
        ${heading}
      </h1>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#4b5563;">
        Use this code to continue. It expires in ${OTP_TTL_MINUTES} minutes and can only be used once.
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;letter-spacing:0.4em;font-family:'JetBrains Mono',Consolas,monospace;font-size:28px;font-weight:700;color:#111827;">
        ${code}
      </div>
      <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
        If you didn't request this code, you can safely ignore this email — nobody can access your account without it.
      </p>
    </div>
    <div style="max-width:480px;margin:16px auto 0;text-align:center;font-size:11px;color:#9ca3af;">
      Sent by Illuxus · illuxus.com
    </div>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let payload: { email?: string; purpose?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const purpose = payload.purpose?.trim();
  if (!email || !purpose) {
    return json({ error: "email and purpose are required" }, 400);
  }
  if (!VALID_PURPOSES.has(purpose)) {
    return json({ error: "invalid purpose" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Rate limit: <= MAX_OTPS_PER_HOUR per email per rolling hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await supabase
    .from("vendor_email_otps")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", oneHourAgo);
  if ((count ?? 0) >= MAX_OTPS_PER_HOUR) {
    return json(
      { error: "Too many codes requested. Try again in an hour." },
      429,
    );
  }

  // Fresh OTP + hash.
  const code = generateOtp();
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000).toISOString();

  const ipHeader =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for") ??
    req.headers.get("x-real-ip") ??
    "";
  const ipHash = ipHeader ? await sha256Hex(ipHeader) : null;

  const { error: insertErr } = await supabase.from("vendor_email_otps").insert({
    email,
    code_hash: codeHash,
    purpose,
    expires_at: expiresAt,
    ip_hash: ipHash,
  });
  if (insertErr) {
    return json({ error: `Could not persist OTP: ${insertErr.message}` }, 500);
  }

  // Deliver via Resend. If your project uses a different provider, swap the
  // fetch call — the OTP row is already stored.
  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: email,
      subject: `Your Illuxus verification code: ${code}`,
      html: otpEmailHtml(code, purpose),
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    return json({ error: `Email send failed: ${errText}` }, 502);
  }

  return json({ ok: true, expires_at: expiresAt });
});
