import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SPINE_PALETTE } from "@/lib/theme";
import { TUTORIAL_PROJECTS, TUTORIAL_TAG_CATEGORIES } from "./tutorialContent";

const DAY_MS = 86_400_000;

// Seed 10 ad-agency demo projects (with nodes, ambitions, notes, and tag
// assignments) the first time a user logs in. Idempotent: gated by the
// `tutorial_seeded` flag on user_preferences, so deleting the demos doesn't
// bring them back next sign-in.
//
// Tag categories/values are looked up by name and only created if missing —
// safe for users who already have their own tags.
//
// All projects/nodes are stamped origin='tutorial' so the whole feature can be
// wiped later: DELETE FROM projects WHERE origin = 'tutorial';
//
// Failures are swallowed: a brand-new user shouldn't be blocked from reaching
// the app because the demo seed hit a snag. Errors are logged server-side.
export async function seedTutorialIfNeeded(userId: string): Promise<void> {
  try {
    const { data: pref, error: prefErr } = await supabaseAdmin
      .from("user_preferences")
      .select("tutorial_seeded")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefErr) {
      console.error("[seedTutorial] read preferences failed:", prefErr.message);
      return;
    }
    if (pref?.tutorial_seeded) return;

    // Build the tag value lookup: name (e.g. "Maya") -> tag_value_id.
    // Reuses any existing categories/values by name match.
    const tagValueIdByName = await ensureTagCatalog(userId);

    const now = Date.now();
    const isoAt = (dayOffset: number) =>
      new Date(now + dayOffset * DAY_MS).toISOString();

    for (let i = 0; i < TUTORIAL_PROJECTS.length; i++) {
      const tp = TUTORIAL_PROJECTS[i];
      const earliest = tp.nodes.reduce(
        (m, n) => (n.dayOffset < m ? n.dayOffset : m),
        tp.nodes[0]?.dayOffset ?? 0
      );
      const latest = tp.nodes.reduce(
        (m, n) => (n.dayOffset > m ? n.dayOffset : m),
        tp.nodes[0]?.dayOffset ?? 0
      );
      const spineColor = SPINE_PALETTE[i % SPINE_PALETTE.length];

      const { data: project, error: pErr } = await supabaseAdmin
        .from("projects")
        .insert({
          user_id: userId,
          display_name: tp.name,
          origin: "tutorial",
          gmail_label_name: null,
          spine_color: spineColor,
          spine_color_is_user_set: false,
          created_at: isoAt(earliest),
          updated_at: isoAt(latest),
          last_activity_at: isoAt(latest),
        })
        .select("id")
        .single();
      if (pErr || !project) {
        console.error("[seedTutorial] project insert failed:", pErr?.message);
        return;
      }

      // Project-level tags.
      if (tp.tags?.length) {
        const rows = tp.tags
          .map((name) => tagValueIdByName.get(name))
          .filter((id): id is string => !!id)
          .map((tag_value_id) => ({ project_id: project.id, tag_value_id }));
        if (rows.length) {
          const { error } = await supabaseAdmin.from("project_tag_values").insert(rows);
          if (error) console.error("[seedTutorial] project tags failed:", error.message);
        }
      }

      // Nodes (sorted oldest -> newest; position_index follows that order).
      const sortedNodes = [...tp.nodes].sort((a, b) => a.dayOffset - b.dayOffset);
      const nodeRows = sortedNodes.map((n, idx) => ({
        project_id: project.id,
        display_label: n.title,
        node_date: isoAt(n.dayOffset),
        origin: "tutorial",
        state: "promoted",
        position_index: idx,
      }));
      const { data: insertedNodes, error: nErr } = await supabaseAdmin
        .from("nodes")
        .insert(nodeRows)
        .select("id, node_date");
      if (nErr || !insertedNodes) {
        console.error("[seedTutorial] nodes insert failed:", nErr?.message);
        return;
      }

      // Per-node tags. insertedNodes is in insertion order (same as sortedNodes).
      const nodeTagRows: { node_id: string; tag_value_id: string }[] = [];
      sortedNodes.forEach((n, idx) => {
        if (!n.tags?.length) return;
        for (const name of n.tags) {
          const tag_value_id = tagValueIdByName.get(name);
          if (tag_value_id) nodeTagRows.push({ node_id: insertedNodes[idx].id, tag_value_id });
        }
      });
      if (nodeTagRows.length) {
        const { error } = await supabaseAdmin.from("node_tag_values").insert(nodeTagRows);
        if (error) console.error("[seedTutorial] node tags failed:", error.message);
      }

      // Ambitions.
      if (tp.ambitions?.length) {
        const ambRows = tp.ambitions.map((a) => ({
          project_id: project.id,
          title: a.title,
          target_date: isoAt(a.dayOffset).slice(0, 10),
          is_deadline: !!a.isDeadline,
        }));
        const { error } = await supabaseAdmin.from("ambitions").insert(ambRows);
        if (error) console.error("[seedTutorial] ambitions failed:", error.message);
      }

      // Tutorial note anchored to the latest node.
      if (tp.note) {
        const lastNode = insertedNodes.reduce((a, b) =>
          new Date(a.node_date).getTime() > new Date(b.node_date).getTime() ? a : b
        );
        const anchorT = new Date(lastNode.node_date).getTime();
        const { error: noteErr } = await supabaseAdmin.from("notes").insert({
          project_id: project.id,
          node_id: lastNode.id,
          body: tp.note.body,
          x: anchorT + tp.note.anchorDayOffset * DAY_MS,
          y: tp.note.yOffset,
        });
        if (noteErr) console.error("[seedTutorial] note insert failed:", noteErr.message);
      }
    }

    const { error: flagErr } = await supabaseAdmin
      .from("user_preferences")
      .update({ tutorial_seeded: true })
      .eq("user_id", userId);
    if (flagErr) {
      console.error("[seedTutorial] flag update failed:", flagErr.message);
    }
  } catch (e) {
    console.error("[seedTutorial] unexpected:", e);
  }
}

// Make sure every tag category/value in TUTORIAL_TAG_CATEGORIES exists for the
// user, reusing existing rows where names match. Returns a map of
// value-text -> tag_value_id so the caller can apply assignments by name.
async function ensureTagCatalog(userId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Pull existing categories so we can reuse by name match.
  const { data: existingCats } = await supabaseAdmin
    .from("tag_categories")
    .select("id, name, sort_order")
    .eq("user_id", userId);
  const catByName = new Map<string, { id: string; sort_order: number }>();
  let maxSort = -1;
  for (const c of (existingCats ?? []) as { id: string; name: string; sort_order: number }[]) {
    catByName.set(c.name, { id: c.id, sort_order: c.sort_order });
    if (c.sort_order > maxSort) maxSort = c.sort_order;
  }

  for (const cat of TUTORIAL_TAG_CATEGORIES) {
    let categoryId = catByName.get(cat.name)?.id;
    if (!categoryId) {
      maxSort += 1;
      const { data, error } = await supabaseAdmin
        .from("tag_categories")
        .insert({
          user_id: userId,
          name: cat.name,
          sort_order: maxSort,
          is_default: false,
          is_hide_filter: cat.isHide,
        })
        .select("id")
        .single();
      if (error || !data) {
        console.error("[seedTutorial] category insert failed:", error?.message);
        continue;
      }
      categoryId = data.id;
    }

    // Reuse existing values in this category by `value` text.
    const { data: existingVals } = await supabaseAdmin
      .from("tag_values")
      .select("id, value")
      .eq("category_id", categoryId);
    const valById = new Map<string, string>();
    for (const v of (existingVals ?? []) as { id: string; value: string }[]) {
      valById.set(v.value, v.id);
    }

    for (const v of cat.values) {
      let valueId = valById.get(v.value);
      if (!valueId) {
        const { data, error } = await supabaseAdmin
          .from("tag_values")
          .insert({ category_id: categoryId, value: v.value, color: v.color })
          .select("id")
          .single();
        if (error || !data) {
          console.error("[seedTutorial] value insert failed:", error?.message);
          continue;
        }
        valueId = data.id;
      }
      if (valueId) out.set(v.value, valueId);
    }
  }
  return out;
}
