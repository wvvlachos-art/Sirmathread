"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  return (
    <button
      onClick={handleSignOut}
      className="rounded-full border border-hairline px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-paper-surface"
    >
      Sign out
    </button>
  );
}
