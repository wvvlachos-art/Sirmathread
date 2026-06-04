// Provider-agnostic contract for the AI project-generation pipeline. The API
// route depends ONLY on this interface + the factory in ./index — never on a
// concrete SDK. Swapping the LLM later = add a file under ./providers and
// register it in the factory; nothing else changes.

export type GenerationSourceType = "auto-detect" | "gmail-thread" | "meeting-notes" | "brain-dump";

// ---- Stage 1: structure extraction -----------------------------------------
export type StructureInput = {
  pasteContent: string;
  sourceType: GenerationSourceType;
  tagHints: string | null;
  projectName: string | null;
  today: string; // YYYY-MM-DD — the parse-time date ("today")
};

export type StructureProject = {
  title: string;
  deadline: string | null; // YYYY-MM-DD or null
  primary_participant: string | null;
  tags: string[];
};
export type StructureNode = {
  id: string; // AI-generated cross-reference id
  title: string;
  date: string; // ISO YYYY-MM-DD
  type: "node" | "ambition";
};
export type StructureOutput = { project: StructureProject; nodes: StructureNode[] };

// ---- Stage 2: context generation -------------------------------------------
export type ContextsInput = {
  structure: StructureOutput;
  pasteContent: string;
  today: string;
};
// Stage-2 adds two flat string arrays per node: INFORMATION (facts) + CONTEXT
// (background). Notes are NOT produced here — they stay user-only.
export type ContextNode = StructureNode & { informations: string[]; contexts: string[] };
export type ContextsOutput = { project: StructureProject; nodes: ContextNode[] };

// Each stage reports the tokens it consumed (input + output + cache) so the
// orchestrator can enforce the per-import total budget and audit cost.
export type StageResult<T> = { data: T; tokensUsed: number };

export interface LLMProvider {
  readonly name: string;
  generateStructure(input: StructureInput): Promise<StageResult<StructureOutput>>;
  generateContexts(input: ContextsInput): Promise<StageResult<ContextsOutput>>;
}

// Carries the HTTP status the API route should surface (504 = timeout, else 500).
// Any failure thrown from a provider refunds the import in the route.
export class GenerationError extends Error {
  httpStatus: number;
  constructor(message: string, httpStatus = 500) {
    super(message);
    this.name = "GenerationError";
    this.httpStatus = httpStatus;
  }
}

// Per-import token budgets (input + output combined, across both stages).
export const TOKEN_BUDGET = {
  haiku: 30_000,
  sonnet: 70_000,
  total: 100_000,
} as const;

// Defensive output caps (also encoded in the prompts; clamped again in code).
export const OUTPUT_CAPS = {
  nodes: 50,
  contextsPerNode: 5,
  contextChars: 300,
  informationsPerNode: 5,
  informationChars: 150,
  tags: 5,
} as const;
