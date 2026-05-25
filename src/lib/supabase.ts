import { createClient } from "@supabase/supabase-js";

// Public Supabase client.
// Uses the publishable key — safe to use in the browser.
// Respects row-level security, so each user only sees their own data.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
