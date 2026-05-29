"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptInviteAction } from "../members/actions";

type Invite = { orgName: string; role: string; email: string; expired: boolean } | null;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-paper px-6 text-center text-ink">
      <h1 className="brand-serif text-3xl text-oxblood">Sirmathread</h1>
      <div className="max-w-md">{children}</div>
    </main>
  );
}

export default function AcceptClient({
  token,
  signedIn,
  userEmail,
  invite,
}: {
  token: string;
  signedIn: boolean;
  userEmail: string | null;
  invite: Invite;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Come straight back to this invite page after Google sign-in.
      options: { redirectTo: window.location.href },
    });
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    const res = await acceptInviteAction(token);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.push("/layer1");
  };

  const primaryBtn =
    "rounded-full bg-oxblood px-6 py-3 text-base font-medium text-paper transition-colors hover:bg-oxblood-dark disabled:opacity-60";
  const ghostBtn =
    "rounded-full border border-hairline px-6 py-3 text-base font-medium text-ink transition-colors hover:bg-paper-surface";

  if (!invite) {
    return (
      <Shell>
        <p className="text-lg font-medium">This invite link is invalid or has already been used.</p>
        <p className="mt-1 text-sm text-muted">Ask the workspace owner to send you a fresh link.</p>
      </Shell>
    );
  }

  if (invite.expired) {
    return (
      <Shell>
        <p className="text-lg font-medium">This invite has expired.</p>
        <p className="mt-1 text-sm text-muted">
          Ask the owner of <strong>{invite.orgName}</strong> to send a new invite.
        </p>
      </Shell>
    );
  }

  const emailMismatch = signedIn && userEmail && userEmail.toLowerCase() !== invite.email.toLowerCase();

  return (
    <Shell>
      <p className="text-lg">
        You&apos;ve been invited to join <strong>{invite.orgName}</strong> as a{" "}
        <strong>{invite.role}</strong>.
      </p>

      {!signedIn && (
        <>
          <p className="mt-1 text-sm text-muted">
            Sign in with <strong>{invite.email}</strong> to accept.
          </p>
          <button onClick={signIn} className={`${primaryBtn} mt-4`}>
            Continue with Google
          </button>
        </>
      )}

      {emailMismatch && (
        <>
          <p className="mt-2 text-sm text-oxblood">
            You&apos;re signed in as {userEmail}, but this invite is for {invite.email}.
          </p>
          <button onClick={signIn} className={`${ghostBtn} mt-4`}>
            Switch Google account
          </button>
        </>
      )}

      {signedIn && !emailMismatch && (
        <>
          <button onClick={join} disabled={busy} className={`${primaryBtn} mt-4`}>
            {busy ? "Joining…" : "Join workspace"}
          </button>
          {error && <p className="mt-3 text-sm text-oxblood">{error}</p>}
        </>
      )}
    </Shell>
  );
}
