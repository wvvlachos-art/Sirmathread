"use server";

import { createClient } from "@/lib/supabase/server";
import { SPINE_PALETTE } from "@/lib/theme";
import { logActivity } from "@/lib/activity";
import { resolveActiveOrg } from "@/lib/activeOrg";

// NOTE on revalidatePath: Layer 1 used to call revalidatePath("/layer1") after
// every mutation, which re-ran the giant Supabase query and re-rendered the
// whole canvas. Now the client applies all updates optimistically and these
// actions just persist the change. The screens that need a fresh server-side
// snapshot (NewProjectButton creating a new lane, ManageTags rebuilding the
// category catalog) call router.refresh() themselves.

// ---- Workspace (organization) helpers --------------------------------------
// New content must carry the workspace it belongs to (organization_id became
// required in the multi-user migration). Top-level items (projects, tag
// categories) go in the user's current workspace; child items inherit their
// parent's workspace, so they stay correct even for shared projects.
async function activeOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  // Honours the workspace switcher (cookie-backed) so new top-level items land
  // in whichever workspace the user is currently viewing.
  const org = await resolveActiveOrg(supabase, userId);
  return org?.id ?? null;
}

async function orgOfProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase.from("projects").select("organization_id").eq("id", projectId).single();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

async function orgOfCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string
): Promise<string | null> {
  const { data } = await supabase.from("tag_categories").select("organization_id").eq("id", categoryId).single();
  return (data as { organization_id: string } | null)?.organization_id ?? null;
}

// Create an Ambition (a forward-looking to-do) for a project.
// Row-Level Security ensures you can only add to your own projects.
export async function createAmbition(
  projectId: string,
  title: string,
  targetDate: string,
  isDeadline = false
): Promise<{ id?: string; error?: string }> {
  const clean = title.trim();
  if (!clean) return { error: "Title is required." };
  if (!targetDate) return { error: "Target date is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const orgId = await orgOfProject(supabase, projectId);
  if (!orgId) return { error: "Project not found." };
  const { data, error } = await supabase
    .from("ambitions")
    .insert({
      project_id: projectId,
      title: clean,
      target_date: targetDate,
      is_deadline: isDeadline,
      organization_id: orgId,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logActivity(supabase, {
    orgId,
    actorId: user.id,
    action: "ambition.created",
    targetType: "ambition",
    targetId: data.id,
    description: `Added ambition "${clean}"`,
  });
  return { id: data.id };
}

// Edit a node's title and/or date. Date is "YYYY-MM-DD"; stored at 09:00 UTC.
// (For Gmail-sourced nodes the timeline position follows the email date, so the
// caller only offers date editing for manual nodes.)
export async function updateNode(
  id: string,
  fields: { label?: string; date?: string }
): Promise<{ error?: string }> {
  const patch: { display_label?: string; node_date?: string } = {};
  if (fields.label !== undefined) {
    const clean = fields.label.trim();
    if (!clean) return { error: "Title is required." };
    patch.display_label = clean;
  }
  if (fields.date !== undefined) {
    if (!fields.date) return { error: "Date is required." };
    patch.node_date = `${fields.date}T09:00:00Z`;
  }
  if (Object.keys(patch).length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.from("nodes").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Edit an ambition's title, target date, and/or deadline flag.
export async function updateAmbition(
  id: string,
  fields: { title?: string; targetDate?: string; isDeadline?: boolean }
): Promise<{ error?: string }> {
  const patch: { title?: string; target_date?: string; is_deadline?: boolean } = {};
  if (fields.title !== undefined) {
    const clean = fields.title.trim();
    if (!clean) return { error: "Title is required." };
    patch.title = clean;
  }
  if (fields.targetDate !== undefined) {
    if (!fields.targetDate) return { error: "Date is required." };
    patch.target_date = fields.targetDate;
  }
  if (fields.isDeadline !== undefined) patch.is_deadline = fields.isDeadline;
  if (Object.keys(patch).length === 0) return {};
  const supabase = await createClient();
  const { error } = await supabase.from("ambitions").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteAmbition(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ambitions").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Set / clear a node's deadline; the countdown runs from now → the date.
export async function setNodeDeadline(id: string, date: string): Promise<{ error?: string }> {
  if (!date) return { error: "Date is required." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("nodes")
    .update({ deadline: date, deadline_set_at: new Date().toISOString(), done: false })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function clearNodeDeadline(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("nodes")
    .update({ deadline: null, deadline_set_at: null, done: false })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function setNodeDone(id: string, done: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("nodes").update({ done }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Create a manual project (no Gmail label behind it). Assigns the next
// spine_color slot by cycling the palette in this user's creation order.
export async function createProject(
  name: string,
  startDate: string
): Promise<{ id?: string; spineColor?: string; error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Project name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // Pick the next palette slot. `count` includes archived/trash projects so
  // numbering stays stable even when projects come and go.
  const { count } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const spineColor = SPINE_PALETTE[((count ?? 0) % SPINE_PALETTE.length)];

  const orgId = await activeOrgId(supabase, user.id);
  if (!orgId) return { error: "No workspace found for your account." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      organization_id: orgId,
      created_by_user_id: user.id,
      display_name: clean,
      origin: "manual",
      gmail_label_name: null,
      created_at: startDate ? `${startDate}T09:00:00Z` : undefined,
      last_activity_at: new Date().toISOString(),
      spine_color: spineColor,
      spine_color_is_user_set: false,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logActivity(supabase, {
    orgId,
    actorId: user.id,
    action: "project.created",
    targetType: "project",
    targetId: data.id,
    description: `Created project "${clean}"`,
  });
  return { id: data.id, spineColor };
}

// Override (or reset) a project's spine_color. Passing null resets to the
// auto-assigned palette slot — we recompute from current project count.
export async function setProjectSpineColor(
  projectId: string,
  color: string | null
): Promise<{ color?: string; error?: string }> {
  const supabase = await createClient();
  if (color === null) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Not signed in." };
    // Re-pick a palette slot based on this project's position in the user's
    // creation order — keeps the auto-assign rule consistent on reset.
    const { data: row } = await supabase
      .from("projects")
      .select("created_at")
      .eq("id", projectId)
      .single();
    const createdAt = row?.created_at ?? new Date().toISOString();
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("created_at", createdAt);
    const slot = Math.max(0, (count ?? 1) - 1) % SPINE_PALETTE.length;
    const picked = SPINE_PALETTE[slot];
    const { error } = await supabase
      .from("projects")
      .update({ spine_color: picked, spine_color_is_user_set: false })
      .eq("id", projectId);
    if (error) return { error: error.message };
    return { color: picked };
  } else {
    const { error } = await supabase
      .from("projects")
      .update({ spine_color: color, spine_color_is_user_set: true })
      .eq("id", projectId);
    if (error) return { error: error.message };
    return { color };
  }
}

// Add a manual node (square, dated, titled) to any project.
export async function createManualNode(
  projectId: string,
  title: string,
  date: string
): Promise<{ id?: string; error?: string }> {
  const clean = title.trim();
  if (!clean) return { error: "Node title is required." };
  if (!date) return { error: "Date is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const orgId = await orgOfProject(supabase, projectId);
  if (!orgId) return { error: "Project not found." };
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      project_id: projectId,
      display_label: clean,
      node_date: `${date}T09:00:00Z`,
      origin: "manual",
      state: "promoted",
      organization_id: orgId,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await logActivity(supabase, {
    orgId,
    actorId: user.id,
    action: "node.created",
    targetType: "node",
    targetId: data.id,
    description: `Added node "${clean}"`,
  });
  return { id: data.id };
}

// ---- Tag management (categories + values) --------------------------------
// These run inside the ManageTags modal, which calls router.refresh() itself
// after closing — so the catalog reloads in one shot rather than on every
// keystroke. No revalidatePath needed here either.
export async function createCategory(name: string, sortOrder: number): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Category name is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const orgId = await activeOrgId(supabase, user.id);
  if (!orgId) return { error: "No workspace found for your account." };
  const { error } = await supabase.from("tag_categories").insert({
    user_id: user.id,
    organization_id: orgId,
    created_by_user_id: user.id,
    name: clean,
    sort_order: sortOrder,
    is_default: false,
    is_hide_filter: false,
  });
  if (error) return { error: error.message };
  return {};
}

export async function renameCategory(id: string, name: string): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").update({ name: clean }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function setCategoryHide(id: string, isHide: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").update({ is_hide_filter: isHide }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function createTagValue(
  categoryId: string,
  value: string,
  color: string
): Promise<{ error?: string }> {
  const clean = value.trim();
  if (!clean) return { error: "Value is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const orgId = await orgOfCategory(supabase, categoryId);
  if (!orgId) return { error: "Category not found." };
  const { error } = await supabase
    .from("tag_values")
    .insert({
      category_id: categoryId,
      value: clean,
      color,
      organization_id: orgId,
      created_by_user_id: user.id,
    });
  if (error) return { error: error.message };
  return {};
}

export async function updateTagValue(
  id: string,
  fields: { value?: string; color?: string }
): Promise<{ error?: string }> {
  const patch: { value?: string; color?: string } = {};
  if (fields.value !== undefined) {
    const clean = fields.value.trim();
    if (!clean) return { error: "Value is required." };
    patch.value = clean;
  }
  if (fields.color !== undefined) patch.color = fields.color;
  const supabase = await createClient();
  const { error } = await supabase.from("tag_values").update(patch).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteTagValue(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_values").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Toggle a tag on a project (add if absent, remove if present).
export async function toggleProjectTag(
  projectId: string,
  valueId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_tag_values")
    .select("tag_value_id")
    .eq("project_id", projectId)
    .eq("tag_value_id", valueId)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from("project_tag_values")
        .delete()
        .eq("project_id", projectId)
        .eq("tag_value_id", valueId)
    : await supabase.from("project_tag_values").insert({ project_id: projectId, tag_value_id: valueId });
  if (error) return { error: error.message };
  return {};
}

// Toggle a tag on a node (add if absent, remove if present). New tags land at
// the end of the order (max position + 1); position 0 = primary (drives the
// node fill on Layer 1). Removing a tag leaves a gap in positions — fine,
// since order is only used for sorting, not as a contiguous index.
export async function toggleNodeTag(
  nodeId: string,
  valueId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("node_tag_values")
    .select("tag_value_id")
    .eq("node_id", nodeId)
    .eq("tag_value_id", valueId)
    .maybeSingle();
  if (existing) {
    const { error } = await supabase
      .from("node_tag_values")
      .delete()
      .eq("node_id", nodeId)
      .eq("tag_value_id", valueId);
    if (error) return { error: error.message };
    return {};
  }
  const { data: rows } = await supabase
    .from("node_tag_values")
    .select("position")
    .eq("node_id", nodeId);
  const nextPos =
    rows && rows.length
      ? Math.max(...rows.map((r: { position: number }) => r.position)) + 1
      : 0;
  const { error } = await supabase
    .from("node_tag_values")
    .insert({ node_id: nodeId, tag_value_id: valueId, position: nextPos });
  if (error) return { error: error.message };
  return {};
}

// Toggle a tag on an ambition (add if absent, remove if present).
export async function toggleAmbitionTag(
  ambitionId: string,
  valueId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ambition_tag_values")
    .select("tag_value_id")
    .eq("ambition_id", ambitionId)
    .eq("tag_value_id", valueId)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from("ambition_tag_values").delete().eq("ambition_id", ambitionId).eq("tag_value_id", valueId)
    : await supabase.from("ambition_tag_values").insert({ ambition_id: ambitionId, tag_value_id: valueId });
  if (error) return { error: error.message };
  return {};
}

// Set (or clear, with null) a project's colour. Null falls back to the
// origin colour (green for Gmail, blue for manual).
export async function setProjectColor(
  projectId: string,
  color: string | null
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ color }).eq("id", projectId);
  if (error) return { error: error.message };
  return {};
}

// Delete a single node (removes it from the canvas; any underlying email row
// stays in the cache untouched).
export async function deleteNode(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Archive a project (hidden from Layer 1 by default; fully reversible).
export async function archiveProject(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({
      state: "archived",
      archived_reason: "user",
      state_changed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Permanently delete a project and everything under it (nodes, ambitions,
// cached emails, etc.) via database cascade. Gmail itself is never touched.
export async function deleteProject(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// ---- Notes (Layer 1, draggable, user-written) ----------------------------
export async function createNote(
  projectId: string,
  nodeId: string | null,
  body: string,
  x: number,
  y: number
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const orgId = await orgOfProject(supabase, projectId);
  if (!orgId) return { error: "Project not found." };
  const { data, error } = await supabase
    .from("notes")
    .insert({
      project_id: projectId,
      node_id: nodeId,
      body,
      x,
      y,
      organization_id: orgId,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Drag reposition — kept optimistic on the client for smoothness.
export async function updateNotePosition(id: string, x: number, y: number): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").update({ x, y }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function updateNoteBody(id: string, body: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").update({ body }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}

export async function deleteNote(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return { error: error.message };
  return {};
}

// Mark an Ambition done / not-done.
export async function toggleAmbition(
  id: string,
  done: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("ambitions").update({ done }).eq("id", id);
  if (error) return { error: error.message };
  return {};
}
