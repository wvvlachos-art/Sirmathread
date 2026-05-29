"use client";

// Layer 2 canvas. PHASE 1: a simple centered, linear chain of the project's
// nodes (no serpentine, no time-spacing, no bubbles yet — those arrive in later
// phases). Reuses Layer 1's node look: rounded square, oxblood outline, cream
// fill, caption beneath.

export type L2Node = {
  id: string;
  label: string;
  t: number;
  done: boolean;
  hasDeadline: boolean;
};

const NODE = 32;
const SPACING = 120; // horizontal gap between node centres (Phase 3 makes this time-aware)
const PAD = 80;
const MID_Y = 70;
const LABEL_MAX = 22;
const trunc = (s: string) => (s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + "…" : s);

export default function Layer2Canvas({ nodes }: { nodes: L2Node[] }) {
  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-sm text-muted">
        This project has no nodes yet.
      </div>
    );
  }

  const width = PAD * 2 + (nodes.length - 1) * SPACING + NODE;
  const height = 160;
  const xFor = (i: number) => PAD + i * SPACING + NODE / 2;

  return (
    <div className="flex-1 overflow-auto p-8">
      <svg width={width} height={height} className="mx-auto block" role="img">
        {/* the wire */}
        {nodes.length > 1 && (
          <line
            x1={xFor(0)}
            y1={MID_Y}
            x2={xFor(nodes.length - 1)}
            y2={MID_Y}
            stroke="#7a2718"
            strokeOpacity={0.5}
            strokeWidth={1.75}
          />
        )}
        {nodes.map((n, i) => {
          const cx = xFor(i);
          return (
            <g key={n.id}>
              <rect
                x={cx - NODE / 2}
                y={MID_Y - NODE / 2}
                width={NODE}
                height={NODE}
                rx={6}
                fill="#f7eed9"
                stroke="#7a2718"
                strokeWidth={1.5}
              />
              {n.done && (
                <path
                  d={`M ${cx - 7} ${MID_Y} l 5 5 l 9 -10`}
                  fill="none"
                  stroke="#7a2718"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <text
                x={cx}
                y={MID_Y + NODE / 2 + 16}
                textAnchor="middle"
                fontSize={11}
                fill="#4d4327"
              >
                {trunc(n.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
