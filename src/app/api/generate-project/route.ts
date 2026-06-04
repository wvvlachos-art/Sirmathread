import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveActiveOrg } from "@/lib/activeOrg";
import { SPINE_PALETTE } from "@/lib/theme";
import { getLLMProvider, toGenerationPayload } from "@/lib/llm";
import { GenerationError, TOKEN_BUDGET, type GenerationSourceType } from "@/lib/llm/types";

// POST /api/generate-project
// Receives the captured Generate inputs, debits one import (atomically, with a
// 'consumed' audit event), runs the parser (mock in Phase 1; Haiku→Sonnet in
// Phase 2), persists project + nodes + Contexts in a single transaction, and
// returns the new project id. ANY failure after the debit refunds the import.
//
// The Anthropic key never touches this file in Phase 1 (no AI yet); when Phase 2
// adds it, it lives only in ANTHROPIC_API_KEY (server env) — never client-side.

const INPUT_LIMIT = 50_000;
const SOURCE_TYPES = ["auto-detect", "gmail-thread", "meeting-notes", "brain-dump"] as const;

export async function POST(request: Request) {
  // ---- parse + validate the body ----
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const sourceType = (SOURCE_TYPES as readonly string[]).includes(b.sourceType as string)
    ? (b.sourceType as GenerationSourceType)
    : "auto-detect";
  const pasteContent = typeof b.pasteContent === "string" ? b.pasteContent : "";
  const projectName = typeof b.projectName === "string" && b.projectName.trim() ? b.projectName.trim() : null;
  const tagHints = typeof b.tagHints === "string" && b.tagHints.trim() ? b.tagHints.trim() : null;

  if (!pasteContent.trim()) {
    return NextResponse.json({ error: "Paste some content to generate from." }, { status: 400 });
  }
  if (pasteContent.length > INPUT_LIMIT) {
    return NextResponse.json(
      { error: "That's too long — paste a smaller section (max 50,000 characters)." },
      { status: 413 }
    );
  }

  // ---- authenticate + authorize ----
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
    return NextResponse.json({ error: "Viewers can't generate projects in this workspace." }, { status: 403 });
  }

  // ---- debit one import (atomic decrement + 'consumed' event) ----
  const { data: consumeRes, error: consumeErr } = await supabase.rpc("consume_import", { p_org: org.id });
  if (consumeErr) {
    return NextResponse.json({ error: consumeErr.message }, { status: 500 });
  }
  const consume = (consumeRes ?? {}) as { ok?: boolean; reason?: string; remaining?: number; event_id?: string };
  if (!consume.ok) {
    if (consume.reason === "exhausted") {
      return NextResponse.json(
        { error: "You're out of imports. Top up or upgrade to keep generating." },
        { status: 402 }
      );
    }
    return NextResponse.json({ error: "You can't generate in this workspace." }, { status: 403 });
  }

  // Everything past here must refund the import on failure.
  try {
    const today = new Date().toISOString().slice(0, 10);
    const provider = getLLMProvider(); // swappable behind LLM_PROVIDER; never the SDK directly

    // Stage 1 (Haiku): structure. Stage 2 (Sonnet): contexts. Straight-line.
    const structure = await provider.generateStructure({ pasteContent, sourceType, tagHints, projectName, today });
    const contexts = await provider.generateContexts({ structure: structure.data, pasteContent, today });

    const totalTokens = structure.tokensUsed + contexts.tokensUsed;
    if (totalTokens > TOKEN_BUDGET.total) {
      throw new GenerationError("Generation exceeded the total token budget.", 500);
    }

    // Assign a spine colour the same way manual projects do (palette by count).
    const { count } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    const spineColor = SPINE_PALETTE[(count ?? 0) % SPINE_PALETTE.length];

    const { payload, contextsTruncated, informationsTruncated } = toGenerationPayload(contexts.data, { projectName, spineColor, today });
    const truncations = contextsTruncated + informationsTruncated;

    const { data: projectId, error: genErr } = await supabase.rpc("generate_ai_project", {
      p_org: org.id,
      p_user: user.id,
      p_payload: payload,
    });
    if (genErr || !projectId) {
      throw new GenerationError(genErr?.message ?? "Could not create the project.", 500);
    }

    // Link the 'consumed' event to the new project + record token usage and how
    // many AI contexts were safety-truncated. import_events is service-role-write
    // only. Tolerant: if the `truncations` column isn't migrated yet, retry with
    // just the always-present columns so the project link still lands.
    if (consume.event_id) {
      const { error: upErr } = await supabaseAdmin
        .from("import_events")
        .update({ project_id: projectId as string, tokens_used: totalTokens, truncations })
        .eq("id", consume.event_id);
      if (upErr) {
        await supabaseAdmin
          .from("import_events")
          .update({ project_id: projectId as string, tokens_used: totalTokens })
          .eq("id", consume.event_id);
      }
    }
    console.log(`[generate-project] created ${projectId} — truncations`, {
      contexts_truncated: contextsTruncated,
      informations_truncated: informationsTruncated,
    });

    return NextResponse.json({ projectId });
  } catch (err) {
    // Refund the import — the user shouldn't pay for a failed generation.
    await supabase.rpc("refund_import", { p_org: org.id, p_project: null, p_tokens: null });
    const status = err instanceof GenerationError ? err.httpStatus : 500;
    console.error("[generate-project] failed, refunded import:", err);
    return NextResponse.json(
      { error: "Generation failed. Your import is back in the bag. Try again, or simplify your paste." },
      { status }
    );
  }
}
