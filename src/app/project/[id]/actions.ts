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
  projectName: string,
  bubbleType: "context" | "information" = "context"
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
      bubble_type: bubbleType,
      // Legacy `kind` column is still NOT NULL from the original schema; its own
      // constraint only allows context/insight/note, so keep it 'context' for
      // every bubble (it's unused for display — bubble_type is the real type).
      kind: "context",
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

// ---- Layer 2 node editing -------------------------------------------------
// All editing happens in Layer 2; Layer 1 reflects the result. These resolve
// the workspace from the node's parent project, then rely on RLS to block
// viewers, and log to the activity feed. Spine nodes are `state='promoted'`;
// Layer 1 only renders promoted nodes, so demote/promote there is a simple
// state flip (the node keeps its email, tags, deadline — nothing is destroyed).

const NODE_TYPES = ["email", "decision", "meeting", "call", "payment", "task", "milestone"] as const;
type NodeType = (typeof NODE_TYPES)[number];

async function orgOfNode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  nodeId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("nodes")
    .select("projects(organization_id)")
    .eq("id", nodeId)
    .maybeSingle();
  const proj = (data as { projects: { organization_id: string } | null } | null)?.projects;
  return proj?.organization_id ?? null;
}

// Rename a node. Writes the Sirmathread-only `display_label` override; the
// underlying Gmail subject is untouched. The new label propagates to Layer 1.
export async function renameNode(nodeId: string, label: string): Promise<{ error?: string }> {
  const clean = label.trim();
  if (!clean) return { error: "Title can't be empty." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const orgId = await orgOfNode(supabase, nodeId);
  const { error } = await supabase.from("nodes").update({ display_label: clean }).eq("id", nodeId);
  if (error) return { error: error.message };

  if (orgId) {
    await logActivity(supabase, {
      orgId,
      actorId: user.id,
      action: "node.renamed",
      targetType: "node",
      targetId: nodeId,
      description: `Renamed a node to "${clean}"`,
    });
  }
  return {};
}

// Demote a spine node off Layer 1 (it becomes a branching bubble in Layer 2),
// or promote it back onto the spine. Reversible; nothing is deleted.
export async function setNodeState(nodeId: string, state: "promoted" | "demoted"): Promise<{ error?: string }> {
  if (state !== "promoted" && state !== "demoted") return { error: "Invalid state." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const orgId = await orgOfNode(supabase, nodeId);
  const { error } = await supabase.from("nodes").update({ state }).eq("id", nodeId);
  if (error) return { error: error.message };

  if (orgId) {
    await logActivity(supabase, {
      orgId,
      actorId: user.id,
      action: state === "demoted" ? "node.demoted" : "node.promoted",
      targetType: "node",
      targetId: nodeId,
      description: state === "demoted" ? "Demoted a node off the overview" : "Promoted a node back to the overview",
    });
  }
  return {};
}

// Persist a dragged main-node position on the Layer 2 canvas (absolute coords).
// Columns added by supabase/node-position.sql; a missing-column error is
// swallowed so dragging is a no-op (in-session only) until the migration runs.
export async function updateNodePosition(nodeId: string, x: number, y: number): Promise<{ error?: string }> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Invalid position." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { error } = await supabase.from("nodes").update({ l2_x: x, l2_y: y }).eq("id", nodeId);
  if (error) return isMissingColumn(error) ? {} : { error: error.message };
  return {};
}

// Persist a resized main-node (square; single px size) on the Layer 2 canvas.
// Column added by supabase/node-size.sql; a missing-column error is swallowed so
// resizing is an in-session no-op until the migration runs. Layer-2-only.
export async function updateNodeSize(nodeId: string, w: number): Promise<{ error?: string }> {
  if (!Number.isFinite(w)) return { error: "Invalid size." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { error } = await supabase.from("nodes").update({ l2_w: Math.round(w) }).eq("id", nodeId);
  if (error) return isMissingColumn(error) ? {} : { error: error.message };
  return {};
}

// Set or clear a node's optional type icon (null = blank).
export async function setNodeType(nodeId: string, type: NodeType | null): Promise<{ error?: string }> {
  if (type !== null && !NODE_TYPES.includes(type)) return { error: "Unknown node type." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };

  const { error } = await supabase.from("nodes").update({ node_type: type }).eq("id", nodeId);
  if (error) return { error: error.message };
  return {};
}

// True when a write failed because the column hasn't been added yet (migration
// pending). PostgREST reports a schema-cache miss as PGRST204 on writes; the
// underlying Postgres code is 42703. Treat both as "ignore, not yet migrated".
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST204" || error.code === "42703" || /could not find|does not exist/i.test(error.message ?? "");
}

// Title + shape live in columns added by supabase/bubble-style.sql. Kept SEPARATE
// from updateBubble (content) so content edits keep working before that migration
// runs; a missing-column error here (42703) is swallowed rather than surfaced.
export async function updateBubbleMeta(
  id: string,
  fields: { title?: string | null; shape?: string | null; bubbleType?: "context" | "information" }
): Promise<{ error?: string }> {
  const patch: { title?: string | null; shape?: string | null; bubble_type?: string; updated_at?: string } = {};
  if (fields.title !== undefined) patch.title = fields.title ? fields.title.trim() || null : null;
  if (fields.shape !== undefined) patch.shape = fields.shape ?? null;
  if (fields.bubbleType !== undefined) patch.bubble_type = fields.bubbleType;
  if (Object.keys(patch).length === 0) return {};
  patch.updated_at = new Date().toISOString();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { error } = await supabase.from("bubbles").update(patch).eq("id", id);
  if (error) return isMissingColumn(error) ? {} : { error: error.message }; // missing column = migration pending
  return {};
}

// Persist a resized sub-node (width/height in px). Same migration as meta; a
// missing-column error is swallowed. Fire-and-forget; no activity log.
export async function updateBubbleSize(id: string, width: number, height: number): Promise<{ error?: string }> {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return { error: "Invalid size." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { error } = await supabase
    .from("bubbles")
    .update({ width: Math.round(width), height: Math.round(height), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return isMissingColumn(error) ? {} : { error: error.message };
  return {};
}

// Persist a bubble's dragged position. x/y are stored as an OFFSET from the
// parent node centre (legacy x/y columns, previously unused). RLS blocks
// viewers; no activity-log entry (position nudges are noise).
export async function updateBubblePosition(id: string, x: number, y: number): Promise<{ error?: string }> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: "Invalid position." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're not signed in." };
  const { error } = await supabase
    .from("bubbles")
    .update({ x, y, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
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
