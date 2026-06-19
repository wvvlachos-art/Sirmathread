"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  createAmbition,
  createManualNode,
  toggleAmbition,
  updateNode,
  updateAmbition,
  deleteAmbition,
  deleteNode,
  archiveProject,
  deleteProject,
  mergeProjects,
  toggleProjectTag,
  toggleNodeTag,
  toggleAmbitionTag,
  setProjectColor,
  setProjectSpineColor,
  setNodeDeadline,
  clearNodeDeadline,
  setProjectDeadline,
  setNodeDone,
  createNote,
  updateNotePosition,
  updateNoteBody,
  deleteNote,
  getNodeDetail,
} from "./actions";
import { createBubble, updateBubble, deleteBubble } from "../project/[id]/actions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtEU } from "@/lib/dateFormat";
import MiniCalendar from "./MiniCalendar";
import SubnodeChip from "@/app/SubnodeChip";
import { useWand } from "./wand";
import {
  NODE_FILL,
  OXBLOOD,
  INK,
  MUTED,
  HAIRLINE,
  PAPER,
  PAPER_SURFACE,
  NOTE_FILL,
  NOTE_BORDER,
  AXIS_BG,
  AXIS_INK,
  AXIS_YEAR,
  AXIS_RULE,
  PILL_EDGE,
  PILL_INK,
  SPINE_PALETTE,
  ATTENTION_ALERT,
  ATTENTION_NORMAL,
  ATTENTION_INACTIVE,
  darken,
} from "@/lib/theme";

// Tag-bar geometry (the thin colour bars beneath a multi-tagged node).
const BAR_H = 3;
const BAR_GAP = 3;
const BAR_WIDTH_FACTOR = 0.78; // fraction of nodeSize
const BAR_RX = 1.5;
// Bars only render when nodes are at full size. At wider zooms (3m, 6m) the
// node shrinks toward a dot and there's no room — tags surface via the tag
// lens at those zooms (separate feature).
const BARS_VISIBLE_MAX_DAYS = 30;

type TagCat = {
  id: string;
  name: string;
  isHide: boolean;
  values: { id: string; value: string; color: string }[];
};

export type LaneNode = {
  id: string;
  label: string;
  t: number;
  stage: number;
  done: boolean;
  deadline: string | null;
  origin: string;
  tags: string[];
};
export type Ambition = { id: string; title: string; t: number; done: boolean; isDeadline: boolean; stage: number; tags: string[] };
export type Note = { id: string; body: string; x: number; y: number; anchorT: number };
export type Attention = "inactive" | "alert" | "normal";
export type Lane = {
  id: string;
  name: string;
  origin: string;
  color: string | null;
  spineColor: string | null;
  spineUserSet: boolean;
  attention: Attention;
  lastActivityAt: string | null;
  archived: boolean;
  inactive: boolean;
  deadline: string | null;
  nodes: LaneNode[];
  ambitions: Ambition[];
  tags: string[];
  notes: Note[];
};

// Origin-colour distinction is removed in this visual pass; both Gmail and
// manual nodes render with the same cream fill + oxblood outline. The
// `colorFor` helper is kept so step 2 can rip out the origin plumbing cleanly.
const colorFor = (_origin: string) => NODE_FILL;

// Preset palette for per-project colour-coding (custom project rail dot/wire).
const PROJECT_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];

const DAY = 86_400_000;
const NODE = 48;
const AMB_R = 22;
const AXIS_H = 46;
// Widened to fit the enriched left-rail content (spine + name + pills + meta).
const LABEL_W = 244;
const LANES_PER_SCREEN = 5;
const MIN_LANE_H = 120;
const CHUNK_DAYS = 60;
const MAX_SPAN_DAYS = 5 * 365;
const INITIAL_BACK = 120;
const INITIAL_FWD = 60;

// Rounded-rect perimeter for the deadline border, in the NODE × NODE coordinate
// space. Starts at the top-left corner exit and traces clockwise — top edge,
// top-right corner, right edge, etc. Combined with pathLength={4} and
// strokeDasharray="N 4", N ∈ 1..4 reveals one quarter of the perimeter per
// stage, so the border grows clockwise from the top as the deadline approaches.
const NODE_RX = 7;
const NODE_PERIMETER_PATH =
  `M ${NODE_RX} 0 H ${NODE - NODE_RX} ` +
  `A ${NODE_RX} ${NODE_RX} 0 0 1 ${NODE} ${NODE_RX} ` +
  `V ${NODE - NODE_RX} ` +
  `A ${NODE_RX} ${NODE_RX} 0 0 1 ${NODE - NODE_RX} ${NODE} ` +
  `H ${NODE_RX} ` +
  `A ${NODE_RX} ${NODE_RX} 0 0 1 0 ${NODE - NODE_RX} ` +
  `V ${NODE_RX} ` +
  `A ${NODE_RX} ${NODE_RX} 0 0 1 ${NODE_RX} 0 Z`;
// Check mark for completed-with-deadline nodes (centred-ish in NODE space).
const CHECK_PATH = "M 14 24 L 22 32 L 36 16";
// At zooms above this many days/screen, the 4-stage detail is unreadable —
// collapse to a single full red ring.
const PERIMETER_STAGES_MAX_DAYS = 30;

// Ambition perimeter path: same idea as nodes, but a full circle. Four 90°
// arcs starting at 12 o'clock and going clockwise (12→3→6→9→12). With
// pathLength={4} and dasharray "N 4" we reveal N quarters from the top.
// The {cx, cy} placeholders are replaced per-ambition since circle centres
// aren't anchored to (0,0).
const ambPerimeterPath = (cx: number, cy: number, r: number) =>
  `M ${cx} ${cy - r} ` +
  `A ${r} ${r} 0 0 1 ${cx + r} ${cy} ` +
  `A ${r} ${r} 0 0 1 ${cx} ${cy + r} ` +
  `A ${r} ${r} 0 0 1 ${cx - r} ${cy} ` +
  `A ${r} ${r} 0 0 1 ${cx} ${cy - r} Z`;

// Compact relative time for the meta line under the project name.
function relTimeAgo(iso: string | null, nowMs: number): string {
  if (!iso) return "—";
  const days = Math.floor((nowMs - new Date(iso).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const ZOOMS = [
  { days: 7, label: "1w" },
  { days: 30, label: "1m" },
  { days: 90, label: "3m" },
  { days: 180, label: "6m" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoFromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Captions get truncated so they stay short under each node.
const LABEL_MAX = 26;
const truncLabel = (s: string) => (s.length > LABEL_MAX ? s.slice(0, LABEL_MAX - 1) + "…" : s);

// A little wand (stick + star) used as the cursor while the wand is armed.
// Oxblood stick + gold star with a paper-coloured halo so it reads on the
// kraft canvas regardless of what's under it.
const WAND_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" +
  "<line x1='3' y1='25' x2='17' y2='11' stroke='#e7dcc4' stroke-width='4.5' stroke-linecap='round'/>" +
  "<line x1='3' y1='25' x2='17' y2='11' stroke='#7a2718' stroke-width='2.6' stroke-linecap='round'/>" +
  "<path d='M21 2 l1.5 4.2 l4.2 1.5 l-4.2 1.5 l-1.5 4.2 l-1.5-4.2 l-4.2-1.5 l4.2-1.5 z' fill='#eab308' stroke='#7a2718' stroke-width='0.6'/>" +
  "</svg>";
const WAND_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(WAND_SVG)}") 21 6, crosshair`;

// Arrange tag dots like dice pips so several tags pack neatly inside a node.
// Idle note size band: from a small dot up to a bit wider than a node and
// ~80% its height. Stored per-note in the browser.
const NOTE_MIN_W = 14;
const NOTE_MAX_W = 84;
const NOTE_MAX_H = 57;
const NOTE_DEFAULT_W = 48;
const NOTE_SIZES_KEY = "sirma:noteSizes";
const noteHeight = (w: number) => Math.max(NOTE_MIN_W, Math.min(NOTE_MAX_H, Math.round(w * 0.68)));

const DICE: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  7: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]],
  8: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
  9: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]],
};
function pipPositions(n: number): { x: number; y: number; r: number }[] {
  if (n >= 1 && n <= 9) {
    return DICE[n].map(([c, r]) => ({ x: 12 + c * 12, y: 12 + r * 12, r: 5 }));
  }
  // Many tags: a centred grid (up to 4 per row) with smaller dots.
  const cols = 4;
  const rows = Math.ceil(n / cols);
  const stepX = 11;
  const stepY = 11;
  const startX = (NODE - (cols - 1) * stepX) / 2;
  const startY = (NODE - (rows - 1) * stepY) / 2;
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: startX + (i % cols) * stepX, y: startY + Math.floor(i / cols) * stepY, r: 3.2 });
  }
  return out;
}

// ---- Per-lane label layout --------------------------------------------------
// Goal: keep adjacent node labels from overlapping. Strategy in priority order
// is place→stagger→truncate→absorb (the last reusing the existing cluster
// mechanism). Computed once per render from clusters + measured text widths.

const LABEL_FONT =
  '11px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
const LABEL_GAP = 4;     // px breathing room between labels on the same side
const LABEL_MIN_W = 18;  // narrower than this → can't read → absorb into cluster

let _measureCanvas: HTMLCanvasElement | null = null;
function measureText(text: string, fontStr: string): number {
  if (typeof document === "undefined") return text.length * 6; // SSR fallback
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas");
  const ctx = _measureCanvas.getContext("2d");
  if (!ctx) return text.length * 6;
  ctx.font = fontStr;
  return ctx.measureText(text).width;
}

// Binary-search the longest prefix that, with an ellipsis, fits within maxWidth.
function truncateToWidth(text: string, maxWidth: number, fontStr: string): string {
  if (measureText(text, fontStr) <= maxWidth) return text;
  let lo = 1;
  let hi = text.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = measureText(text.slice(0, mid) + "…", fontStr);
    if (w <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best >= 1 ? text.slice(0, best) + "…" : "";
}

type SoloLabel = { text: string; fullText: string; side: "below" | "above" };

function layoutLaneLabels(
  nodes: LaneNode[],
  xFor: (t: number) => number,
  nodeSize: number,
): { clusters: LaneNode[][]; labels: Map<string, SoloLabel> } {
  // 1. Initial clustering — same threshold as before, so we don't change which
  //    nodes already cluster; we only use clustering as the *fallback* below.
  const minGapX = nodeSize + 6;
  const clusters: LaneNode[][] = [];
  {
    let i = 0;
    while (i < nodes.length) {
      let j = i + 1;
      while (j < nodes.length && xFor(nodes[j].t) - xFor(nodes[j - 1].t) < minGapX) j++;
      clusters.push(nodes.slice(i, j));
      i = j;
    }
  }

  // 2. Single L→R sweep over EVERY node (solo *and* cluster member). Each
  //    label tries: below → above → truncate. Solos that don't fit are
  //    candidates for absorption; cluster members that don't fit just drop
  //    their leader-text (the cluster badge + click-list still covers them).
  type PlaceResult = { labels: Map<string, SoloLabel>; soloLeftovers: Set<string> };
  const place = (cls: LaneNode[][]): PlaceResult => {
    const labels = new Map<string, SoloLabel>();
    const soloLeftovers = new Set<string>();
    const soloIds = new Set<string>();
    for (const cl of cls) if (cl.length === 1) soloIds.add(cl[0].id);

    type Item = { nodeId: string; cx: number; text: string };
    const items: Item[] = [];
    for (const cl of cls) for (const n of cl) items.push({ nodeId: n.id, cx: xFor(n.t), text: n.label });
    items.sort((a, b) => a.cx - b.cx);

    let lastBelow = -Infinity;
    let lastAbove = -Infinity;
    for (const it of items) {
      const fullW = measureText(it.text, LABEL_FONT);
      if (it.cx - fullW / 2 >= lastBelow + LABEL_GAP) {
        labels.set(it.nodeId, { text: it.text, fullText: it.text, side: "below" });
        lastBelow = it.cx + fullW / 2;
        continue;
      }
      if (it.cx - fullW / 2 >= lastAbove + LABEL_GAP) {
        labels.set(it.nodeId, { text: it.text, fullText: it.text, side: "above" });
        lastAbove = it.cx + fullW / 2;
        continue;
      }
      const tryTrunc = (side: "below" | "above", roomEdge: number): boolean => {
        const availW = 2 * (it.cx - roomEdge - LABEL_GAP);
        if (availW < LABEL_MIN_W) return false;
        const t = truncateToWidth(it.text, availW, LABEL_FONT);
        if (!t) return false;
        const w = measureText(t, LABEL_FONT);
        labels.set(it.nodeId, { text: t, fullText: it.text, side });
        if (side === "below") lastBelow = it.cx + w / 2;
        else lastAbove = it.cx + w / 2;
        return true;
      };
      const placed =
        lastBelow <= lastAbove
          ? tryTrunc("below", lastBelow) || tryTrunc("above", lastAbove)
          : tryTrunc("above", lastAbove) || tryTrunc("below", lastBelow);
      // Solos that couldn't fit anything are candidates for absorption;
      // cluster members just go without a leader-text (badge covers them).
      if (!placed && soloIds.has(it.nodeId)) soloLeftovers.add(it.nodeId);
    }
    return { labels, soloLeftovers };
  };

  let { labels, soloLeftovers } = place(clusters);

  // 3. Absorb unfittable solos into the nearest adjacent cluster, processed
  //    back-to-front so earlier indices stay valid through splices.
  if (soloLeftovers.size) {
    const absorbIdx: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].length === 1 && soloLeftovers.has(clusters[i][0].id)) absorbIdx.push(i);
    }
    absorbIdx.sort((a, b) => b - a);
    for (const idx of absorbIdx) {
      const my = clusters[idx];
      const myX = xFor(my[0].t);
      const dist = (cl: LaneNode[]) => {
        const xs = cl.map((n) => xFor(n.t));
        const cxC = cl.length > 1 ? (Math.min(...xs) + Math.max(...xs)) / 2 : xs[0];
        return Math.abs(cxC - myX);
      };
      const hasPrev = idx - 1 >= 0;
      const hasNext = idx + 1 < clusters.length;
      let targetIdx: number;
      if (hasPrev && hasNext) targetIdx = dist(clusters[idx - 1]) <= dist(clusters[idx + 1]) ? idx - 1 : idx + 1;
      else if (hasPrev) targetIdx = idx - 1;
      else if (hasNext) targetIdx = idx + 1;
      else continue;
      clusters[targetIdx] = [...clusters[targetIdx], ...my].sort((a, b) => a.t - b.t);
      clusters.splice(idx, 1);
    }
    // Re-run placement now that the cluster shape changed; second-pass
    // leftovers (cluster-member labels that still can't fit) just don't render.
    labels = place(clusters).labels;
  }

  return { clusters, labels };
}

export default function Timeline({
  lanes: lanesProp,
  nowMs,
  tagColors,
  categories,
  selectedTags,
  deadlineActive,
}: {
  lanes: Lane[];
  nowMs: number;
  tagColors: Record<string, string>;
  categories: TagCat[];
  selectedTags: string[];
  deadlineActive: boolean;
}) {
  const filterActive = selectedTags.length > 0 || deadlineActive;
  const { armed, setArmed } = useWand();

  // The canvas owns its data after the initial server snapshot. Mutations
  // (add node, tag toggle, delete, ...) update this local state directly,
  // so we never re-fetch the whole project list on every click. Resyncs only
  // when the parent re-renders with a genuinely new snapshot — i.e. when the
  // URL filter/sort changes, page.tsx re-runs and hands us a new lanesProp.
  const [lanes, setLanes] = useState<Lane[]>(lanesProp);
  useEffect(() => {
    setLanes(lanesProp);
  }, [lanesProp]);

  // ---- Mutation helpers (replace what router.refresh() used to do) ----
  const patchLane = (laneId: string, fn: (l: Lane) => Lane) =>
    setLanes((prev) => prev.map((l) => (l.id === laneId ? fn(l) : l)));
  const removeLaneById = (laneId: string) =>
    setLanes((prev) => prev.filter((l) => l.id !== laneId));
  const addNodeToLane = (laneId: string, node: LaneNode) =>
    patchLane(laneId, (l) => ({
      ...l,
      nodes: [...l.nodes, node].sort((a, b) => a.t - b.t),
      lastActivityAt: new Date().toISOString(),
    }));
  const updateNodeIn = (laneId: string, nodeId: string, patch: Partial<LaneNode>) =>
    patchLane(laneId, (l) => ({
      ...l,
      nodes: l.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));
  const removeNodeFromLane = (laneId: string, nodeId: string) =>
    patchLane(laneId, (l) => ({ ...l, nodes: l.nodes.filter((n) => n.id !== nodeId) }));
  const addAmbitionToLane = (laneId: string, amb: Ambition) =>
    patchLane(laneId, (l) => ({ ...l, ambitions: [...l.ambitions, amb] }));
  const updateAmbitionIn = (laneId: string, ambId: string, patch: Partial<Ambition>) =>
    patchLane(laneId, (l) => ({
      ...l,
      ambitions: l.ambitions.map((a) => (a.id === ambId ? { ...a, ...patch } : a)),
    }));
  const removeAmbitionFromLane = (laneId: string, ambId: string) =>
    patchLane(laneId, (l) => ({ ...l, ambitions: l.ambitions.filter((a) => a.id !== ambId) }));
  const addNoteToLane = (laneId: string, note: Note) =>
    patchLane(laneId, (l) => ({ ...l, notes: [...l.notes, note] }));
  const updateNoteIn = (laneId: string, noteId: string, patch: Partial<Note>) =>
    patchLane(laneId, (l) => ({
      ...l,
      notes: l.notes.map((n) => (n.id === noteId ? { ...n, ...patch } : n)),
    }));
  const removeNoteFromLane = (laneId: string, noteId: string) =>
    patchLane(laneId, (l) => ({ ...l, notes: l.notes.filter((n) => n.id !== noteId) }));
  const laneOfNode = (nodeId: string) =>
    lanes.find((l) => l.nodes.some((n) => n.id === nodeId)) ?? null;
  const laneOfAmbition = (ambId: string) =>
    lanes.find((l) => l.ambitions.some((a) => a.id === ambId)) ?? null;
  const laneOfNote = (noteId: string) =>
    lanes.find((l) => l.notes.some((n) => n.id === noteId)) ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchored = useRef(false);
  const scrollIntent = useRef<"today" | "left" | "right" | null>(null);
  const scrollTargetT = useRef<number | null>(null);
  const scrollTargetTop = useRef<number | null>(null);

  const [legendOpen, setLegendOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [tagFindOpen, setTagFindOpen] = useState(false);
  const [tagFindId, setTagFindId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // A node/ambition briefly spotlit after jumping to it from a panel.
  const [highlight, setHighlight] = useState<{ id: string; key: number } | null>(null);
  const [daysPerScreen, setDaysPerScreen] = useState(30);
  const [startMs, setStartMs] = useState(nowMs - INITIAL_BACK * DAY);
  const [endMs, setEndMs] = useState(nowMs + INITIAL_FWD * DAY);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [busy, setBusy] = useState(false);

  // Add (node or ambition) modal.
  const [addTo, setAddTo] = useState<
    { projectId: string; projectName: string; minDate: string; mode: "node" | "ambition" } | null
  >(null);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState(todayIso());

  // Node and project action menus.
  const [nodeMenu, setNodeMenu] = useState<
    { id: string; label: string; tags: string[]; deadline: string | null; done: boolean; origin: string; dateIso: string } | null
  >(null);
  // Inline title/date editing inside the node panel.
  const [editLabel, setEditLabel] = useState("");
  const [editDate, setEditDate] = useState(todayIso());
  const [editDateOpen, setEditDateOpen] = useState(false);
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [confirmDeleteNode, setConfirmDeleteNode] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  // Wave 2 — on-demand node content (email excerpt + notes + contexts).
  type NodeDetail = {
    email: { from: string; snippet: string; dateSent: string | null; threadUrl: string | null } | null;
    notes: { id: string; body: string; code: string | null }[];
    contexts: { id: string; content: string; kind: "context" | "information"; title: string | null; code: string | null }[];
  };
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteEdit, setNoteEdit] = useState<{ id: string | "new"; text: string } | null>(null);
  const [ctxEdit, setCtxEdit] = useState<{ id: string | "new"; text: string; kind: "context" | "information" } | null>(null);
  // Ambition menu (open / edit / tag / delete a single ambition).
  const [ambMenu, setAmbMenu] = useState<
    { id: string; title: string; t: number; isDeadline: boolean; done: boolean; tags: string[] } | null
  >(null);
  const [ambEditTitle, setAmbEditTitle] = useState("");
  const [ambEditDate, setAmbEditDate] = useState(todayIso());
  const [ambEditDateOpen, setAmbEditDateOpen] = useState(false);
  const [ambEditDeadline, setAmbEditDeadline] = useState(false);
  const [clusterMenu, setClusterMenu] = useState<
    {
      projectName: string;
      items: {
        id: string;
        kind: "node" | "ambition";
        label: string;
        t: number;
        done: boolean;
        tags?: string[];
        deadline?: string | null;
        origin?: string;
      }[];
    } | null
  >(null);
  // Hover-to-peek list shown next to a count badge.
  const [peek, setPeek] = useState<
    { x: number; y: number; title: string; items: { label: string; done: boolean; due: boolean }[] } | null
  >(null);
  const [nodeCalOpen, setNodeCalOpen] = useState(false);
  const [nodeCalDate, setNodeCalDate] = useState(todayIso());
  const [addAsDeadline, setAddAsDeadline] = useState(false);
  const [addChoice, setAddChoice] = useState<
    { projectId: string; projectName: string; minDate: string; anchorNodeId: string | null; anchorT: number; x: number; y: number } | null
  >(null);
  const [addDeadlineOpen, setAddDeadlineOpen] = useState(false);
  const [noteCompose, setNoteCompose] = useState<
    { projectId: string; anchorNodeId: string | null; anchorT: number } | null
  >(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteOverride, setNoteOverride] = useState<Record<string, { x: number; y: number }>>({});
  const noteOverrideRef = useRef<Record<string, { x: number; y: number }>>({});
  const noteDragRef = useRef<{ id: string; moved: boolean; dist: number } | null>(null);
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [noteSizes, setNoteSizes] = useState<Record<string, number>>({});
  const sizeRef = useRef<{ id: string; w: number } | null>(null);
  const [resizingNote, setResizingNote] = useState<string | null>(null);
  const [projMenu, setProjMenu] = useState<
    {
      id: string;
      name: string;
      nodeCount: number;
      ambitionCount: number;
      archived: boolean;
      tags: string[];
      color: string | null;
      spineColor: string | null;
      spineUserSet: boolean;
    } | null
  >(null);
  const [projConfirm, setProjConfirm] = useState(false);
  // Merge flow: pick a source project to fold into projMenu (the target), then an
  // explicit confirmation naming both before it runs.
  const [mergePicking, setMergePicking] = useState(false);
  const [mergeSource, setMergeSource] = useState<{ id: string; name: string; nodeCount: number; ambitionCount: number } | null>(null);
  const router = useRouter();

  const measured = vw > 0;
  const pxPerDay = measured ? Math.max(6, (vw - LABEL_W) / daysPerScreen) : 40;
  const laneH = measured ? Math.max(MIN_LANE_H, Math.floor(vh / LANES_PER_SCREEN)) : 150;
  const canvasW = Math.round(((endMs - startMs) / DAY) * pxPerDay);
  const xFor = (t: number) => ((t - startMs) / DAY) * pxPerDay;
  const todayX = xFor(nowMs);

  // A gentle shrink on the zoomed-out spans; the real declutter is the clustering below.
  const nodeSize = daysPerScreen <= 30 ? NODE : daysPerScreen <= 90 ? 40 : 32;
  const nodeScale = nodeSize / NODE;

  // Cluster + label layout per lane. Memoized: only recomputes when the lane's
  // nodes change, the zoom changes, or the time origin changes. Previously this
  // ran ~150 times per render (every lane, every render) — the single biggest
  // per-frame cost identified in the perf audit.
  const laneLayouts = useMemo(() => {
    const m = new Map<string, ReturnType<typeof layoutLaneLabels>>();
    const x = (t: number) => ((t - startMs) / DAY) * pxPerDay;
    for (const l of lanes) m.set(l.id, layoutLaneLabels(l.nodes, x, nodeSize));
    return m;
  }, [lanes, startMs, pxPerDay, nodeSize]);

  // Wire thickness grows with the span; default colour stays a constant
  // oxblood-at-45%. A per-project custom colour overrides the default and
  // uses the opacity ramp so it reads at every zoom.
  const wire =
    daysPerScreen <= 7
      ? { w: 1, o: 0.6 }
      : daysPerScreen <= 30
      ? { w: 1.25, o: 0.75 }
      : daysPerScreen <= 90
      ? { w: 1.5, o: 0.85 }
      : { w: 2, o: 1 };

  // ---- "Upcoming": open deadlines + ambitions across every project, soonest first ----
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  type Upcoming = {
    id: string;
    kind: "deadline" | "ambition";
    project: string;
    origin: string;
    label: string;
    dueT: number; // for sorting + display
    goT: number; // where to scroll the calendar
    lane: number; // which row
  };
  const upcoming: Upcoming[] = [];
  lanes.forEach((p, li) => {
    for (const a of p.ambitions)
      if (!a.done)
        upcoming.push({ id: a.id, kind: "ambition", project: p.name, origin: p.origin, label: a.title, dueT: a.t, goT: a.t, lane: li });
    for (const n of p.nodes)
      if (n.deadline && !n.done)
        upcoming.push({ id: n.id, kind: "deadline", project: p.name, origin: p.origin, label: n.label, dueT: new Date(n.deadline).getTime(), goT: n.t, lane: li });
  });
  upcoming.sort((a, b) => a.dueT - b.dueT);
  const overdueCount = upcoming.filter((u) => u.dueT < todayMs).length;
  const UP_BUCKETS = ["Overdue", "This week", "This month", "Later"] as const;
  const bucketOf = (t: number) =>
    t < todayMs ? "Overdue" : t < todayMs + 7 * DAY ? "This week" : t < todayMs + 30 * DAY ? "This month" : "Later";
  const relLabel = (t: number) => {
    const d = Math.round((t - todayMs) / DAY);
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    if (d === -1) return "yesterday";
    return d > 0 ? `in ${d} days` : `${-d} days ago`;
  };

  // ---- "Recent": nodes from the last 7 days, across every project, newest first ----
  const recentCutoff = todayMs - 7 * DAY;
  type Recent = { id: string; project: string; origin: string; label: string; t: number; done: boolean; lane: number };
  const recent: Recent[] = [];
  lanes.forEach((p, li) => {
    for (const n of p.nodes)
      if (n.t >= recentCutoff && n.t <= todayMs + DAY)
        recent.push({ id: n.id, project: p.name, origin: p.origin, label: n.label, t: n.t, done: n.done, lane: li });
  });
  recent.sort((a, b) => b.t - a.t);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => {
      setVw(el.clientWidth);
      setVh(el.clientHeight);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!measured || anchored.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = Math.max(0, todayX - vw * 0.65);
    anchored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // A pending "jump to this date" (e.g. a project's first node) wins.
    if (scrollTargetT.current != null) {
      el.scrollLeft = Math.max(0, LABEL_W + xFor(scrollTargetT.current) - vw / 2);
      if (scrollTargetTop.current != null) el.scrollTop = scrollTargetTop.current;
      scrollTargetT.current = null;
      scrollTargetTop.current = null;
      return;
    }
    if (!scrollIntent.current) return;
    if (scrollIntent.current === "today") el.scrollLeft = Math.max(0, todayX - vw * 0.65);
    else if (scrollIntent.current === "left") el.scrollLeft = vw * 0.1;
    else if (scrollIntent.current === "right") el.scrollLeft = canvasW - vw * 1.05;
    scrollIntent.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, pxPerDay]);

  // Scroll position that centres a lane (row) vertically, allowing for the
  // sticky axis that covers the top AXIS_H of the viewport.
  const laneTopFor = (idx: number) => Math.max(0, idx * laneH + laneH / 2 - (vh - AXIS_H) / 2);

  // Centre the calendar on a date — and, if a lane index is given, on that row
  // too — expanding the loaded range back/forward if the date isn't in view.
  const jumpToTime = (t: number, laneIdx?: number) => {
    const top = laneIdx != null ? laneTopFor(laneIdx) : null;
    const margin = 14 * DAY;
    if (t - margin < startMs) {
      scrollTargetT.current = t;
      scrollTargetTop.current = top;
      setStartMs(Math.max(nowMs - MAX_SPAN_DAYS * DAY, t - margin));
    } else if (t + margin > endMs) {
      scrollTargetT.current = t;
      scrollTargetTop.current = top;
      setEndMs(Math.min(nowMs + MAX_SPAN_DAYS * DAY, t + margin));
    } else {
      const el = scrollRef.current;
      if (el) el.scrollTo({ left: Math.max(0, LABEL_W + xFor(t) - vw / 2), top: top ?? el.scrollTop, behavior: "smooth" });
    }
  };

  // Jump to an item and briefly spotlight it (dim the rest).
  const focusOn = (id: string, t: number, laneIdx: number) => {
    setHighlight((h) => ({ id, key: (h?.key ?? 0) + 1 }));
    jumpToTime(t, laneIdx);
  };
  useEffect(() => {
    if (!highlight) return;
    const h = setTimeout(() => setHighlight(null), 2600);
    return () => clearTimeout(h);
  }, [highlight]);

  // Press Enter (when nothing is focused and no menu is open) to open search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || searchOpen) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || el?.isContentEditable) return;
      if (addTo || addChoice || noteCompose || nodeMenu || ambMenu || projMenu || clusterMenu) return;
      e.preventDefault();
      setUpcomingOpen(false);
      setRecentOpen(false);
      setTagFindOpen(false);
      setSearchQuery("");
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, addTo, addChoice, noteCompose, nodeMenu, ambMenu, projMenu, clusterMenu]);

  const zoomTo = (d: number) => {
    scrollIntent.current = "today";
    setDaysPerScreen(d);
  };
  const loadEarlier = () => {
    if (startMs <= nowMs - MAX_SPAN_DAYS * DAY) return;
    scrollIntent.current = "left";
    setStartMs((s) => s - CHUNK_DAYS * DAY);
  };
  const loadLater = () => {
    if (endMs >= nowMs + MAX_SPAN_DAYS * DAY) return;
    scrollIntent.current = "right";
    setEndMs((e) => e + CHUNK_DAYS * DAY);
  };
  const goToday = () => {
    scrollRef.current?.scrollTo({ left: Math.max(0, todayX - vw * 0.65), behavior: "smooth" });
  };

  const openAdd = (projectId: string, projectName: string, minDate: string, mode: "node" | "ambition") => {
    setAddTitle("");
    // Node defaults to today (a recent past event); ambition defaults to tomorrow.
    setAddDate(mode === "ambition" ? isoFromMs(Date.now() + DAY) : todayIso());
    setAddAsDeadline(false);
    setAddTo({ projectId, projectName, minDate, mode });
  };
  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTo) return;
    setBusy(true);
    const res =
      addTo.mode === "ambition"
        ? await createAmbition(addTo.projectId, addTitle, addDate, addAsDeadline)
        : await createManualNode(addTo.projectId, addTitle, addDate);
    setBusy(false);
    if (res.error || !res.id) {
      alert("Could not add: " + (res.error ?? "unknown error"));
      return;
    }
    if (addTo.mode === "ambition") {
      addAmbitionToLane(addTo.projectId, {
        id: res.id,
        title: addTitle.trim(),
        t: new Date(addDate).getTime(),
        done: false,
        isDeadline: addAsDeadline,
        stage: 0,
        tags: [],
      });
    } else {
      addNodeToLane(addTo.projectId, {
        id: res.id,
        label: addTitle.trim(),
        t: new Date(`${addDate}T09:00:00Z`).getTime(),
        stage: 0,
        done: false,
        deadline: null,
        origin: "manual",
        tags: [],
      });
    }
    setAddTo(null);
  };

  const toggle = async (id: string, done: boolean) => {
    const lane = laneOfAmbition(id);
    if (!lane) return;
    const prev = lane.ambitions.find((a) => a.id === id)?.done ?? false;
    updateAmbitionIn(lane.id, id, { done });
    const res = await toggleAmbition(id, done);
    if (res?.error) {
      updateAmbitionIn(lane.id, id, { done: prev });
      alert("Could not update: " + res.error);
    }
  };
  // Open a node: stamp it if the wand is armed, otherwise show its menu.
  const openNode = (n: LaneNode) => {
    if (armed) {
      applyNodeTag(n.id, armed.id, nodeTagsOf(n));
      return;
    }
    setNodeCalOpen(false);
    setEditDateOpen(false);
    setTitleErr(null);
    setConfirmDeleteNode(false);
    setTagPopoverOpen(false);
    setEditLabel(n.label);
    setEditDate(isoFromMs(n.t));
    setNodeMenu({ id: n.id, label: n.label, tags: nodeTagsOf(n), deadline: n.deadline, done: n.done, origin: n.origin, dateIso: isoFromMs(n.t) });
  };
  // Panel title save — on blur / Enter. Reverts the field + shows an inline
  // error on failure; keeps the panel open on success.
  const panelSaveTitle = async () => {
    if (!nodeMenu) return;
    const next = editLabel.trim();
    if (!next || next === nodeMenu.label) {
      setEditLabel(nodeMenu.label);
      setTitleErr(null);
      return;
    }
    setBusy(true);
    const res = await updateNode(nodeMenu.id, { label: next });
    setBusy(false);
    if (res.error) {
      setEditLabel(nodeMenu.label);
      setTitleErr(res.error);
      return;
    }
    setTitleErr(null);
    const lane = laneOfNode(nodeMenu.id);
    if (lane) updateNodeIn(lane.id, nodeMenu.id, { label: next });
    setNodeMenu({ ...nodeMenu, label: next });
  };
  // Panel date save — manual nodes only (gmail dates follow the email).
  const panelSaveDate = async (iso: string) => {
    if (!nodeMenu) return;
    setEditDate(iso);
    setEditDateOpen(false);
    if (iso === nodeMenu.dateIso) return;
    setBusy(true);
    const res = await updateNode(nodeMenu.id, { date: iso });
    setBusy(false);
    if (res.error) {
      setEditDate(nodeMenu.dateIso);
      alert(res.error);
      return;
    }
    const lane = laneOfNode(nodeMenu.id);
    if (lane) updateNodeIn(lane.id, nodeMenu.id, { t: new Date(`${iso}T09:00:00Z`).getTime() });
    setNodeMenu({ ...nodeMenu, dateIso: iso });
  };

  // Open an ambition: stamp it if armed, otherwise show its menu.
  const openAmbition = (a: Ambition) => {
    if (armed) {
      applyAmbTag(a.id, armed.id, ambTagsOf(a));
      return;
    }
    setAmbEditTitle(a.title);
    setAmbEditDate(isoFromMs(a.t));
    setAmbEditDateOpen(false);
    setAmbEditDeadline(a.isDeadline);
    setAmbMenu({ id: a.id, title: a.title, t: a.t, isDeadline: a.isDeadline, done: a.done, tags: ambTagsOf(a) });
  };
  const saveAmbEdits = async () => {
    if (!ambMenu) return;
    const fields: { title?: string; targetDate?: string; isDeadline?: boolean } = {};
    if (ambEditTitle.trim() !== ambMenu.title) fields.title = ambEditTitle;
    if (ambEditDate !== isoFromMs(ambMenu.t)) fields.targetDate = ambEditDate;
    if (ambEditDeadline !== ambMenu.isDeadline) fields.isDeadline = ambEditDeadline;
    if (Object.keys(fields).length === 0) {
      setAmbMenu(null);
      return;
    }
    setBusy(true);
    const res = await updateAmbition(ambMenu.id, fields);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    const lane = laneOfAmbition(ambMenu.id);
    if (lane) {
      const patch: Partial<Ambition> = {};
      if (fields.title) patch.title = fields.title.trim();
      if (fields.targetDate) patch.t = new Date(fields.targetDate).getTime();
      if (fields.isDeadline !== undefined) patch.isDeadline = fields.isDeadline;
      updateAmbitionIn(lane.id, ambMenu.id, patch);
    }
    setAmbMenu(null);
  };
  const removeAmbition = async () => {
    if (!ambMenu) return;
    const lane = laneOfAmbition(ambMenu.id);
    setBusy(true);
    const res = await deleteAmbition(ambMenu.id);
    setBusy(false);
    if (res?.error) {
      alert("Could not delete: " + res.error);
      return;
    }
    if (lane) removeAmbitionFromLane(lane.id, ambMenu.id);
    setAmbMenu(null);
  };
  const removeNode = async () => {
    if (!nodeMenu) return;
    const lane = laneOfNode(nodeMenu.id);
    setBusy(true);
    const res = await deleteNode(nodeMenu.id);
    setBusy(false);
    if (res?.error) {
      alert("Could not delete: " + res.error);
      return;
    }
    if (lane) removeNodeFromLane(lane.id, nodeMenu.id);
    setNodeMenu(null);
  };
  const saveNodeDeadline = async () => {
    if (!nodeMenu) return;
    setBusy(true);
    const res = await setNodeDeadline(nodeMenu.id, nodeCalDate);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    const lane = laneOfNode(nodeMenu.id);
    if (lane) {
      // Stage starts at 0 because deadline_set_at = now: no time has elapsed.
      updateNodeIn(lane.id, nodeMenu.id, { deadline: nodeCalDate, done: false, stage: 0 });
    }
    setNodeMenu({ ...nodeMenu, deadline: nodeCalDate, done: false }); // keep panel open
    setNodeCalOpen(false);
  };
  const removeNodeDeadline = async () => {
    if (!nodeMenu) return;
    const lane = laneOfNode(nodeMenu.id);
    setBusy(true);
    const res = await clearNodeDeadline(nodeMenu.id);
    setBusy(false);
    if (res?.error) {
      alert("Could not clear: " + res.error);
      return;
    }
    if (lane) updateNodeIn(lane.id, nodeMenu.id, { deadline: null, done: false, stage: 0 });
    setNodeMenu({ ...nodeMenu, deadline: null, done: false }); // keep panel open
  };
  const completeNode = async (done: boolean) => {
    if (!nodeMenu) return;
    const lane = laneOfNode(nodeMenu.id);
    setBusy(true);
    const res = await setNodeDone(nodeMenu.id, done);
    setBusy(false);
    if (res?.error) {
      alert("Could not update: " + res.error);
      return;
    }
    if (lane) updateNodeIn(lane.id, nodeMenu.id, { done });
    setNodeMenu({ ...nodeMenu, done }); // keep panel open
  };

  const noteOf = (nt: Note) => noteOverride[nt.id] ?? { x: nt.x, y: nt.y };
  const submitNote = async () => {
    if (!noteCompose) return;
    setBusy(true);
    const res = await createNote(noteCompose.projectId, noteCompose.anchorNodeId, noteBody, noteCompose.anchorT, -60);
    setBusy(false);
    if (res.error || !res.id) {
      alert("Could not add: " + (res.error ?? "unknown error"));
      return;
    }
    addNoteToLane(noteCompose.projectId, {
      id: res.id,
      body: noteBody,
      x: noteCompose.anchorT,
      y: -60,
      anchorT: noteCompose.anchorT,
    });
    setNoteCompose(null);
    setNoteBody("");
  };
  const saveNoteBody = async (id: string) => {
    setEditingNote(null);
    const lane = laneOfNote(id);
    const prevBody = lane?.notes.find((n) => n.id === id)?.body ?? "";
    if (lane) updateNoteIn(lane.id, id, { body: editBody });
    const res = await updateNoteBody(id, editBody);
    if (res?.error) {
      if (lane) updateNoteIn(lane.id, id, { body: prevBody });
      alert("Could not save: " + res.error);
    }
  };
  const removeNoteById = async (id: string) => {
    const lane = laneOfNote(id);
    if (lane) removeNoteFromLane(lane.id, id);
    const res = await deleteNote(id);
    if (res?.error) alert("Could not delete: " + res.error);
  };

  // ── Wave 2 node panel: load the node's content (email + notes + contexts) on open ──
  useEffect(() => {
    if (!nodeMenu) {
      setNodeDetail(null);
      return;
    }
    const id = nodeMenu.id;
    let cancelled = false;
    setNodeDetail(null);
    setNoteEdit(null);
    setCtxEdit(null);
    setDetailLoading(true);
    getNodeDetail(id).then((d) => {
      if (cancelled) return;
      setDetailLoading(false);
      setNodeDetail({ email: d.email, notes: d.notes, contexts: d.contexts });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeMenu?.id]);

  // Notes inside the panel — reuse the Layer-1 note actions + keep the canvas in sync.
  const savePanelNote = async () => {
    if (!noteEdit || !nodeMenu) return;
    const text = noteEdit.text.trim();
    const lane = laneOfNode(nodeMenu.id);
    if (!text) {
      setNoteEdit(null);
      return;
    }
    setBusy(true);
    if (noteEdit.id === "new") {
      const t = lane?.nodes.find((n) => n.id === nodeMenu.id)?.t ?? Date.now();
      const res = await createNote(lane?.id ?? "", nodeMenu.id, text, t, -60);
      setBusy(false);
      if (res.error || !res.id) return void alert("Could not add note: " + (res.error ?? "unknown error"));
      setNodeDetail((d) => (d ? { ...d, notes: [...d.notes, { id: res.id!, body: text, code: res.code ?? null }] } : d));
      if (lane) addNoteToLane(lane.id, { id: res.id, body: text, x: t, y: -60, anchorT: t });
    } else {
      const res = await updateNoteBody(noteEdit.id, text);
      setBusy(false);
      if (res.error) return void alert("Could not save: " + res.error);
      const nid = noteEdit.id;
      setNodeDetail((d) => (d ? { ...d, notes: d.notes.map((n) => (n.id === nid ? { ...n, body: text } : n)) } : d));
      if (lane) updateNoteIn(lane.id, nid, { body: text });
    }
    setNoteEdit(null);
  };
  const deletePanelNote = async (id: string) => {
    const lane = nodeMenu ? laneOfNode(nodeMenu.id) : null;
    setNodeDetail((d) => (d ? { ...d, notes: d.notes.filter((n) => n.id !== id) } : d));
    if (lane) removeNoteFromLane(lane.id, id);
    setNoteEdit(null);
    const res = await deleteNote(id);
    if (res?.error) alert("Could not delete: " + res.error);
  };

  // Context bubbles inside the panel — reuse the Layer-2 bubble actions.
  const savePanelCtx = async () => {
    if (!ctxEdit || !nodeMenu) return;
    const text = ctxEdit.text.trim();
    if (!text) {
      setCtxEdit(null);
      return;
    }
    const lane = laneOfNode(nodeMenu.id);
    setBusy(true);
    if (ctxEdit.id === "new") {
      const res = await createBubble(lane?.id ?? "", nodeMenu.id, text, "above", nodeMenu.label, lane?.name ?? "", ctxEdit.kind);
      setBusy(false);
      if (res.error || !res.id) return void alert("Could not add context: " + (res.error ?? "unknown error"));
      setNodeDetail((d) => (d ? { ...d, contexts: [...d.contexts, { id: res.id!, content: text, kind: ctxEdit.kind, title: null, code: res.code ?? null }] } : d));
    } else {
      const res = await updateBubble(ctxEdit.id, text);
      setBusy(false);
      if (res.error) return void alert("Could not save: " + res.error);
      const cid = ctxEdit.id;
      setNodeDetail((d) => (d ? { ...d, contexts: d.contexts.map((c) => (c.id === cid ? { ...c, content: text } : c)) } : d));
    }
    setCtxEdit(null);
  };
  const deletePanelCtx = async (id: string) => {
    setNodeDetail((d) => (d ? { ...d, contexts: d.contexts.filter((c) => c.id !== id) } : d));
    setCtxEdit(null);
    const res = await deleteBubble(id);
    if (res?.error) alert("Could not delete: " + res.error);
  };

  // Project-level deadline (Add popover footer). Optimistic; reverts on error.
  const saveProjectDeadline = async (projectId: string, date: string | null) => {
    const prev = lanes.find((l) => l.id === projectId)?.deadline ?? null;
    patchLane(projectId, (l) => ({ ...l, deadline: date }));
    const res = await setProjectDeadline(projectId, date);
    if (res?.error) {
      patchLane(projectId, (l) => ({ ...l, deadline: prev }));
      alert("Could not update deadline: " + res.error);
    }
  };
  const doArchive = async () => {
    if (!projMenu) return;
    const id = projMenu.id;
    setBusy(true);
    const res = await archiveProject(id);
    setBusy(false);
    if (res?.error) {
      alert("Could not archive: " + res.error);
      return;
    }
    patchLane(id, (l) => ({ ...l, archived: true }));
    closeProj();
  };
  const doDelete = async () => {
    if (!projMenu) return;
    const id = projMenu.id;
    setBusy(true);
    const res = await deleteProject(id);
    setBusy(false);
    if (res?.error) {
      alert("Could not delete: " + res.error);
      return;
    }
    removeLaneById(id);
    closeProj();
  };
  // Fold mergeSource INTO projMenu (the target), then delete the source. The
  // target gains the source's nodes, so we refresh from the server to rebuild its
  // timeline; the source lane is removed immediately for instant feedback.
  const doMerge = async () => {
    if (!projMenu || !mergeSource) return;
    const targetId = projMenu.id;
    const sourceId = mergeSource.id;
    setBusy(true);
    const res = await mergeProjects(targetId, sourceId);
    setBusy(false);
    if (res?.error) {
      alert("Could not merge: " + res.error);
      return;
    }
    removeLaneById(sourceId);
    closeProj();
    router.refresh();
  };
  const closeProj = () => {
    setProjMenu(null);
    setProjConfirm(false);
    setMergePicking(false);
    setMergeSource(null);
  };

  // Esc puts the magic wand down.
  useEffect(() => {
    if (!armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setArmed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed, setArmed]);

  useEffect(() => {
    try {
      const r = localStorage.getItem(NOTE_SIZES_KEY);
      if (r) setNoteSizes(JSON.parse(r));
    } catch {}
  }, []);
  const setNoteSize = (id: string, w: number) => {
    setNoteSizes((prev) => {
      const next = { ...prev, [id]: w };
      try {
        localStorage.setItem(NOTE_SIZES_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Current tags / colours are now read directly from the lifted lanes state,
  // since every mutation patches that state in place. These tiny helpers are
  // kept for call-site readability.
  const nodeTagsOf = (n: LaneNode) => n.tags;
  const projTagsOf = (p: Lane) => p.tags;
  const ambTagsOf = (a: Ambition) => a.tags;
  const projColorOf = (p: Lane) => p.color ?? colorFor(p.origin);

  // Toggle instantly in the UI; save in the background; revert if the save fails.
  const applyNodeTag = (id: string, valueId: string, current: string[]) => {
    const lane = laneOfNode(id);
    if (!lane) return;
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    updateNodeIn(lane.id, id, { tags: next });
    toggleNodeTag(id, valueId).then((res) => {
      if (res?.error) {
        updateNodeIn(lane.id, id, { tags: current });
        alert("Could not update tag: " + res.error);
      }
    });
  };
  const applyProjTag = (id: string, valueId: string, current: string[]) => {
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    patchLane(id, (l) => ({ ...l, tags: next }));
    toggleProjectTag(id, valueId).then((res) => {
      if (res?.error) {
        patchLane(id, (l) => ({ ...l, tags: current }));
        alert("Could not update tag: " + res.error);
      }
    });
  };
  const applyAmbTag = (id: string, valueId: string, current: string[]) => {
    const lane = laneOfAmbition(id);
    if (!lane) return;
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    updateAmbitionIn(lane.id, id, { tags: next });
    toggleAmbitionTag(id, valueId).then((res) => {
      if (res?.error) {
        updateAmbitionIn(lane.id, id, { tags: current });
        alert("Could not update tag: " + res.error);
      }
    });
  };
  // Set a project's colour optimistically (null = back to origin colour).
  const applyProjColor = (id: string, color: string | null) => {
    const prev = lanes.find((l) => l.id === id)?.color ?? null;
    patchLane(id, (l) => ({ ...l, color }));
    setProjectColor(id, color).then((res) => {
      if (res?.error) {
        patchLane(id, (l) => ({ ...l, color: prev }));
        alert("Could not set colour: " + res.error);
      }
    });
  };
  // Spine colour. Null = ask the server to auto-pick from the palette by
  // re-running the creation-order rule; the server returns the picked colour.
  const applySpineColor = (id: string, color: string | null) => {
    const prevColor = lanes.find((l) => l.id === id)?.spineColor ?? null;
    const prevUserSet = lanes.find((l) => l.id === id)?.spineUserSet ?? false;
    // Best-guess optimistic value for the explicit case; the auto-pick path
    // syncs to the server's chosen colour once it responds.
    patchLane(id, (l) => ({
      ...l,
      spineColor: color ?? l.spineColor,
      spineUserSet: color !== null,
    }));
    setProjectSpineColor(id, color).then((res) => {
      if (res?.error) {
        patchLane(id, (l) => ({ ...l, spineColor: prevColor, spineUserSet: prevUserSet }));
        alert("Could not set spine colour: " + res.error);
      } else if (res?.color) {
        patchLane(id, (l) => ({ ...l, spineColor: res.color! }));
      }
    });
  };
  const spineColorOf = (p: Lane): string => p.spineColor ?? MUTED;
  // Map attention state → dot colour.
  const attentionColorOf = (a: Attention): string =>
    a === "inactive" ? ATTENTION_INACTIVE : a === "alert" ? ATTENTION_ALERT : ATTENTION_NORMAL;
  // Lookup a tag value name by id (built from the catalog).
  const tagNameById = (() => {
    const m = new Map<string, string>();
    for (const c of categories) for (const v of c.values) m.set(v.id, v.value);
    return m;
  })();

  // Axis pieces. Month name (serif) and year (small sans) render as a single
  // inline pair so the axis reads as one typographic unit.
  const months: { x: number; month: string; year: string }[] = [];
  const days: number[] = [];
  if (measured) {
    const s = new Date(startMs);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur.getTime() <= endMs) {
      months.push({
        x: xFor(cur.getTime()),
        month: cur.toLocaleString("en-GB", { month: "short" }),
        year: String(cur.getFullYear()),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    const first = new Date(startMs);
    first.setHours(0, 0, 0, 0);
    for (let t = first.getTime(); t <= endMs; t += DAY) days.push(t);
  }
  const showDayNumbers = pxPerDay >= 16;

  const btn = "rounded-md border border-hairline bg-paper-surface/90 px-2.5 py-1 text-sm text-ink hover:bg-paper-surface";
  const zoomBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-sm ${
      active
        ? "bg-oxblood text-paper"
        : "border border-hairline bg-paper-surface/90 text-ink hover:bg-paper-surface"
    }`;
  const card = "max-h-[85vh] w-full max-w-sm overflow-auto rounded-lg border border-hairline bg-paper-surface p-5 text-ink shadow-xl";
  const primary = "rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-paper hover:bg-oxblood-dark disabled:opacity-60";
  const ghost = "rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-paper";
  const danger = "rounded-md bg-oxblood-dark px-4 py-2 text-sm font-medium text-paper hover:bg-oxblood disabled:opacity-60";

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-auto"
        style={{ cursor: armed ? WAND_CURSOR : undefined }}
      >
        {measured && (
          <div style={{ width: LABEL_W + canvasW }}>
            {/* Axis row — frozen left cell houses Find; right side is the calendar */}
            <div className="sticky top-0 z-20 flex">
              <div
                className="sticky left-0 z-30 flex items-center border-b border-r border-hairline px-3"
                style={{ width: LABEL_W, height: AXIS_H, background: AXIS_BG }}
              >
                <button
                  onClick={() => {
                    setUpcomingOpen(false);
                    setRecentOpen(false);
                    setTagFindOpen(false);
                    setSearchQuery("");
                    setSearchOpen(true);
                  }}
                  className="flex items-center gap-1.5 text-sm text-muted hover:text-ink"
                  title="Search projects and nodes (press Enter)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Find
                </button>
              </div>
              <svg width={canvasW} height={AXIS_H} className="border-b border-hairline" style={{ background: AXIS_BG }}>
                {showDayNumbers &&
                  days.map((t, i) => {
                    const x = xFor(t);
                    return (
                      <g key={i}>
                        <line x1={x} y1={AXIS_H - 9} x2={x} y2={AXIS_H} stroke={AXIS_RULE} />
                        <text x={x + 3} y={AXIS_H - 11} fill={MUTED} fontSize={9}>
                          {new Date(t).getDate()}
                        </text>
                      </g>
                    );
                  })}
                {months.map((m, i) => (
                  <g key={`m${i}`}>
                    <line x1={m.x} y1={0} x2={m.x} y2={AXIS_H} stroke={AXIS_RULE} />
                    <text x={m.x + 6} y={20} fill={AXIS_INK} fontSize={13} fontWeight={500} fontFamily='Georgia, "Iowan Old Style", serif'>
                      {m.month}
                      <tspan
                        dx="3"
                        fill={AXIS_YEAR}
                        fontSize={10}
                        fontFamily='ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
                        fontWeight={400}
                      >
                        {m.year}
                      </tspan>
                    </text>
                  </g>
                ))}
                {/* Today: slim oxblood line with a small pill at the top */}
                <line x1={todayX} y1={0} x2={todayX} y2={AXIS_H} stroke={OXBLOOD} strokeWidth={1.5} />
                <rect x={todayX - 18} y={3} width={36} height={14} rx={4} fill={OXBLOOD} />
                <text x={todayX} y={13} fill={PAPER} fontSize={9} textAnchor="middle">
                  Today
                </text>
              </svg>
            </div>

            {/* Lanes */}
            {lanes.map((p) => {
              const centerY = laneH / 2;
              const ptags = projTagsOf(p);
              const last = p.nodes[p.nodes.length - 1];
              // A project's own colour (if set) shows at every zoom; otherwise the
              // wire follows the grey → origin-colour ramp.
              const customColor = p.color;
              const wireColor = customColor ?? OXBLOOD;
              const wireOpacity = customColor ? wire.o : 0.45;

              // Group nodes that bunch up in time. A cluster of 2+ collapses into a
              // single "count" marker; its members' titles fan out above/below the
              // line, each with a thin leader to its exact spot.
              //
              // layoutLaneLabels also resolves label collisions: solo labels stagger
              // above/below the wire, truncate when crowded, and unfittable solos
              // get absorbed into the nearest cluster — so a returned cluster's
              // membership may exceed what the time-gap threshold alone produced.
              const { clusters, labels: nodeLabels } =
                laneLayouts.get(p.id) ?? { clusters: [], labels: new Map() };

              // Same idea for ambitions (round markers are bigger, so a wider gap).
              const ambClusters: Ambition[][] = [];
              {
                const ambGapX = 2 * AMB_R + 4;
                const as = p.ambitions; // already sorted by time
                let i = 0;
                while (i < as.length) {
                  let j = i + 1;
                  while (j < as.length && xFor(as[j].t) - xFor(as[j - 1].t) < ambGapX) j++;
                  ambClusters.push(as.slice(i, j));
                  i = j;
                }
              }

              const anchorX = last ? xFor(last.t) : todayX;
              const plusX = anchorX + (last ? nodeSize / 2 : 0);
              const plusY = centerY - (last ? nodeSize / 2 : 14);
              // Floor only at the latest node (keeps chains in order). An empty
              // project has no floor, so you can backdate when recreating history.
              const minDate = last ? isoFromMs(last.t) : "";
              const anchorNodeId = last ? last.id : null;
              const anchorT = last ? last.t : nowMs;

              return (
                <div key={p.id} className="relative flex" style={{ opacity: p.inactive ? 0.55 : 1 }}>
                  <div
                    onClick={() =>
                      armed
                        ? applyProjTag(p.id, armed.id, projTagsOf(p))
                        : setProjMenu({
                            id: p.id,
                            name: p.name,
                            nodeCount: p.nodes.length,
                            ambitionCount: p.ambitions.length,
                            archived: p.archived,
                            tags: projTagsOf(p),
                            color: customColor,
                            spineColor: spineColorOf(p),
                            spineUserSet: p.spineUserSet,
                          })
                    }
                    className="sticky left-0 z-10 flex cursor-pointer items-stretch border-b border-r border-hairline bg-paper-surface hover:bg-paper"
                    style={{ width: LABEL_W, height: laneH }}
                    title={armed ? `Stamp "${armed.value}"` : "Project options"}
                  >
                    {/* 4px coloured spine on the far left edge */}
                    <div
                      className="w-1 shrink-0"
                      style={{ background: spineColorOf(p) }}
                      aria-hidden
                    />

                    {/* Top-aligned content so tall lanes don't leave the name floating */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 px-3 pt-3 pb-2">
                      {/* Row 1: attention dot · name · skip-to-start */}
                      <div className="flex items-start gap-1.5">
                        <span
                          className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: attentionColorOf(p.attention) }}
                          aria-hidden
                        />
                        <a
                          href={`/project/${p.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="brand-serif line-clamp-2 min-w-0 flex-1 text-sm leading-tight text-ink hover:text-oxblood hover:underline"
                          title={`Open ${p.name}`}
                        >
                          {p.name}
                        </a>
                        {p.nodes.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              jumpToTime(p.nodes[0].t);
                            }}
                            title="Jump to the start of this project"
                            className="mt-0.5 shrink-0 text-muted hover:text-ink"
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                              <rect x="5" y="5" width="2.4" height="14" rx="1" fill="currentColor" />
                              <path d="M20 5 L9 12 L20 19 Z" fill="currentColor" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Row 2: tag pills, indented under the name (not under the dot) */}
                      {ptags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pl-3">
                          {ptags.map((tid) => {
                            const tc = tagColors[tid] ?? MUTED;
                            const tname = tagNameById.get(tid) ?? "";
                            return (
                              <span
                                key={tid}
                                className="tag-pop inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]"
                                style={{
                                  background: PAPER,
                                  border: `1px solid ${tc}66`,
                                  color: PILL_INK,
                                }}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: tc }}
                                />
                                {tname}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Row 3: meta line — node count + relative time */}
                      <div className="pl-3 text-[10px] text-muted">
                        {p.nodes.length} node{p.nodes.length === 1 ? "" : "s"} · updated{" "}
                        {relTimeAgo(p.lastActivityAt, nowMs)}
                      </div>

                      {p.archived && (
                        <span className="self-start rounded border border-hairline bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                          archived
                        </span>
                      )}
                    </div>
                  </div>

                  <svg width={canvasW} height={laneH} className="border-b border-hairline" style={{ background: PAPER }}>

                    {months.map((m, i) => (
                      <line key={i} x1={m.x} y1={0} x2={m.x} y2={laneH} stroke={HAIRLINE} strokeOpacity={0.45} />
                    ))}
                    <line x1={todayX} y1={0} x2={todayX} y2={laneH} stroke={OXBLOOD} strokeOpacity={0.25} />

                    {p.nodes.length > 1 && (
                      <line
                        x1={xFor(p.nodes[0].t)}
                        y1={centerY}
                        x2={xFor(last.t)}
                        y2={centerY}
                        stroke={wireColor}
                        strokeWidth={wire.w}
                        strokeOpacity={wireOpacity}
                      />
                    )}

                    {p.ambitions.map((a) => (
                      <line
                        key={`aw-${a.id}`}
                        x1={anchorX}
                        y1={centerY}
                        x2={xFor(a.t)}
                        y2={centerY}
                        stroke={OXBLOOD}
                        strokeOpacity={0.45}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                      />
                    ))}

                    {/* dotted connectors to notes */}
                    {p.notes.map((nt) => {
                      const np = noteOf(nt);
                      return (
                        <line
                          key={`nl-${nt.id}`}
                          x1={xFor(nt.anchorT)}
                          y1={centerY}
                          x2={xFor(np.x)}
                          y2={centerY + np.y}
                          stroke={NOTE_BORDER}
                          strokeWidth={1.5}
                          strokeDasharray="2 3"
                        />
                      );
                    })}

                    {/* nodes: lone ones as squares; bunched ones as a single count marker */}
                    {clusters.map((cl) => {
                      // ---- a single node on its own ----
                      if (cl.length === 1) {
                        const n = cl[0];
                        const cx = xFor(n.t);
                        const left = cx - nodeSize / 2;
                        const top = centerY - nodeSize / 2;
                        const ntags = nodeTagsOf(n);
                        const matchesFilter =
                          (!selectedTags.length || ntags.some((t) => selectedTags.includes(t))) &&
                          (!deadlineActive || !!n.deadline);
                        const dim = n.done || (filterActive && !matchesFilter);
                        const isHi = highlight?.id === n.id;
                        const opacity = highlight ? (isHi ? 1 : 0.2) : dim ? 0.4 : 1;
                        return (
                          <g key={n.id} className="cursor-pointer" opacity={opacity} onClick={() => openNode(n)}>
                            {isHi && (
                              <rect
                                x={left - 3}
                                y={top - 3}
                                width={nodeSize + 6}
                                height={nodeSize + 6}
                                rx={10}
                                fill="none"
                                stroke={OXBLOOD}
                                strokeWidth={2.5}
                              />
                            )}
                            {(() => {
                              // Tag channels:
                              //   0 tags  → cream fill + oxblood outline (default)
                              //   1+ tag  → fill = primary tag's colour, outline = darken(primary)
                              //   2+ tags → extras render as thin colour bars below the node
                              // Deadline urgency rides the perimeter as a red border that
                              // grows clockwise from the top (4 stages → full ring). Tag fill
                              // and deadline perimeter coexist without conflict — both render.
                              // Completed-with-deadline nodes get a check mark in place of the
                              // border.
                              const primaryTagId = ntags[0];
                              const primaryColor = primaryTagId ? tagColors[primaryTagId] : null;
                              const fill = primaryColor ?? NODE_FILL;
                              const stroke = primaryColor ? darken(primaryColor) : OXBLOOD;
                              const showPerimeter = !n.done && n.stage > 0;
                              const showCheck = n.done && !!n.deadline;
                              const stagesReadable = daysPerScreen <= PERIMETER_STAGES_MAX_DAYS;
                              return (
                                <g transform={`translate(${left}, ${top}) scale(${nodeScale})`}>
                                  <rect
                                    width={NODE}
                                    height={NODE}
                                    rx={NODE_RX}
                                    ry={NODE_RX}
                                    fill={fill}
                                    stroke={stroke}
                                    strokeWidth={1.25}
                                  />
                                  {showPerimeter && (
                                    stagesReadable ? (
                                      <path
                                        d={NODE_PERIMETER_PATH}
                                        pathLength={4}
                                        fill="none"
                                        stroke={ATTENTION_ALERT}
                                        strokeWidth={3}
                                        strokeDasharray={`${n.stage} 4`}
                                        strokeLinecap="butt"
                                      />
                                    ) : (
                                      <rect
                                        width={NODE}
                                        height={NODE}
                                        rx={NODE_RX}
                                        ry={NODE_RX}
                                        fill="none"
                                        stroke={ATTENTION_ALERT}
                                        strokeWidth={3}
                                      />
                                    )
                                  )}
                                  {showCheck && (
                                    <path
                                      d={CHECK_PATH}
                                      fill="none"
                                      stroke={primaryColor ? "#ffffff" : OXBLOOD}
                                      strokeWidth={3}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  )}
                                  <title>
                                    {n.label}
                                    {n.deadline ? ` — deadline ${fmtEU(n.deadline)}` : ""}
                                    {n.done ? " (done)" : ""}
                                  </title>
                                </g>
                              );
                            })()}
                            {(() => {
                              // Stacked base bars for tags 2..N. Hidden at zoom levels
                              // where the node has shrunk (BARS_VISIBLE_MAX_DAYS).
                              if (daysPerScreen > BARS_VISIBLE_MAX_DAYS) return null;
                              const extras = ntags.slice(1);
                              if (extras.length === 0) return null;
                              const barW = nodeSize * BAR_WIDTH_FACTOR;
                              const barX = cx - barW / 2;
                              const barsY0 = top + nodeSize + BAR_GAP;
                              return extras.map((tid, i) => (
                                <rect
                                  key={`bar-${n.id}-${tid}`}
                                  x={barX}
                                  y={barsY0 + i * (BAR_H + BAR_GAP)}
                                  width={barW}
                                  height={BAR_H}
                                  rx={BAR_RX}
                                  ry={BAR_RX}
                                  fill={tagColors[tid] ?? MUTED}
                                />
                              ));
                            })()}
                            {(() => {
                              const li = nodeLabels.get(n.id);
                              if (!li) return null;
                              // Push the below-label past the bar stack when bars are
                              // visible — keeps the label clear of the colour stripes.
                              const extras = ntags.slice(1);
                              const showingBars = daysPerScreen <= BARS_VISIBLE_MAX_DAYS && extras.length > 0;
                              const barStackH = showingBars
                                ? extras.length * (BAR_H + BAR_GAP)
                                : 0;
                              const y =
                                li.side === "above"
                                  ? top - 6
                                  : top + nodeSize + 13 + barStackH;
                              return (
                                <text x={cx} y={y} fill={MUTED} fontSize={11} textAnchor="middle">
                                  <title>{li.fullText}</title>
                                  {li.text}
                                </text>
                              );
                            })()}
                          </g>
                        );
                      }

                      // ---- a bunch of nodes, collapsed into one count marker ----
                      const xs = cl.map((n) => xFor(n.t));
                      const cxC = (Math.min(...xs) + Math.max(...xs)) / 2;
                      const left = cxC - nodeSize / 2;
                      const top = centerY - nodeSize / 2;
                      const doneCount = cl.filter((n) => n.done).length;
                      const allDone = doneCount === cl.length;
                      const anyDeadline = cl.some((n) => n.deadline && !n.done);
                      const hiInCluster = !!highlight && cl.some((n) => n.id === highlight.id);
                      return (
                        <g key={`cl-${cl[0].id}`} opacity={highlight ? (hiInCluster ? 1 : 0.2) : 1}>
                          {/* each member's title — placed by the lane-wide layout pass.
                              Members whose label couldn't fit (alongside other labels
                              from this and adjacent clusters) just render nothing here;
                              the cluster badge + click-to-see-list still surfaces them. */}
                          {cl.map((n) => {
                            const li = nodeLabels.get(n.id);
                            if (!li) return null;
                            const mx = xFor(n.t);
                            const ty = li.side === "above" ? top - 6 : top + nodeSize + 13;
                            return (
                              <g key={n.id} className="cursor-pointer" onClick={() => openNode(n)}>
                                <line x1={mx} y1={centerY} x2={mx} y2={li.side === "above" ? ty + 3 : ty - 9} stroke={HAIRLINE} strokeWidth={1} />
                                <circle cx={mx} cy={centerY} r={2.5} fill={OXBLOOD} />
                                <text x={mx} y={ty} fill={MUTED} fontSize={11} textAnchor="middle">
                                  <title>{li.fullText}</title>
                                  {li.text}
                                </text>
                              </g>
                            );
                          })}
                          {/* the count marker itself */}
                          <g
                            className="cursor-pointer"
                            onMouseEnter={(e) =>
                              setPeek({
                                x: e.clientX,
                                y: e.clientY,
                                title: `${cl.length} items · ${p.name}`,
                                items: cl.map((n) => ({ label: n.label, done: n.done, due: !!n.deadline && !n.done })),
                              })
                            }
                            onMouseLeave={() => setPeek(null)}
                            onClick={() =>
                              armed
                                ? cl.forEach((n) => applyNodeTag(n.id, armed.id, nodeTagsOf(n)))
                                : setClusterMenu({
                                    projectName: p.name,
                                    items: cl.map((n) => ({
                                      id: n.id,
                                      kind: "node" as const,
                                      label: n.label,
                                      t: n.t,
                                      done: n.done,
                                      tags: nodeTagsOf(n),
                                      deadline: n.deadline,
                                      origin: n.origin,
                                    })),
                                  })
                            }
                          >
                            {hiInCluster && (
                              <rect x={left - 3} y={top - 3} width={nodeSize + 6} height={nodeSize + 6} rx={10} fill="none" stroke={OXBLOOD} strokeWidth={2.5} />
                            )}
                            <rect x={left} y={top} width={nodeSize} height={nodeSize} rx={7} ry={7} fill={NODE_FILL} stroke={OXBLOOD} strokeWidth={1.5} />
                            <text x={cxC} y={centerY + 6} fill={OXBLOOD} fontSize={17} fontWeight={500} textAnchor="middle" fontFamily="Georgia, serif">
                              {cl.length}
                            </text>
                            {anyDeadline && <circle cx={left + nodeSize - 5} cy={top + 5} r={3.5} fill={OXBLOOD} stroke={NODE_FILL} strokeWidth={1} />}
                            {doneCount > 0 && !allDone && (
                              <circle cx={left + 5} cy={top + 5} r={3.5} fill="#22c55e" stroke={NODE_FILL} strokeWidth={1} />
                            )}
                          </g>
                        </g>
                      );
                    })}

                    {/* round ambitions — lone ones as circles, bunched ones as a count marker */}
                    {ambClusters.map((cl) => {
                      // ---- a single ambition ----
                      if (cl.length === 1) {
                        const a = cl[0];
                        const cx = xFor(a.t);
                        const isHi = highlight?.id === a.id;
                        const atags = ambTagsOf(a);
                        return (
                          <g
                            key={a.id}
                            className="cursor-pointer"
                            opacity={highlight ? (isHi ? 1 : 0.2) : 1}
                            onClick={() => openAmbition(a)}
                          >
                            {isHi && (
                              <circle cx={cx} cy={centerY} r={AMB_R + 4} fill="none" stroke={OXBLOOD} strokeWidth={2.5} />
                            )}
                            <circle
                              cx={cx}
                              cy={centerY}
                              r={AMB_R}
                              fill={NODE_FILL}
                              fillOpacity={a.done ? 0.5 : 1}
                              stroke={OXBLOOD}
                              strokeWidth={1.25}
                              strokeDasharray="4 3"
                            />
                            {a.isDeadline && !a.done && a.stage > 0 && (
                              daysPerScreen <= PERIMETER_STAGES_MAX_DAYS ? (
                                <path
                                  d={ambPerimeterPath(cx, centerY, AMB_R)}
                                  pathLength={4}
                                  fill="none"
                                  stroke={ATTENTION_ALERT}
                                  strokeWidth={3}
                                  strokeDasharray={`${a.stage} 4`}
                                  strokeLinecap="butt"
                                />
                              ) : (
                                <circle
                                  cx={cx}
                                  cy={centerY}
                                  r={AMB_R}
                                  fill="none"
                                  stroke={ATTENTION_ALERT}
                                  strokeWidth={3}
                                />
                              )
                            )}
                            {a.done && a.isDeadline && (
                              <path
                                d="M 14 24 L 22 32 L 36 16"
                                transform={`translate(${cx - NODE / 2}, ${centerY - NODE / 2})`}
                                fill="none"
                                stroke={OXBLOOD}
                                strokeWidth={3}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            )}
                            {a.done && !a.isDeadline && (
                              <text x={cx} y={centerY + 5} fill={OXBLOOD} fontSize={16} textAnchor="middle">
                                ✓
                              </text>
                            )}
                            {!a.done &&
                              (() => {
                                // Same pip size + layout as the node boxes, pulled in
                                // slightly (×0.82) so they sit inside the round shape.
                                const pos = pipPositions(atags.length);
                                const f = 0.82;
                                return atags.map((tid, di) => (
                                  <circle
                                    key={tid}
                                    className="tag-pop"
                                    cx={cx + (pos[di].x - NODE / 2) * f}
                                    cy={centerY + (pos[di].y - NODE / 2) * f}
                                    r={pos[di].r}
                                    fill={tagColors[tid] ?? MUTED}
                                    stroke="#00000033"
                                    strokeWidth={0.75}
                                  />
                                ));
                              })()}
                            <title>
                              Ambition: {a.title} — target {fmtEU(a.t)}
                              {a.done ? " (done)" : ""} — click to open
                            </title>
                            <text x={cx} y={centerY + AMB_R + 15} fill={MUTED} fontSize={11} textAnchor="middle">
                              {truncLabel(a.title)}
                            </text>
                          </g>
                        );
                      }

                      // ---- a bunch of ambitions, collapsed into one count marker ----
                      const xs = cl.map((a) => xFor(a.t));
                      const cxC = (Math.min(...xs) + Math.max(...xs)) / 2;
                      const doneCount = cl.filter((a) => a.done).length;
                      const allDone = doneCount === cl.length;
                      const anyDue = cl.some((a) => a.isDeadline && !a.done);
                      const rowH = 14;
                      const hiInCluster = !!highlight && cl.some((a) => a.id === highlight.id);
                      return (
                        <g key={`acl-${cl[0].id}`} opacity={highlight ? (hiInCluster ? 1 : 0.2) : 1}>
                          {cl.map((a, k) => {
                            const mx = xFor(a.t);
                            const up = k % 2 === 0;
                            const level = Math.floor(k / 2);
                            const ty = up
                              ? centerY - AMB_R - 8 - level * rowH
                              : centerY + AMB_R + 16 + level * rowH;
                            if (ty < 10 || ty > laneH - 4) return null;
                            const short = a.title.length > 16 ? a.title.slice(0, 15) + "…" : a.title;
                            return (
                              <g key={a.id} className="cursor-pointer" onClick={() => toggle(a.id, !a.done)}>
                                <line x1={mx} y1={centerY} x2={mx} y2={up ? ty + 3 : ty - 9} stroke={HAIRLINE} strokeWidth={1} strokeDasharray="2 2" />
                                <circle cx={mx} cy={centerY} r={2.5} fill={OXBLOOD} />
                                <text x={mx} y={ty} fill={INK} fontSize={10} textAnchor="middle">
                                  {a.done ? "✓ " : ""}
                                  {short}
                                </text>
                              </g>
                            );
                          })}
                          <g
                            className="cursor-pointer"
                            onMouseEnter={(e) =>
                              setPeek({
                                x: e.clientX,
                                y: e.clientY,
                                title: `${cl.length} ambitions · ${p.name}`,
                                items: cl.map((a) => ({ label: a.title, done: a.done, due: a.isDeadline && !a.done })),
                              })
                            }
                            onMouseLeave={() => setPeek(null)}
                            onClick={() =>
                              armed
                                ? cl.forEach((a) => applyAmbTag(a.id, armed.id, ambTagsOf(a)))
                                : setClusterMenu({
                                    projectName: p.name,
                                    items: cl.map((a) => ({ id: a.id, kind: "ambition" as const, label: a.title, t: a.t, done: a.done })),
                                  })
                            }
                          >
                            {hiInCluster && (
                              <circle cx={cxC} cy={centerY} r={AMB_R + 4} fill="none" stroke={OXBLOOD} strokeWidth={2.5} />
                            )}
                            <circle
                              cx={cxC}
                              cy={centerY}
                              r={AMB_R}
                              fill={NODE_FILL}
                              fillOpacity={allDone ? 0.5 : 1}
                              stroke={OXBLOOD}
                              strokeWidth={1.25}
                              strokeDasharray="4 3"
                            />
                            <text x={cxC} y={centerY + 6} fill={OXBLOOD} fontSize={17} fontWeight={500} textAnchor="middle" fontFamily="Georgia, serif">
                              {cl.length}
                            </text>
                            {anyDue && <circle cx={cxC + AMB_R - 5} cy={centerY - AMB_R + 5} r={3.5} fill={OXBLOOD} stroke={NODE_FILL} strokeWidth={1} />}
                            {doneCount > 0 && !allDone && (
                              <circle cx={cxC - AMB_R + 5} cy={centerY - AMB_R + 5} r={3.5} fill="#22c55e" stroke={NODE_FILL} strokeWidth={1} />
                            )}
                          </g>
                        </g>
                      );
                    })}

                    {/* "+" to add a node/ambition */}
                    <g
                      className="cursor-pointer"
                      onClick={(e) => {
                        setAddDeadlineOpen(false);
                        setAddChoice({ projectId: p.id, projectName: p.name, minDate, anchorNodeId, anchorT, x: e.clientX, y: e.clientY });
                      }}
                    >
                      <circle cx={plusX} cy={plusY} r={10} fill={PAPER_SURFACE} stroke={OXBLOOD} strokeWidth={1.25} />
                      <text x={plusX} y={plusY + 4} fill={OXBLOOD} fontSize={14} textAnchor="middle">
                        +
                      </text>
                      <title>Add a note or ambition to {p.name}</title>
                    </g>
                  </svg>

                  {p.notes.map((nt) => {
                    const np = noteOf(nt);
                    const isEditing = editingNote === nt.id;
                    return (
                      <div
                        key={nt.id}
                        onPointerDown={(e) => {
                          if (isEditing) return;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          noteDragRef.current = { id: nt.id, moved: false, dist: 0 };
                          setDraggingNote(nt.id);
                        }}
                        onPointerMove={(e) => {
                          if (draggingNote !== nt.id || !noteDragRef.current) return;
                          noteDragRef.current.dist += Math.abs(e.movementX) + Math.abs(e.movementY);
                          if (noteDragRef.current.dist <= 4) return; // ignore tiny jitter
                          noteDragRef.current.moved = true;
                          setNoteOverride((prev) => {
                            const cur = prev[nt.id] ?? { x: nt.x, y: nt.y };
                            const nx = cur.x + (e.movementX / pxPerDay) * DAY;
                            const limit = laneH / 2 - 22;
                            const ny = Math.max(-limit, Math.min(limit, cur.y + e.movementY));
                            const next = { ...prev, [nt.id]: { x: nx, y: ny } };
                            noteOverrideRef.current = next;
                            return next;
                          });
                        }}
                        onPointerUp={(e) => {
                          if (draggingNote !== nt.id) return;
                          e.currentTarget.releasePointerCapture(e.pointerId);
                          setDraggingNote(null);
                          const info = noteDragRef.current;
                          noteDragRef.current = null;
                          if (info && info.moved) {
                            const cur = noteOverrideRef.current[nt.id] ?? { x: nt.x, y: nt.y };
                            updateNotePosition(nt.id, cur.x, cur.y);
                          } else {
                            // a click (no real drag) opens the note for reading/editing
                            setEditBody(nt.body);
                            setEditingNote(nt.id);
                          }
                        }}
                        style={{
                          position: "absolute",
                          left: LABEL_W + xFor(np.x),
                          top: centerY + np.y,
                          transform: "translate(-50%, -50%)",
                          touchAction: "none",
                          zIndex: isEditing ? 20 : 10,
                        }}
                        className="cursor-grab select-none"
                        title={isEditing ? "" : "Click to open · drag to move · corner to resize"}
                      >
                        {isEditing ? (
                          <div
                            className="flex flex-col gap-1 rounded-md p-2 shadow"
                            style={{ background: NOTE_FILL, border: `1px solid ${NOTE_BORDER}`, color: INK }}
                          >
                            <textarea
                              autoFocus
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              onBlur={() => saveNoteBody(nt.id)}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-60 resize-none rounded p-2 text-sm outline-none"
                              style={{ background: PAPER, color: INK }}
                              rows={6}
                            />
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => removeNoteById(nt.id)}
                              className="self-end text-xs text-muted hover:text-oxblood"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <div className="relative">
                            {/* Compact Pantone Note chip: same band/colour language as
                                Layer 2, but kept small — the corner code is hidden at
                                this size (it surfaces on Layer 2 and the node panel). */}
                            <SubnodeChip
                              type="note"
                              body={nt.body}
                              showCode={false}
                              compact
                              clampLines={2}
                              minHeight={0}
                              style={{
                                width: noteSizes[nt.id] ?? NOTE_DEFAULT_W,
                                height: noteHeight(noteSizes[nt.id] ?? NOTE_DEFAULT_W),
                                overflow: "hidden",
                              }}
                            />
                            <div
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                sizeRef.current = { id: nt.id, w: noteSizes[nt.id] ?? NOTE_DEFAULT_W };
                                setResizingNote(nt.id);
                              }}
                              onPointerMove={(e) => {
                                if (resizingNote !== nt.id || !sizeRef.current) return;
                                const nw = Math.max(NOTE_MIN_W, Math.min(NOTE_MAX_W, sizeRef.current.w + e.movementX));
                                sizeRef.current.w = nw;
                                setNoteSize(nt.id, nw);
                              }}
                              onPointerUp={(e) => {
                                if (resizingNote !== nt.id) return;
                                e.stopPropagation();
                                e.currentTarget.releasePointerCapture(e.pointerId);
                                setResizingNote(null);
                                sizeRef.current = null;
                              }}
                              className="absolute -bottom-1 -right-1 h-3 w-3 cursor-se-resize rounded-full"
                              style={{ background: NOTE_BORDER, border: `1px solid ${OXBLOOD}` }}
                              title="Drag to resize"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover-to-peek list for a count badge */}
      {peek && (
        <div
          className="pointer-events-none fixed z-50 w-56 rounded-lg border border-hairline bg-paper-surface/95 p-2 text-xs text-ink shadow-xl backdrop-blur"
          style={{
            left: Math.min(peek.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 240),
            top: peek.y + 14,
          }}
        >
          <div className="brand-serif mb-1 truncate text-ink">{peek.title}</div>
          <ul className="flex max-h-60 flex-col gap-0.5 overflow-hidden">
            {peek.items.map((it, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: it.done ? MUTED : it.due ? OXBLOOD : "#22c55e" }}
                />
                <span className={`truncate ${it.done ? "text-muted line-through" : "text-ink"}`}>{it.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Magic-wand active banner */}
      {armed && (
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-oxblood bg-oxblood/90 px-4 py-1.5 text-sm text-paper shadow backdrop-blur">
          <span>
            🪄 Tagging with <strong>{armed.value}</strong> — click nodes/projects
          </span>
          <button onClick={() => setArmed(null)} className="rounded bg-paper/20 px-2 py-0.5 hover:bg-paper/30">
            Stop (Esc)
          </button>
        </div>
      )}

      {/* Upcoming / Recent / By-tag toggles (lowered so they clear the calendar axis) */}
      {!upcomingOpen && !recentOpen && !tagFindOpen && (
        <div className="absolute right-4 top-14 z-30 flex flex-col items-end gap-2">
          <button
            onClick={() => {
              setRecentOpen(false);
              setTagFindOpen(false);
              setSearchOpen(false);
              setUpcomingOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-hairline bg-paper-surface/90 px-3 py-1.5 text-sm text-ink shadow backdrop-blur hover:bg-paper-surface"
            title="Upcoming deadlines and ambitions"
          >
            Upcoming
            {upcoming.length > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  overdueCount ? "bg-oxblood text-paper" : "bg-paper text-ink border border-hairline"
                }`}
              >
                {overdueCount ? `${overdueCount} overdue` : upcoming.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setUpcomingOpen(false);
              setTagFindOpen(false);
              setSearchOpen(false);
              setRecentOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-hairline bg-paper-surface/90 px-3 py-1.5 text-sm text-ink shadow backdrop-blur hover:bg-paper-surface"
            title="Nodes from the last 7 days"
          >
            Recent
            {recent.length > 0 && (
              <span className="rounded-full border border-hairline bg-paper px-1.5 py-0.5 text-[11px] text-ink">{recent.length}</span>
            )}
          </button>
          <button
            onClick={() => {
              setUpcomingOpen(false);
              setRecentOpen(false);
              setSearchOpen(false);
              setTagFindOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-hairline bg-paper-surface/90 px-3 py-1.5 text-sm text-ink shadow backdrop-blur hover:bg-paper-surface"
            title="Find everything carrying a tag"
          >
            By tag
          </button>
        </div>
      )}
      {upcomingOpen && (
        <div className="absolute bottom-0 right-0 top-0 z-30 flex w-72 flex-col border-l border-hairline bg-paper-surface/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="brand-serif text-sm text-ink">
              Upcoming{overdueCount > 0 && <span className="ml-2 text-xs font-normal text-oxblood">{overdueCount} overdue</span>}
            </span>
            <button
              onClick={() => setUpcomingOpen(false)}
              className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {upcoming.length === 0 ? (
              <p className="p-3 text-sm text-muted">Nothing scheduled yet. Add an ambition, or set a deadline on a node.</p>
            ) : (
              UP_BUCKETS.map((b) => {
                const items = upcoming.filter((u) => bucketOf(u.dueT) === b);
                if (items.length === 0) return null;
                return (
                  <div key={b} className="mb-3">
                    <div
                      className={`mb-1 px-1 text-[10px] font-medium uppercase tracking-wide ${
                        b === "Overdue" ? "text-oxblood" : "text-muted"
                      }`}
                    >
                      {b}
                    </div>
                    {items.map((u) => (
                      <button
                        key={`${u.kind}-${u.id}`}
                        onClick={() => focusOn(u.id, u.goT, u.lane)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper"
                        title="Show on the timeline"
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OXBLOOD }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink">
                            <span className="text-oxblood">
                              {u.kind === "deadline" ? "⚑ " : "◯ "}
                            </span>
                            {u.label}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{u.project}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className={`block text-[11px] ${u.dueT < todayMs ? "text-oxblood" : "text-ink"}`}>
                            {fmtEU(u.dueT)}
                          </span>
                          <span className="block text-[10px] text-muted">{relLabel(u.dueT)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Find: live search over projects then nodes — popover anchors below
          the docked Find button (which now lives in the axis left column). */}
      {searchOpen && (
        <div
          className="absolute left-3 z-40 w-72 rounded-lg border border-hairline bg-paper-surface/95 shadow-xl backdrop-blur"
          style={{ top: AXIS_H + 6 }}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-2 py-1.5">
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Esc closes; Enter on an empty box closes too (toggle back off).
                if (e.key === "Escape" || (e.key === "Enter" && searchQuery.trim() === "")) {
                  setSearchOpen(false);
                  setSearchQuery("");
                }
              }}
              placeholder="Search projects & nodes…"
              className="min-w-0 flex-1 rounded-md border border-hairline bg-paper px-2 py-1 text-sm text-ink outline-none focus:border-oxblood"
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
          <div className="max-h-[60vh] overflow-auto p-2">
            {searchQuery.trim().length < 2 ? (
              <p className="px-1 pt-1 text-xs text-muted">Type at least 2 letters…</p>
            ) : (
              (() => {
                const q = searchQuery.trim().toLowerCase();
                const projHits: { lane: number; p: Lane }[] = [];
                const nodeHits: { id: string; label: string; t: number; origin: string; project: string; lane: number; done: boolean }[] = [];
                lanes.forEach((p, li) => {
                  if (p.name.toLowerCase().includes(q)) projHits.push({ lane: li, p });
                  for (const n of p.nodes)
                    if (n.label.toLowerCase().includes(q))
                      nodeHits.push({ id: n.id, label: n.label, t: n.t, origin: n.origin, project: p.name, lane: li, done: n.done });
                });
                nodeHits.sort((a, b) => b.t - a.t);
                if (projHits.length === 0 && nodeHits.length === 0)
                  return <p className="px-1 pt-1 text-sm text-muted">No matches.</p>;
                return (
                  <>
                    {projHits.length > 0 && (
                      <div className="mb-3">
                        <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted">Projects</div>
                        {projHits.map(({ p, lane }) => (
                          <button
                            key={p.id}
                            onClick={() => jumpToTime(p.nodes[0]?.t ?? nowMs, lane)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper"
                            title="Go to this project"
                          >
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: projColorOf(p) }} />
                            <span className="brand-serif truncate text-sm text-ink">{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {nodeHits.length > 0 && (
                      <div>
                        <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted">Nodes</div>
                        {nodeHits.slice(0, 60).map((u) => (
                          <button
                            key={u.id}
                            onClick={() => focusOn(u.id, u.t, u.lane)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper"
                            title="Show on the timeline"
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OXBLOOD }} />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${u.done ? "text-muted line-through" : "text-ink"}`}>
                                {u.label}
                              </span>
                              <span className="block truncate text-[11px] text-muted">{u.project}</span>
                            </span>
                            <span className="shrink-0 text-[11px] text-muted">{fmtEU(u.t)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Recent: nodes from the last 7 days */}
      {recentOpen && (
        <div className="absolute bottom-0 right-0 top-0 z-30 flex w-72 flex-col border-l border-hairline bg-paper-surface/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="brand-serif text-sm text-ink">
              Recent <span className="ml-1 text-xs font-normal text-muted">last 7 days</span>
            </span>
            <button
              onClick={() => setRecentOpen(false)}
              className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {recent.length === 0 ? (
              <p className="p-3 text-sm text-muted">No nodes in the last 7 days.</p>
            ) : (
              recent.map((u) => (
                <button
                  key={u.id}
                  onClick={() => focusOn(u.id, u.t, u.lane)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper"
                  title="Show on the timeline"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OXBLOOD }} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${u.done ? "text-muted line-through" : "text-ink"}`}>
                      {u.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted">{u.project}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] text-ink">{fmtEU(u.t)}</span>
                    <span className="block text-[10px] text-muted">{relLabel(u.t)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* By tag: pick a tag, then see every node carrying it, newest first */}
      {tagFindOpen && (
        <div className="absolute bottom-0 right-0 top-0 z-30 flex w-72 flex-col border-l border-hairline bg-paper-surface/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="brand-serif text-sm text-ink">By tag</span>
            <button
              onClick={() => {
                setTagFindOpen(false);
                setTagFindId(null);
              }}
              className="rounded px-1.5 text-muted hover:bg-paper hover:text-ink"
              title="Close"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {!tagFindId ? (
              <>
                <p className="px-1 pb-2 text-xs text-muted">Pick a tag to see everything it&apos;s on.</p>
                {categories.length === 0 && <p className="px-1 text-xs text-muted">No tags yet.</p>}
                {categories.map((c) => (
                  <div key={c.id} className="mb-3">
                    <div className="mb-1 px-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                    <div className="flex flex-wrap gap-1 px-1">
                      {c.values.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => setTagFindId(v.id)}
                          className="rounded-full px-2 py-0.5 text-xs text-ink"
                          style={{ border: `1px solid ${v.color}`, background: `${v.color}33` }}
                        >
                          {v.value}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              (() => {
                const tagVal = categories.flatMap((c) => c.values).find((v) => v.id === tagFindId);
                const tagName = tagVal?.value ?? "tag";
                const tagColor = tagVal?.color ?? tagColors[tagFindId] ?? MUTED;
                const matches: {
                  id: string;
                  kind: "node" | "ambition";
                  label: string;
                  t: number;
                  done: boolean;
                  project: string;
                  origin: string;
                  lane: number;
                }[] = [];
                lanes.forEach((p, li) => {
                  for (const n of p.nodes)
                    if (nodeTagsOf(n).includes(tagFindId))
                      matches.push({ id: n.id, kind: "node", label: n.label, t: n.t, done: n.done, project: p.name, origin: p.origin, lane: li });
                  for (const a of p.ambitions)
                    if (ambTagsOf(a).includes(tagFindId))
                      matches.push({ id: a.id, kind: "ambition", label: a.title, t: a.t, done: a.done, project: p.name, origin: p.origin, lane: li });
                });
                matches.sort((a, b) => b.t - a.t);
                return (
                  <>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: tagColor }}>
                        {tagName}
                      </span>
                      <button onClick={() => setTagFindId(null)} className="text-xs text-muted hover:text-ink">
                        Change tag
                      </button>
                    </div>
                    {matches.length === 0 ? (
                      <p className="px-1 text-sm text-muted">Nothing carries this tag yet.</p>
                    ) : (
                      matches.map((u) => (
                        <button
                          key={`${u.kind}-${u.id}`}
                          onClick={() => focusOn(u.id, u.t, u.lane)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-paper"
                          title="Show on the timeline"
                        >
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OXBLOOD }} />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm ${u.done ? "text-muted line-through" : "text-ink"}`}>
                              <span className="text-muted">{u.kind === "ambition" ? "◯ " : "▢ "}</span>
                              {u.label}
                            </span>
                            <span className="block truncate text-[11px] text-muted">{u.project}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[11px] text-ink">{fmtEU(u.t)}</span>
                            <span className="block text-[10px] text-muted">{relLabel(u.t)}</span>
                          </span>
                        </button>
                      ))
                    )}
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Legend / key (toggleable, bottom-left — offset right to clear the deploy badge) */}
      <div className="absolute bottom-6 left-20 z-30 flex flex-col items-start gap-2">
        {legendOpen && (
          <div className="w-64 rounded-lg border border-hairline bg-paper-surface/95 p-3 text-xs text-ink shadow-xl backdrop-blur">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted">Key</div>
            <ul className="flex flex-col gap-2">
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <rect x="1" y="1" width="16" height="16" rx="3" fill={NODE_FILL} stroke={OXBLOOD} strokeWidth="1.25" />
                </svg>
                <span>Event (a node)</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <rect x="1" y="1" width="16" height="16" rx="3" fill={NODE_FILL} stroke={OXBLOOD} strokeWidth="1.25" opacity="0.4" />
                </svg>
                <span>Done</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <rect x="1" y="1" width="16" height="16" rx="3" fill={NODE_FILL} stroke={OXBLOOD} strokeWidth="1.25" />
                  <rect x="1.6" y="1.6" width="6" height="14.8" fill={OXBLOOD} fillOpacity="0.85" />
                </svg>
                <span>Deadline — fills as it nears</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <circle cx="9" cy="9" r="7" fill={NODE_FILL} stroke={OXBLOOD} strokeWidth="1.25" strokeDasharray="3 2" />
                </svg>
                <span>Ambition (future) — click to tick off</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <rect x="1" y="1" width="16" height="16" rx="3" fill={NODE_FILL} stroke={OXBLOOD} strokeWidth="1.5" />
                  <text x="9" y="13" fill={OXBLOOD} fontSize="11" fontWeight="500" textAnchor="middle" fontFamily="Georgia, serif">
                    3
                  </text>
                </svg>
                <span>Several items bunched — hover to peek, click for list</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <circle cx="6" cy="9" r="3.5" fill={OXBLOOD} />
                  <circle cx="15" cy="9" r="3.5" fill="#22c55e" />
                </svg>
                <span>Corner dots: deadline inside / some done</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <line x1="1" y1="9" x2="19" y2="9" stroke={OXBLOOD} strokeOpacity="0.45" strokeWidth="2" />
                </svg>
                <span>Wire between nodes (thickens as you zoom out)</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" aria-hidden>
                  <rect x="2" y="3" width="16" height="12" rx="2" fill={NOTE_FILL} stroke={NOTE_BORDER} />
                </svg>
                <span>Note — drag to move, click to edit</span>
              </li>
              <li className="flex items-center gap-2">
                <svg width="20" height="18" viewBox="0 0 24 24" aria-hidden>
                  <rect x="5" y="5" width="2.4" height="14" rx="1" fill={MUTED} />
                  <path d="M20 5 L9 12 L20 19 Z" fill={MUTED} />
                </svg>
                <span>Jump to a project&apos;s start</span>
              </li>
            </ul>
          </div>
        )}
        <button
          onClick={() => setLegendOpen((v) => !v)}
          className="rounded-lg border border-hairline bg-paper-surface/90 px-2.5 py-1 text-sm text-ink backdrop-blur hover:bg-paper-surface"
        >
          {legendOpen ? "Hide key" : "Key"}
        </button>
      </div>

      {/* Floating controls */}
      <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-hairline bg-paper-surface/90 p-1 backdrop-blur">
          <span className="px-1 text-xs text-muted">Span</span>
          {ZOOMS.map((z) => (
            <button key={z.days} className={zoomBtn(daysPerScreen === z.days)} onClick={() => zoomTo(z.days)}>
              {z.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-hairline bg-paper-surface/90 p-1 backdrop-blur">
          <button className={btn} onClick={loadEarlier} title="Load 2 earlier months">
            ‹ Earlier
          </button>
          <button className={btn} onClick={goToday} title="Jump to today">
            Today
          </button>
          <button className={btn} onClick={loadLater} title="Load 2 later months">
            Later ›
          </button>
        </div>
      </div>

      {/* Add node / ambition modal */}
      {addTo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setAddTo(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitAdd} className={card}>
            <h2 className="brand-serif mb-1 text-lg text-oxblood">
              Add {addTo.mode === "ambition" ? "an ambition" : "a node"} to {addTo.projectName}
            </h2>
            <p className="mb-4 text-sm text-muted">
              {addTo.mode === "ambition"
                ? "Something planned — pick a future date."
                : "A past event — pick any date from the last node up to today."}
            </p>

            <label className="mb-1 block text-sm text-ink">Title</label>
            <input
              autoFocus
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="e.g. Kickoff meeting"
              className="mb-4 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood"
            />

            <label className="mb-1 block text-sm text-ink">Date</label>
            <MiniCalendar
              value={addDate}
              onChange={setAddDate}
              minDate={addTo.mode === "ambition" ? isoFromMs(Date.now() + DAY) : addTo.minDate || undefined}
              maxDate={addTo.mode === "node" ? todayIso() : undefined}
            />
            <p className="mb-2 mt-1 text-xs text-muted">Selected: {fmtEU(addDate)}</p>
            {addTo.mode === "ambition" && (
              <label className="mb-5 flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={addAsDeadline} onChange={(e) => setAddAsDeadline(e.target.checked)} />
                Also set as a deadline (red countdown to the date)
              </label>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <button type="button" onClick={() => setAddTo(null)} disabled={busy} className={ghost}>
                Cancel
              </button>
              <button type="submit" disabled={busy} className={primary}>
                {busy ? "Adding…" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Choose what to add: note or ambition */}
      {addChoice &&
        (() => {
          const proj = lanes.find((l) => l.id === addChoice.projectId);
          const dl = proj?.deadline ?? null;
          const PW = 288;
          const left = Math.max(8, Math.min(addChoice.x, window.innerWidth - PW - 8));
          const top = Math.max(8, Math.min(addChoice.y, window.innerHeight - 360));
          const fmtShort = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          const close = () => {
            setAddChoice(null);
            setAddDeadlineOpen(false);
          };
          return (
            <div className="fixed inset-0 z-40" onClick={close}>
              <div
                onClick={(e) => e.stopPropagation()}
                className="fixed rounded-lg border border-hairline bg-paper-surface p-3 text-ink shadow-2xl"
                style={{ left, top, width: PW }}
              >
                <div className="mb-2.5 flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-ink">Add to {addChoice.projectName}</div>
                    <div className="text-xs text-muted">What would you like to add?</div>
                  </div>
                  <button onClick={close} title="Close" className="-mr-1 -mt-1 shrink-0 rounded p-1 text-muted hover:bg-paper hover:text-ink">
                    ✕
                  </button>
                </div>

                <div className="flex flex-col gap-1.5">
                  {(addChoice.minDate === "" || addChoice.minDate < todayIso()) && (
                    <button
                      onClick={() => {
                        const c = addChoice;
                        close();
                        openAdd(c.projectId, c.projectName, c.minDate, "node");
                      }}
                      className="flex w-full items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2.5 text-left hover:bg-paper-surface"
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" className="shrink-0 text-ink">
                        <rect x={3} y={3} width={18} height={18} rx={3} fill="none" stroke="currentColor" strokeWidth={1.5} />
                      </svg>
                      <span className="flex flex-col">
                        <span className="text-sm font-medium text-ink">Node</span>
                        <span className="text-xs text-muted">A past event, up to today</span>
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const c = addChoice;
                      close();
                      openAdd(c.projectId, c.projectName, c.minDate, "ambition");
                    }}
                    className="flex w-full items-center gap-3 rounded-md border border-hairline bg-paper px-3 py-2.5 text-left hover:bg-paper-surface"
                  >
                    <svg width={18} height={18} viewBox="0 0 24 24" className="shrink-0 text-ink">
                      <circle cx={12} cy={12} r={9} fill="none" stroke="currentColor" strokeWidth={1.5} />
                    </svg>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-ink">Ambition</span>
                      <span className="text-xs text-muted">Something planned, in the future</span>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setNoteCompose({ projectId: addChoice.projectId, anchorNodeId: addChoice.anchorNodeId, anchorT: addChoice.anchorT });
                      setNoteBody("");
                      close();
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:brightness-95"
                    style={{ background: NOTE_FILL, border: `1px solid ${NOTE_BORDER}` }}
                  >
                    <svg
                      width={18}
                      height={18}
                      viewBox="0 0 24 24"
                      className="shrink-0"
                      style={{ color: "#8a6d1e" }}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M13 20l7 -7" />
                      <path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v14a2 2 0 0 0 2 2h8" />
                    </svg>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium" style={{ color: "#7a5c12" }}>
                        Note
                      </span>
                      <span className="text-xs" style={{ color: "#9a7c3a" }}>
                        A sticky reminder
                      </span>
                    </span>
                  </button>
                </div>

                {/* footer: project-level deadline */}
                <div className="mt-2.5 flex justify-end border-t border-hairline pt-2">
                  <button onClick={() => setAddDeadlineOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12.5 21h-6.5a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3.5" />
                      <path d="M16 3v4" />
                      <path d="M8 3v4" />
                      <path d="M4 11h16" />
                      <path d="M16 19h6" />
                      <path d="M19 16v6" />
                    </svg>
                    {dl ? `Deadline · ${fmtShort(dl)}` : "Set deadline"}
                  </button>
                </div>
                {addDeadlineOpen && (
                  <div className="mt-2 border-t border-hairline pt-2">
                    <MiniCalendar
                      value={dl ?? todayIso()}
                      onChange={(d) => {
                        saveProjectDeadline(addChoice.projectId, d);
                        setAddDeadlineOpen(false);
                      }}
                    />
                    {dl && (
                      <button
                        onClick={() => {
                          saveProjectDeadline(addChoice.projectId, null);
                          setAddDeadlineOpen(false);
                        }}
                        className="mt-1 text-xs text-oxblood hover:underline"
                      >
                        Clear deadline
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* Compose a note */}
      {noteCompose && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setNoteCompose(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg border border-hairline bg-paper-surface p-5 text-ink shadow-xl">
            <h2 className="brand-serif mb-3 text-lg text-oxblood">New note</h2>
            <textarea
              autoFocus
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write a note…"
              rows={4}
              className="mb-3 w-full resize-none rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood"
            />
            <p className="mb-4 text-xs text-muted">
              It&apos;ll appear by the latest node, linked by a dotted line — then drag it anywhere.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNoteCompose(null)} disabled={busy} className={ghost}>
                Cancel
              </button>
              <button onClick={submitNote} disabled={busy} className={primary}>
                {busy ? "Adding…" : "Add note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cluster list: the items collapsed under a count marker */}
      {clusterMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setClusterMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="brand-serif mb-1 text-lg text-oxblood">{clusterMenu.items.length} items</h2>
            <p className="mb-4 text-sm text-muted">{clusterMenu.projectName} · same stretch of time</p>
            <div className="flex max-h-[50vh] flex-col gap-1 overflow-auto">
              {clusterMenu.items.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setClusterMenu(null);
                    if (it.kind === "ambition") {
                      toggle(it.id, !it.done);
                    } else {
                      setNodeCalOpen(false);
                      setEditDateOpen(false);
                      setEditLabel(it.label);
                      setEditDate(isoFromMs(it.t));
                      setNodeMenu({
                        id: it.id,
                        label: it.label,
                        tags: it.tags ?? [],
                        deadline: it.deadline ?? null,
                        done: it.done,
                        origin: it.origin ?? "manual",
                        dateIso: isoFromMs(it.t),
                      });
                    }
                  }}
                  className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-paper px-3 py-2 text-left text-sm text-ink hover:bg-paper-surface"
                >
                  <span className="truncate">
                    {it.kind === "ambition" ? "◯ " : ""}
                    {it.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {fmtEU(it.t)}
                    {it.done ? " ✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setClusterMenu(null)} className={ghost}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Node actions */}
      {nodeMenu &&
        (() => {
          const lane = laneOfNode(nodeMenu.id);
          const projectName = lane?.name ?? "";
          const cur = lane?.nodes.find((n) => n.id === nodeMenu.id)?.tags ?? nodeMenu.tags;
          const tagInfo: Record<string, { value: string; color: string | null }> = {};
          for (const c of categories) for (const v of c.values) tagInfo[v.id] = { value: v.value, color: v.color };
          const subtitleDate = nodeMenu.origin === "manual" ? editDate : nodeMenu.dateIso;
          return (
            <div className="fixed inset-0 z-40 flex items-center justify-end bg-black/30" onClick={() => !busy && setNodeMenu(null)}>
              <div
                onClick={(e) => e.stopPropagation()}
                className="mr-3 w-[400px] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-hairline bg-paper-surface text-ink shadow-2xl"
                style={{ maxHeight: "min(720px, 85vh)" }}
              >
                {/* ── sticky header region (metadata) ── */}
                <div className="sticky top-0 z-10 border-b border-hairline bg-paper-surface p-4">
                  <div className="mb-1 flex items-start gap-2">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={panelSaveTitle}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                      }}
                      className="brand-serif min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-lg text-oxblood outline-none hover:border-hairline focus:border-oxblood focus:bg-paper"
                    />
                    <button onClick={() => setNodeMenu(null)} title="Close" className="shrink-0 rounded p-1 text-muted hover:bg-paper hover:text-ink">
                      ✕
                    </button>
                  </div>
                  {titleErr && <p className="mb-1 px-1 text-xs text-oxblood">{titleErr}</p>}

                  <div className="mb-3 flex items-center gap-1 px-1 text-xs text-muted">
                    {nodeMenu.origin === "manual" ? (
                      <button onClick={() => setEditDateOpen((v) => !v)} className="hover:text-ink hover:underline">
                        {fmtEU(subtitleDate)}
                      </button>
                    ) : (
                      <span title="Date comes from the email">{fmtEU(subtitleDate)}</span>
                    )}
                    <span>·</span>
                    <span className="truncate">{projectName}</span>
                  </div>
                  {editDateOpen && nodeMenu.origin === "manual" && (
                    <div className="mb-3">
                      <MiniCalendar value={editDate} onChange={panelSaveDate} maxDate={todayIso()} />
                    </div>
                  )}

                  {/* status chips */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    {nodeMenu.deadline ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-paper px-2.5 py-1 text-xs text-ink">
                        <button
                          onClick={() => {
                            setNodeCalDate(nodeMenu.deadline!);
                            setNodeCalOpen((v) => !v);
                          }}
                          className="hover:text-oxblood"
                        >
                          Due {fmtEU(nodeMenu.deadline)}
                        </button>
                        <button onClick={removeNodeDeadline} disabled={busy} title="Clear deadline" className="text-muted hover:text-oxblood">
                          ✕
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setNodeCalDate(todayIso());
                          setNodeCalOpen((v) => !v);
                        }}
                        className="rounded-full border border-dashed border-hairline px-2.5 py-1 text-xs text-muted hover:border-oxblood hover:text-oxblood"
                      >
                        Set deadline
                      </button>
                    )}
                    <button
                      onClick={() => completeNode(!nodeMenu.done)}
                      disabled={busy}
                      className="rounded-full border px-2.5 py-1 text-xs"
                      style={
                        nodeMenu.done
                          ? { background: "#e6efe0", borderColor: "#8a9a72", color: "#3f5536" }
                          : { background: "var(--color-paper, #e7dcc4)", borderColor: "#cbbb96", color: "#8f7f5b" }
                      }
                    >
                      {nodeMenu.done ? "✓ Complete" : "Incomplete"}
                    </button>
                  </div>

                  {/* deadline date picker (set / change) */}
                  {nodeCalOpen && (
                    <div className="mb-3 rounded-md border border-hairline bg-paper p-2">
                      <MiniCalendar value={nodeCalDate} onChange={setNodeCalDate} />
                      <p className="mt-1 text-xs text-muted">Due {fmtEU(nodeCalDate)}</p>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => setNodeCalOpen(false)} disabled={busy} className={ghost}>
                          Cancel
                        </button>
                        <button onClick={saveNodeDeadline} disabled={busy} className={primary}>
                          {nodeMenu.deadline ? "Update" : "Set deadline"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* tags: applied pills + "+ Tag" category popover */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {cur.map((id) => {
                      const info = tagInfo[id];
                      if (!info) return null;
                      return (
                        <span
                          key={id}
                          className="group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
                          style={{ background: info.color ?? "#a1a1aa", color: "#fff" }}
                        >
                          {info.value}
                          <button
                            onClick={() => applyNodeTag(nodeMenu.id, id, cur)}
                            title="Remove tag"
                            className="-mr-0.5 opacity-60 transition hover:opacity-100 group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })}
                    <div className="relative">
                      <button
                        onClick={() => setTagPopoverOpen((v) => !v)}
                        className="rounded-full border border-dashed border-hairline px-2 py-0.5 text-xs text-muted hover:border-oxblood hover:text-oxblood"
                      >
                        + Tag
                      </button>
                      {tagPopoverOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setTagPopoverOpen(false)} />
                          <div className="absolute left-1/2 top-full z-20 mt-1 max-h-64 w-56 -translate-x-1/2 overflow-auto rounded-md border border-hairline bg-paper-surface p-2 shadow-lg">
                            {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
                            {categories.map((c) => (
                              <div key={c.id} className="mb-2 last:mb-0">
                                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                                <div className="flex flex-wrap gap-1">
                                  {c.values.map((v) => {
                                    const on = cur.includes(v.id);
                                    return (
                                      <button
                                        key={v.id}
                                        onClick={() => applyNodeTag(nodeMenu.id, v.id, cur)}
                                        className="rounded-full px-2 py-0.5 text-xs"
                                        style={{ background: on ? v.color ?? "#a1a1aa" : "transparent", color: on ? "#fff" : INK, border: `1px solid ${v.color ?? "#a1a1aa"}` }}
                                      >
                                        {on ? "✓ " : ""}
                                        {v.value}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── body region: email + notes + context ── */}
                {detailLoading && <div className="px-4 py-4 text-xs text-muted">Loading…</div>}

                {/* email excerpt (hidden for manual nodes with no email) */}
                {nodeDetail?.email && (
                  <div className="border-b border-hairline px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                      <svg width={13} height={13} viewBox="0 0 24 24" className="shrink-0">
                        <path d="M3 6 h18 v12 h-18 z M3 6 l9 7 l9 -7" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
                      </svg>
                      <span className="truncate">From {nodeDetail.email.from}</span>
                      <span>·</span>
                      <span className="shrink-0">{relTimeAgo(nodeDetail.email.dateSent, Date.now())}</span>
                    </div>
                    {nodeDetail.email.snippet && (
                      <p className="whitespace-pre-line text-sm leading-snug text-ink/90">{nodeDetail.email.snippet}</p>
                    )}
                    {nodeDetail.email.threadUrl && (
                      <a href={nodeDetail.email.threadUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-oxblood hover:underline">
                        View full email →
                      </a>
                    )}
                  </div>
                )}

                {/* notes */}
                <div className="border-b border-hairline px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted">Notes</span>
                    <button onClick={() => setNoteEdit({ id: "new", text: "" })} title="Add note" className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink">
                      +
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {nodeDetail?.notes.map((n) =>
                      noteEdit && noteEdit.id === n.id ? (
                        <div key={n.id} className="rounded-md border p-2" style={{ background: NOTE_FILL, borderColor: NOTE_BORDER }}>
                          <textarea
                            autoFocus
                            rows={3}
                            value={noteEdit.text}
                            onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
                            className="w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-sm text-ink outline-none"
                          />
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <button onClick={savePanelNote} disabled={busy} className="rounded bg-oxblood px-2 py-0.5 text-paper hover:bg-oxblood-dark">Save</button>
                            <button onClick={() => setNoteEdit(null)} className="text-muted hover:text-ink">Cancel</button>
                            <button onClick={() => deletePanelNote(n.id)} className="ml-auto text-oxblood hover:underline">Delete</button>
                          </div>
                        </div>
                      ) : (
                        <button key={n.id} onClick={() => setNoteEdit({ id: n.id, text: n.body })} className="block w-full text-left">
                          <SubnodeChip type="note" body={n.body} code={n.code} />
                        </button>
                      )
                    )}
                    {noteEdit?.id === "new" && (
                      <div className="rounded-md border p-2" style={{ background: NOTE_FILL, borderColor: NOTE_BORDER }}>
                        <textarea
                          autoFocus
                          rows={3}
                          value={noteEdit.text}
                          onChange={(e) => setNoteEdit({ ...noteEdit, text: e.target.value })}
                          placeholder="New note…"
                          className="w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-sm text-ink outline-none"
                        />
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <button onClick={savePanelNote} disabled={busy || !noteEdit.text.trim()} className="rounded bg-oxblood px-2 py-0.5 text-paper hover:bg-oxblood-dark disabled:opacity-60">Add</button>
                          <button onClick={() => setNoteEdit(null)} className="text-muted hover:text-ink">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* context */}
                <div className="border-b border-hairline px-4 py-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-muted">Context</span>
                    <button onClick={() => setCtxEdit({ id: "new", text: "", kind: "context" })} title="Add context" className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-paper hover:text-ink">
                      +
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {nodeDetail?.contexts.map((c) => {
                      const col = c.kind === "information" ? "#6f5a8c" : "#5a7d8c";
                      return ctxEdit && ctxEdit.id === c.id ? (
                        <div key={c.id} className="rounded-md border bg-paper p-2" style={{ borderColor: col }}>
                          <div className="mb-1 flex gap-1">
                            {(["context", "information"] as const).map((k) => (
                              <button
                                key={k}
                                onClick={() => setCtxEdit({ ...ctxEdit, kind: k })}
                                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                                style={ctxEdit.kind === k ? { background: k === "information" ? "#6f5a8c" : "#5a7d8c", color: "#fff" } : { border: "1px solid #cbbb96", color: MUTED }}
                              >
                                {k}
                              </button>
                            ))}
                          </div>
                          <textarea
                            autoFocus
                            rows={3}
                            value={ctxEdit.text}
                            onChange={(e) => setCtxEdit({ ...ctxEdit, text: e.target.value })}
                            className="w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-sm text-ink outline-none"
                          />
                          <div className="mt-1 flex items-center gap-2 text-xs">
                            <button onClick={savePanelCtx} disabled={busy} className="rounded bg-oxblood px-2 py-0.5 text-paper hover:bg-oxblood-dark">Save</button>
                            <button onClick={() => setCtxEdit(null)} className="text-muted hover:text-ink">Cancel</button>
                            <button onClick={() => deletePanelCtx(c.id)} className="ml-auto text-oxblood hover:underline">Delete</button>
                          </div>
                        </div>
                      ) : (
                        <button key={c.id} onClick={() => setCtxEdit({ id: c.id, text: c.content, kind: c.kind })} className="block w-full text-left">
                          <SubnodeChip type={c.kind} body={c.content} code={c.code} />
                        </button>
                      );
                    })}
                    {ctxEdit?.id === "new" && (
                      <div className="rounded-md border bg-paper p-2" style={{ borderColor: ctxEdit.kind === "information" ? "#6f5a8c" : "#5a7d8c" }}>
                        <div className="mb-1 flex gap-1">
                          {(["context", "information"] as const).map((k) => (
                            <button
                              key={k}
                              onClick={() => setCtxEdit({ ...ctxEdit, kind: k })}
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={ctxEdit.kind === k ? { background: k === "information" ? "#6f5a8c" : "#5a7d8c", color: "#fff" } : { border: "1px solid #cbbb96", color: MUTED }}
                            >
                              {k}
                            </button>
                          ))}
                        </div>
                        <textarea
                          autoFocus
                          rows={3}
                          value={ctxEdit.text}
                          onChange={(e) => setCtxEdit({ ...ctxEdit, text: e.target.value })}
                          placeholder="New context…"
                          className="w-full resize-none rounded border border-hairline bg-paper px-1.5 py-1 text-sm text-ink outline-none"
                        />
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <button onClick={savePanelCtx} disabled={busy || !ctxEdit.text.trim()} className="rounded bg-oxblood px-2 py-0.5 text-paper hover:bg-oxblood-dark disabled:opacity-60">Add</button>
                          <button onClick={() => setCtxEdit(null)} className="text-muted hover:text-ink">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── footer (scrolls with the body) ── */}
                <div className="flex items-center justify-between gap-2 p-4">
                  {confirmDeleteNode ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Delete this node?</span>
                      <button onClick={removeNode} disabled={busy} className="font-medium text-oxblood hover:underline">
                        {busy ? "Deleting…" : "Yes, delete"}
                      </button>
                      <button onClick={() => setConfirmDeleteNode(false)} className="text-muted hover:text-ink">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button onClick={() => setConfirmDeleteNode(true)} disabled={busy} className="text-sm text-oxblood hover:underline">
                      Delete node
                    </button>
                  )}
                  {lane && (
                    <Link href={`/project/${lane.id}`} className="ml-auto inline-flex items-center gap-1 rounded-md bg-oxblood px-3 py-1.5 text-sm font-medium text-paper hover:bg-oxblood-dark">
                      Open in Layer 2 →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* Ambition actions */}
      {ambMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setAmbMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="brand-serif mb-3 text-lg text-oxblood">Ambition</h2>

            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Title</label>
            <input
              value={ambEditTitle}
              onChange={(e) => setAmbEditTitle(e.target.value)}
              className="mb-3 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood"
            />
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">Target: {fmtEU(ambEditDate)}</span>
                <button onClick={() => setAmbEditDateOpen((v) => !v)} className="text-xs text-muted hover:text-ink">
                  {ambEditDateOpen ? "Hide" : "Change"}
                </button>
              </div>
              {ambEditDateOpen && (
                <div className="mt-2">
                  <MiniCalendar value={ambEditDate} onChange={setAmbEditDate} />
                </div>
              )}
            </div>
            <label className="mb-4 flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={ambEditDeadline} onChange={(e) => setAmbEditDeadline(e.target.checked)} />
              Treat as a deadline (red countdown to the date)
            </label>
            <button onClick={saveAmbEdits} disabled={busy} className={`${primary} mb-5 w-full`}>
              {busy ? "Saving…" : "Save changes"}
            </button>

            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
            <div className="mb-5">
              {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
              {categories.map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.values.map((v) => {
                      const cur =
                        laneOfAmbition(ambMenu.id)?.ambitions.find((a) => a.id === ambMenu.id)
                          ?.tags ?? ambMenu.tags;
                      const on = cur.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          onClick={() => applyAmbTag(ambMenu.id, v.id, cur)}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{ background: on ? v.color : "transparent", color: on ? "#fff" : INK, border: `1px solid ${v.color}` }}
                        >
                          {v.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => {
                  toggle(ambMenu.id, !ambMenu.done);
                  setAmbMenu(null);
                }}
                disabled={busy}
                className={ambMenu.done ? ghost : primary}
              >
                {ambMenu.done ? "Reopen" : "✓ Mark done"}
              </button>
              <div className="flex gap-2">
                <button onClick={() => setAmbMenu(null)} disabled={busy} className={ghost}>
                  Close
                </button>
                <button onClick={removeAmbition} disabled={busy} className={danger}>
                  {busy ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Project actions */}
      {projMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && closeProj()}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            {mergeSource ? (
              <>
                {/* Explicit second confirmation — names BOTH projects and the direction. */}
                <h2 className="brand-serif mb-1 text-lg text-oxblood">Merge into {projMenu.name}?</h2>
                <p className="mb-5 text-sm text-muted">
                  Everything in <span className="font-medium text-ink">{mergeSource.name}</span> — its {mergeSource.nodeCount} node
                  {mergeSource.nodeCount === 1 ? "" : "s"}, {mergeSource.ambitionCount} ambition
                  {mergeSource.ambitionCount === 1 ? "" : "s"}, and all their information, context, notes and tags — will move into{" "}
                  <span className="font-medium text-ink">{projMenu.name}</span> and be placed on its timeline by date.{" "}
                  <span className="font-medium text-ink">{mergeSource.name}</span> will then be{" "}
                  <span className="font-medium text-ink">permanently deleted</span>. This can&apos;t be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setMergeSource(null)} disabled={busy} className={ghost}>
                    Back
                  </button>
                  <button onClick={doMerge} disabled={busy} className={danger}>
                    {busy ? "Merging…" : `Merge & delete ${mergeSource.name}`}
                  </button>
                </div>
              </>
            ) : mergePicking ? (
              <>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">Merge into {projMenu.name}</h2>
                <p className="mb-4 text-sm text-muted">
                  Pick a project to fold into <span className="font-medium text-ink">{projMenu.name}</span>. Its nodes,
                  information and tags move in; the project you pick is then deleted.
                </p>
                <div className="mb-4 flex max-h-72 flex-col gap-1 overflow-auto">
                  {lanes.filter((l) => l.id !== projMenu.id).length === 0 && (
                    <p className="text-xs text-muted">No other projects to merge in.</p>
                  )}
                  {lanes
                    .filter((l) => l.id !== projMenu.id)
                    .map((l) => (
                      <button
                        key={l.id}
                        onClick={() =>
                          setMergeSource({ id: l.id, name: l.name, nodeCount: l.nodes.length, ambitionCount: l.ambitions.length })
                        }
                        className="flex items-center justify-between rounded-md border border-hairline px-3 py-2 text-left text-sm hover:bg-paper"
                      >
                        <span className="truncate text-ink">{l.name}</span>
                        <span className="ml-3 shrink-0 text-xs text-muted">
                          {l.nodes.length} node{l.nodes.length === 1 ? "" : "s"}
                          {l.archived ? " · archived" : ""}
                        </span>
                      </button>
                    ))}
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setMergePicking(false)} disabled={busy} className={ghost}>
                    Back
                  </button>
                </div>
              </>
            ) : !projConfirm ? (
              <>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">{projMenu.name}</h2>
                <p className="mb-3 text-sm text-muted">
                  {projMenu.nodeCount} node{projMenu.nodeCount === 1 ? "" : "s"} ·{" "}
                  {projMenu.ambitionCount} ambition{projMenu.ambitionCount === 1 ? "" : "s"}
                </p>

                <a
                  href={`/project/${projMenu.id}`}
                  className="mb-5 inline-flex items-center gap-1 rounded-md bg-oxblood px-3 py-1.5 text-sm font-medium text-paper hover:bg-oxblood-dark"
                >
                  Open detail view →
                </a>

                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Wire colour</p>
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  {(() => {
                    const cur = lanes.find((l) => l.id === projMenu.id)?.color ?? projMenu.color;
                    return (
                      <>
                        {PROJECT_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => applyProjColor(projMenu.id, c)}
                            className={`h-6 w-6 rounded-full border-2 ${cur === c ? "border-oxblood" : "border-transparent"}`}
                            style={{ background: c }}
                            title={`Set ${c}`}
                          />
                        ))}
                        <button
                          onClick={() => applyProjColor(projMenu.id, null)}
                          title="Use the default project colour"
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            cur ? "border-hairline text-ink hover:bg-paper" : "border-oxblood text-oxblood"
                          }`}
                        >
                          Default
                        </button>
                      </>
                    );
                  })()}
                </div>

                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Spine colour</p>
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  {SPINE_PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => applySpineColor(projMenu.id, c)}
                      className={`h-6 w-6 rounded-sm border-2 ${
                        projMenu.spineColor === c ? "border-oxblood" : "border-transparent"
                      }`}
                      style={{ background: c }}
                      title={`Set spine colour ${c}`}
                    />
                  ))}
                  <button
                    onClick={() => applySpineColor(projMenu.id, null)}
                    title="Reset to the auto-assigned spine colour"
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      projMenu.spineUserSet ? "border-hairline text-ink hover:bg-paper" : "border-oxblood text-oxblood"
                    }`}
                  >
                    Auto
                  </button>
                </div>

                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
                <div className="mb-5">
                  {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
                  {categories.map((c) => (
                    <div key={c.id} className="mb-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {c.values.map((v) => {
                          const cur = lanes.find((l) => l.id === projMenu.id)?.tags ?? projMenu.tags;
                          const on = cur.includes(v.id);
                          return (
                            <button
                              key={v.id}
                              onClick={() => applyProjTag(projMenu.id, v.id, cur)}
                              className="rounded-full px-2 py-0.5 text-xs"
                              style={{
                                background: on ? v.color : "transparent",
                                color: on ? "#fff" : INK,
                                border: `1px solid ${v.color}`,
                              }}
                            >
                              {v.value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => setMergePicking(true)} disabled={busy || lanes.length < 2} className={ghost}>
                    Merge another project in…
                  </button>
                  <button onClick={doArchive} disabled={busy} className={ghost}>
                    {projMenu.archived ? "Archive again" : "Archive (hide, reversible)"}
                  </button>
                  <button onClick={() => setProjConfirm(true)} disabled={busy} className={danger}>
                    Delete permanently…
                  </button>
                  <button onClick={closeProj} disabled={busy} className="mt-1 text-sm text-muted hover:text-ink">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">Delete {projMenu.name}?</h2>
                <p className="mb-5 text-sm text-muted">
                  This permanently removes the project and its {projMenu.nodeCount} node
                  {projMenu.nodeCount === 1 ? "" : "s"} and {projMenu.ambitionCount} ambition
                  {projMenu.ambitionCount === 1 ? "" : "s"}. Gmail is never touched. This can&apos;t be undone.
                </p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setProjConfirm(false)} disabled={busy} className={ghost}>
                    Back
                  </button>
                  <button onClick={doDelete} disabled={busy} className={danger}>
                    {busy ? "Deleting…" : "Delete permanently"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
