import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { seedTutorialIfNeeded } from "@/lib/onboarding/seedTutorial";

// Google redirects the user here after they approve sign-in. We swap the
// one-time code Google gave us for a real logged-in session, then send the
// user on to the home page.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-login demo seed: 10 ad-agency projects + 3 tutorial notes.
      // No-ops on subsequent logins (gated by user_preferences.tutorial_seeded).
      // Failures are swallowed inside — never block the redirect.
      if (data.user) await seedTutorialIfNeeded(data.user.id);
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Keep the detailed reason in the server log only, not in the URL.
    console.error("[auth/callback] exchange failed:", error.message);
  } else {
    console.error("[auth/callback] no code present in callback URL");
  }

  // Something went wrong — send back to the login page.
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
