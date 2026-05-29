"use client";

import { useEffect, useRef, useState } from "react";
import { createBubble, updateBubble, deleteBubble } from "./actions";

// Layer 2 canvas: serpentine layout (time-aware spacing) + manual context
// bubbles (margin-note annotations attached to nodes). Time flows ALONG THE
// THREAD. Month band (Phase 3) deferred.

export type L2Node = { id: string; label: string; t: number; done: boolean; hasDeadline: boolean };
export type L2Bubble = {
  id: string;
  nodeId: string;
  content: string;
  side: "above" | "below";
  source: "manual" | "ai";
};

const NODE = 44;
const BAND_W = 54; // soft month band down the left
const PAD = 96; // left/right padding (keeps the leftmost nodes clear of the band)
const TOP = 76;
const ROW_H = 158;
const CORNER = 30;
const LINEAR_MAX = 8;
const DAY = 86_400_000;

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

// Bubble geometry
const CONN = 20; // dashed connector stub length
const LABEL_SPACE = 26; // clearance below a node for its caption
const STACK = 74; // vertical step when a node has multiple bubbles on one side
const BUBBLE_W = 186;
const MANUAL_EDGE = "#5a7d8c";

const LABEL_MAX = 20;
const trunc = (s: string) => (s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + "…" : s);

type Pt = { x: number; y: number };

function roundedPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
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

type Editing =
  | { kind: "new"; nodeId: string; side: "above" | "below"; text: string }
  | { kind: "edit"; bubbleId: string; nodeId: string; side: "above" | "below"; text: string };

export default function Layer2Canvas({
  nodes,
  bubbles: initialBubbles,
  canEdit,
  projectId,
  projectName,
}: {
  nodes: L2Node[];
  bubbles: L2Bubble[];
  canEdit: boolean;
  projectId: string;
  projectName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [bubbles, setBubbles] = useState<L2Bubble[]>(initialBubbles);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setBubbles(initialBubbles), [initialBubbles]);
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

  // ---- layout ----
  const W = width || 1100;
  const usable = Math.max(MIN_SPACING * 2, W - 2 * PAD);
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
    let row = 0, dir = 1, x = PAD;
    positions.push({ x, y: TOP });
    for (let i = 1; i < nodes.length; i++) {
      const nx = x + dir * spans[i];
      const overR = dir === 1 && nx + NODE / 2 > W - PAD;
      const overL = dir === -1 && nx - NODE / 2 < PAD;
      if (overR || overL) {
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

  // Extra height so bubbles below the last row aren't clipped.
  const height = TOP + (rows - 1) * ROW_H + NODE / 2 + STACK + 80;
  const svgW = linear ? Math.max(W, totalLinear + 2 * PAD) : W;

  const posById = new Map<string, Pt & { label: string }>();
  nodes.forEach((n, i) => posById.set(n.id, { ...positions[i], label: n.label }));

  // Approximate month band (orientation aid only — NOT to scale, since spacing
  // is compressed). Each month is labelled near the first node that falls in it.
  const monthBands: { label: string; y: number }[] = [];
  {
    let lastKey = "";
    let lastYear = "";
    let lastY = -Infinity;
    nodes.forEach((n, i) => {
      const d = new Date(n.t);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key === lastKey) return;
      const mon = d.toLocaleString("en-GB", { month: "short" });
      const yr = String(d.getFullYear());
      let y = positions[i].y;
      if (y < lastY + 15) y = lastY + 15; // avoid label pile-up within a row
      monthBands.push({ label: yr !== lastYear ? `${mon} '${yr.slice(2)}` : mon, y });
      lastKey = key;
      lastYear = yr;
      lastY = y;
    });
    if (monthBands.length === 1) monthBands[0].y = Math.round(height / 2);
  }

  // Bubble instances with stacking index per (node, side).
  const sideCount: Record<string, number> = {};
  const instances = bubbles
    .map((b) => {
      const np = posById.get(b.nodeId);
      if (!np) return null;
      const key = `${b.nodeId}|${b.side}`;
      const k = sideCount[key] ?? 0;
      sideCount[key] = k + 1;
      return { b, np, k };
    })
    .filter((x): x is { b: L2Bubble; np: Pt & { label: string }; k: number } => !!x);

  const anchorFor = (np: Pt, side: "above" | "below", k: number) => ({
    x: np.x,
    y: side === "above" ? np.y - NODE / 2 - CONN - k * STACK : np.y + NODE / 2 + LABEL_SPACE + CONN + k * STACK,
  });
  const clampX = (x: number) => Math.max(BUBBLE_W / 2 + 4, Math.min(svgW - BUBBLE_W / 2 - 4, x));

  // ---- bubble CRUD ----
  const startNew = (nodeId: string) => {
    const existing = bubbles.filter((b) => b.nodeId === nodeId).length;
    setConfirmDelete(false);
    setEditing({ kind: "new", nodeId, side: existing % 2 === 0 ? "above" : "below", text: "" });
  };
  const startEdit = (b: L2Bubble) => {
    if (!canEdit) return;
    setConfirmDelete(false);
    setEditing({ kind: "edit", bubbleId: b.id, nodeId: b.nodeId, side: b.side, text: b.content });
  };
  const cancel = () => {
    setEditing(null);
    setConfirmDelete(false);
  };
  const save = async () => {
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    setBusy(true);
    if (editing.kind === "new") {
      const label = posById.get(editing.nodeId)?.label ?? "a node";
      const res = await createBubble(projectId, editing.nodeId, text, editing.side, label, projectName);
      setBusy(false);
      if (res.error || !res.id) {
        alert(res.error ?? "Could not save.");
        return;
      }
      setBubbles((prev) => [...prev, { id: res.id!, nodeId: editing.nodeId, content: text, side: editing.side, source: "manual" }]);
    } else {
      const res = await updateBubble(editing.bubbleId, text);
      setBusy(false);
      if (res.error) {
        alert(res.error);
        return;
      }
      setBubbles((prev) => prev.map((b) => (b.id === editing.bubbleId ? { ...b, content: text } : b)));
    }
    cancel();
  };
  const remove = async () => {
    if (editing?.kind !== "edit") return;
    const id = editing.bubbleId;
    setBusy(true);
    const res = await deleteBubble(id);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    cancel();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      cancel();
    }
  };

  const editorAnchor = (() => {
    if (!editing) return null;
    const np = posById.get(editing.nodeId);
    if (!np) return null;
    const k = editing.kind === "new" ? bubbles.filter((b) => b.nodeId === editing.nodeId && b.side === editing.side).length : instances.find((x) => x.b.id === (editing as { bubbleId: string }).bubbleId)?.k ?? 0;
    return { ...anchorFor(np, editing.side, k), side: editing.side };
  })();

  const labelCls = "text-[8px] uppercase tracking-[0.5px]";

  return (
    <div ref={ref} className="flex-1 overflow-auto">
      <div className="relative" style={{ width: svgW, height }}>
        <svg width={svgW} height={height} className="absolute inset-0" role="img" aria-label="Project node chain">
          {/* soft month band (approximate orientation aid) */}
          <rect x={0} y={0} width={BAND_W} height={height} fill="#e1d5ba" fillOpacity={0.5} />
          {monthBands.map((m, i) => (
            <text
              key={`mb-${i}`}
              x={10}
              y={Math.min(height - 8, Math.max(16, m.y))}
              fontSize={11}
              fontFamily="Georgia, serif"
              fill="#8a7d5c"
            >
              {m.label}
            </text>
          ))}

          <path d={roundedPath(positions, CORNER)} fill="none" stroke="#7a2718" strokeOpacity={0.5} strokeWidth={1.75} />

          {/* gap annotations */}
          {nodes.map((n, i) => {
            if (i === 0) return null;
            const days = (n.t - nodes[i - 1].t) / DAY;
            if (days <= GAP_NOTE_DAYS) return null;
            const a = positions[i - 1], b = positions[i];
            const sameRow = Math.abs(a.y - b.y) < 1;
            const mx = sameRow ? (a.x + b.x) / 2 : a.x + NODE / 2 + 10;
            const my = sameRow ? a.y - NODE / 2 - 10 : (a.y + b.y) / 2;
            return (
              <text key={`gap-${n.id}`} x={mx} y={my} textAnchor={sameRow ? "middle" : "start"} fontSize={10} fontStyle="italic" fontFamily='Georgia, serif' fill="#a8915f">
                {humanGap(days)}
              </text>
            );
          })}

          {/* bubble connectors */}
          {instances.map(({ b, np, k }) => {
            const a = anchorFor(np, b.side, k);
            const fromY = b.side === "above" ? np.y - NODE / 2 : np.y + NODE / 2;
            return (
              <line key={`c-${b.id}`} x1={np.x} y1={fromY} x2={clampX(a.x)} y2={a.y} stroke="#bca37e" strokeWidth={1} strokeDasharray="3 3" />
            );
          })}

          {/* nodes */}
          {nodes.map((n, i) => {
            const { x: cx, y: cy } = positions[i];
            return (
              <g key={n.id}>
                {n.hasDeadline && (
                  <rect x={cx - NODE / 2 - 3} y={cy - NODE / 2 - 3} width={NODE + 6} height={NODE + 6} rx={10} fill="none" stroke="#7a2718" strokeWidth={1.25} strokeOpacity={0.7} />
                )}
                <rect x={cx - NODE / 2} y={cy - NODE / 2} width={NODE} height={NODE} rx={8} fill="#f7eed9" stroke="#7a2718" strokeWidth={1.75} />
                {n.done && (
                  <path d={`M ${cx - 9} ${cy} l 7 7 l 12 -13`} fill="none" stroke="#7a2718" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
                )}
                <text x={cx} y={cy + NODE / 2 + 17} textAnchor="middle" fontSize={11.5} fill="#4d4327">
                  {trunc(n.label)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* ---- HTML overlay: hover "+", bubbles, editor ---- */}
        {canEdit &&
          nodes.map((n, i) => {
            const { x: cx, y: cy } = positions[i];
            return (
              <div
                key={`hit-${n.id}`}
                className="absolute"
                style={{ left: cx - NODE / 2, top: cy - NODE / 2, width: NODE, height: NODE }}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
              >
                {hovered === n.id && (
                  <button
                    onClick={() => startNew(n.id)}
                    title="Add a context note"
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-oxblood text-xs leading-none text-paper hover:bg-oxblood-dark"
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}

        {/* existing bubbles (hidden while being edited) */}
        {instances.map(({ b, np, k }) => {
          if (editing?.kind === "edit" && editing.bubbleId === b.id) return null;
          const a = anchorFor(np, b.side, k);
          const rot = (k + (b.side === "above" ? 0 : 1)) % 2 === 0 ? -1.3 : 1.3;
          return (
            <div
              key={b.id}
              className={canEdit ? "absolute cursor-text" : "absolute"}
              onClick={() => startEdit(b)}
              style={{
                left: clampX(a.x),
                top: a.y,
                width: BUBBLE_W,
                transform: `translate(-50%, ${b.side === "above" ? "-100%" : "0"}) rotate(${rot}deg)`,
              }}
            >
              <div className="flex gap-2">
                <div className="shrink-0 rounded" style={{ width: 4, background: MANUAL_EDGE }} />
                <div>
                  <div className={labelCls} style={{ color: MANUAL_EDGE }}>CONTEXT · YOU</div>
                  <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 12, color: "#5c5238", lineHeight: 1.35 }}>
                    {b.content}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* inline editor */}
        {editing && editorAnchor && (
          <div
            className="absolute"
            style={{
              left: clampX(editorAnchor.x),
              top: editorAnchor.y,
              width: 210,
              transform: `translate(-50%, ${editorAnchor.side === "above" ? "-100%" : "0"})`,
            }}
          >
            <div className="flex gap-2 rounded-md border border-hairline bg-paper-surface p-2 shadow-lg">
              <div className="shrink-0 rounded" style={{ width: 4, background: MANUAL_EDGE }} />
              <div className="flex-1">
                <div className={labelCls} style={{ color: MANUAL_EDGE }}>CONTEXT · YOU</div>
                <textarea
                  autoFocus
                  rows={2}
                  value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                  onKeyDown={onKey}
                  placeholder="Add context…"
                  className="mt-0.5 w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-ink outline-none"
                  style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 12 }}
                />
                <div className="mt-1 flex items-center gap-2">
                  <button onClick={save} disabled={busy || !editing.text.trim()} className="rounded bg-oxblood px-2 py-0.5 text-xs text-paper hover:bg-oxblood-dark disabled:opacity-60">
                    Save
                  </button>
                  <button onClick={cancel} className="text-xs text-muted hover:text-ink">Cancel</button>
                  {editing.kind === "edit" && (
                    <span className="ml-auto">
                      {confirmDelete ? (
                        <span className="flex items-center gap-1.5 text-xs">
                          <span className="text-muted">Delete?</span>
                          <button onClick={remove} disabled={busy} className="text-oxblood hover:underline">Yes</button>
                          <button onClick={() => setConfirmDelete(false)} className="text-muted hover:text-ink">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmDelete(true)} className="text-xs text-oxblood hover:underline">Delete</button>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
