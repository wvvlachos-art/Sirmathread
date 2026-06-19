// Pure tag-resolution logic for AI/BYO project generation — no I/O, so it's
// unit-testable. Given the tag strings a generator detected and the tag VALUES
// that already exist in the workspace, decide which existing values to link and
// which brand-new ones to create. Matching is case-insensitive and trims
// surrounding whitespace; the FIRST existing value wins on a case-collision.

export type ExistingTagValue = { id: string; value: string };

export type ResolvedTags = {
  linkIds: string[]; // ids of existing tag_values to link to the project
  toCreate: string[]; // new tag strings to create (original casing, deduped)
  matched: Map<string, string>; // lower(name) → existing tag_value id, for the matched subset
};

const norm = (s: string): string => s.trim().toLowerCase();

export function resolveTags(detected: string[], existing: ExistingTagValue[]): ResolvedTags {
  // lower(value) → id, first occurrence wins
  const byLower = new Map<string, string>();
  for (const e of existing) {
    const k = norm(e.value);
    if (k && !byLower.has(k)) byLower.set(k, e.id);
  }

  const linkIds: string[] = [];
  const toCreate: string[] = [];
  const matched = new Map<string, string>();
  const seen = new Set<string>(); // de-dupe the detected list case-insensitively

  for (const raw of detected) {
    const clean = (raw ?? "").trim();
    if (!clean) continue;
    const key = norm(clean);
    if (seen.has(key)) continue;
    seen.add(key);

    const existingId = byLower.get(key);
    if (existingId) {
      linkIds.push(existingId);
      matched.set(key, existingId);
    } else {
      toCreate.push(clean);
    }
  }

  return { linkIds, toCreate, matched };
}

// Look up the ids for a list of tag strings against a resolved lower(name)→id map,
// deduped and in input order. Strings absent from the map are skipped.
export function tagIdsFor(names: string[] | undefined, map: Map<string, string>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const n of names ?? []) {
    const id = map.get(norm(n ?? ""));
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}
