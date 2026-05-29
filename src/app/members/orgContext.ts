// Shared (non-action) helper: figure out which workspace the user is currently
// "in". There's no workspace switcher yet (Phase 4), so for now we pick the org
// they OWN (their personal workspace), falling back to their first membership.
import type { SupabaseClient } from "@supabase/supabase-js";

export type OrgRole = "owner" | "member" | "viewer";

export type ActiveOrg = {
  id: string;
  name: string;
  role: OrgRole;
  memberLimit: number;
};

export async function getActiveOrg(
  supabase: SupabaseClient,
  userId: string
): Promise<ActiveOrg | null> {
  const { data, error } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations(name, member_limit)")
    .eq("user_id", userId);
  if (error || !data || data.length === 0) return null;

  // Prefer an org the user owns; otherwise the first one.
  const rows = data as unknown as {
    organization_id: string;
    role: OrgRole;
    organizations: { name: string; member_limit: number } | null;
  }[];
  const chosen = rows.find((r) => r.role === "owner") ?? rows[0];
  if (!chosen.organizations) return null;

  return {
    id: chosen.organization_id,
    name: chosen.organizations.name,
    role: chosen.role,
    memberLimit: chosen.organizations.member_limit,
  };
}
