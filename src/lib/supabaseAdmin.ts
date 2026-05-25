import "server-only";
import { createClient } from "@supabase/supabase-js";

// Admin Supabase client.
// Uses the SECRET key — full database access, bypasses row-level security.
// The "server-only" import above makes the build FAIL if this file is ever
// imported into browser-side code, so the secret can never leak to users.
// Use this only in API routes and background jobs.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
