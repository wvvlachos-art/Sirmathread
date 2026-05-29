"use client";

import { useEffect, useRef, useState } from "react";

// Layer 2 canvas.
// PHASE 2: serpentine layout. Small projects (≤8 nodes that fit) render as a
// centered linear chain; larger ones wrap into a downward snake whose rows
// alternate direction (L→R, then R→L, …) joined by rounded curve transitions.
// Time flows ALONG THE THREAD, not the horizontal axis. (Phase 3 will make the
// spacing time-aware; Phase 4 adds context bubbles.)

export type L2Node = {
  id: string;
  label: string;
  t: number;
  done: boolean;
  hasDeadline: boolean;
};

const NODE = 32;
const SPACING = 120; // centre-to-centre gap (Phase 3 makes this time-aware)
const PAD = 80; // left/right padding inside the canvas
const TOP = 56; // y of the first row's node centres
const ROW_H = 116; // vertical distance between snake rows
const CORNER = 30; // curve radius at row wraps
const LINEAR_MAX = 8;
const LABEL_MAX = 16;
const trunc = (s: string) => (s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + "…" : s);

type Pt = { x: number; y: number };

// Rounded polyline: straight through collinear points, quadratic-bezier corners
// at direction changes (the snake's row wraps).
function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const d1 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (d1 === 0 || d2 === 0) continue;
    const u1 = { x: (p1.x - p0.x) / d1, y: (p1.y - p0.y) / d1 };
    const u2 = { x: (p2.x - p1.x) / d2, y: (p2.y - p1.y) / d2 };
    // collinear → no corner, just continue the line to p1
    if (Math.abs(u1.x - u2.x) < 1e-6 && Math.abs(u1.y - u2.y) < 1e-6) {
      d += ` L ${p1.x} ${p1.y}`;
      continue;
    }
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a = { x: p1.x - u1.x * rr, y: p1.y - u1.y * rr };
    const b = { x: p1.x + u2.x * rr, y: p1.y + u2.y * rr };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

export default function Layer2Canvas({ nodes }: { nodes: L2Node[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setWidth(el.clientWidth);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (nodes.length === 0) {
    return (
      <div ref={ref} className="flex flex-1 items-center justify-center p-16 text-sm text-muted">
        This project has no nodes yet.
      </div>
    );
  }

  // How many nodes fit per row at the current width.
  const usable = Math.max(SPACING, (width || 1000) - 2 * PAD);
  const cap = Math.max(1, Math.floor(usable / SPACING) + 1);
  const rightEnd = PAD + (cap - 1) * SPACING;
  const linear = nodes.length <= LINEAR_MAX && nodes.length <= cap;

  const positions: Pt[] = nodes.map((_, i) => {
    if (linear) {
      const total = (nodes.length - 1) * SPACING;
      const startX = Math.max(PAD, ((width || total + 2 * PAD) - total) / 2);
      return { x: startX + i * SPACING, y: TOP };
    }
    const row = Math.floor(i / cap);
    const col = i % cap;
    const x = row % 2 === 0 ? PAD + col * SPACING : rightEnd - col * SPACING;
    return { x, y: TOP + row * ROW_H };
  });

  const rows = linear ? 1 : Math.ceil(nodes.length / cap);
  const height = TOP + (rows - 1) * ROW_H + NODE / 2 + 40;
  const svgW = Math.max(width || 0, linear ? 0 : rightEnd + PAD);

  return (
    <div ref={ref} className="flex-1 overflow-auto">
      <svg width={svgW} height={height} className="block" role="img" aria-label="Project node chain">
        <path d={roundedPath(positions, CORNER)} fill="none" stroke="#7a2718" strokeOpacity={0.5} strokeWidth={1.75} />
        {nodes.map((n, i) => {
          const { x: cx, y: cy } = positions[i];
          return (
            <g key={n.id}>
              <rect
                x={cx - NODE / 2}
                y={cy - NODE / 2}
                width={NODE}
                height={NODE}
                rx={6}
                fill="#f7eed9"
                stroke="#7a2718"
                strokeWidth={1.5}
              />
              {n.hasDeadline && (
                <rect
                  x={cx - NODE / 2 - 2.5}
                  y={cy - NODE / 2 - 2.5}
                  width={NODE + 5}
                  height={NODE + 5}
                  rx={8}
                  fill="none"
                  stroke="#7a2718"
                  strokeWidth={1.25}
                  strokeOpacity={0.7}
                />
              )}
              {n.done && (
                <path
                  d={`M ${cx - 7} ${cy} l 5 5 l 9 -10`}
                  fill="none"
                  stroke="#7a2718"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text x={cx} y={cy + NODE / 2 + 15} textAnchor="middle" fontSize={11} fill="#4d4327">
                {trunc(n.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
