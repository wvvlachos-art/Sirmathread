import type { SupabaseClient } from "@supabase/supabase-js";
import { SPINE_PALETTE } from "@/lib/theme";
import { resolveTags } from "./resolveTags";

// Ensure every detected tag string exists as a tag_value in the workspace, then
// return a lower(name) → tag_value_id map. Reuses the workspace's EXISTING values
// (case-insensitive) and auto-creates genuinely new ones under a single
// "Auto-detected" category (colours cycled from SPINE_PALETTE). The CALLER links
// the ids to projects/nodes/ambitions (the generate_ai_project RPC does this
// atomically). Runs on the signed-in writer's RLS-scoped client.
//
// NEVER throws — tag persistence is best-effort polish on top of generation, so a
// failure here must not fail (or refund) the generation. On any error it returns
// whatever it managed to resolve (possibly an empty map).

const AUTO_CATEGORY = "Auto-detected";

export async function ensureTagValueIds(
  supabase: SupabaseClient,
  opts: { orgId: string; userId: string; tags: string[] }
): Promise<Map<string, string>> {
  const map = new Map<string, string>(); // lower(name) → tag_value id
  try {
    const detected = (opts.tags ?? []).filter((t) => typeof t === "string" && t.trim());
    if (detected.length === 0) return map;

    const { data: existing, error: exErr } = await supabase
      .from("tag_values")
      .select("id, value")
      .eq("organization_id", opts.orgId);
    if (exErr) return map;

    const { toCreate, matched } = resolveTags(detected, existing ?? []);
    for (const [k, id] of matched) map.set(k, id);

    if (toCreate.length > 0) {
      const categoryId = await findOrCreateAutoCategory(supabase, opts.orgId, opts.userId);
      if (categoryId) {
        const rows = toCreate.map((value, i) => ({
          category_id: categoryId,
          organization_id: opts.orgId,
          created_by_user_id: opts.userId,
          value,
          color: SPINE_PALETTE[i % SPINE_PALETTE.length],
        }));
        const { data: ins } = await supabase.from("tag_values").insert(rows).select("id, value");
        for (const r of (ins ?? []) as { id: string; value: string }[]) {
          map.set(r.value.trim().toLowerCase(), r.id);
        }
      }
    }
    return map;
  } catch {
    return map;
  }
}

// Find the workspace's "Auto-detected" category (case-insensitive) or create it,
// placed after the user's existing categories. Returns null on failure.
async function findOrCreateAutoCategory(
  supabase: SupabaseClient,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data: found } = await supabase
    .from("tag_categories")
    .select("id")
    .eq("organization_id", orgId)
    .ilike("name", AUTO_CATEGORY)
    .limit(1)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data: maxRow } = await supabase
    .from("tag_categories")
    .select("sort_order")
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((maxRow?.sort_order as number | undefined) ?? 0) + 1;

  const { data: created, error } = await supabase
    .from("tag_categories")
    .insert({
      user_id: userId,
      organization_id: orgId,
      created_by_user_id: userId,
      name: AUTO_CATEGORY,
      sort_order: sortOrder,
      is_default: false,
      is_hide_filter: false,
    })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id as string;
}
