"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Context bubbles. RLS already enforces owner/member to write and blocks
// viewers; these actions add the activity-log entries and resolve the
// workspace from the parent project.

export async function createBubble(
  projectId: string,
  nodeId: string,
  content: string,
  side: "above" | "below",
  nodeLabel: string,
  projectName: string
): Promise<{ id?: string; error?: string }> {
  const clean = content.trim();
  if (!clean) return { error: "Note can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const { data: proj } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  const orgId = (proj as { organization_id: string } | null)?.organization_id;
  if (!orgId) return { error: "Project not found." };

  const { data, error } = await supabase
    .from("bubbles")
    .insert({
      organization_id: orgId,
      project_id: projectId,
      node_id: nodeId,
      bubble_type: "context",
      source: "manual",
      content: clean,
      position_side: side,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await logActivity(supabase, {
    orgId,
    actorId: user.id,
    action: "bubble.created",
    targetType: "bubble",
    targetId: data.id,
    description: `Added a note to "${nodeLabel}" on "${projectName}"`,
  });
  return { id: data.id };
}

export async function updateBubble(id: string, content: string): Promise<{ error?: string }> {
  const clean = content.trim();
  if (!clean) return { error: "Note can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const { data: row } = await supabase
    .from("bubbles")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  const orgId = (row as { organization_id: string } | null)?.organization_id;

  const { error } = await supabase
    .from("bubbles")
    .update({ content: clean, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  if (orgId) {
    await logActivity(supabase, {
      orgId,
      actorId: user.id,
      action: "bubble.edited",
      targetType: "bubble",
      targetId: id,
      description: "Edited a context note",
    });
  }
  return {};
}

export async function deleteBubble(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const { data: row } = await supabase
    .from("bubbles")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  const orgId = (row as { organization_id: string } | null)?.organization_id;

  const { error } = await supabase.from("bubbles").delete().eq("id", id);
  if (error) return { error: error.message };

  if (orgId) {
    await logActivity(supabase, {
      orgId,
      actorId: user.id,
      action: "bubble.deleted",
      targetType: "bubble",
      targetId: id,
      description: "Deleted a context note",
    });
  }
  return {};
}
