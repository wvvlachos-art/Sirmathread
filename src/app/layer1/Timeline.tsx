"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  toggleProjectTag,
  toggleNodeTag,
  toggleAmbitionTag,
  setProjectColor,
  setNodeDeadline,
  clearNodeDeadline,
  setNodeDone,
  createNote,
  updateNotePosition,
  updateNoteBody,
  deleteNote,
} from "./actions";
import MiniCalendar from "./MiniCalendar";
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
} from "@/lib/theme";

type TagCat = {
  id: string;
  name: string;
  isHide: boolean;
  values: { id: string; value: string; color: string }[];
};

type LaneNode = {
  id: string;
  label: string;
  t: number;
  stage: number;
  done: boolean;
  deadline: string | null;
  origin: string;
  tags: string[];
};
type Ambition = { id: string; title: string; t: number; done: boolean; isDeadline: boolean; stage: number; tags: string[] };
type Note = { id: string; body: string; x: number; y: number; anchorT: number };
type Lane = {
  id: string;
  name: string;
  origin: string;
  color: string | null;
  archived: boolean;
  inactive: boolean;
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
const LABEL_W = 220;
const LANES_PER_SCREEN = 5;
const MIN_LANE_H = 120;
const CHUNK_DAYS = 60;
const MAX_SPAN_DAYS = 5 * 365;
const INITIAL_BACK = 120;
const INITIAL_FWD = 60;

const ZOOMS = [
  { days: 7, label: "1w" },
  { days: 30, label: "1m" },
  { days: 90, label: "3m" },
  { days: 180, label: "6m" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const isoFromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fmtEU = (d: string | number) =>
  new Date(typeof d === "string" ? d + "T00:00:00" : d).toLocaleDateString("en-GB");

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
  lanes,
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
  const router = useRouter();
  const { armed, setArmed } = useWand();
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
  // Inline title/date editing inside the node menu.
  const [editLabel, setEditLabel] = useState("");
  const [editDate, setEditDate] = useState(todayIso());
  const [editDateOpen, setEditDateOpen] = useState(false);
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
    { projectId: string; projectName: string; minDate: string; anchorNodeId: string | null; anchorT: number } | null
  >(null);
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
    } | null
  >(null);
  const [projConfirm, setProjConfirm] = useState(false);
  // Optimistic overrides so dots/colours change instantly (no refetch).
  const [nodeTagOverride, setNodeTagOverride] = useState<Record<string, string[]>>({});
  const [projTagOverride, setProjTagOverride] = useState<Record<string, string[]>>({});
  const [ambTagOverride, setAmbTagOverride] = useState<Record<string, string[]>>({});
  const [projColorOverride, setProjColorOverride] = useState<Record<string, string | null>>({});

  const measured = vw > 0;
  const pxPerDay = measured ? Math.max(6, (vw - LABEL_W) / daysPerScreen) : 40;
  const laneH = measured ? Math.max(MIN_LANE_H, Math.floor(vh / LANES_PER_SCREEN)) : 150;
  const canvasW = Math.round(((endMs - startMs) / DAY) * pxPerDay);
  const xFor = (t: number) => ((t - startMs) / DAY) * pxPerDay;
  const todayX = xFor(nowMs);

  // A gentle shrink on the zoomed-out spans; the real declutter is the clustering below.
  const nodeSize = daysPerScreen <= 30 ? NODE : daysPerScreen <= 90 ? 40 : 32;
  const nodeScale = nodeSize / NODE;

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
    if (res.error) {
      alert("Could not add: " + res.error);
      return;
    }
    setAddTo(null);
    router.refresh();
  };

  const toggle = async (id: string, done: boolean) => {
    await toggleAmbition(id, done);
    router.refresh();
  };
  // Open a node: stamp it if the wand is armed, otherwise show its menu.
  const openNode = (n: LaneNode) => {
    if (armed) {
      applyNodeTag(n.id, armed.id, nodeTagsOf(n));
      return;
    }
    setNodeCalOpen(false);
    setEditDateOpen(false);
    setEditLabel(n.label);
    setEditDate(isoFromMs(n.t));
    setNodeMenu({ id: n.id, label: n.label, tags: nodeTagsOf(n), deadline: n.deadline, done: n.done, origin: n.origin, dateIso: isoFromMs(n.t) });
  };
  const saveNodeEdits = async () => {
    if (!nodeMenu) return;
    const fields: { label?: string; date?: string } = {};
    if (editLabel.trim() !== nodeMenu.label) fields.label = editLabel;
    if (nodeMenu.origin === "manual" && editDate !== nodeMenu.dateIso) fields.date = editDate;
    if (Object.keys(fields).length === 0) {
      setNodeMenu(null);
      return;
    }
    setBusy(true);
    const res = await updateNode(nodeMenu.id, fields);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setNodeMenu(null);
    router.refresh();
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
    setAmbMenu(null);
    router.refresh();
  };
  const removeAmbition = async () => {
    if (!ambMenu) return;
    setBusy(true);
    await deleteAmbition(ambMenu.id);
    setBusy(false);
    setAmbMenu(null);
    router.refresh();
  };
  const removeNode = async () => {
    if (!nodeMenu) return;
    setBusy(true);
    await deleteNode(nodeMenu.id);
    setBusy(false);
    setNodeMenu(null);
    router.refresh();
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
    setNodeMenu(null);
    setNodeCalOpen(false);
    router.refresh();
  };
  const removeNodeDeadline = async () => {
    if (!nodeMenu) return;
    setBusy(true);
    await clearNodeDeadline(nodeMenu.id);
    setBusy(false);
    setNodeMenu(null);
    router.refresh();
  };
  const completeNode = async (done: boolean) => {
    if (!nodeMenu) return;
    setBusy(true);
    await setNodeDone(nodeMenu.id, done);
    setBusy(false);
    setNodeMenu(null);
    router.refresh();
  };

  const noteOf = (nt: Note) => noteOverride[nt.id] ?? { x: nt.x, y: nt.y };
  const submitNote = async () => {
    if (!noteCompose) return;
    setBusy(true);
    const res = await createNote(noteCompose.projectId, noteCompose.anchorNodeId, noteBody, noteCompose.anchorT, -60);
    setBusy(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setNoteCompose(null);
    setNoteBody("");
    router.refresh();
  };
  const saveNoteBody = async (id: string) => {
    setEditingNote(null);
    await updateNoteBody(id, editBody);
    router.refresh();
  };
  const removeNoteById = async (id: string) => {
    await deleteNote(id);
    router.refresh();
  };
  const doArchive = async () => {
    if (!projMenu) return;
    setBusy(true);
    await archiveProject(projMenu.id);
    setBusy(false);
    closeProj();
    router.refresh();
  };
  const doDelete = async () => {
    if (!projMenu) return;
    setBusy(true);
    await deleteProject(projMenu.id);
    setBusy(false);
    closeProj();
    router.refresh();
  };
  const closeProj = () => {
    setProjMenu(null);
    setProjConfirm(false);
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

  // Current tags for a node/project/ambition, respecting any optimistic override.
  const nodeTagsOf = (n: LaneNode) => nodeTagOverride[n.id] ?? n.tags;
  const projTagsOf = (p: Lane) => projTagOverride[p.id] ?? p.tags;
  const ambTagsOf = (a: Ambition) => ambTagOverride[a.id] ?? a.tags;
  // A project's colour (custom if set, else the origin colour).
  const projColorOf = (p: Lane) => {
    const c = p.id in projColorOverride ? projColorOverride[p.id] : p.color;
    return c ?? colorFor(p.origin);
  };

  // Toggle instantly in the UI; save in the background; revert if the save fails.
  const applyNodeTag = (id: string, valueId: string, current: string[]) => {
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    setNodeTagOverride((prev) => ({ ...prev, [id]: next }));
    toggleNodeTag(id, valueId).then((res) => {
      if (res?.error) {
        setNodeTagOverride((prev) => ({ ...prev, [id]: current }));
        alert("Could not update tag: " + res.error);
      }
    });
  };
  const applyProjTag = (id: string, valueId: string, current: string[]) => {
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    setProjTagOverride((prev) => ({ ...prev, [id]: next }));
    toggleProjectTag(id, valueId).then((res) => {
      if (res?.error) {
        setProjTagOverride((prev) => ({ ...prev, [id]: current }));
        alert("Could not update tag: " + res.error);
      }
    });
  };
  const applyAmbTag = (id: string, valueId: string, current: string[]) => {
    const next = current.includes(valueId)
      ? current.filter((x) => x !== valueId)
      : [...current, valueId];
    setAmbTagOverride((prev) => ({ ...prev, [id]: next }));
    toggleAmbitionTag(id, valueId).then((res) => {
      if (res?.error) {
        setAmbTagOverride((prev) => ({ ...prev, [id]: current }));
        alert("Could not update tag: " + res.error);
      }
    });
  };
  // Set a project's colour optimistically (null = back to origin colour).
  const applyProjColor = (id: string, color: string | null) => {
    setProjColorOverride((prev) => ({ ...prev, [id]: color }));
    setProjectColor(id, color).then((res) => {
      if (res?.error) alert("Could not set colour: " + res.error);
    });
  };

  // Axis pieces.
  const months: { x: number; label: string }[] = [];
  const days: number[] = [];
  if (measured) {
    const s = new Date(startMs);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur.getTime() <= endMs) {
      months.push({
        x: xFor(cur.getTime()),
        label: cur.toLocaleString("en-GB", { month: "short", year: "numeric" }),
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
            {/* Axis row */}
            <div className="sticky top-0 z-20 flex">
              <div
                className="sticky left-0 z-30 border-b border-r border-hairline bg-paper-surface"
                style={{ width: LABEL_W, height: AXIS_H }}
              />
              <svg width={canvasW} height={AXIS_H} className="border-b border-hairline" style={{ background: PAPER_SURFACE }}>
                {showDayNumbers &&
                  days.map((t, i) => {
                    const x = xFor(t);
                    return (
                      <g key={i}>
                        <line x1={x} y1={AXIS_H - 9} x2={x} y2={AXIS_H} stroke={HAIRLINE} />
                        <text x={x + 3} y={AXIS_H - 11} fill={MUTED} fontSize={9}>
                          {new Date(t).getDate()}
                        </text>
                      </g>
                    );
                  })}
                {months.map((m, i) => (
                  <g key={`m${i}`}>
                    <line x1={m.x} y1={0} x2={m.x} y2={AXIS_H} stroke={HAIRLINE} />
                    <text x={m.x + 5} y={15} fill={INK} fontSize={12} fontWeight={500} fontFamily="Georgia, serif">
                      {m.label}
                    </text>
                  </g>
                ))}
                <line x1={todayX} y1={0} x2={todayX} y2={AXIS_H} stroke={OXBLOOD} strokeWidth={1.5} />
                <text x={todayX + 4} y={28} fill={OXBLOOD} fontSize={10}>
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
              const customColor = p.id in projColorOverride ? projColorOverride[p.id] : p.color;
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
              const { clusters, labels: nodeLabels } = layoutLaneLabels(p.nodes, xFor, nodeSize);

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
                          })
                    }
                    className="sticky left-0 z-10 flex cursor-pointer items-center gap-2 border-b border-r border-hairline bg-paper-surface px-4 hover:bg-paper"
                    style={{ width: LABEL_W, height: laneH }}
                    title={armed ? `Stamp "${armed.value}"` : "Project options"}
                  >
                    {p.nodes.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          jumpToTime(p.nodes[0].t);
                        }}
                        title="Jump to the start of this project"
                        className="shrink-0 text-muted hover:text-ink"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <rect x="5" y="5" width="2.4" height="14" rx="1" fill="currentColor" />
                          <path d="M20 5 L9 12 L20 19 Z" fill="currentColor" />
                        </svg>
                      </button>
                    )}
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: projColorOf(p) }}
                    />
                    <span className="brand-serif line-clamp-2 text-sm leading-tight text-ink" title={p.name}>{p.name}</span>
                    {ptags.length > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {ptags.map((tid) => (
                          <span
                            key={tid}
                            className="tag-pop h-3 w-3 rounded-full"
                            style={{ background: tagColors[tid] ?? MUTED }}
                          />
                        ))}
                      </span>
                    )}
                    {p.archived && (
                      <span className="shrink-0 rounded border border-hairline bg-paper px-1.5 py-0.5 text-[10px] text-muted">
                        archived
                      </span>
                    )}
                  </div>

                  <svg width={canvasW} height={laneH} className="border-b border-hairline" style={{ background: PAPER }}>
                    <defs>
                      {p.nodes.map((n) => (
                        <clipPath key={n.id} id={`clip-${n.id}`}>
                          <rect width={NODE} height={NODE} rx={7} ry={7} />
                        </clipPath>
                      ))}
                      {p.ambitions.map((a) => (
                        <clipPath key={`ac-${a.id}`} id={`aclip-${a.id}`}>
                          <circle cx={xFor(a.t)} cy={centerY} r={AMB_R} />
                        </clipPath>
                      ))}
                    </defs>

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
                            <g transform={`translate(${left}, ${top}) scale(${nodeScale})`}>
                              <rect
                                width={NODE}
                                height={NODE}
                                rx={7}
                                ry={7}
                                fill={NODE_FILL}
                                stroke={OXBLOOD}
                                strokeWidth={1.25}
                              />
                              {!n.done && n.stage > 0 && (
                                <rect width={(NODE * n.stage) / 100} height={NODE} fill={OXBLOOD} fillOpacity={0.85} clipPath={`url(#clip-${n.id})`} />
                              )}
                              {(() => {
                                const pos = pipPositions(ntags.length);
                                return ntags.map((tid, di) => (
                                  <circle
                                    key={tid}
                                    className="tag-pop"
                                    cx={pos[di].x}
                                    cy={pos[di].y}
                                    r={pos[di].r}
                                    fill={tagColors[tid] ?? MUTED}
                                    stroke="#00000033"
                                    strokeWidth={0.75}
                                  />
                                ));
                              })()}
                              <title>
                                {n.label}
                                {n.deadline ? ` — deadline ${fmtEU(n.deadline)}` : ""}
                                {n.done ? " (done)" : ""}
                              </title>
                            </g>
                            {(() => {
                              const li = nodeLabels.get(n.id);
                              if (!li) return null;
                              const y = li.side === "above" ? top - 6 : top + nodeSize + 13;
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
                              <rect
                                x={cx - AMB_R}
                                y={centerY - AMB_R}
                                width={(2 * AMB_R * a.stage) / 100}
                                height={2 * AMB_R}
                                fill={OXBLOOD}
                                fillOpacity={0.85}
                                clipPath={`url(#aclip-${a.id})`}
                              />
                            )}
                            {a.done && (
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
                      onClick={() => setAddChoice({ projectId: p.id, projectName: p.name, minDate, anchorNodeId, anchorT })}
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
                            <div
                              className="overflow-hidden rounded-md shadow"
                              style={{
                                width: noteSizes[nt.id] ?? NOTE_DEFAULT_W,
                                height: noteHeight(noteSizes[nt.id] ?? NOTE_DEFAULT_W),
                                background: NOTE_FILL,
                                border: `1px solid ${NOTE_BORDER}`,
                              }}
                            >
                              <span
                                className="block whitespace-pre-wrap break-words px-1 py-0.5 text-[10px] leading-tight line-clamp-2"
                                style={{ color: INK }}
                              >
                                {nt.body}
                              </span>
                            </div>
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

      {/* Find button (top-left, under Arrange) — Enter also opens it */}
      {!searchOpen && (
        <button
          onClick={() => {
            setUpcomingOpen(false);
            setRecentOpen(false);
            setTagFindOpen(false);
            setSearchQuery("");
            setSearchOpen(true);
          }}
          className="absolute left-3 top-2 z-30 flex items-center gap-1.5 rounded-lg border border-hairline bg-paper-surface/90 px-3 py-1.5 text-sm text-ink shadow backdrop-blur hover:bg-paper-surface"
          title="Search projects and nodes (press Enter)"
        >
          🔍 Find
        </button>
      )}

      {/* Find: live search over projects then nodes — a popover at top-left, under Arrange */}
      {searchOpen && (
        <div className="absolute left-3 top-2 z-40 w-72 rounded-lg border border-hairline bg-paper-surface/95 shadow-xl backdrop-blur">
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
      {addChoice && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setAddChoice(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-lg border border-hairline bg-paper-surface p-5 text-ink shadow-xl">
            <h2 className="brand-serif mb-1 text-lg text-oxblood">Add to {addChoice.projectName}</h2>
            <p className="mb-4 text-sm text-muted">What would you like to add?</p>
            <div className="flex flex-col gap-2">
              {(addChoice.minDate === "" || addChoice.minDate < todayIso()) && (
                <button
                  onClick={() => {
                    const c = addChoice;
                    setAddChoice(null);
                    openAdd(c.projectId, c.projectName, c.minDate, "node");
                  }}
                  className="rounded-md border border-hairline bg-paper px-4 py-3 text-left text-sm font-medium text-ink hover:bg-paper-surface"
                >
                  ▢ Node <span className="font-normal text-muted">— a past event (up to today)</span>
                </button>
              )}
              <button
                onClick={() => {
                  const c = addChoice;
                  setAddChoice(null);
                  openAdd(c.projectId, c.projectName, c.minDate, "ambition");
                }}
                className="rounded-md border border-oxblood bg-paper px-4 py-3 text-left text-sm font-medium text-oxblood hover:bg-paper-surface"
              >
                ◯ Ambition <span className="font-normal text-muted">— something planned (future)</span>
              </button>
              <button
                onClick={() => {
                  setNoteCompose({
                    projectId: addChoice.projectId,
                    anchorNodeId: addChoice.anchorNodeId,
                    anchorT: addChoice.anchorT,
                  });
                  setNoteBody("");
                  setAddChoice(null);
                }}
                className="rounded-md px-4 py-3 text-left text-sm font-medium text-ink"
                style={{ background: NOTE_FILL, border: `1px solid ${NOTE_BORDER}` }}
              >
                📝 Note <span className="font-normal text-muted">— a sticky reminder</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
      {nodeMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setNodeMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="brand-serif mb-3 text-lg text-oxblood">Node</h2>

            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Title</label>
            <input
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              className="mb-3 w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood"
            />
            {nodeMenu.origin === "manual" ? (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink">Date: {fmtEU(editDate)}</span>
                  <button onClick={() => setEditDateOpen((v) => !v)} className="text-xs text-muted hover:text-ink">
                    {editDateOpen ? "Hide" : "Change"}
                  </button>
                </div>
                {editDateOpen && (
                  <div className="mt-2">
                    <MiniCalendar value={editDate} onChange={setEditDate} maxDate={todayIso()} />
                  </div>
                )}
              </div>
            ) : (
              <p className="mb-3 text-xs text-muted">Date comes from the email and isn&apos;t editable here.</p>
            )}
            <button onClick={saveNodeEdits} disabled={busy} className={`${primary} mb-5 w-full`}>
              {busy ? "Saving…" : "Save title / date"}
            </button>

            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Deadline</p>
            <div className="mb-4">
              {nodeMenu.deadline ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ink">
                    {nodeMenu.done ? "Completed ✓" : `Due ${fmtEU(nodeMenu.deadline)}`}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => completeNode(!nodeMenu.done)}
                      disabled={busy}
                      className={nodeMenu.done ? ghost : primary}
                    >
                      {nodeMenu.done ? "Reopen" : "✓ Complete"}
                    </button>
                    <button onClick={removeNodeDeadline} disabled={busy} className={ghost}>
                      Clear deadline
                    </button>
                  </div>
                </div>
              ) : nodeCalOpen ? (
                <div>
                  <MiniCalendar value={nodeCalDate} onChange={setNodeCalDate} />
                  <p className="mt-1 text-xs text-muted">Due {fmtEU(nodeCalDate)}</p>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setNodeCalOpen(false)} disabled={busy} className={ghost}>
                      Cancel
                    </button>
                    <button onClick={saveNodeDeadline} disabled={busy} className={primary}>
                      Set deadline
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setNodeCalDate(todayIso());
                    setNodeCalOpen(true);
                  }}
                  className={ghost}
                >
                  Set deadline
                </button>
              )}
            </div>

            <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
            <div className="mb-5">
              {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
              {categories.map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.values.map((v) => {
                      const cur = nodeTagOverride[nodeMenu.id] ?? nodeMenu.tags;
                      const on = cur.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          onClick={() => applyNodeTag(nodeMenu.id, v.id, cur)}
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

            <div className="flex justify-end gap-2">
              <button onClick={() => setNodeMenu(null)} disabled={busy} className={ghost}>
                Close
              </button>
              <button onClick={removeNode} disabled={busy} className={danger}>
                {busy ? "Deleting…" : "Delete node"}
              </button>
            </div>
          </div>
        </div>
      )}

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
                      const cur = ambTagOverride[ambMenu.id] ?? ambMenu.tags;
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
            {!projConfirm ? (
              <>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">{projMenu.name}</h2>
                <p className="mb-4 text-sm text-muted">
                  {projMenu.nodeCount} node{projMenu.nodeCount === 1 ? "" : "s"} ·{" "}
                  {projMenu.ambitionCount} ambition{projMenu.ambitionCount === 1 ? "" : "s"}
                </p>

                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Colour</p>
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  {(() => {
                    const cur = projMenu.id in projColorOverride ? projColorOverride[projMenu.id] : projMenu.color;
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

                <p className="mb-2 text-xs uppercase tracking-wide text-muted">Tags</p>
                <div className="mb-5">
                  {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
                  {categories.map((c) => (
                    <div key={c.id} className="mb-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                      <div className="flex flex-wrap gap-1">
                        {c.values.map((v) => {
                          const cur = projTagOverride[projMenu.id] ?? projMenu.tags;
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
