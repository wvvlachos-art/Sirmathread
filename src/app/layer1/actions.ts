"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Create an Ambition (a forward-looking to-do) for a project.
// Row-Level Security ensures you can only add to your own projects.
export async function createAmbition(
  projectId: string,
  title: string,
  targetDate: string,
  isDeadline = false
): Promise<{ error?: string }> {
  const clean = title.trim();
  if (!clean) return { error: "Title is required." };
  if (!targetDate) return { error: "Target date is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ambitions")
    .insert({ project_id: projectId, title: clean, target_date: targetDate, is_deadline: isDeadline });
  if (error) return { error: error.message };

  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
  return {};
}

export async function clearNodeDeadline(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("nodes")
    .update({ deadline: null, deadline_set_at: null, done: false })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return {};
}

export async function setNodeDone(id: string, done: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("nodes").update({ done }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return {};
}

// Create a manual project (no Gmail label behind it).
export async function createProject(
  name: string,
  startDate: string
): Promise<{ id?: string; error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Project name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      display_name: clean,
      origin: "manual",
      gmail_label_name: null,
      created_at: startDate ? `${startDate}T09:00:00Z` : undefined,
      last_activity_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/layer1");
  return { id: data.id };
}

// Add a manual node (square, dated, titled) to any project.
export async function createManualNode(
  projectId: string,
  title: string,
  date: string
): Promise<{ error?: string }> {
  const clean = title.trim();
  if (!clean) return { error: "Node title is required." };
  if (!date) return { error: "Date is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("nodes").insert({
    project_id: projectId,
    display_label: clean,
    node_date: `${date}T09:00:00Z`,
    origin: "manual",
    state: "promoted",
  });
  if (error) return { error: error.message };

  revalidatePath("/layer1");
  return {};
}

// ---- Tag management (categories + values) --------------------------------
export async function createCategory(name: string, sortOrder: number): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Category name is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { error } = await supabase.from("tag_categories").insert({
    user_id: user.id,
    name: clean,
    sort_order: sortOrder,
    is_default: false,
    is_hide_filter: false,
  });
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return {};
}

export async function renameCategory(id: string, name: string): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean) return { error: "Name is required." };
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").update({ name: clean }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return {};
}

export async function setCategoryHide(id: string, isHide: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").update({ is_hide_filter: isHide }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return {};
}

export async function deleteCategory(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  const { error } = await supabase
    .from("tag_values")
    .insert({ category_id: categoryId, value: clean, color });
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
  return {};
}

export async function deleteTagValue(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("tag_values").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
  return {};
}

// Toggle a tag on a node (add if absent, remove if present).
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
  const { error } = existing
    ? await supabase.from("node_tag_values").delete().eq("node_id", nodeId).eq("tag_value_id", valueId)
    : await supabase.from("node_tag_values").insert({ node_id: nodeId, tag_value_id: valueId });
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
  return {};
}

// Delete a single node (removes it from the canvas; any underlying email row
// stays in the cache untouched).
export async function deleteNode(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  revalidatePath("/layer1");
  return {};
}

// Permanently delete a project and everything under it (nodes, ambitions,
// cached emails, etc.) via database cascade. Gmail itself is never touched.
export async function deleteProject(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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
  const { data, error } = await supabase
    .from("notes")
    .insert({ project_id: projectId, node_id: nodeId, body, x, y })
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/layer1");
  return { id: data.id };
}

// Drag reposition — no revalidate (kept optimistic on the client for smoothness).
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
  revalidatePath("/layer1");
  return {};
}

export async function deleteNote(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/layer1");
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

  revalidatePath("/layer1");
  return {};
}
