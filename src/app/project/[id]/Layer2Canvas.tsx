"use client";

import { useEffect, useRef, useState } from "react";

// Layer 2 canvas.
// PHASE 2+3: serpentine layout with TIME-AWARE spacing. The gap between two
// consecutive nodes (in days) maps — sub-linearly — to the distance along the
// thread, so bursts cluster and quiet stretches open up. Rows fill to the canvas
// edges before wrapping into the next snake row. Long gaps get a small italic
// "~N weeks later" annotation. (Phase 3's month band and Phase 4's bubbles still
// to come.) Time flows ALONG THE THREAD, not the horizontal axis.

export type L2Node = {
  id: string;
  label: string;
  t: number;
  done: boolean;
  hasDeadline: boolean;
};

const NODE = 44;
const PAD = 72;
const TOP = 76;
const ROW_H = 158;
const CORNER = 30;
const LINEAR_MAX = 8;
const DAY = 86_400_000;

// Time gap (days) → distance (px). Floor keeps close nodes readable; log keeps
// far-apart nodes from blowing out; clamp bounds the longest gaps.
const MIN_SPACING = 112;
const LOG_FACTOR = 70;
const MAX_SPACING = 460;
const spacingFor = (gapDays: number) =>
  Math.max(MIN_SPACING, Math.min(MAX_SPACING, MIN_SPACING + LOG_FACTOR * Math.log(1 + Math.max(0, gapDays))));

const GAP_NOTE_DAYS = 14;
function humanGap(days: number): string {
  if (days < 60) return `~${Math.max(2, Math.round(days / 7))} weeks later`;
  if (days < 365) return `~${Math.round(days / 30)} months later`;
  return `~${Math.round((days / 365) * 10) / 10} years later`;
}

const LABEL_MAX = 20;
const trunc = (s: string) => (s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + "…" : s);

type Pt = { x: number; y: number };

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
    if (Math.abs(u1.x - u2.x) < 1e-6 && Math.abs(u1.y - u2.y) < 1e-6) {
      d += ` L ${p1.x} ${p1.y}`;
      continue;
    }
    const rr = Math.min(r, d1 / 2, d2 / 2);
    d += ` L ${p1.x - u1.x * rr} ${p1.y - u1.y * rr} Q ${p1.x} ${p1.y} ${p1.x + u2.x * rr} ${p1.y + u2.y * rr}`;
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

  const W = width || 1100;
  const usable = Math.max(MIN_SPACING * 2, W - 2 * PAD);

  // Distance to the previous node, for each node (index 0 unused).
  const spans = nodes.map((n, i) => (i === 0 ? 0 : spacingFor((n.t - nodes[i - 1].t) / DAY)));
  const totalLinear = spans.reduce((a, b) => a + b, 0);
  const linear = nodes.length <= LINEAR_MAX && totalLinear + NODE <= usable;

  const positions: Pt[] = [];
  let rows = 1;
  if (linear) {
    const startX = Math.max(PAD, (W - totalLinear) / 2);
    let x = startX;
    nodes.forEach((_, i) => {
      x += spans[i];
      positions.push({ x: i === 0 ? startX : x, y: TOP });
    });
  } else {
    let row = 0;
    let dir = 1; // 1 = L→R, -1 = R→L
    let x = PAD;
    positions.push({ x, y: TOP });
    for (let i = 1; i < nodes.length; i++) {
      const nx = x + dir * spans[i];
      const overR = dir === 1 && nx + NODE / 2 > W - PAD;
      const overL = dir === -1 && nx - NODE / 2 < PAD;
      if (overR || overL) {
        // Wrap: drop straight down (vertical curve) and reverse direction.
        row++;
        dir = -dir;
        positions.push({ x, y: TOP + row * ROW_H });
      } else {
        x = nx;
        positions.push({ x, y: TOP + row * ROW_H });
      }
    }
    rows = row + 1;
  }

  const height = TOP + (rows - 1) * ROW_H + NODE / 2 + 52;
  const svgW = linear ? Math.max(W, totalLinear + 2 * PAD) : W;

  return (
    <div ref={ref} className="flex-1 overflow-auto">
      <svg width={svgW} height={height} className="block" role="img" aria-label="Project node chain">
        <path d={roundedPath(positions, CORNER)} fill="none" stroke="#7a2718" strokeOpacity={0.5} strokeWidth={1.75} />

        {/* Gap annotations on long stretches */}
        {nodes.map((n, i) => {
          if (i === 0) return null;
          const days = (n.t - nodes[i - 1].t) / DAY;
          if (days <= GAP_NOTE_DAYS) return null;
          const a = positions[i - 1];
          const b = positions[i];
          const sameRow = Math.abs(a.y - b.y) < 1;
          const mx = sameRow ? (a.x + b.x) / 2 : a.x + NODE / 2 + 10;
          const my = sameRow ? a.y - NODE / 2 - 10 : (a.y + b.y) / 2;
          return (
            <text
              key={`gap-${n.id}`}
              x={mx}
              y={my}
              textAnchor={sameRow ? "middle" : "start"}
              fontSize={10}
              fontStyle="italic"
              fontFamily='Georgia, "Iowan Old Style", serif'
              fill="#a8915f"
            >
              {humanGap(days)}
            </text>
          );
        })}

        {nodes.map((n, i) => {
          const { x: cx, y: cy } = positions[i];
          return (
            <g key={n.id}>
              {n.hasDeadline && (
                <rect
                  x={cx - NODE / 2 - 3}
                  y={cy - NODE / 2 - 3}
                  width={NODE + 6}
                  height={NODE + 6}
                  rx={10}
                  fill="none"
                  stroke="#7a2718"
                  strokeWidth={1.25}
                  strokeOpacity={0.7}
                />
              )}
              <rect
                x={cx - NODE / 2}
                y={cy - NODE / 2}
                width={NODE}
                height={NODE}
                rx={8}
                fill="#f7eed9"
                stroke="#7a2718"
                strokeWidth={1.75}
              />
              {n.done && (
                <path
                  d={`M ${cx - 9} ${cy} l 7 7 l 12 -13`}
                  fill="none"
                  stroke="#7a2718"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text x={cx} y={cy + NODE / 2 + 17} textAnchor="middle" fontSize={11.5} fill="#4d4327">
                {trunc(n.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
