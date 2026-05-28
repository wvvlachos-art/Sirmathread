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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-paper px-6 text-center text-ink">
      <h1 className="brand-serif text-4xl text-oxblood">
        Sign in to Sirmathread
      </h1>
      <button
        onClick={handleGoogleSignIn}
        className="rounded-full bg-oxblood px-6 py-3 text-base font-medium text-paper transition-colors hover:bg-oxblood-dark"
      >
        Continue with Google
      </button>
    </main>
  );
}
