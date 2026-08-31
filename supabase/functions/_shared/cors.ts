/**
 * Shared CORS headers for every vendor edge function.
 *
 * Kept permissive during dev — set an ALLOWED_ORIGINS Supabase secret and
 * check `req.headers.get('origin')` against it if you need to tighten this
 * in production.
 */
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
