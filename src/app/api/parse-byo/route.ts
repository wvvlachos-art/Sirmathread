import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveActiveOrg } from "@/lib/activeOrg";
import { SPINE_PALETTE } from "@/lib/theme";
import { parseByo } from "@/lib/byo/parser";
import { ensureTagValueIds } from "@/lib/tags/ensureTagValueIds";
import { resolveTags, tagIdsFor } from "@/lib/tags/resolveTags";

// POST /api/parse-byo — BYO LLM path. Receives the raw output the user got from
// their own LLM (formatted via byo-template.txt), parses it MECHANICALLY (no AI
// on our side), and persists project + nodes + Information/Context subnodes
// (source='byo') in a single transaction. FREE — does not touch the import quota.

const MAX_INPUT = 200_000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const rawText = typeof (body as { rawText?: unknown })?.rawText === "string" ? (body as { rawText: string }).rawText : "";
  // Two-phase tag flow: `preview` reports which detected tags are new (so the
  // client can let the user approve them); the commit pass passes back the
  // approved subset in `approvedNewTags`.
  const preview = (body as { preview?: unknown })?.preview === true;
  const approvedNewTags = Array.isArray((body as { approvedNewTags?: unknown })?.approvedNewTags)
    ? ((body as { approvedNewTags: unknown[] }).approvedNewTags.filter((t): t is string => typeof t === "string"))
    : [];

  // 1. validate
  if (!rawText.trim()) {
    return NextResponse.json({ error: "Paste your LLM output to parse." }, { status: 400 });
  }
  if (rawText.length > MAX_INPUT) {
    return NextResponse.json({ error: "That's too long — keep it under 200,000 characters." }, { status: 400 });
  }

  // auth + workspace (BYO creates a project, so still requires a signed-in writer)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You're not signed in." }, { status: 401 });
  }
  const org = await resolveActiveOrg(supabase, user.id);
  if (!org) {
    return NextResponse.json({ error: "No workspace found for your account." }, { status: 403 });
  }
  if (org.role === "viewer") {
    return NextResponse.json({ error: "Viewers can't create projects in this workspace." }, { status: 403 });
  }

  // 2. parse (mechanical)
  const { project, events, skippedCount, truncatedCount } = parseByo(rawText);

  // 3. nothing usable found — never create an empty project, even when a PROJECT
  //    header was present but no event blocks parsed.
  if (events.length === 0) {
    return NextResponse.json(
      { error: "No dated events found. Verify your LLM output uses the DATE/TITLE format shown in the template." },
      { status: 422 }
    );
  }

  // 3b. Detect which tags don't exist in the workspace yet. The LLM tags each
  //     node with a subset of project tags, so consider the UNION of project +
  //     node tags. resolveTags is pure (no I/O); existingTagRows is reused below.
  const allTags = [...project.tags, ...events.flatMap((e) => e.tags)];
  const { data: existingTagRows } = await supabase.from("tag_values").select("id, value").eq("organization_id", org.id);
  const { toCreate: newTags } = resolveTags(allTags, existingTagRows ?? []);

  const informationsCount = events.reduce((s, e) => s + e.informations.length, 0);
  const contextsCount = events.reduce((s, e) => s + e.contexts.length, 0);
  const summary = { events: events.length, informations: informationsCount, contexts: contextsCount, skipped: skippedCount, truncated: truncatedCount };

  // Preview pass: report the new tags and stop — NOTHING is persisted. The client
  // shows a checklist (all ticked) so the user can opt out of creating any.
  if (preview) {
    return NextResponse.json({ preview: true, newTags, summary });
  }

  // 4. persist (single transaction via the shared RPC, source='byo')
  const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  const spineColor = SPINE_PALETTE[(count ?? 0) % SPINE_PALETTE.length];

  // Resolve tags to ids. Only create the new tags the user APPROVED; existing
  // tags always apply. Unapproved new tags fall out of the map → dropped from the
  // project and its nodes. Best-effort.
  const approved = new Set(approvedNewTags.map((t) => t.trim().toLowerCase()));
  const existingSet = new Set((existingTagRows ?? []).map((r) => r.value.trim().toLowerCase()));
  const allowedTags = allTags.filter((t) => {
    const k = t.trim().toLowerCase();
    return existingSet.has(k) || approved.has(k);
  });
  const tagMap = await ensureTagValueIds(supabase, { orgId: org.id, userId: user.id, tags: allowedTags });
  const projectTagIds = tagIdsFor(project.tags, tagMap);

  const payload = {
    project: { title: project.title, deadline: null, spine_color: spineColor, primary_participant: null, tag_value_ids: projectTagIds },
    nodes: events.map((e) => ({
      title: e.title,
      date: e.date,
      node_type: e.type,
      tag_value_ids: tagIdsFor(e.tags, tagMap),
      informations: e.informations.map((b) => ({ body: b })),
      contexts: e.contexts.map((b) => ({ body: b })),
    })),
  };

  const { data: projectId, error: genErr } = await supabase.rpc("generate_ai_project", {
    p_org: org.id,
    p_user: user.id,
    p_payload: payload,
    p_source: "byo",
  });
  if (genErr || !projectId) {
    console.error("[parse-byo] persist failed:", genErr);
    return NextResponse.json({ error: "Couldn't save the parsed project. Please try again." }, { status: 500 });
  }

  // 5. audit log — event_type='byo'. FREE: no quota consume, no imports_used bump.
  // Tolerant of the optional `truncations` column not being migrated.
  {
    const row = { workspace_id: org.id, project_id: projectId as string, event_type: "byo" as const };
    const { error: logErr } = await supabaseAdmin.from("import_events").insert({ ...row, truncations: truncatedCount });
    if (logErr) await supabaseAdmin.from("import_events").insert(row);
  }
  console.log("[parse-byo] created", projectId, {
    events_count: events.length,
    informations_count: informationsCount,
    contexts_count: contextsCount,
    skipped_count: skippedCount,
    truncated_count: truncatedCount,
    project_tags: projectTagIds.length,
  });

  // 6. respond
  return NextResponse.json({ project_id: projectId, summary });
}
