// Client-side entry point for AI project generation. Replaces the Phase-1 stub:
// this POSTs the captured inputs to /api/generate-project (the real Haiku→Sonnet
// backend) and returns the new project id so the caller can navigate to it.

export type GenerationSourceType = "auto-detect" | "gmail-thread" | "meeting-notes" | "brain-dump";

export type GenerationInput = {
  sourceType: GenerationSourceType;
  pasteContent: string;
  projectName: string | null;
  tagHints: string | null;
};

// Hard input cap shared by the dialog textarea and the quick paste bar.
export const GENERATION_INPUT_LIMIT = 50_000;

// Carries the HTTP status so callers can branch the error copy (402/413/5xx).
export class GenerationRequestError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GenerationRequestError";
    this.status = status;
  }
}

// sessionStorage key holding the toast MESSAGE to flash on the Layer-2 project
// page once, right after the post-generation/parse navigation lands. (AI sets a
// fixed message; BYO sets a parse-summary message.)
export const GENERATED_FLAG = "sirma:projectGenerated";

// ---- BYO LLM (mechanical parse path; no AI, no import cost) -----------------
export type ByoSummary = { events: number; informations: number; contexts: number; skipped: number; truncated: number };

const EMPTY_SUMMARY: ByoSummary = { events: 0, informations: 0, contexts: 0, skipped: 0, truncated: 0 };

// Phase 1: parse WITHOUT saving and report which detected tags don't exist in the
// workspace yet, so the dialog can ask the user which to create. Free + mechanical.
export async function parseByoPreview(rawText: string): Promise<{ newTags: string[]; summary: ByoSummary }> {
  let res: Response;
  try {
    res = await fetch("/api/parse-byo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, preview: true }),
    });
  } catch {
    throw new GenerationRequestError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  let data: { newTags?: string[]; summary?: ByoSummary; error?: string } | null = null;
  try {
    data = (await res.json()) as { newTags?: string[]; summary?: ByoSummary; error?: string };
  } catch {
    /* non-JSON — fall through */
  }
  if (!res.ok) {
    throw new GenerationRequestError(data?.error ?? "Couldn't parse that. Try again.", res.status);
  }
  return { newTags: data?.newTags ?? [], summary: data?.summary ?? EMPTY_SUMMARY };
}

// Phase 2: commit. `approvedNewTags` is the subset of preview's newTags the user
// kept ticked; only those get created (existing tags always apply).
export async function parseByoRequest(rawText: string, approvedNewTags: string[] = []): Promise<{ projectId: string; summary: ByoSummary }> {
  let res: Response;
  try {
    res = await fetch("/api/parse-byo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, approvedNewTags }),
    });
  } catch {
    throw new GenerationRequestError("Couldn't reach the server. Check your connection and try again.", 0);
  }
  let data: { project_id?: string; summary?: ByoSummary; error?: string } | null = null;
  try {
    data = (await res.json()) as { project_id?: string; summary?: ByoSummary; error?: string };
  } catch {
    /* non-JSON — fall through */
  }
  if (!res.ok || !data?.project_id) {
    throw new GenerationRequestError(data?.error ?? "Couldn't parse that. Try again.", res.status);
  }
  return { projectId: data.project_id, summary: data.summary ?? EMPTY_SUMMARY };
}

export async function triggerGeneration(input: GenerationInput): Promise<{ projectId: string }> {
  let res: Response;
  try {
    res = await fetch("/api/generate-project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new GenerationRequestError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  let data: { projectId?: string; error?: string } | null = null;
  try {
    data = (await res.json()) as { projectId?: string; error?: string };
  } catch {
    /* non-JSON response — fall through to the generic message below */
  }

  if (!res.ok || !data?.projectId) {
    // The API already returns status-appropriate friendly copy; surface it, with
    // a safe fallback for unexpected shapes.
    throw new GenerationRequestError(
      data?.error ?? "Generation failed. Try again, or simplify your paste.",
      res.status
    );
  }
  return { projectId: data.projectId };
}
