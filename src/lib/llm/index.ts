import { AnthropicProvider } from "./providers/anthropic";
import { OUTPUT_CAPS, type ContextsOutput, type LLMProvider } from "./types";

// Factory: returns the provider named by LLM_PROVIDER (default "anthropic").
// To add OpenAI/Google later: implement LLMProvider under ./providers, import
// it here, and add a case — no other file changes. The API route depends on
// this factory + ./types only, never on a concrete SDK.
export function getLLMProvider(): LLMProvider {
  const name = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  switch (name) {
    case "anthropic":
      return new AnthropicProvider();
    // case "openai": return new OpenAIProvider();   // ← future
    // case "google": return new GoogleProvider();   // ← future
    default:
      // Unknown value: fall back to the default rather than failing the request.
      return new AnthropicProvider();
  }
}

export type GenerationPayload = {
  project: {
    title: string;
    deadline: string | null;
    spine_color: string;
    primary_participant: string | null;
    tags: string[];
  };
  nodes: {
    title: string;
    date: string;
    node_type: "node" | "ambition";
    informations: { body: string }[];
    contexts: { body: string }[];
  }[];
};

const normDate = (s: unknown): string | null => {
  if (typeof s !== "string") return null;
  const d = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

// Safety-net truncation for AI context bodies: cut at the nearest word boundary
// before the char limit and append an ellipsis. Falls back to a hard cut only
// when there's no sensible word break near the end (one very long token). Final
// length is always ≤ max. This applies ONLY to freshly AI-generated contexts
// (everything that flows through here is source='ai'); a later user edit flips
// the row to source='manual' and never re-enters this path.
const ELLIPSIS = "…";
function truncateAtWord(text: string, max: number): { body: string; truncated: boolean } {
  const t = text.trim();
  if (t.length <= max) return { body: t, truncated: false };
  const slice = t.slice(0, max - 1); // leave room for the ellipsis
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > Math.floor(max * 0.6) ? slice.slice(0, lastSpace) : slice;
  return { body: cut.trimEnd() + ELLIPSIS, truncated: true };
}

// Clamp + truncate one flat string-array of subnode bodies (INFORMATION or
// CONTEXT). Returns {body} objects (the shape generate_ai_project reads) and
// bumps the per-type truncation counter.
function mapSubnodes(arr: unknown, perNode: number, maxChars: number, onTruncated: () => void): { body: string }[] {
  return (Array.isArray(arr) ? arr : [])
    .slice(0, perNode)
    .map((s) => {
      const { body, truncated } = truncateAtWord(String(s ?? ""), maxChars);
      if (truncated) onTruncated();
      return { body };
    })
    .filter((c) => c.body.length > 0);
}

// Map the validated Stage-2 output to the shape generate_ai_project() expects,
// re-clamping every cap defensively (the prompts ask for these limits, but we
// never trust the model to honour them perfectly). Guarantees ≥ 1 node. Returns
// per-type truncation counts for the import_events audit row.
export function toGenerationPayload(
  out: ContextsOutput,
  opts: { projectName: string | null; spineColor: string; today: string }
): { payload: GenerationPayload; contextsTruncated: number; informationsTruncated: number } {
  let contextsTruncated = 0;
  let informationsTruncated = 0;
  const nodes = (out.nodes ?? [])
    .slice(0, OUTPUT_CAPS.nodes)
    .map((n) => ({
      title: (n.title ?? "").trim() || "(untitled)",
      date: normDate(n.date),
      node_type: (n.type === "ambition" ? "ambition" : "node") as "node" | "ambition",
      informations: mapSubnodes(n.informations, OUTPUT_CAPS.informationsPerNode, OUTPUT_CAPS.informationChars, () => informationsTruncated++),
      contexts: mapSubnodes(n.contexts, OUTPUT_CAPS.contextsPerNode, OUTPUT_CAPS.contextChars, () => contextsTruncated++),
    }))
    .filter((n): n is GenerationPayload["nodes"][number] => n.date !== null);

  if (nodes.length === 0) {
    nodes.push({ title: (out.project?.title ?? "").trim() || "Captured note", date: opts.today, node_type: "node", informations: [], contexts: [] });
  }

  return {
    payload: {
      project: {
        title: opts.projectName ?? ((out.project?.title ?? "").trim() || "Generated project"),
        deadline: normDate(out.project?.deadline),
        spine_color: opts.spineColor,
        primary_participant: out.project?.primary_participant ?? null,
        tags: (out.project?.tags ?? []).slice(0, OUTPUT_CAPS.tags).map((t) => String(t)),
      },
      nodes,
    },
    contextsTruncated,
    informationsTruncated,
  };
}
