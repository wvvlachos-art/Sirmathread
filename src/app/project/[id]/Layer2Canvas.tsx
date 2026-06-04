"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NODE_FILL, OXBLOOD, MUTED, PAPER_SURFACE, NOTE_BORDER, ATTENTION_ALERT, CHIP, darken } from "@/lib/theme";
import { createBubble, updateBubble, updateBubbleMeta, updateBubbleSize, deleteBubble, updateBubblePosition, updateNodePosition, updateNodeSize, renameNode, setNodeState, setNodeType, resetL2Layout } from "./actions";
import { toggleNodeTag, updateNoteLayout } from "@/app/layer1/actions";
import SubnodeChip from "@/app/SubnodeChip";

export type TagCategory = { id: string; name: string; values: { id: string; value: string; color: string | null }[] };
// User notes authored on Layer 1 (notes table). Shown on Layer 2, where they can
// be dragged/resized via their own l2_* columns (x/y absolute centre, w width).
export type L2NoteItem = { id: string; nodeId: string | null; body: string; x: number | null; y: number | null; w: number | null; code: string | null };

// Layer 2 canvas: serpentine layout (time-aware spacing) inside a centered,
// bounded column, with manual context bubbles and an approximate month band.
// Nodes reuse Layer 1's visual rules (tag fill, extra-tag bars, deadline
// perimeter ring, done check), scaled up.

export type NodeType = "email" | "decision" | "meeting" | "call" | "payment" | "task" | "milestone";
export type L2Node = {
  id: string;
  label: string;
  t: number;
  done: boolean;
  deadline: string | null;
  stage: number; // 0 = none, 1..4 = perimeter quarters
  tags: string[]; // tag_value ids, in display order
  type: NodeType | null; // optional type icon (null = plain)
  px: number | null; // custom Layer-2 canvas position (null = auto serpentine)
  py: number | null;
  pw: number | null; // custom Layer-2 node size (square px; null = default)
};
export type BubbleKind = "context" | "information";
export type L2Bubble = {
  id: string;
  nodeId: string;
  content: string;
  side: "above" | "below";
  source: "manual" | "ai";
  kind: BubbleKind; // 'context' (dusty-blue, solid wire) | 'information' (violet, dotted wire)
  // Persisted drag position, stored as an OFFSET from the parent node centre
  // (null until the user drags it; then it falls back to the default stack slot).
  x: number | null;
  y: number | null;
  title: string | null; // null = auto (start of the body text)
  width: number | null; // px; null = default
  height: number | null; // px; null = auto
  shape: string | null; // 'rounded' (default) | 'square' | 'soft' | 'pill'
  code: string | null; // stable Pantone code, e.g. "C-02" / "I-01" (null = pre-migration)
};

// Card shape → outer border-radius. Falls back to 'rounded'.
const SHAPE_RADIUS: Record<string, number> = { rounded: 8, square: 1, soft: 18, pill: 26 };
const SHAPE_ORDER = ["rounded", "square", "soft", "pill"] as const;
const SHAPE_LABEL: Record<string, string> = { rounded: "Rounded", square: "Square", soft: "Soft", pill: "Pill" };

// Default title = first line / first ~48 chars of the body.
function deriveTitle(content: string): string {
  const t = content.trim().split("\n")[0].trim();
  return t.length > 48 ? t.slice(0, 47).trimEnd() + "…" : t;
}

// Optional node-type line icons, drawn in a 24×24 box (stroke-only). A node is
// born plain; the user may assign a type in Layer 2. Order = picker order.
const NODE_TYPE_ORDER: NodeType[] = ["email", "decision", "meeting", "call", "payment", "task", "milestone"];
const NODE_TYPE_LABEL: Record<NodeType, string> = {
  email: "Email",
  decision: "Decision",
  meeting: "Meeting",
  call: "Call",
  payment: "Payment",
  task: "Task",
  milestone: "Milestone",
};
const NODE_TYPE_ICON: Record<NodeType, string> = {
  email: "M3 6 h18 v12 h-18 z M3 6 l9 7 l9 -7",
  decision: "M12 3 l9 9 l-9 9 l-9 -9 z",
  meeting: "M4 5 h16 v15 h-16 z M4 9 h16 M8 3 v4 M16 3 v4",
  call: "M5 4 h4 l2 5 l-2.5 1.5 a11 11 0 0 0 5 5 l1.5 -2.5 l5 2 v4 a2 2 0 0 1 -2 2 a16 16 0 0 1 -16 -16 a2 2 0 0 1 2 -2 z",
  payment: "M3 6 h18 v12 h-18 z M3 10 h18",
  task: "M4 4 h16 v16 h-16 z M8 12 l3 3 l5 -6",
  milestone: "M6 3 v18 M6 4 h11 l-3 4 l3 4 h-11 z",
};

// --- node glyph (matches Layer 1, in a 48-unit space, scaled to NODE) ---
const GLYPH = 48;
const NODE = 56;
const NODE_RX = 7;
const NODE_PERIMETER_PATH =
  `M 7 0 H 41 A 7 7 0 0 1 48 7 V 41 A 7 7 0 0 1 41 48 H 7 A 7 7 0 0 1 0 41 V 7 A 7 7 0 0 1 7 0 Z`;
const CHECK_PATH = "M 14 24 L 22 32 L 36 16";
const BAR_H = 4;
const BAR_GAP = 3;
const BAR_W = NODE * 0.78;

// --- layout ---
const BAND_W = 60;
const COL_W = 1120; // bounded, centered column (~5 nodes per row)
const PAD = 96; // left clears the band; right is symmetric margin
const TOP = 84;
const CORNER = 60;
const LINEAR_MAX = 8;
const DAY = 86_400_000;

const MIN_SPACING = 200;
const LOG_FACTOR = 80;
const MAX_SPACING = 600;
const spacingFor = (gapDays: number) =>
  Math.max(MIN_SPACING, Math.min(MAX_SPACING, MIN_SPACING + LOG_FACTOR * Math.log(1 + Math.max(0, gapDays))));

const GAP_NOTE_DAYS = 14;
function humanGap(days: number): string {
  if (days < 60) return `~${Math.max(2, Math.round(days / 7))} weeks later`;
  if (days < 365) return `~${Math.round(days / 30)} months later`;
  return `~${Math.round((days / 365) * 10) / 10} years later`;
}

// --- bubbles ---
const CONN = 22;
const LABEL_SPACE = 36; // clearance below a node for caption + bars
const STACK = 80;
const BUBBLE_W = 190;
// Connector + socket colour matches the chip's band family (a darkened coral
// for Context, darkened lavender for Information) so the wire reads as the same
// material as the chip it leads to.
const edgeColor = (kind: BubbleKind) => darken(CHIP[kind].fill, 0.38);
const DBUB_W = 150; // demoted-node branch width
const DNODE = 36; // demoted-node glyph size
const SUBNODE_H = 64; // approx sub-node card height (for default stacking + canvas sizing)
const NOTE_W = 172; // Layer-1 note card width on Layer 2

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LABEL_MAX = 22;
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
  | { kind: "new"; nodeId: string; side: "above" | "below"; text: string; btype: BubbleKind }
  | { kind: "edit"; bubbleId: string; nodeId: string; side: "above" | "below"; text: string; title: string; shape: string; btype: BubbleKind };

export default function Layer2Canvas({
  nodes: spineNodes,
  demoted,
  bubbles: initialBubbles,
  notes,
  tagColors,
  tagCatalog,
  canEdit,
  projectId,
  projectName,
}: {
  nodes: L2Node[];
  demoted: L2Node[];
  bubbles: L2Bubble[];
  notes: L2NoteItem[];
  tagColors: Record<string, string>;
  tagCatalog: TagCategory[];
  canEdit: boolean;
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const renameCancel = useRef(false);
  const [vh, setVh] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [bubbles, setBubbles] = useState<L2Bubble[]>(initialBubbles);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [layoutBusy, setLayoutBusy] = useState(false);
  // Node editing state. Rename + type are optimistic (local overrides, then a
  // fire-and-forget save) since they don't change the layout; demote/promote
  // reshuffle the spine, so those re-fetch via router.refresh() after the save.
  const [nodeMenu, setNodeMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ nodeId: string; text: string } | null>(null);
  const [labelOverride, setLabelOverride] = useState<Record<string, string>>({});
  const [typeOverride, setTypeOverride] = useState<Record<string, NodeType | null>>({});
  const [tagOverride, setTagOverride] = useState<Record<string, string[]>>({});
  // Main-node drag: optimistic position overrides (absolute canvas coords) +
  // ref mirror + which node is being dragged.
  const [nodePos, setNodePos] = useState<Record<string, { x: number; y: number }>>({});
  const nodePosRef = useRef<Record<string, { x: number; y: number }>>({});
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const nodeDragRef = useRef<{ id: string; moved: boolean; dist: number } | null>(null);
  // Main-node resize (square; Layer-2-only): size overrides + ref + which node.
  const [nodeSize, setNodeSize] = useState<Record<string, number>>({});
  const nodeSizeRef = useRef<Record<string, number>>({});
  const [resizingNode, setResizingNode] = useState<string | null>(null);
  // Note cards (Layer-1 notes shown on L2): drag (absolute centre) + resize (width).
  const [notePos, setNotePos] = useState<Record<string, { x: number; y: number }>>({});
  const notePosRef = useRef<Record<string, { x: number; y: number }>>({});
  const [draggingNoteCard, setDraggingNoteCard] = useState<string | null>(null);
  const noteDragRef = useRef<{ id: string; moved: boolean; dist: number } | null>(null);
  const [noteWidth, setNoteWidth] = useState<Record<string, number>>({});
  const noteWidthRef = useRef<Record<string, number>>({});
  const [resizingNoteCard, setResizingNoteCard] = useState<string | null>(null);
  // Bubble drag: optimistic offset overrides (keyed by id), plus a ref mirror so
  // the pointer-up handler can read the latest position synchronously.
  const [bubblePos, setBubblePos] = useState<Record<string, { x: number; y: number }>>({});
  const bubblePosRef = useRef<Record<string, { x: number; y: number }>>({});
  const [draggingBubble, setDraggingBubble] = useState<string | null>(null);
  const bubbleDragRef = useRef<{ id: string; moved: boolean; dist: number } | null>(null);
  // Bubble resize: size overrides (keyed by id) + ref mirror + which is resizing.
  const [bubbleSize, setBubbleSize] = useState<Record<string, { w: number; h: number }>>({});
  const bubbleSizeRef = useRef<Record<string, { w: number; h: number }>>({});
  const [resizingBubble, setResizingBubble] = useState<string | null>(null);

  // Apply optimistic label/type overrides on top of the server data.
  const eff = (n: L2Node): L2Node => ({
    ...n,
    label: labelOverride[n.id] ?? n.label,
    type: n.id in typeOverride ? typeOverride[n.id] : n.type,
    tags: tagOverride[n.id] ?? n.tags,
  });
  const nodes = spineNodes.map(eff);

  useEffect(() => setMounted(true), []);
  useEffect(() => setBubbles(initialBubbles), [initialBubbles]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => setVh(el.clientHeight);
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

  // Render the canvas only after mount: it depends on browser-only measurement,
  // so server + first-client render must agree (an empty wrapper) to avoid a
  // hydration mismatch that would otherwise tear down the interactive tree.
  if (!mounted) return <div ref={ref} className="flex-1 overflow-auto" />;

  // ---- horizontal layout + row index (time-gap spacing preserved untouched) ----
  const spans = nodes.map((n, i) => (i === 0 ? 0 : spacingFor((n.t - nodes[i - 1].t) / DAY)));
  const totalLinear = spans.reduce((a, b) => a + b, 0);
  // Small chains that fit in roughly one row render centered (horizontally, and
  // vertically when the page is short) rather than wrapping.
  const linear = nodes.length <= LINEAR_MAX && totalLinear + NODE <= COL_W - 40;

  const xs: number[] = [];
  const rowOf: number[] = [];
  if (linear) {
    const startX = (COL_W - totalLinear) / 2;
    let x = startX;
    nodes.forEach((_, i) => {
      x += spans[i];
      xs.push(i === 0 ? startX : x);
      rowOf.push(0);
    });
  } else {
    let row = 0, dir = 1, x = PAD;
    xs.push(x);
    rowOf.push(0);
    for (let i = 1; i < nodes.length; i++) {
      const nx = x + dir * spans[i];
      const overR = dir === 1 && nx + NODE / 2 > COL_W - PAD;
      const overL = dir === -1 && nx - NODE / 2 < PAD;
      if (overR || overL) {
        row++;
        dir = -dir;
        xs.push(x);
        rowOf.push(row);
      } else {
        x = nx;
        xs.push(x);
        rowOf.push(row);
      }
    }
  }
  const numRows = (rowOf[rowOf.length - 1] ?? 0) + 1;

  // Resolved per-node size (live resize override → persisted pw → default NODE).
  const sizeById = new Map<string, number>();
  nodes.forEach((n) => sizeById.set(n.id, nodeSize[n.id] ?? n.pw ?? NODE));
  const szOf = (id: string) => sizeById.get(id) ?? NODE;

  // ---- adaptive vertical layout: stack sub-nodes at their REAL estimated height
  // so they never overlap, and size each row to the actual footprints above/below
  // it (replaces the old fixed SUBNODE_H slot + fixed ROW_H). ----
  const SUB_GAP = 12; // vertical gap between stacked sub-nodes
  const ROW_VPAD = 30; // padding between one row's lowest chip and the next row's highest
  // Estimate a chip's rendered height from its text + width (no DOM measure).
  const estChipH = (text: string, w: number) => {
    const cpl = Math.max(8, Math.floor((w - 28) / 6.6)); // chars per line at 13px serif
    const lines = Math.max(1, Math.ceil((text.trim().length || 1) / cpl));
    return Math.max(36, Math.round(lines * 18 + 26)); // line-height ~18 + 26 vpad
  };
  // Stack each node's bubbles per side with cumulative real heights; record each
  // bubble's offset from the node centre and how far the stack reaches up/down.
  const bubbleOffset = new Map<string, { x: number; y: number }>();
  const bubbleH = new Map<string, number>();
  const reachAbove: Record<string, number> = {};
  const reachBelow: Record<string, number> = {};
  {
    const cursor: Record<string, number> = {}; // key = `${nodeId}|${side}` → distance used so far
    for (const b of bubbles) {
      const half = szOf(b.nodeId) / 2;
      const w = bubbleSize[b.id]?.w ?? b.width ?? BUBBLE_W;
      const h = bubbleSize[b.id]?.h ?? b.height ?? estChipH(b.content, w);
      bubbleH.set(b.id, h);
      const key = `${b.nodeId}|${b.side}`;
      if (cursor[key] === undefined) cursor[key] = half + (b.side === "above" ? CONN : LABEL_SPACE + CONN);
      const centerDist = cursor[key] + h / 2;
      bubbleOffset.set(b.id, { x: 0, y: b.side === "above" ? -centerDist : centerDist });
      cursor[key] = centerDist + h / 2 + SUB_GAP;
      const reach = centerDist + h / 2;
      if (b.side === "above") reachAbove[b.nodeId] = Math.max(reachAbove[b.nodeId] ?? half, reach);
      else reachBelow[b.nodeId] = Math.max(reachBelow[b.nodeId] ?? half + LABEL_SPACE, reach);
    }
    // Fold any attached notes' downward extent into the below reach (defensive —
    // AI projects have no notes; user notes stack lower-left below the node).
    const noteCnt: Record<string, number> = {};
    notes.forEach((nt) => {
      const a = nt.nodeId && nodes.some((n) => n.id === nt.nodeId) ? nt.nodeId : nodes[0]?.id;
      if (a) noteCnt[a] = (noteCnt[a] ?? 0) + 1;
    });
    for (const n of nodes) {
      const c = noteCnt[n.id] ?? 0;
      if (c) reachBelow[n.id] = Math.max(reachBelow[n.id] ?? szOf(n.id) / 2 + LABEL_SPACE, szOf(n.id) / 2 + 8 + c * 60 + 20);
    }
  }

  // Per-row required clearance above/below, then cumulative row Y.
  const maxAbove = Array.from({ length: numRows }, () => 0);
  const maxBelow = Array.from({ length: numRows }, () => 0);
  nodes.forEach((n, i) => {
    const r = rowOf[i];
    const half = szOf(n.id) / 2;
    maxAbove[r] = Math.max(maxAbove[r], reachAbove[n.id] ?? half);
    maxBelow[r] = Math.max(maxBelow[r], reachBelow[n.id] ?? half + LABEL_SPACE);
  });
  const rowY: number[] = [];
  rowY[0] = TOP + maxAbove[0];
  for (let r = 1; r < numRows; r++) rowY[r] = rowY[r - 1] + maxBelow[r - 1] + ROW_VPAD + maxAbove[r];

  const positions: Pt[] = nodes.map((n, i) => ({ x: xs[i], y: rowY[rowOf[i]] }));

  // Apply custom node positions on top of the auto layout: live drag override →
  // persisted px/py → adaptive slot. Everything downstream (wire, bubbles, demoted
  // branches, month band) reads from `positions`, so it all follows a dragged node.
  nodes.forEach((n, i) => {
    const o = nodePos[n.id] ?? (n.px != null && n.py != null ? { x: n.px, y: n.py } : null);
    if (o) positions[i] = o;
  });
  const nodeBottom = positions.reduce((m, p, i) => Math.max(m, p.y + szOf(nodes[i].id) / 2), 0) + 70;

  // ---- demoted nodes branch off the nearest spine node (by time) ----
  const demotedStack: Record<number, number> = {};
  const demotedInstances = demoted
    .map((d) => {
      if (positions.length === 0) return null;
      let best = 0,
        bestDx = Infinity;
      nodes.forEach((n, i) => {
        const dx = Math.abs(n.t - d.t);
        if (dx < bestDx) {
          bestDx = dx;
          best = i;
        }
      });
      const np = positions[best];
      const k = demotedStack[best] ?? 0;
      demotedStack[best] = k + 1;
      const half = szOf(nodes[best].id) / 2;
      const x = Math.max(DBUB_W / 2 + 4, Math.min(COL_W - DBUB_W / 2 - 4, np.x + half + 96));
      const y = Math.max(30, np.y - half + k * 52);
      return { d: eff(d), np, x, y };
    })
    .filter((v): v is { d: L2Node; np: Pt; x: number; y: number } => !!v);
  const demotedBottom = demotedInstances.reduce((m, di) => Math.max(m, di.y + 46), 0);

  const posById = new Map<string, Pt & { label: string }>();
  nodes.forEach((n, i) => posById.set(n.id, { ...positions[i], label: n.label }));

  // ---- bubble instances (sub-nodes branching off their parent node) ----
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

  const clampX = (x: number) => Math.max(BUBBLE_W / 2 + 4, Math.min(COL_W - BUBBLE_W / 2 - 4, x));
  // Fallback fixed-slot offset, used only if the adaptive `bubbleOffset` somehow
  // lacks an entry (it shouldn't — it's computed from the same `bubbles`).
  const defaultOffset = (side: "above" | "below", k: number, half: number) =>
    side === "above"
      ? { x: 0, y: -(half + CONN + SUBNODE_H / 2 + k * STACK) }
      : { x: 0, y: half + LABEL_SPACE + CONN + SUBNODE_H / 2 + k * STACK };

  // Resolve each bubble to an absolute centre. Priority: live drag / saved
  // override → persisted x/y offset → adaptive real-height stack slot.
  const bubbleLayout = instances.map(({ b, np, k }) => {
    const off =
      bubblePos[b.id] ??
      (b.x != null && b.y != null
        ? { x: b.x, y: b.y }
        : bubbleOffset.get(b.id) ?? defaultOffset(b.side, k, szOf(b.nodeId) / 2));
    // Live resize override → persisted width/height → default (width BUBBLE_W,
    // height auto). h === null means the chip auto-sizes to its content.
    const w = bubbleSize[b.id]?.w ?? b.width ?? BUBBLE_W;
    const h = bubbleSize[b.id]?.h ?? b.height ?? null;
    return { b, np, k, off, w, h, cx: clampX(np.x + off.x), cy: np.y + off.y };
  });
  const bubbleBottom = bubbleLayout.reduce((m, l) => Math.max(m, l.cy + (l.h ?? bubbleH.get(l.b.id) ?? SUBNODE_H) / 2 + 20), 0);

  // ---- Layer-1 user notes, anchored to their node ----
  // The Layer-1 x/y are timeline coords and don't translate here, so notes carry
  // their OWN Layer-2 position/size (l2_*). Resolve: live drag/resize override →
  // persisted l2_x/l2_y/l2_w → a default slot to the lower-left of the node
  // (stacked). Notes with no node (lane-level) attach to the first node.
  const noteStack: Record<string, number> = {};
  const noteInstances = notes
    .map((nt) => {
      const anchorId = nt.nodeId && posById.has(nt.nodeId) ? nt.nodeId : nodes[0]?.id;
      const np = anchorId ? posById.get(anchorId) : undefined;
      if (!np) return null;
      const k = noteStack[anchorId!] ?? 0;
      noteStack[anchorId!] = k + 1;
      const w = noteWidth[nt.id] ?? nt.w ?? NOTE_W;
      const defCx = Math.max(w / 2 + 4, Math.min(COL_W - w / 2 - 4, np.x - (anchorId ? szOf(anchorId) : NODE) / 2 - 96));
      const defCy = np.y + 8 + k * 60;
      const pos = notePos[nt.id] ?? (nt.x != null && nt.y != null ? { x: nt.x, y: nt.y } : { x: defCx, y: defCy });
      return { nt, np, cx: pos.x, cy: pos.y, w };
    })
    .filter((v): v is { nt: L2NoteItem; np: Pt & { label: string }; cx: number; cy: number; w: number } => !!v);
  const noteBottom = noteInstances.reduce((m, n) => Math.max(m, n.cy + 60), 0);

  const lastRowBottom = rowY[numRows - 1] + maxBelow[numRows - 1] + 60;
  const height = Math.max(lastRowBottom, demotedBottom + 40, bubbleBottom + 40, nodeBottom, noteBottom);

  // ---- approximate month band (orientation aid, not to scale) ----
  const monthBands: { label: string; y: number }[] = [];
  {
    const order: string[] = [];
    const data: Record<string, { mon: string; yr: string; ys: number[] }> = {};
    nodes.forEach((n, i) => {
      const d = new Date(n.t);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      if (!data[key]) {
        data[key] = { mon: MONTHS[d.getUTCMonth()], yr: String(d.getUTCFullYear()), ys: [] };
        order.push(key);
      }
      data[key].ys.push(positions[i].y);
    });
    let lastYear = "";
    let lastY = -Infinity;
    for (const key of order) {
      const m = data[key];
      let y = m.ys.reduce((a, b) => a + b, 0) / m.ys.length; // vertical centre of the month's nodes
      if (y < lastY + 18) y = lastY + 18;
      lastY = y;
      monthBands.push({ label: m.yr !== lastYear ? `${m.mon} '${m.yr.slice(2)}` : m.mon, y });
      lastYear = m.yr;
    }
    if (monthBands.length === 1) monthBands[0].y = height / 2;
  }

  // ---- bubble CRUD ----
  const startNew = (nodeId: string) => {
    const existing = bubbles.filter((b) => b.nodeId === nodeId).length;
    setConfirmDelete(false);
    setEditing({ kind: "new", nodeId, side: existing % 2 === 0 ? "above" : "below", text: "", btype: "context" });
  };
  const startEdit = (b: L2Bubble) => {
    if (!canEdit) return;
    setConfirmDelete(false);
    setEditing({ kind: "edit", bubbleId: b.id, nodeId: b.nodeId, side: b.side, text: b.content, title: b.title ?? "", shape: b.shape ?? "rounded", btype: b.kind });
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
      const btype = editing.btype;
      const res = await createBubble(projectId, editing.nodeId, text, editing.side, label, projectName, btype);
      setBusy(false);
      if (res.error || !res.id) return void alert(res.error ?? "Could not save.");
      setBubbles((prev) => [...prev, { id: res.id!, nodeId: editing.nodeId, content: text, side: editing.side, source: "manual", kind: btype, x: null, y: null, title: null, width: null, height: null, shape: null, code: res.code ?? null }]);
    } else {
      const title = editing.title.trim() || null;
      const shape = editing.shape;
      const btype = editing.btype;
      const res = await updateBubble(editing.bubbleId, text);
      if (res.error) {
        setBusy(false);
        return void alert(res.error);
      }
      await updateBubbleMeta(editing.bubbleId, { title, shape, bubbleType: btype }); // best-effort (no-op pre-migration)
      setBusy(false);
      setBubbles((prev) => prev.map((b) => (b.id === editing.bubbleId ? { ...b, content: text, title, shape, kind: btype } : b)));
    }
    cancel();
  };
  const remove = async () => {
    if (editing?.kind !== "edit") return;
    const id = editing.bubbleId;
    setBusy(true);
    const res = await deleteBubble(id);
    setBusy(false);
    if (res.error) return void alert(res.error);
    setBubbles((prev) => prev.filter((b) => b.id !== id));
    cancel();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") cancel();
  };

  // ---- node editing (rename / type / demote / promote) ----
  const openRename = (n: L2Node) => {
    if (!canEdit) return;
    setNodeMenu(null);
    renameCancel.current = false;
    setRenaming({ nodeId: n.id, text: labelOverride[n.id] ?? n.label });
  };
  const saveRename = async () => {
    if (!renaming) return;
    if (renameCancel.current) {
      renameCancel.current = false;
      setRenaming(null);
      return;
    }
    const text = renaming.text.trim();
    const { nodeId } = renaming;
    setRenaming(null);
    if (!text) return;
    setLabelOverride((m) => ({ ...m, [nodeId]: text })); // optimistic
    const res = await renameNode(nodeId, text);
    if (res.error) {
      setLabelOverride((m) => {
        const rest = { ...m };
        delete rest[nodeId];
        return rest;
      });
      alert(res.error);
    }
  };
  const applyType = async (nodeId: string, current: NodeType | null, picked: NodeType) => {
    const next = current === picked ? null : picked; // tapping the active type clears it
    setNodeMenu(null);
    setTypeOverride((m) => ({ ...m, [nodeId]: next })); // optimistic
    const res = await setNodeType(nodeId, next);
    if (res.error) {
      setTypeOverride((m) => ({ ...m, [nodeId]: current }));
      alert(res.error);
    }
  };
  // Toggle a tag on a node (optimistic; the menu stays open for multi-select).
  const toggleTag = async (nodeId: string, valueId: string) => {
    const base = tagOverride[nodeId] ?? spineNodes.find((n) => n.id === nodeId)?.tags ?? [];
    const next = base.includes(valueId) ? base.filter((x) => x !== valueId) : [...base, valueId];
    setTagOverride((m) => ({ ...m, [nodeId]: next }));
    const res = await toggleNodeTag(nodeId, valueId);
    if (res.error) {
      setTagOverride((m) => ({ ...m, [nodeId]: base })); // revert
      alert(res.error);
    }
  };

  const changeState = async (nodeId: string, state: "promoted" | "demoted") => {
    setNodeMenu(null);
    setBusy(true);
    const res = await setNodeState(nodeId, state);
    setBusy(false);
    if (res.error) return void alert(res.error);
    router.refresh(); // demote/promote reshapes the spine — re-fetch the layout
  };

  // "Re-run initial layout": discard every manual position (server + local) so the
  // adaptive auto-layout takes over. Deliberately overwrites user drags.
  const rerunLayout = async () => {
    setLayoutBusy(true);
    const res = await resetL2Layout(projectId);
    if (res.error) {
      setLayoutBusy(false);
      return void alert(res.error);
    }
    // Clear in-session overrides immediately; refresh re-fetches the now-null
    // persisted positions so the algorithmic layout is what renders.
    setNodePos({});
    nodePosRef.current = {};
    setBubblePos({});
    bubblePosRef.current = {};
    setNotePos({});
    notePosRef.current = {};
    setNodeSize({});
    nodeSizeRef.current = {};
    setBubbleSize({});
    bubbleSizeRef.current = {};
    setNoteWidth({});
    noteWidthRef.current = {};
    setLayoutBusy(false);
    router.refresh();
  };

  const fmt = (iso: string) => {
    const d = new Date(iso + "T00:00:00Z");
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };

  return (
    <div ref={ref} className="flex-1 overflow-auto">
      {/* Re-run initial layout — pinned top-right; resets all manual positions */}
      {canEdit && (
        <div className="pointer-events-none sticky top-0 z-30 flex justify-end px-4 py-2">
          <button
            onClick={rerunLayout}
            disabled={layoutBusy}
            title="Reset every sub-node and node to the automatic layout (discards manual drags)"
            className="pointer-events-auto rounded-md border border-hairline bg-paper-surface px-3 py-1 text-xs text-ink shadow-sm hover:bg-paper disabled:opacity-60"
          >
            {layoutBusy ? "Re-laying out…" : "Re-run initial layout"}
          </button>
        </div>
      )}
      <div className="flex min-h-full justify-center" style={{ alignItems: height < vh ? "center" : "flex-start", marginTop: canEdit ? -36 : 0 }}>
        <div className="relative" style={{ width: COL_W, height }}>
          <svg width={COL_W} height={height} className="absolute inset-0" role="img" aria-label="Project node chain">
            {/* month band */}
            <rect x={0} y={0} width={BAND_W} height={height} fill="#e1d5ba" fillOpacity={0.5} />
            {monthBands.map((m, i) => (
              <text key={`mb-${i}`} x={12} y={Math.min(height - 10, Math.max(18, m.y))} fontSize={12.5} fontFamily="Georgia, serif" fill="#8a7d5c">
                {m.label}
              </text>
            ))}

            {/* wire */}
            <path d={roundedPath(positions, CORNER)} fill="none" stroke={OXBLOOD} strokeOpacity={0.5} strokeWidth={2.5} />

            {/* gap annotations */}
            {nodes.map((n, i) => {
              if (i === 0) return null;
              const days = (n.t - nodes[i - 1].t) / DAY;
              if (days <= GAP_NOTE_DAYS) return null;
              const a = positions[i - 1], b = positions[i];
              const sameRow = Math.abs(a.y - b.y) < 1;
              const mx = sameRow ? (a.x + b.x) / 2 : a.x + NODE / 2 + 12;
              const my = sameRow ? a.y - NODE / 2 - 12 : (a.y + b.y) / 2;
              return (
                <text key={`gap-${n.id}`} x={mx} y={my} textAnchor={sameRow ? "middle" : "start"} fontSize={10} fontStyle="italic" fontFamily="Georgia, serif" fill="#a8915f">
                  {humanGap(days)}
                </text>
              );
            })}

            {/* sub-node connectors — clear, solid, with a socket on the node edge */}
            {bubbleLayout.map(({ b, np, cx, cy }) => {
              if (editing?.kind === "edit" && editing.bubbleId === b.id) return null; // card hidden while editing
              const dx = cx - np.x,
                dy = cy - np.y;
              const len = Math.hypot(dx, dy) || 1;
              const r = szOf(b.nodeId) / 2;
              const sx = np.x + (dx / len) * r;
              const sy = np.y + (dy / len) * r;
              const edge = edgeColor(b.kind);
              return (
                <g key={`c-${b.id}`}>
                  <line
                    x1={sx}
                    y1={sy}
                    x2={cx}
                    y2={cy}
                    stroke={edge}
                    strokeWidth={1.75}
                    strokeOpacity={0.9}
                    strokeDasharray={b.kind === "information" ? "2 4" : undefined}
                  />
                  <circle cx={sx} cy={sy} r={3} fill={edge} />
                </g>
              );
            })}

            {/* demoted-node branches off the spine */}
            {demotedInstances.map(({ d, np, x, y }) => (
              <line key={`db-${d.id}`} x1={np.x} y1={np.y} x2={x} y2={y + DNODE / 2} stroke={OXBLOOD} strokeOpacity={0.4} strokeWidth={1.25} strokeDasharray="2 3" />
            ))}

            {/* Layer-1 note connectors — dotted amber */}
            {noteInstances.map(({ nt, np, cx, cy }) => {
              const dx = cx - np.x,
                dy = cy - np.y;
              const len = Math.hypot(dx, dy) || 1;
              const r = (nt.nodeId ? szOf(nt.nodeId) : NODE) / 2;
              const sx = np.x + (dx / len) * r;
              const sy = np.y + (dy / len) * r;
              return (
                <g key={`nc-${nt.id}`}>
                  <line x1={sx} y1={sy} x2={cx} y2={cy} stroke={NOTE_BORDER} strokeWidth={1.5} strokeDasharray="2 3" strokeOpacity={0.9} />
                  <circle cx={sx} cy={sy} r={3} fill={NOTE_BORDER} />
                </g>
              );
            })}

            {/* nodes — Layer 1 visual rules, scaled */}
            {nodes.map((n, i) => {
              const { x: cx, y: cy } = positions[i];
              const sz = szOf(n.id);
              const half = sz / 2;
              const primaryColor = n.tags[0] ? tagColors[n.tags[0]] : null;
              const fill = primaryColor ?? NODE_FILL;
              const stroke = primaryColor ? darken(primaryColor) : OXBLOOD;
              const showPerimeter = !n.done && n.stage > 0;
              const showCheck = n.done && !!n.deadline;
              const extras = n.tags.slice(1);
              return (
                <g key={n.id}>
                  <g transform={`translate(${cx - half}, ${cy - half}) scale(${sz / GLYPH})`}>
                    <rect width={GLYPH} height={GLYPH} rx={NODE_RX} ry={NODE_RX} fill={fill} stroke={stroke} strokeWidth={1.5} />
                    {showPerimeter && (
                      <path d={NODE_PERIMETER_PATH} pathLength={4} fill="none" stroke={ATTENTION_ALERT} strokeWidth={3} strokeDasharray={`${n.stage} 4`} strokeLinecap="butt" />
                    )}
                    {showCheck && (
                      <path d={CHECK_PATH} fill="none" stroke={primaryColor ? "#ffffff" : OXBLOOD} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    <title>
                      {n.label}
                      {n.deadline ? ` — deadline ${fmt(n.deadline)}` : ""}
                      {n.done ? " (done)" : ""}
                    </title>
                  </g>
                  {n.type && (
                    <g transform={`translate(${cx - half - 5}, ${cy - half - 5})`}>
                      <title>{NODE_TYPE_LABEL[n.type]}</title>
                      <circle cx={9} cy={9} r={10} fill={NODE_FILL} stroke={OXBLOOD} strokeWidth={1} />
                      <g transform="translate(2.5,2.5) scale(0.54)">
                        <path d={NODE_TYPE_ICON[n.type]} fill="none" stroke={OXBLOOD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    </g>
                  )}
                  {extras.map((tid, bi) => (
                    <rect key={tid} x={cx - BAR_W / 2} y={cy + half + BAR_GAP + bi * (BAR_H + BAR_GAP)} width={BAR_W} height={BAR_H} rx={2} ry={2} fill={tagColors[tid] ?? MUTED} />
                  ))}
                  <text
                    x={cx}
                    y={cy + half + (extras.length ? extras.length * (BAR_H + BAR_GAP) + BAR_GAP : 0) + 18}
                    textAnchor="middle"
                    fontSize={13.5}
                    fontFamily="Georgia, serif"
                    fill="#6b6244"
                  >
                    {trunc(n.label)}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* node hit area: drag to reposition · double-click to rename · hover for + and ⋯ */}
          {canEdit &&
            nodes.map((n, i) => {
              const { x: cx, y: cy } = positions[i];
              const sz = szOf(n.id);
              const draggingThis = draggingNode === n.id;
              return (
                <div
                  key={`hit-${n.id}`}
                  className={draggingThis ? "absolute cursor-grabbing" : "absolute cursor-grab"}
                  title="Drag to move · double-click to rename"
                  style={{ left: cx - sz / 2, top: cy - sz / 2, width: sz, height: sz, touchAction: "none" }}
                  onMouseEnter={() => setHovered(n.id)}
                  onMouseLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  onDoubleClick={() => openRename(n)}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    nodeDragRef.current = { id: n.id, moved: false, dist: 0 };
                    setDraggingNode(n.id);
                  }}
                  onPointerMove={(e) => {
                    if (draggingNode !== n.id || !nodeDragRef.current) return;
                    nodeDragRef.current.dist += Math.abs(e.movementX) + Math.abs(e.movementY);
                    if (nodeDragRef.current.dist <= 4) return; // ignore jitter (keeps double-click working)
                    nodeDragRef.current.moved = true;
                    setNodePos((prev) => {
                      const cur = prev[n.id] ?? { x: cx, y: cy };
                      const nx = Math.max(BAND_W + sz / 2, Math.min(COL_W - sz / 2, cur.x + e.movementX));
                      const ny = Math.max(sz / 2 + 8, cur.y + e.movementY);
                      const next = { ...prev, [n.id]: { x: nx, y: ny } };
                      nodePosRef.current = next;
                      return next;
                    });
                  }}
                  onPointerUp={(e) => {
                    if (draggingNode !== n.id) return;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    setDraggingNode(null);
                    const info = nodeDragRef.current;
                    nodeDragRef.current = null;
                    if (info?.moved) {
                      const cur = nodePosRef.current[n.id] ?? { x: cx, y: cy };
                      updateNodePosition(n.id, cur.x, cur.y); // persist (fire-and-forget)
                    }
                  }}
                >
                  {/* resize handle (bottom-left; square/uniform; Layer-2-only) */}
                  {(hovered === n.id || resizingNode === n.id) && (
                    <div
                      title="Drag to resize"
                      className="absolute"
                      style={{ left: -3, bottom: -3, width: 14, height: 14, cursor: "nesw-resize", zIndex: 2 }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const ns = { ...nodeSizeRef.current, [n.id]: sz };
                        nodeSizeRef.current = ns;
                        setNodeSize(ns);
                        setResizingNode(n.id);
                      }}
                      onPointerMove={(e) => {
                        if (resizingNode !== n.id) return;
                        e.stopPropagation();
                        const cur = nodeSizeRef.current[n.id] ?? sz;
                        const next = Math.max(32, Math.min(140, cur + (e.movementY - e.movementX) / 2));
                        const ns = { ...nodeSizeRef.current, [n.id]: next };
                        nodeSizeRef.current = ns;
                        setNodeSize(ns);
                      }}
                      onPointerUp={(e) => {
                        if (resizingNode !== n.id) return;
                        e.stopPropagation();
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        setResizingNode(null);
                        const s = nodeSizeRef.current[n.id];
                        if (s) updateNodeSize(n.id, s);
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 14 14">
                        <path d="M1 6 L8 13 M1 10 L4 13" stroke={OXBLOOD} strokeWidth={1.5} strokeLinecap="round" />
                      </svg>
                    </div>
                  )}
                  {(hovered === n.id || nodeMenu === n.id) && (
                    <>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => startNew(n.id)}
                        title="Add a context note"
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-oxblood text-xs leading-none text-paper hover:bg-oxblood-dark"
                      >
                        +
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => setNodeMenu((m) => (m === n.id ? null : n.id))}
                        title="Node actions"
                        className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-paper-surface text-xs leading-none text-oxblood ring-1 ring-hairline hover:bg-paper"
                      >
                        ⋯
                      </button>
                    </>
                  )}
                </div>
              );
            })}

          {/* node-actions menu */}
          {canEdit &&
            nodeMenu &&
            (() => {
              const i = nodes.findIndex((n) => n.id === nodeMenu);
              if (i < 0) return null;
              const n = nodes[i];
              const { x: cx, y: cy } = positions[i];
              return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNodeMenu(null)} />
                  <div
                    className="absolute z-20 w-52 rounded-md border border-hairline bg-paper-surface p-1 shadow-lg"
                    style={{ left: Math.max(8, Math.min(cx + szOf(n.id) / 2, COL_W - 216)), top: Math.max(8, Math.min(cy + szOf(n.id) / 2 + 6, height - 220)) }}
                  >
                    <button onClick={() => openRename(n)} className="block w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-paper">
                      Rename
                    </button>
                    <div className="px-2 pb-0.5 pt-1.5 text-[8px] uppercase tracking-[0.5px] text-muted">Type</div>
                    <div className="flex flex-wrap gap-1 px-1.5 pb-1">
                      {NODE_TYPE_ORDER.map((t) => (
                        <button
                          key={t}
                          onClick={() => applyType(n.id, n.type, t)}
                          title={NODE_TYPE_LABEL[t]}
                          className={`flex h-6 w-6 items-center justify-center rounded ring-1 hover:bg-paper ${n.type === t ? "bg-paper ring-oxblood" : "ring-hairline"}`}
                        >
                          <svg width={15} height={15} viewBox="0 0 24 24">
                            <path d={NODE_TYPE_ICON[t]} fill="none" stroke={OXBLOOD} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ))}
                    </div>
                    {/* Tags — toggle the workspace's existing tag values on this node */}
                    <div className="px-2 pb-0.5 pt-1.5 text-[8px] uppercase tracking-[0.5px] text-muted">Tags</div>
                    {tagCatalog.some((c) => c.values.length > 0) ? (
                      <div className="max-h-40 overflow-auto px-1.5 pb-1">
                        {tagCatalog
                          .filter((c) => c.values.length > 0)
                          .map((cat) => (
                            <div key={cat.id} className="mb-1">
                              <div className="text-[8px] uppercase tracking-[0.4px] text-muted">{cat.name}</div>
                              <div className="mt-0.5 flex flex-wrap gap-1">
                                {cat.values.map((v) => {
                                  const active = n.tags.includes(v.id);
                                  return (
                                    <button
                                      key={v.id}
                                      onClick={() => toggleTag(n.id, v.id)}
                                      className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] ring-1 hover:bg-paper ${active ? "bg-paper text-ink ring-oxblood" : "text-muted ring-hairline"}`}
                                    >
                                      <span className="h-2 w-2 rounded-full" style={{ background: v.color ?? "#a1a1aa" }} />
                                      {v.value}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="px-2 pb-1 text-[10px] italic text-muted">No tags yet — create them in the overview.</div>
                    )}
                    <button
                      onClick={() => changeState(n.id, "demoted")}
                      disabled={busy}
                      className="mt-0.5 block w-full rounded border-t border-hairline px-2 py-1 text-left text-xs text-oxblood hover:bg-paper disabled:opacity-60"
                    >
                      Demote off overview
                    </button>
                  </div>
                </>
              );
            })()}

          {/* inline node rename */}
          {canEdit &&
            renaming &&
            (() => {
              const i = nodes.findIndex((n) => n.id === renaming.nodeId);
              const di = i < 0 ? demotedInstances.find((v) => v.d.id === renaming.nodeId) : null;
              if (i < 0 && !di) return null;
              const cx = i >= 0 ? positions[i].x : di!.x;
              const cy = i >= 0 ? positions[i].y : di!.y;
              return (
                <div className="absolute z-30" style={{ left: Math.max(112, Math.min(cx, COL_W - 112)), top: Math.min(cy + NODE / 2 + 6, height - 60), width: 220, transform: "translateX(-50%)" }}>
                  <div className="rounded-md border border-hairline bg-paper-surface p-1.5 shadow-lg">
                    <input
                      autoFocus
                      value={renaming.text}
                      onChange={(e) => setRenaming({ ...renaming, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          saveRename();
                        } else if (e.key === "Escape") {
                          renameCancel.current = true;
                          setRenaming(null);
                        }
                      }}
                      onBlur={saveRename}
                      placeholder="Node title…"
                      className="w-full rounded border border-hairline bg-paper px-1.5 py-1 text-ink outline-none"
                      style={{ fontFamily: "Georgia, serif", fontSize: 13 }}
                    />
                  </div>
                </div>
              );
            })()}

          {/* demoted nodes — branching glyphs off the spine, with a promote action */}
          {demotedInstances.map(({ d, x, y }) => (
            <div
              key={`dn-${d.id}`}
              className="absolute"
              style={{ left: x, top: y, width: DBUB_W, transform: "translateX(-50%)" }}
              onMouseEnter={() => setHovered(`d-${d.id}`)}
              onMouseLeave={() => setHovered((h) => (h === `d-${d.id}` ? null : h))}
            >
              <div className="flex flex-col items-center">
                <div
                  className="flex items-center justify-center rounded-md border border-dashed bg-paper text-[8px] uppercase tracking-[0.5px]"
                  style={{ width: DNODE, height: DNODE, borderColor: OXBLOOD, color: MUTED }}
                  title={d.label}
                >
                  off
                </div>
                <div className="mt-1 text-center" style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 11, color: "#6b6244", lineHeight: 1.2 }}>
                  {trunc(d.label)}
                </div>
                {canEdit && hovered === `d-${d.id}` && (
                  <div className="mt-1 flex items-center gap-2 text-[11px]">
                    <button onClick={() => changeState(d.id, "promoted")} disabled={busy} className="text-oxblood hover:underline disabled:opacity-60">
                      Promote
                    </button>
                    <button onClick={() => openRename(d)} className="text-muted hover:text-ink">
                      Rename
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* sub-node chips — Pantone chips (draggable; click to edit; corner to
              resize). Width = slot width; height auto unless the user resizes. */}
          {bubbleLayout.map(({ b, cx, cy, off, w, h }) => {
            if (editing?.kind === "edit" && editing.bubbleId === b.id) return null;
            const dragging = draggingBubble === b.id;
            const resizing = resizingBubble === b.id;
            return (
              <div
                key={b.id}
                data-bubble={b.id}
                className={canEdit ? (dragging ? "absolute cursor-grabbing select-none" : "absolute cursor-grab select-none") : "absolute select-none"}
                title={canEdit ? "Click to edit · drag to move · corner to resize" : ""}
                style={{ left: cx, top: cy, width: w, transform: "translate(-50%, -50%)", touchAction: "none", zIndex: dragging || resizing ? 30 : 12 }}
                onMouseEnter={() => setHovered(`b-${b.id}`)}
                onMouseLeave={() => setHovered((hh) => (hh === `b-${b.id}` ? null : hh))}
                onPointerDown={
                  canEdit
                    ? (e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        bubbleDragRef.current = { id: b.id, moved: false, dist: 0 };
                        setDraggingBubble(b.id);
                      }
                    : undefined
                }
                onPointerMove={
                  canEdit
                    ? (e) => {
                        if (draggingBubble !== b.id || !bubbleDragRef.current) return;
                        bubbleDragRef.current.dist += Math.abs(e.movementX) + Math.abs(e.movementY);
                        if (bubbleDragRef.current.dist <= 4) return; // ignore jitter
                        bubbleDragRef.current.moved = true;
                        setBubblePos((prev) => {
                          const cur = prev[b.id] ?? off;
                          const next = { ...prev, [b.id]: { x: cur.x + e.movementX, y: cur.y + e.movementY } };
                          bubblePosRef.current = next;
                          return next;
                        });
                      }
                    : undefined
                }
                onPointerUp={
                  canEdit
                    ? (e) => {
                        if (draggingBubble !== b.id) return;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        setDraggingBubble(null);
                        const info = bubbleDragRef.current;
                        bubbleDragRef.current = null;
                        if (info?.moved) {
                          const cur = bubblePosRef.current[b.id] ?? off;
                          updateBubblePosition(b.id, cur.x, cur.y); // persist (fire-and-forget)
                        } else {
                          startEdit(b); // a click (no real drag) opens the editor
                        }
                      }
                    : undefined
                }
              >
                <SubnodeChip type={b.kind} body={b.content} code={b.code} scroll={h != null} style={{ height: h ?? undefined }} />

                {/* corner resize handle (width + height) */}
                {canEdit && (hovered === `b-${b.id}` || resizing) && (
                  <div
                    title="Drag to resize"
                    className="absolute"
                    style={{ right: -3, bottom: -3, width: 14, height: 14, cursor: "nwse-resize", zIndex: 31 }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const card = e.currentTarget.parentElement!;
                      const ns = { ...bubbleSizeRef.current, [b.id]: { w: card.offsetWidth, h: card.offsetHeight } };
                      bubbleSizeRef.current = ns;
                      setBubbleSize(ns);
                      setResizingBubble(b.id);
                    }}
                    onPointerMove={(e) => {
                      if (resizingBubble !== b.id) return;
                      e.stopPropagation();
                      const cur = bubbleSizeRef.current[b.id] ?? { w, h: h ?? 80 };
                      const nw = Math.max(104, Math.min(380, cur.w + e.movementX));
                      const nh = Math.max(32, Math.min(440, cur.h + e.movementY));
                      const dw = nw - cur.w,
                        dh = nh - cur.h;
                      if (!dw && !dh) return;
                      const ns = { ...bubbleSizeRef.current, [b.id]: { w: nw, h: nh } };
                      bubbleSizeRef.current = ns;
                      setBubbleSize(ns);
                      // keep the top-left corner fixed by shifting the centre by half the delta
                      const cp = bubblePosRef.current[b.id] ?? off;
                      const np2 = { ...bubblePosRef.current, [b.id]: { x: cp.x + dw / 2, y: cp.y + dh / 2 } };
                      bubblePosRef.current = np2;
                      setBubblePos(np2);
                    }}
                    onPointerUp={(e) => {
                      if (resizingBubble !== b.id) return;
                      e.stopPropagation();
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      setResizingBubble(null);
                      const s = bubbleSizeRef.current[b.id];
                      const p = bubblePosRef.current[b.id];
                      if (s) updateBubbleSize(b.id, s.w, s.h);
                      if (p) updateBubblePosition(b.id, p.x, p.y);
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 14 14">
                      <path d="M13 5 L5 13 M13 9 L9 13" stroke={edgeColor(b.kind)} strokeWidth={1.5} strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* Layer-1 notes shown on L2 — Pantone Note chips (draggable; corner to resize width; edit text in the overview) */}
          {noteInstances.map(({ nt, cx, cy, w }) => {
            const dragging = draggingNoteCard === nt.id;
            const resizing = resizingNoteCard === nt.id;
            return (
              <div
                key={`note-${nt.id}`}
                className={canEdit ? (dragging ? "absolute cursor-grabbing select-none" : "absolute cursor-grab select-none") : "absolute select-none"}
                title={canEdit ? "Drag to move · corner to resize" : nt.body}
                style={{ left: cx, top: cy, width: w, transform: "translate(-50%, -50%)", touchAction: "none", zIndex: dragging || resizing ? 30 : 11 }}
                onMouseEnter={() => setHovered(`note-${nt.id}`)}
                onMouseLeave={() => setHovered((hh) => (hh === `note-${nt.id}` ? null : hh))}
                onPointerDown={
                  canEdit
                    ? (e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        noteDragRef.current = { id: nt.id, moved: false, dist: 0 };
                        setDraggingNoteCard(nt.id);
                      }
                    : undefined
                }
                onPointerMove={
                  canEdit
                    ? (e) => {
                        if (draggingNoteCard !== nt.id || !noteDragRef.current) return;
                        noteDragRef.current.dist += Math.abs(e.movementX) + Math.abs(e.movementY);
                        if (noteDragRef.current.dist <= 4) return;
                        noteDragRef.current.moved = true;
                        setNotePos((prev) => {
                          const cur = prev[nt.id] ?? { x: cx, y: cy };
                          const next = { ...prev, [nt.id]: { x: cur.x + e.movementX, y: cur.y + e.movementY } };
                          notePosRef.current = next;
                          return next;
                        });
                      }
                    : undefined
                }
                onPointerUp={
                  canEdit
                    ? (e) => {
                        if (draggingNoteCard !== nt.id) return;
                        e.currentTarget.releasePointerCapture(e.pointerId);
                        setDraggingNoteCard(null);
                        const info = noteDragRef.current;
                        noteDragRef.current = null;
                        if (info?.moved) {
                          const cur = notePosRef.current[nt.id] ?? { x: cx, y: cy };
                          updateNoteLayout(nt.id, { x: cur.x, y: cur.y });
                        }
                      }
                    : undefined
                }
              >
                <SubnodeChip type="note" body={nt.body} code={nt.code} />

                {/* width resize handle (bottom-right) */}
                {canEdit && (hovered === `note-${nt.id}` || resizing) && (
                  <div
                    title="Drag to resize"
                    className="absolute"
                    style={{ right: -3, bottom: -3, width: 14, height: 14, cursor: "ew-resize", zIndex: 31 }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const ns = { ...noteWidthRef.current, [nt.id]: w };
                      noteWidthRef.current = ns;
                      setNoteWidth(ns);
                      setResizingNoteCard(nt.id);
                    }}
                    onPointerMove={(e) => {
                      if (resizingNoteCard !== nt.id) return;
                      e.stopPropagation();
                      const cur = noteWidthRef.current[nt.id] ?? w;
                      const next = Math.max(104, Math.min(320, cur + e.movementX));
                      const ns = { ...noteWidthRef.current, [nt.id]: next };
                      noteWidthRef.current = ns;
                      setNoteWidth(ns);
                    }}
                    onPointerUp={(e) => {
                      if (resizingNoteCard !== nt.id) return;
                      e.stopPropagation();
                      e.currentTarget.releasePointerCapture(e.pointerId);
                      setResizingNoteCard(null);
                      const ww = noteWidthRef.current[nt.id];
                      if (ww) updateNoteLayout(nt.id, { w: ww });
                    }}
                  >
                    <svg width={14} height={14} viewBox="0 0 14 14">
                      <path d="M13 5 L5 13 M13 9 L9 13" stroke={NOTE_BORDER} strokeWidth={1.5} strokeLinecap="round" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}

          {/* editor — centred modal so it's always fully visible (never clipped at an edge) */}
          {editing && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) cancel();
              }}
            >
              <div className="flex w-[264px] gap-2 rounded-md border border-hairline bg-paper-surface p-2 shadow-xl">
                <div className="shrink-0 rounded" style={{ width: 4, background: edgeColor(editing.btype) }} />
                <div className="flex-1">
                  {/* kind toggle: Context vs Information */}
                  <div className="mb-1.5 flex items-center gap-1">
                    {(["context", "information"] as BubbleKind[]).map((kk) => (
                      <button
                        key={kk}
                        onClick={() => setEditing({ ...editing, btype: kk })}
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] ${editing.btype === kk ? "text-paper" : "text-muted ring-1 ring-hairline hover:bg-paper"}`}
                        style={editing.btype === kk ? { background: edgeColor(kk) } : undefined}
                      >
                        {kk === "context" ? "Context" : "Information"}
                      </button>
                    ))}
                  </div>
                  {editing.kind === "edit" && (
                    <input
                      autoFocus
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          save();
                        } else if (e.key === "Escape") cancel();
                      }}
                      placeholder={deriveTitle(editing.text) || "Title (defaults to the text)"}
                      className="mb-1 w-full rounded border border-hairline bg-paper px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.4px] outline-none"
                      style={{ color: edgeColor(editing.btype) }}
                    />
                  )}
                  <textarea
                    autoFocus={editing.kind === "new"}
                    rows={editing.kind === "edit" ? 3 : 2}
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    onKeyDown={onKey}
                    placeholder="Add context…"
                    className="mt-0.5 w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-ink outline-none"
                    style={{ fontFamily: "Georgia, serif", fontSize: 12.5 }}
                  />
                  {editing.kind === "edit" && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="mr-0.5 text-[8px] uppercase tracking-[0.5px] text-muted">Shape</span>
                      {SHAPE_ORDER.map((s) => (
                        <button
                          key={s}
                          onClick={() => setEditing({ ...editing, shape: s })}
                          title={SHAPE_LABEL[s]}
                          className={`h-5 w-6 hover:bg-paper ${editing.shape === s ? "ring-1 ring-oxblood" : "ring-1 ring-hairline"}`}
                          style={{ borderRadius: SHAPE_RADIUS[s], background: editing.shape === s ? PAPER_SURFACE : "transparent" }}
                        />
                      ))}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
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
    </div>
  );
}
