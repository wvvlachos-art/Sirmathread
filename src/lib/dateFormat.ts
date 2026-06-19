// Shared date + gap-label formatting. Extracted VERBATIM from Timeline.tsx
// (`fmtEU`) and Layer2Canvas.tsx (`GAP_NOTE_DAYS`, `humanGap`) so the mobile layer
// reuses the exact same logic instead of reimplementing it. No behaviour change —
// the desktop files now import these and render byte-identically.

// en-GB date (DD/MM/YYYY). Accepts an ISO date string (anchored to local midnight)
// or an epoch-ms number. Matches desktop; do NOT switch to auto-locale here.
export const fmtEU = (d: string | number) =>
  new Date(typeof d === "string" ? d + "T00:00:00" : d).toLocaleDateString("en-GB");

// Only annotate gaps of MORE than this many days between adjacent nodes.
export const GAP_NOTE_DAYS = 14;

// "~N weeks/months/years later" between two nodes.
export function humanGap(days: number): string {
  if (days < 60) return `~${Math.max(2, Math.round(days / 7))} weeks later`;
  if (days < 365) return `~${Math.round(days / 30)} months later`;
  return `~${Math.round((days / 365) * 10) / 10} years later`;
}
