"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAmbition,
  createManualNode,
  toggleAmbition,
  deleteNode,
  archiveProject,
  deleteProject,
  toggleProjectTag,
  toggleNodeTag,
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
type Ambition = { id: string; title: string; t: number; done: boolean; isDeadline: boolean; stage: number };
type Note = { id: string; body: string; x: number; y: number; anchorT: number };
type Lane = {
  id: string;
  name: string;
  origin: string;
  archived: boolean;
  inactive: boolean;
  nodes: LaneNode[];
  ambitions: Ambition[];
  tags: string[];
  notes: Note[];
};

const GMAIL_COLOR = "#34d399"; // light green
const MANUAL_COLOR = "#2563eb"; // deep blue
const colorFor = (origin: string) => (origin === "manual" ? MANUAL_COLOR : GMAIL_COLOR);

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

// A little wand (stick + star) used as the cursor while the wand is armed.
const WAND_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'>" +
  "<line x1='3' y1='25' x2='17' y2='11' stroke='white' stroke-width='2.6' stroke-linecap='round'/>" +
  "<path d='M21 2 l1.5 4.2 l4.2 1.5 l-4.2 1.5 l-1.5 4.2 l-1.5-4.2 l-4.2-1.5 l4.2-1.5 z' fill='#facc15' stroke='white' stroke-width='0.6'/>" +
  "</svg>";
const WAND_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(WAND_SVG)}") 21 6, crosshair`;

// Arrange tag dots like dice pips so several tags pack neatly inside a node.
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

  const [daysPerScreen, setDaysPerScreen] = useState(30);
  const [startMs, setStartMs] = useState(nowMs - INITIAL_BACK * DAY);
  const [endMs, setEndMs] = useState(nowMs + INITIAL_FWD * DAY);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [busy, setBusy] = useState(false);

  // Add (node or ambition) modal.
  const [addTo, setAddTo] = useState<{ projectId: string; projectName: string; minDate: string } | null>(null);
  const [addTitle, setAddTitle] = useState("");
  const [addDate, setAddDate] = useState(todayIso());

  // Node and project action menus.
  const [nodeMenu, setNodeMenu] = useState<
    { id: string; label: string; tags: string[]; deadline: string | null; done: boolean } | null
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
  const [projMenu, setProjMenu] = useState<
    {
      id: string;
      name: string;
      nodeCount: number;
      ambitionCount: number;
      archived: boolean;
      tags: string[];
    } | null
  >(null);
  const [projConfirm, setProjConfirm] = useState(false);
  // Optimistic tag overrides so dots appear/disappear instantly (no refetch).
  const [nodeTagOverride, setNodeTagOverride] = useState<Record<string, string[]>>({});
  const [projTagOverride, setProjTagOverride] = useState<Record<string, string[]>>({});

  const measured = vw > 0;
  const pxPerDay = measured ? Math.max(6, (vw - LABEL_W) / daysPerScreen) : 40;
  const laneH = measured ? Math.max(MIN_LANE_H, Math.floor(vh / LANES_PER_SCREEN)) : 150;
  const canvasW = Math.round(((endMs - startMs) / DAY) * pxPerDay);
  const xFor = (t: number) => ((t - startMs) / DAY) * pxPerDay;
  const todayX = xFor(nowMs);

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
    if (!el || !scrollIntent.current) return;
    if (scrollIntent.current === "today") el.scrollLeft = Math.max(0, todayX - vw * 0.65);
    else if (scrollIntent.current === "left") el.scrollLeft = vw * 0.1;
    else if (scrollIntent.current === "right") el.scrollLeft = canvasW - vw * 1.05;
    scrollIntent.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startMs, endMs, pxPerDay]);

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

  const openAdd = (projectId: string, projectName: string, minDate: string) => {
    setAddTitle("");
    setAddDate(minDate > todayIso() ? minDate : todayIso());
    setAddAsDeadline(false);
    setAddTo({ projectId, projectName, minDate });
  };
  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTo) return;
    setBusy(true);
    const isFuture = addDate > todayIso();
    const res = isFuture
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

  // Current tags for a node/project, respecting any optimistic override.
  const nodeTagsOf = (n: LaneNode) => nodeTagOverride[n.id] ?? n.tags;
  const projTagsOf = (p: Lane) => projTagOverride[p.id] ?? p.tags;

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

  const btn = "rounded-md border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 text-sm text-zinc-200 hover:bg-zinc-800";
  const zoomBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-sm ${
      active
        ? "bg-zinc-100 text-zinc-900"
        : "border border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800"
    }`;
  const card = "w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl";
  const primary = "rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-60";
  const ghost = "rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800";
  const danger = "rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-60";

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
                className="sticky left-0 z-30 border-b border-r border-zinc-800 bg-zinc-950"
                style={{ width: LABEL_W, height: AXIS_H }}
              />
              <svg width={canvasW} height={AXIS_H} className="border-b border-zinc-800 bg-zinc-950">
                {showDayNumbers &&
                  days.map((t, i) => {
                    const x = xFor(t);
                    return (
                      <g key={i}>
                        <line x1={x} y1={AXIS_H - 9} x2={x} y2={AXIS_H} stroke="#27272a" />
                        <text x={x + 3} y={AXIS_H - 11} fill="#71717a" fontSize={9}>
                          {new Date(t).getDate()}
                        </text>
                      </g>
                    );
                  })}
                {months.map((m, i) => (
                  <g key={`m${i}`}>
                    <line x1={m.x} y1={0} x2={m.x} y2={AXIS_H} stroke="#3f3f46" />
                    <text x={m.x + 5} y={15} fill="#d4d4d8" fontSize={12} fontWeight={600}>
                      {m.label}
                    </text>
                  </g>
                ))}
                <line x1={todayX} y1={0} x2={todayX} y2={AXIS_H} stroke="#fbbf24" strokeWidth={1.5} />
                <text x={todayX + 4} y={28} fill="#fbbf24" fontSize={10}>
                  Today
                </text>
              </svg>
            </div>

            {/* Lanes */}
            {lanes.map((p) => {
              const centerY = laneH / 2;
              const ptags = projTagsOf(p);
              const last = p.nodes[p.nodes.length - 1];
              const anchorX = last ? xFor(last.t) : todayX;
              const plusX = anchorX + (last ? NODE / 2 : 0);
              const plusY = centerY - (last ? NODE / 2 : 14);
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
                          })
                    }
                    className="sticky left-0 z-10 flex cursor-pointer items-center gap-2 border-b border-r border-zinc-800 bg-zinc-950 px-4 hover:bg-zinc-900"
                    style={{ width: LABEL_W, height: laneH }}
                    title={armed ? `Stamp "${armed.value}"` : "Project options"}
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: colorFor(p.origin) }}
                    />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                    {ptags.length > 0 && (
                      <span className="flex shrink-0 items-center gap-0.5">
                        {ptags.map((tid) => (
                          <span
                            key={tid}
                            className="tag-pop h-3 w-3 rounded-full"
                            style={{ background: tagColors[tid] ?? "#a1a1aa" }}
                          />
                        ))}
                      </span>
                    )}
                    {p.archived && (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        archived
                      </span>
                    )}
                  </div>

                  <svg width={canvasW} height={laneH} className="border-b border-zinc-800">
                    <defs>
                      {p.nodes.map((n) => (
                        <clipPath key={n.id} id={`clip-${n.id}`}>
                          <rect width={NODE} height={NODE} rx={10} ry={10} />
                        </clipPath>
                      ))}
                      {p.ambitions.map((a) => (
                        <clipPath key={`ac-${a.id}`} id={`aclip-${a.id}`}>
                          <circle cx={xFor(a.t)} cy={centerY} r={AMB_R} />
                        </clipPath>
                      ))}
                    </defs>

                    {months.map((m, i) => (
                      <line key={i} x1={m.x} y1={0} x2={m.x} y2={laneH} stroke="#1c1c1f" />
                    ))}
                    <line x1={todayX} y1={0} x2={todayX} y2={laneH} stroke="#3f3722" />

                    {p.nodes.map((n, i) =>
                      i === 0 ? null : (
                        <line
                          key={`w-${n.id}`}
                          x1={xFor(p.nodes[i - 1].t)}
                          y1={centerY}
                          x2={xFor(n.t)}
                          y2={centerY}
                          stroke="#3f3f46"
                          strokeWidth={2}
                        />
                      )
                    )}

                    {p.ambitions.map((a) => (
                      <line
                        key={`aw-${a.id}`}
                        x1={anchorX}
                        y1={centerY}
                        x2={xFor(a.t)}
                        y2={centerY}
                        stroke="#52525b"
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
                          stroke="#d97706"
                          strokeWidth={1.5}
                          strokeDasharray="2 3"
                        />
                      );
                    })}

                    {/* square nodes */}
                    {p.nodes.map((n) => {
                      const cx = xFor(n.t);
                      const left = cx - NODE / 2;
                      const top = centerY - NODE / 2;
                      const ntags = nodeTagsOf(n);
                      const matchesFilter =
                        (!selectedTags.length || ntags.some((t) => selectedTags.includes(t))) &&
                        (!deadlineActive || !!n.deadline);
                      const dim = n.done || (filterActive && !matchesFilter);
                      return (
                        <g
                          key={n.id}
                          className="cursor-pointer"
                          opacity={dim ? 0.4 : 1}
                          onClick={() => {
                            if (armed) {
                              applyNodeTag(n.id, armed.id, nodeTagsOf(n));
                            } else {
                              setNodeCalOpen(false);
                              setNodeMenu({
                                id: n.id,
                                label: n.label,
                                tags: nodeTagsOf(n),
                                deadline: n.deadline,
                                done: n.done,
                              });
                            }
                          }}
                        >
                          <g transform={`translate(${left}, ${top})`}>
                            <rect
                              width={NODE}
                              height={NODE}
                              rx={10}
                              ry={10}
                              fill={n.done ? "#6b7280" : colorFor(n.origin)}
                            />
                            {!n.done && n.stage > 0 && (
                              <rect
                                width={(NODE * n.stage) / 100}
                                height={NODE}
                                fill="#ef4444"
                                clipPath={`url(#clip-${n.id})`}
                              />
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
                                  fill={tagColors[tid] ?? "#a1a1aa"}
                                  stroke="#00000066"
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
                          <text x={cx} y={top + NODE + 15} fill="#a1a1aa" fontSize={11} textAnchor="middle">
                            {n.label.length > 26 ? n.label.slice(0, 25) + "…" : n.label}
                          </text>
                        </g>
                      );
                    })}

                    {/* round ambitions */}
                    {p.ambitions.map((a) => {
                      const cx = xFor(a.t);
                      return (
                        <g key={a.id} className="cursor-pointer" onClick={() => toggle(a.id, !a.done)}>
                          <circle
                            cx={cx}
                            cy={centerY}
                            r={AMB_R}
                            fill={a.done ? "#3f3f46" : colorFor(p.origin)}
                            fillOpacity={a.done ? 0.5 : 0.9}
                            stroke="#e4e4e7"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                          />
                          {a.isDeadline && !a.done && a.stage > 0 && (
                            <rect
                              x={cx - AMB_R}
                              y={centerY - AMB_R}
                              width={(2 * AMB_R * a.stage) / 100}
                              height={2 * AMB_R}
                              fill="#ef4444"
                              clipPath={`url(#aclip-${a.id})`}
                            />
                          )}
                          {a.done && (
                            <text x={cx} y={centerY + 5} fill="#e4e4e7" fontSize={16} textAnchor="middle">
                              ✓
                            </text>
                          )}
                          <title>
                            Ambition: {a.title} — target {fmtEU(a.t)}
                            {a.done ? " (done — click to reopen)" : " (click to mark done)"}
                          </title>
                          <text x={cx} y={centerY + AMB_R + 15} fill="#a1a1aa" fontSize={11} textAnchor="middle">
                            {a.title.length > 26 ? a.title.slice(0, 25) + "…" : a.title}
                          </text>
                        </g>
                      );
                    })}

                    {/* "+" to add a node/ambition */}
                    <g
                      className="cursor-pointer"
                      onClick={() => setAddChoice({ projectId: p.id, projectName: p.name, minDate, anchorNodeId, anchorT })}
                    >
                      <circle cx={plusX} cy={plusY} r={10} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.5} />
                      <text x={plusX} y={plusY + 4} fill="#e4e4e7" fontSize={14} textAnchor="middle">
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
                        className={`cursor-grab select-none rounded-md border border-amber-500/70 bg-amber-100 text-amber-950 shadow ${
                          isEditing ? "p-2" : "px-2 py-1"
                        }`}
                        title={isEditing ? "" : "Click to open · drag to move"}
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-1">
                            <textarea
                              autoFocus
                              value={editBody}
                              onChange={(e) => setEditBody(e.target.value)}
                              onBlur={() => saveNoteBody(nt.id)}
                              onPointerDown={(e) => e.stopPropagation()}
                              className="w-60 resize-none rounded bg-white p-2 text-sm text-amber-950 outline-none"
                              rows={6}
                            />
                            <button
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => removeNoteById(nt.id)}
                              className="self-end text-xs text-amber-700 hover:text-red-600"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <span className="line-clamp-3 block max-w-[150px] whitespace-pre-wrap break-words text-xs">
                            {nt.body || "(empty note)"}
                          </span>
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

      {/* Magic-wand active banner */}
      {armed && (
        <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-blue-400 bg-blue-600/90 px-4 py-1.5 text-sm text-white shadow backdrop-blur">
          <span>
            🪄 Tagging with <strong>{armed.value}</strong> — click nodes/projects
          </span>
          <button onClick={() => setArmed(null)} className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30">
            Stop (Esc)
          </button>
        </div>
      )}

      {/* Floating controls */}
      <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-1 backdrop-blur">
          <span className="px-1 text-xs text-zinc-500">Span</span>
          {ZOOMS.map((z) => (
            <button key={z.days} className={zoomBtn(daysPerScreen === z.days)} onClick={() => zoomTo(z.days)}>
              {z.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/80 p-1 backdrop-blur">
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

      {/* Add node/ambition modal */}
      {addTo && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setAddTo(null)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={submitAdd} className={card}>
            <h2 className="mb-1 text-lg font-semibold text-zinc-100">Add to {addTo.projectName}</h2>
            <p className="mb-4 text-sm text-zinc-400">A future date becomes an Ambition; today/past becomes a node.</p>

            <label className="mb-1 block text-sm text-zinc-300">Title</label>
            <input
              autoFocus
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              placeholder="e.g. Kickoff meeting"
              className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />

            <label className="mb-1 block text-sm text-zinc-300">Date</label>
            <MiniCalendar value={addDate} onChange={setAddDate} minDate={addTo.minDate} />
            <p className="mb-1 mt-1 text-xs text-zinc-500">Selected: {fmtEU(addDate)}</p>
            <p className="mb-2 text-xs">
              {addDate > todayIso() ? (
                <span className="text-blue-400">Future → Ambition (round)</span>
              ) : (
                <span className="text-zinc-500">Today/past → node (square)</span>
              )}
            </p>
            {addDate > todayIso() && (
              <label className="mb-5 flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={addAsDeadline} onChange={(e) => setAddAsDeadline(e.target.checked)} />
                Also set as a deadline (red countdown to the date)
              </label>
            )}

            <div className="flex justify-end gap-2">
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => setAddChoice(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-100">Add to {addChoice.projectName}</h2>
            <p className="mb-4 text-sm text-zinc-400">What would you like to add?</p>
            <div className="flex gap-2">
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
                className="flex-1 rounded-md border border-amber-500/70 bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 hover:bg-amber-200"
              >
                📝 Note
              </button>
              <button
                onClick={() => {
                  const c = addChoice;
                  setAddChoice(null);
                  openAdd(c.projectId, c.projectName, c.minDate);
                }}
                className="flex-1 rounded-md border border-blue-400 bg-blue-600 px-4 py-3 text-sm font-medium text-white hover:bg-blue-500"
              >
                ◯ Ambition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose a note */}
      {noteCompose && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setNoteCompose(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
            <h2 className="mb-3 text-lg font-semibold text-zinc-100">New note</h2>
            <textarea
              autoFocus
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Write a note…"
              rows={4}
              className="mb-3 w-full resize-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
            <p className="mb-4 text-xs text-zinc-500">
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

      {/* Node actions */}
      {nodeMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setNodeMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-1 text-lg font-semibold text-zinc-100">Node</h2>
            <p className="mb-4 text-sm text-zinc-400">{nodeMenu.label}</p>

            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Deadline</p>
            <div className="mb-4">
              {nodeMenu.deadline ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-zinc-300">
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
                  <p className="mt-1 text-xs text-zinc-500">Due {fmtEU(nodeCalDate)}</p>
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

            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Tags</p>
            <div className="mb-5">
              {categories.length === 0 && <p className="text-xs text-zinc-500">No tags yet.</p>}
              {categories.map((c) => (
                <div key={c.id} className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">{c.name}</div>
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
                            color: on ? "#fff" : "#d4d4d8",
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

      {/* Project actions */}
      {projMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && closeProj()}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            {!projConfirm ? (
              <>
                <h2 className="mb-1 text-lg font-semibold text-zinc-100">{projMenu.name}</h2>
                <p className="mb-4 text-sm text-zinc-400">
                  {projMenu.nodeCount} node{projMenu.nodeCount === 1 ? "" : "s"} ·{" "}
                  {projMenu.ambitionCount} ambition{projMenu.ambitionCount === 1 ? "" : "s"}
                </p>

                <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Tags</p>
                <div className="mb-5">
                  {categories.length === 0 && <p className="text-xs text-zinc-500">No tags yet.</p>}
                  {categories.map((c) => (
                    <div key={c.id} className="mb-2">
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">{c.name}</div>
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
                                color: on ? "#fff" : "#d4d4d8",
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
                  <button onClick={closeProj} disabled={busy} className="mt-1 text-sm text-zinc-500 hover:text-zinc-300">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-1 text-lg font-semibold text-zinc-100">Delete {projMenu.name}?</h2>
                <p className="mb-5 text-sm text-zinc-400">
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
