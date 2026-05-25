import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-center">
      <h1 className="text-5xl font-semibold tracking-tight text-zinc-50 sm:text-6xl">
        Sirmathread
      </h1>
      <p className="max-w-xl text-lg leading-8 text-zinc-400">
        Turn labeled Gmail threads into navigable project flowcharts.
      </p>

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-zinc-400">
            Signed in as <span className="text-zinc-200">{user.email}</span>
          </p>
          <Link
            href="/layer1"
            className="rounded-full bg-zinc-50 px-6 py-3 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            Open your projects →
          </Link>
          <SignOutButton />
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded-full bg-zinc-50 px-6 py-3 text-base font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          Sign in with Google
        </Link>
      )}

      <p className="text-sm text-zinc-600">In early development · 2026</p>
    </main>
  );
}
