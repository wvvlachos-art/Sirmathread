import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Safe for use in the browser (uses the
// publishable key). Respects per-user security. Used by client components,
// e.g. the "Sign in with Google" button.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
