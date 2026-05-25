import "server-only";
import { createClient } from "@supabase/supabase-js";

// Admin Supabase client.
// Uses the SECRET key — full database access, bypasses row-level security.
// The "server-only" import makes the build FAIL if this is ever imported into
// browser-side code, so the secret can never leak to users.
// Use this only in API routes and background jobs (e.g. Gmail sync).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
