"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Create an Ambition (a forward-looking to-do) for a project.
// Row-Level Security ensures you can only add to your own projects.
export async function createAmbition(
  projectId: string,
  title: string,
  targetDate: string
): Promise<{ error?: string }> {
  const clean = title.trim();
  if (!clean) return { error: "Title is required." };
  if (!targetDate) return { error: "Target date is required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("ambitions")
    .insert({ project_id: projectId, title: clean, target_date: targetDate });
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
