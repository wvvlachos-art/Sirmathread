"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { randomBytes } from "node:crypto";

// All actions follow the existing convention: return { error } on failure
// rather than throwing, and let the client refresh the page on success.

type Role = "member" | "viewer";

// Confirm the caller is the OWNER of the given org. Returns the user id, or an
// error message to bubble up.
async function requireOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<{ userId?: string; error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { data: me } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (me?.role !== "owner") return { error: "Only the workspace owner can do that." };
  return { userId: user.id };
}

// Invite someone by email. Creates (or refreshes) a pending invite and returns
// a copy-able accept link. Enforces the per-org member cap (members + pending).
export async function inviteMember(
  orgId: string,
  email: string,
  role: Role
): Promise<{ link?: string; error?: string }> {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { error: "Enter a valid email address." };
  if (role !== "member" && role !== "viewer") return { error: "Pick a role." };

  const supabase = await createClient();
  const { userId, error: ownerErr } = await requireOwner(supabase, orgId);
  if (ownerErr || !userId) return { error: ownerErr };

  const [{ count: memberCount }, { count: pendingCount }, { data: org }] = await Promise.all([
    supabase.from("memberships").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("pending_invites").select("*", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("organizations").select("member_limit").eq("id", orgId).single(),
  ]);
  const limit = org?.member_limit ?? 5;
  if ((memberCount ?? 0) + (pendingCount ?? 0) >= limit) {
    return {
      error: `This workspace has reached its ${limit}-member limit. Remove someone (or raise the limit) before inviting more.`,
    };
  }

  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("pending_invites").upsert(
    {
      organization_id: orgId,
      email: clean,
      role,
      invited_by_user_id: userId,
      token,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    { onConflict: "organization_id,email" }
  );
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    organization_id: orgId,
    actor_user_id: userId,
    action_type: "member.invited",
    target_type: "membership",
    description: `Invited ${clean} as ${role}`,
  });

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return { link: `${proto}://${host}/accept-invite?token=${token}` };
}

// Cancel a pending invite (owner only).
export async function cancelInvite(orgId: string, email: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error: ownerErr } = await requireOwner(supabase, orgId);
  if (ownerErr) return { error: ownerErr };
  const { error } = await supabase
    .from("pending_invites")
    .delete()
    .eq("organization_id", orgId)
    .eq("email", email.trim().toLowerCase());
  return error ? { error: error.message } : {};
}

// Remove a member (owner only; can't remove yourself).
export async function removeMember(orgId: string, userId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { userId: meId, error: ownerErr } = await requireOwner(supabase, orgId);
  if (ownerErr || !meId) return { error: ownerErr };
  if (userId === meId) return { error: "You can't remove yourself." };

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    organization_id: orgId,
    actor_user_id: meId,
    action_type: "member.removed",
    target_type: "membership",
    target_id: userId,
    description: "Removed a member",
  });
  return {};
}

// Change a member's role (owner only; can't change your own).
export async function changeRole(
  orgId: string,
  userId: string,
  role: "owner" | "member" | "viewer"
): Promise<{ error?: string }> {
  if (!["owner", "member", "viewer"].includes(role)) return { error: "Invalid role." };
  const supabase = await createClient();
  const { userId: meId, error: ownerErr } = await requireOwner(supabase, orgId);
  if (ownerErr || !meId) return { error: ownerErr };
  if (userId === meId) return { error: "You can't change your own role." };

  const { error } = await supabase
    .from("memberships")
    .update({ role })
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    organization_id: orgId,
    actor_user_id: meId,
    action_type: "member.role_changed",
    target_type: "membership",
    target_id: userId,
    description: `Changed a member's role to ${role}`,
  });
  return {};
}

// Accept an invite by token (called from the accept-invite page). Delegates to
// the SECURITY DEFINER db function so RLS + cap + email-match are enforced.
export async function acceptInviteAction(
  token: string
): Promise<{ ok?: boolean; orgId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { invite_token: token });
  if (error) return { error: error.message };
  const res = data as { ok?: boolean; organization_id?: string; error?: string };
  if (res?.error) return { error: res.error };
  return { ok: true, orgId: res?.organization_id };
}
