import Anthropic from "@anthropic-ai/sdk";
import {
  GenerationError,
  TOKEN_BUDGET,
  type LLMProvider,
  type StageResult,
  type StructureInput,
  type StructureOutput,
  type ContextsInput,
  type ContextsOutput,
} from "../types";

// The ONLY file that imports the Anthropic SDK. Implements the two-stage
// pipeline: Haiku (structure) → Sonnet (context). Straight-line — each model is
// called once, with a single corrective retry on malformed/invalid JSON. No
// agentic loops, no self-evaluation.

// User explicitly specced Haiku → Sonnet (not the Opus default).
const HAIKU_MODEL = "claude-haiku-4-5";
const SONNET_MODEL = "claude-sonnet-4-6";

const STAGE_TIMEOUT_MS = 30_000;
const HAIKU_MAX_OUTPUT = 8_000;
const SONNET_MAX_OUTPUT = 16_000;

// ============================================================================
// SYSTEM PROMPTS — the product's editorial DNA. Keep VERBATIM-in-sync with the
// copies in CLAUDE_NOTES.md so they stay revisable. (Volatile values — "today",
// the paste, tag hints — live in the USER turn, NOT here, so this stable prefix
// stays cacheable.)
// ============================================================================
const HAIKU_SYSTEM = `You are the STRUCTURE-EXTRACTION stage of Sirmathread's project parser. You read raw source content (an email thread, meeting notes, or freeform text) and extract a project and its timeline of events as strict JSON. You do NOT write narrative context — that is a later stage.

PROCESSING RULES
- Identify events that have a known or reasonably inferable date from the source content.
- Create a node ONLY when the event is meaningful. EXCLUDE routine acknowledgments, administrative confirmations, out-of-office replies, pleasantries, and signature blocks.
- One node per distinct EVENT — not per email and not per message. Consolidate a multi-message discussion of the same event into a SINGLE node.
- Node titles are 2–6 words, an active verb phrase. Good: "Ting provides card number". Bad: "Card number information from Ting".
- If an event's date is genuinely unknown and cannot be reasonably inferred, SKIP the event rather than fabricate a date.
- Classify each node by its date relative to TODAY (the parse date is given in the user message): past or today → "node"; future → "ambition".
- Project metadata: a declarative, concise title; a deadline ONLY if one is explicitly stated in the source (otherwise null); identify the primary participant — the main "character" — when there is a clear one (otherwise null).
- Tag detection: extract people, organizations, and recurring topics as tags. Normalize variants to the fullest form (e.g. "Ting" and "Ting Lee" → "Ting Lee"). Any user-supplied tag hints take PRIORITY and must be included. Maximum 5 tags.
- Prefer FEWER nodes over more when uncertain. Skip noise. NEVER invent facts, dates, names, or events that are not supported by the source.
- When the content is genuinely unstructurable, output a minimal valid result: one project with a single node titled to signal that it could not be structured further (e.g. "Unstructured note captured").
- HARD CAP: at most 50 nodes per project. If you approach that, consolidate aggressively.

OUTPUT
Return ONLY a single JSON object — no markdown, no code fences, no commentary — matching EXACTLY this shape:
{
  "project": { "title": string, "deadline": string|null, "primary_participant": string|null, "tags": string[] },
  "nodes": [ { "id": string, "title": string, "date": string, "type": "node"|"ambition" } ]
}
Generate a unique "id" (any short unique string) per node so a later stage can attach context to specific nodes. Every "date" MUST be ISO format YYYY-MM-DD.`;

const SONNET_SYSTEM = `You are the SUBNODE-GENERATION stage of Sirmathread's project parser. You receive (1) a structured project + node list produced by an earlier stage, and (2) the ORIGINAL source content for grounding. Your job is to attach short factual subnodes — INFORMATION and CONTEXT — to the nodes. You do NOT change the project, and you do NOT add, remove, rename, or re-date any node.

VOICE
- Declarative, factual, third person, neutral. NO opinion, speculation, or attempts to mimic anyone's voice.

SUBNODES — INFORMATION vs CONTEXT
For each node, output up to 3 INFORMATION (facts, 1 sentence, ≤150 chars) and up to 3 CONTEXT (explanatory background, 2-3 sentences, ≤300 chars).

- INFORMATION = the "what." Direct factual claim from the source.
  Example: "The vendor confirmed delivery on April 15."
- CONTEXT = the "why" or "how." Background that explains a fact.
  Example: "The vendor is a Tier-1 supplier providing 60% of raw material."

Split mixed sentences — facts to INFORMATION, background to CONTEXT. Never combine both in one subnode. When unsure, choose INFORMATION.

Voice: declarative, factual, third person. Never invent.

OUTPUT
Return ONLY a single JSON object — no markdown, no code fences, no commentary — identical to the input structure but with "informations" and "contexts" arrays added to EVERY node:
{
  "project": { "title": string, "deadline": string|null, "primary_participant": string|null, "tags": string[] },
  "nodes": [ { "id": string, "title": string, "date": string, "type": "node"|"ambition", "informations": [ string ], "contexts": [ string ] } ]
}
Preserve every node's id, title, date, and type EXACTLY as given. "informations" and "contexts" each hold 0 to 3 short plain strings.`;

// ---- JSON extraction + validation ------------------------------------------
function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body.trim();
}

const asObj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const isIsoDate = (s: unknown): boolean => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);

function validateProjectMeta(p: Record<string, unknown> | null, errs: string[]) {
  if (!p) return void errs.push("project is missing or not an object");
  if (typeof p.title !== "string" || !p.title.trim()) errs.push("project.title must be a non-empty string");
  if (!(p.deadline === null || typeof p.deadline === "string")) errs.push("project.deadline must be a string or null");
  if (!(p.primary_participant === null || typeof p.primary_participant === "string"))
    errs.push("project.primary_participant must be a string or null");
  if (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string")) errs.push("project.tags must be an array of strings");
}
function validateNodeCore(n: Record<string, unknown> | null, i: number, errs: string[]) {
  if (!n) return void errs.push(`nodes[${i}] is not an object`);
  if (typeof n.id !== "string" || !n.id) errs.push(`nodes[${i}].id must be a non-empty string`);
  if (typeof n.title !== "string" || !n.title.trim()) errs.push(`nodes[${i}].title must be a non-empty string`);
  if (!isIsoDate(n.date)) errs.push(`nodes[${i}].date must be ISO YYYY-MM-DD`);
  if (n.type !== "node" && n.type !== "ambition") errs.push(`nodes[${i}].type must be "node" or "ambition"`);
}

function validateStructure(o: unknown): string[] {
  const errs: string[] = [];
  const root = asObj(o);
  if (!root) return ["the top-level value must be a JSON object"];
  validateProjectMeta(asObj(root.project), errs);
  if (!Array.isArray(root.nodes)) errs.push("nodes must be an array");
  else root.nodes.forEach((n, i) => validateNodeCore(asObj(n), i, errs));
  return errs;
}
function validateContexts(o: unknown): string[] {
  const errs: string[] = [];
  const root = asObj(o);
  if (!root) return ["the top-level value must be a JSON object"];
  validateProjectMeta(asObj(root.project), errs);
  if (!Array.isArray(root.nodes)) errs.push("nodes must be an array");
  else
    root.nodes.forEach((n, i) => {
      const nn = asObj(n);
      validateNodeCore(nn, i, errs);
      if (nn) {
        for (const key of ["informations", "contexts"] as const) {
          if (!Array.isArray(nn[key])) errs.push(`nodes[${i}].${key} must be an array`);
          else
            (nn[key] as unknown[]).forEach((c, j) => {
              if (typeof c !== "string") errs.push(`nodes[${i}].${key}[${j}] must be a string`);
            });
        }
      }
    });
  return errs;
}

type StageSpec<T> = {
  model: string;
  system: string;
  userText: string;
  maxTokens: number;
  cap: number;
  validate: (o: unknown) => string[];
};

// One model call with a 30s AbortController timeout, JSON parse + schema
// validation, and a SINGLE corrective retry that feeds back the exact error.
async function runStage<T>(client: Anthropic, spec: StageSpec<T>): Promise<StageResult<T>> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: spec.userText }];
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS);
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create(
        {
          model: spec.model,
          max_tokens: spec.maxTokens,
          system: [{ type: "text", text: spec.system, cache_control: { type: "ephemeral" } }],
          messages,
        },
        { signal: controller.signal }
      );
    } catch (e) {
      clearTimeout(timer);
      if (controller.signal.aborted) throw new GenerationError(`${spec.model} timed out after 30s.`, 504);
      throw new GenerationError(`${spec.model} request failed: ${(e as Error).message}`, 500);
    }
    clearTimeout(timer);

    const u = resp.usage;
    const tokensUsed =
      (u.input_tokens ?? 0) +
      (u.output_tokens ?? 0) +
      (u.cache_read_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    if (tokensUsed > spec.cap) {
      throw new GenerationError(`${spec.model} exceeded its ${spec.cap}-token budget (${tokensUsed}).`, 500);
    }

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(text));
    } catch {
      lastError = "the output was not valid JSON";
      if (attempt === 0) {
        appendCorrection(messages, text, lastError);
        continue;
      }
      throw new GenerationError(`${spec.model} returned malformed JSON after a retry.`, 500);
    }

    const errors = spec.validate(parsed);
    if (errors.length === 0) return { data: parsed as T, tokensUsed };

    lastError = errors.slice(0, 6).join("; ");
    if (attempt === 0) {
      appendCorrection(messages, text, lastError);
      continue;
    }
    throw new GenerationError(`${spec.model} output failed validation after a retry: ${lastError}`, 500);
  }
  throw new GenerationError(`${spec.model} failed.`, 500);
}

function appendCorrection(messages: Anthropic.MessageParam[], badOutput: string, error: string) {
  messages.push(
    { role: "assistant", content: badOutput },
    {
      role: "user",
      content: `That response was invalid: ${error}. Return ONLY a corrected single JSON object that conforms EXACTLY to the required schema. No prose, no markdown, no code fences.`,
    }
  );
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new GenerationError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }
    this.client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  }

  async generateStructure(input: StructureInput): Promise<StageResult<StructureOutput>> {
    const hints = input.tagHints ? `USER TAG HINTS (priority — include these): ${input.tagHints}\n` : "";
    const name = input.projectName ? `USER-SUPPLIED PROJECT NAME (use as the title): ${input.projectName}\n` : "";
    const userText =
      `TODAY (parse date): ${input.today}\n` +
      `SOURCE TYPE: ${input.sourceType}\n` +
      hints +
      name +
      `\n--- SOURCE CONTENT START ---\n${input.pasteContent}\n--- SOURCE CONTENT END ---`;

    return runStage<StructureOutput>(this.client, {
      model: HAIKU_MODEL,
      system: HAIKU_SYSTEM,
      userText,
      maxTokens: HAIKU_MAX_OUTPUT,
      cap: TOKEN_BUDGET.haiku,
      validate: validateStructure,
    });
  }

  async generateContexts(input: ContextsInput): Promise<StageResult<ContextsOutput>> {
    const userText =
      `TODAY (parse date): ${input.today}\n\n` +
      `STRUCTURED PROJECT (from stage 1):\n${JSON.stringify(input.structure)}\n\n` +
      `--- ORIGINAL SOURCE CONTENT START ---\n${input.pasteContent}\n--- ORIGINAL SOURCE CONTENT END ---`;

    return runStage<ContextsOutput>(this.client, {
      model: SONNET_MODEL,
      system: SONNET_SYSTEM,
      userText,
      maxTokens: SONNET_MAX_OUTPUT,
      cap: TOKEN_BUDGET.sonnet,
      validate: validateContexts,
    });
  }
}
