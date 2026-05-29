import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "./orgContext";
import MembersClient, { type MemberRow, type InviteRow } from "./MembersClient";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getActiveOrg(supabase, user.id);
  if (!org) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-paper text-center text-ink">
        <p className="text-lg font-medium">No workspace found.</p>
        <p className="text-sm text-muted">Your account isn&apos;t a member of any workspace yet.</p>
        <a href="/layer1" className="mt-2 text-sm text-oxblood hover:underline">← Back to board</a>
      </main>
    );
  }

  // Who's in the workspace.
  const { data: memberRows } = await supabase
    .from("memberships")
    .select("user_id, role, joined_at")
    .eq("organization_id", org.id)
    .order("joined_at", { ascending: true });
  const rows = (memberRows ?? []) as { user_id: string; role: MemberRow["role"]; joined_at: string }[];

  // Their names/emails (RLS now lets you read co-members' profiles).
  const userIds = rows.map((r) => r.user_id);
  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, display_name, email")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
  const profById = new Map(
    ((profileRows ?? []) as { id: string; display_name: string | null; email: string | null }[]).map((p) => [p.id, p])
  );

  const members: MemberRow[] = rows.map((r) => {
    const p = profById.get(r.user_id);
    return {
      userId: r.user_id,
      displayName: p?.display_name ?? p?.email?.split("@")[0] ?? "Unknown",
      email: p?.email ?? "—",
      role: r.role,
      joinedAt: r.joined_at,
    };
  });

  // Outstanding invites.
  const { data: inviteRows } = await supabase
    .from("pending_invites")
    .select("email, role, expires_at, token")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false });
  const invites: InviteRow[] = (
    (inviteRows ?? []) as { email: string; role: "member" | "viewer"; expires_at: string; token: string }[]
  ).map((i) => ({ email: i.email, role: i.role, expiresAt: i.expires_at, token: i.token }));

  return (
    <main className="min-h-screen bg-paper">
      <MembersClient
        orgId={org.id}
        orgName={org.name}
        isOwner={org.role === "owner"}
        currentUserId={user.id}
        members={members}
        invites={invites}
        memberLimit={org.memberLimit}
      />
    </main>
  );
}
