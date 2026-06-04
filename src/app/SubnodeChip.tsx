"use client";

import type { CSSProperties } from "react";
import { CHIP, OXBLOOD, type ChipType } from "@/lib/theme";

// The one Pantone-chip visual for every sub-node, used on all three surfaces
// (Layer 1 swim-lane, Layer 2 serpentine, Wave 2 node panel). It is purely
// presentational: body text sits in a colour band (oxblood serif for
// readability), a small italic "<TYPE> · <CODE>" sits in the bottom-right
// corner. The PARENT controls width and positioning; the chip auto-sizes its
// height to the content and stretches to fill the width it's given.
//
//  - `compact` (Layer-1 swim-lane stickies): tighter padding, no 140px floor,
//    and the body is clamped so the chip stays small. Pass `showCode={false}`
//    (or just leave the code off) below the size threshold — the corner label
//    is hidden when there's no room for it.
export default function SubnodeChip({
  type,
  body,
  code,
  showCode = true,
  compact = false,
  clampLines,
  minHeight = 30,
  scroll = false,
  className,
  style,
}: {
  type: ChipType;
  body: string;
  code?: string | null;
  showCode?: boolean;
  compact?: boolean;
  clampLines?: number; // clamp the body to N lines (used by the compact L1 stickies)
  minHeight?: number;
  // Only scroll the body when the parent pins an explicit height (a user-resized
  // chip). By default the chip renders at its natural content height — no internal
  // scroll arrows — and the layout absorbs the real size.
  scroll?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const c = CHIP[type];
  const text = body.trim();
  const codeStr = code && code.trim() ? code.trim() : null;
  const label = showCode && codeStr ? `${c.label} · ${codeStr}` : null;

  const bodyStyle: CSSProperties = {
    // Grows with content by default (overflow visible → natural height, no scroll
    // arrows); only scrolls when the parent pins an explicit height.
    flex: "1 1 auto",
    minHeight: 0,
    overflow: scroll ? "auto" : "visible",
    fontFamily: "Georgia, serif",
    fontSize: compact ? 11 : 13,
    lineHeight: 1.4,
    color: OXBLOOD,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  };
  if (clampLines) {
    bodyStyle.display = "-webkit-box";
    bodyStyle.WebkitBoxOrient = "vertical";
    bodyStyle.WebkitLineClamp = clampLines;
    bodyStyle.overflow = "hidden";
    bodyStyle.whiteSpace = "normal";
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: c.fill,
        borderRadius: 4,
        // Extra bottom padding leaves room for the corner code label.
        padding: compact ? "5px 7px 7px" : "10px 14px 16px",
        boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
        // Floor kept just wide enough for the corner code to stay on one line.
        // Matches the resize min-width so the chip never renders wider than its
        // wrapper (which would push the resize handle off the corner).
        minWidth: compact ? undefined : 104,
        minHeight,
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div style={bodyStyle}>{text}</div>
      {label && (
        <span
          style={{
            position: "absolute",
            right: 9,
            bottom: 8,
            fontFamily: "Georgia, serif",
            fontStyle: "italic",
            fontSize: 8,
            letterSpacing: "0.18em",
            color: c.code,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
