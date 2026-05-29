import { createClient } from "@/lib/supabase/server";
import AcceptClient from "./AcceptClient";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-paper text-center text-ink">
        <h1 className="brand-serif text-3xl text-oxblood">Sirmathread</h1>
        <p className="mt-2 text-lg font-medium">This invite link is missing its token.</p>
      </main>
    );
  }

  // peek_invite is a SECURITY DEFINER function, so it can read the invite even
  // though the invitee isn't a member yet.
  const { data: peekData } = await supabase.rpc("peek_invite", { invite_token: token });
  const peek = (Array.isArray(peekData) ? peekData[0] : peekData) as
    | { organization_name: string; role: string; invite_email: string; expired: boolean }
    | undefined;

  return (
    <AcceptClient
      token={token}
      signedIn={!!user}
      userEmail={user?.email ?? null}
      invite={
        peek
          ? { orgName: peek.organization_name, role: peek.role, email: peek.invite_email, expired: peek.expired }
          : null
      }
    />
  );
}
