// Sub-node "Pantone code" numbering — the pure rule, shared by the server
// actions that create notes and context/information bubbles.
//
// Codes look like "N-04" / "C-12" / "I-03": a one-letter type prefix + a
// zero-padded sequence number. Numbering is sequential WITHIN A PARENT NODE,
// independent per type, in creation order, and STABLE across deletes — so the
// next code is always (highest existing number for that prefix) + 1 and never
// reuses a freed number.

export function nextPantoneCode(prefix: string, existing: (string | null | undefined)[]): string {
  const p = prefix.toUpperCase();
  let max = 0;
  for (const code of existing) {
    if (!code) continue;
    const m = /^([A-Za-z])-(\d+)$/.exec(code.trim());
    if (m && m[1].toUpperCase() === p) {
      const n = parseInt(m[2], 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${p}-${String(max + 1).padStart(2, "0")}`;
}

// The Pantone letter prefix for a bubble, given its type. Context and the legacy
// 'insight' share the C family; 'information' is its own I family.
export const bubblePrefix = (bubbleType: string | null | undefined): "C" | "I" =>
  bubbleType === "information" ? "I" : "C";
