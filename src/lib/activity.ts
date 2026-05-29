import type { SupabaseClient } from "@supabase/supabase-js";

// Write one row to the immutable activity log. Best-effort: a logging failure
// must never break the action that triggered it, so errors are swallowed (the
// RLS policy already guarantees a member can only log under their own identity).
export async function logActivity(
  supabase: SupabaseClient,
  entry: {
    orgId: string;
    actorId: string;
    action: string; // e.g. 'project.created', 'member.invited'
    targetType?: string;
    targetId?: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("activity_log").insert({
      organization_id: entry.orgId,
      actor_user_id: entry.actorId,
      action_type: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      description: entry.description,
      metadata: entry.metadata ?? null,
    });
    if (error) console.error("[logActivity] insert failed:", error.message);
  } catch (e) {
    console.error("[logActivity] unexpected:", e);
  }
}
