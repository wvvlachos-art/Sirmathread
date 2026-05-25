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
