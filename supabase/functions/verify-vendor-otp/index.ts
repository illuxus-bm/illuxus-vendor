// deno-lint-ignore-file no-explicit-any
// @ts-nocheck  — Deno edge function.
//
// verify-vendor-otp
// -----------------
// Consumes a 6-digit code the user typed on /vendor/verify-otp. On success,
// generates a Supabase magic-link token via admin.generateLink and returns
// its `hashed_token`. The client then calls
//     supabase.auth.verifyOtp({ email, token_hash, type: 'magiclink' })
// to establish a real session. Because we don't return the session until
// BOTH the password (checked earlier by the client) and this OTP have been
// validated server-side, this is proper 2FA — not a client-side gate.
//
// Input JSON:  { email: string, code: string, purpose: 'login' | 'signup' | 'reverify' | 'password_reset' }
// Output JSON: { ok: true, token_hash: string } | { error: string }
//
// Required env / Supabase secrets (same as send-vendor-otp):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// CORS headers inlined so the Supabase Dashboard's single-file bundler
// can deploy this without needing the sibling _shared directory.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_PURPOSES = new Set([
  "login",
  "signup",
  "reverify",
  "password_reset",
]);

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  let payload: { email?: string; code?: string; purpose?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = payload.email?.trim().toLowerCase();
  const code = payload.code?.trim();
  const purpose = payload.purpose?.trim();
  if (!email || !code || !purpose) {
    return json({ error: "email, code, and purpose are required" }, 400);
  }
  if (!VALID_PURPOSES.has(purpose)) {
    return json({ error: "invalid purpose" }, 400);
  }
  if (!/^\d{6}$/.test(code)) {
    return json({ error: "Code must be 6 digits" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load the freshest un-consumed OTP for this (email, purpose) that isn't
  // yet expired.
  const { data: otp, error: findErr } = await supabase
    .from("vendor_email_otps")
    .select("id, code_hash, attempts, max_attempts, expires_at")
    .eq("email", email)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findErr) {
    return json({ error: findErr.message }, 500);
  }
  if (!otp) {
    return json({ error: "Code has expired or was already used" }, 400);
  }
  if (otp.attempts >= otp.max_attempts) {
    return json(
      { error: "Too many attempts on this code. Request a new one." },
      429,
    );
  }

  const inputHash = await sha256Hex(code);
  if (inputHash !== otp.code_hash) {
    await supabase
      .from("vendor_email_otps")
      .update({ attempts: otp.attempts + 1 })
      .eq("id", otp.id);
    return json({ error: "Invalid code" }, 400);
  }

  // Consume the OTP so it can never be reused.
  await supabase
    .from("vendor_email_otps")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", otp.id);

  // Issue a Supabase magic-link token the client can exchange for a real
  // session. We DO NOT email this — we return the hashed_token directly.
  const { data: linkData, error: linkErr } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return json(
      { error: linkErr?.message ?? "Could not issue session" },
      500,
    );
  }

  return json({ ok: true, token_hash: linkData.properties.hashed_token });
});
