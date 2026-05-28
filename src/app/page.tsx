import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 text-center text-ink">
      <h1 className="brand-serif text-5xl sm:text-6xl text-oxblood">
        Sirmathread
      </h1>
      <p className="max-w-xl text-lg leading-8 text-ink">
        Turn labeled Gmail threads into navigable project flowcharts.
      </p>

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-muted">
            Signed in as <span className="text-ink">{user.email}</span>
          </p>
          <Link
            href="/layer1"
            className="rounded-full bg-oxblood px-6 py-3 text-base font-medium text-paper transition-colors hover:bg-oxblood-dark"
          >
            Open your projects →
          </Link>
          <SignOutButton />
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded-full bg-oxblood px-6 py-3 text-base font-medium text-paper transition-colors hover:bg-oxblood-dark"
        >
          Sign in with Google
        </Link>
      )}

      <p className="text-sm text-muted">In early development · 2026</p>
    </main>
  );
}
