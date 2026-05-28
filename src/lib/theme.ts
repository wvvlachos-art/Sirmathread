// Kraft & oxblood — locked 2026-05-28.
// JS/SVG mirror of the CSS tokens in src/app/globals.css. Keep in sync.

export const PAPER = "#e7dcc4";
export const PAPER_SURFACE = "#ede4d0";
export const NODE_FILL = "#f7eed9";
export const OXBLOOD = "#7a2718";
export const OXBLOOD_DARK = "#5e1d12";
export const INK = "#4d4327";
export const MUTED = "#8f7f5b";
export const HAIRLINE = "#cbbb96";
export const NOTE_FILL = "#f2e4a8";
export const NOTE_BORDER = "#cdb858";

// Editorial header tokens (mirrors --axis-* / --pill-* in globals.css).
export const AXIS_BG = "#e8ddc6";
export const AXIS_INK = "#5c5238";
export const AXIS_YEAR = "#a39573";
export const AXIS_RULE = "#d3c5a3";
export const PILL_EDGE = "#ddd0b3";
export const PILL_INK = "#6b6244";

// Wire = oxblood at ~45% opacity. Pre-baked so SVG attributes can use it.
export const WIRE = "rgba(122, 39, 24, 0.45)";

// 8-slot earthy palette used to auto-assign the spine_color on each project.
// Server-side action cycles by per-user creation order; the picker in the
// project menu re-uses these same swatches for manual override.
export const SPINE_PALETTE = [
  "#8a9a72", // sage
  "#c2622a", // terracotta
  "#b8902f", // ochre
  "#5a7d8c", // dusty blue
  "#8a5a6f", // plum
  "#9c6b4a", // clay
  "#6b8e6b", // moss
  "#a8503a", // brick
] as const;

// Attention-dot colours next to the project name in the left rail.
export const ATTENTION_ALERT = "#c0392b";    // any node deadline ≥ stage 3 or overdue
export const ATTENTION_NORMAL = "#8a9a72";   // active, nothing urgent
export const ATTENTION_INACTIVE = "#c4b48f"; // past the 45-day quiet threshold
