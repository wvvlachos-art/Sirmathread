// Single source of truth for "which workspace is the user currently in".
// The choice is persisted in a cookie; everything (the board, Members, Activity,
// and create actions) resolves the active workspace through here so they agree.
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_ORG_COOKIE = "sirma_active_org";

export type OrgRole = "owner" | "member" | "viewer";
export type MyOrg = { id: string; name: string; role: OrgRole; memberLimit: number };

// Every workspace the user belongs to.
export async function listMyOrgs(supabase: SupabaseClient, userId: string): Promise<MyOrg[]> {
  const { data } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations(name, member_limit)")
    .eq("user_id", userId);
  const rows = (data ?? []) as unknown as {
    organization_id: string;
    role: OrgRole;
    organizations: { name: string; member_limit: number } | null;
  }[];
  return rows
    .filter((r) => r.organizations)
    .map((r) => ({
      id: r.organization_id,
      name: r.organizations!.name,
      role: r.role,
      memberLimit: r.organizations!.member_limit,
    }));
}

// The active workspace: the cookie's choice if the user still belongs to it,
// otherwise the one they own, otherwise their first. Null if they're in none.
export async function resolveActiveOrg(supabase: SupabaseClient, userId: string): Promise<MyOrg | null> {
  const orgs = await listMyOrgs(supabase, userId);
  if (orgs.length === 0) return null;
  const cookieStore = await cookies();
  const wanted = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  return (
    (wanted ? orgs.find((o) => o.id === wanted) : undefined) ??
    orgs.find((o) => o.role === "owner") ??
    orgs[0]
  );
}
