"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const handleGoogleSignIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Where Google sends the user back to after they approve.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-950 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">
        Sign in to Sirmathread
      </h1>
      <button
        onClick={handleGoogleSignIn}
        className="rounded-full bg-zinc-50 px-6 py-3 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
      >
        Continue with Google
      </button>
    </main>
  );
}
