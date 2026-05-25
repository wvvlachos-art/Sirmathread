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
} from "./actions";
import MiniCalendar from "./MiniCalendar";

type LaneNode = {
  id: string;
  label: string;
  t: number;
  stage: number;
  done: boolean;
  deadline: string | null;
  origin: string;
};
type Ambition = { id: string; title: string; t: number; done: boolean };
type Lane = {
  id: string;
  name: string;
  origin: string;
  archived: boolean;
  nodes: LaneNode[];
  ambitions: Ambition[];
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

export default function Timeline({ lanes, nowMs }: { lanes: Lane[]; nowMs: number }) {
  const router = useRouter();
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
  const [nodeMenu, setNodeMenu] = useState<{ id: string; label: string } | null>(null);
  const [projMenu, setProjMenu] = useState<
    { id: string; name: string; nodeCount: number; ambitionCount: number; archived: boolean } | null
  >(null);
  const [projConfirm, setProjConfirm] = useState(false);

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
    setAddTo({ projectId, projectName, minDate });
  };
  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addTo) return;
    setBusy(true);
    const isFuture = addDate > todayIso();
    const res = isFuture
      ? await createAmbition(addTo.projectId, addTitle, addDate)
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
      <div ref={scrollRef} className="h-full overflow-auto">
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
              const last = p.nodes[p.nodes.length - 1];
              const anchorX = last ? xFor(last.t) : todayX;
              const plusX = anchorX + (last ? NODE / 2 : 0);
              const plusY = centerY - (last ? NODE / 2 : 14);
              // Floor only at the latest node (keeps chains in order). An empty
              // project has no floor, so you can backdate when recreating history.
              const minDate = last ? isoFromMs(last.t) : "";

              return (
                <div key={p.id} className="flex">
                  <div
                    onClick={() =>
                      setProjMenu({
                        id: p.id,
                        name: p.name,
                        nodeCount: p.nodes.length,
                        ambitionCount: p.ambitions.length,
                        archived: p.archived,
                      })
                    }
                    className="sticky left-0 z-10 flex cursor-pointer items-center gap-2 border-b border-r border-zinc-800 bg-zinc-950 px-4 hover:bg-zinc-900"
                    style={{ width: LABEL_W, height: laneH }}
                    title="Project options"
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: colorFor(p.origin) }}
                    />
                    <span className="truncate text-sm font-medium">{p.name}</span>
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

                    {/* square nodes */}
                    {p.nodes.map((n) => {
                      const cx = xFor(n.t);
                      const left = cx - NODE / 2;
                      const top = centerY - NODE / 2;
                      return (
                        <g
                          key={n.id}
                          className="cursor-pointer"
                          opacity={n.done ? 0.4 : 1}
                          onClick={() => setNodeMenu({ id: n.id, label: n.label })}
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
                    <g className="cursor-pointer" onClick={() => openAdd(p.id, p.name, minDate)}>
                      <circle cx={plusX} cy={plusY} r={10} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.5} />
                      <text x={plusX} y={plusY + 4} fill="#e4e4e7" fontSize={14} textAnchor="middle">
                        +
                      </text>
                      <title>Add a node or ambition to {p.name}</title>
                    </g>
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
            <p className="mb-5 text-xs">
              {addDate > todayIso() ? (
                <span className="text-blue-400">Future → Ambition (round)</span>
              ) : (
                <span className="text-zinc-500">Today/past → node (square)</span>
              )}
            </p>

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

      {/* Node actions */}
      {nodeMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setNodeMenu(null)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-1 text-lg font-semibold text-zinc-100">Node</h2>
            <p className="mb-5 text-sm text-zinc-400">{nodeMenu.label}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setNodeMenu(null)} disabled={busy} className={ghost}>
                Cancel
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
                <p className="mb-5 text-sm text-zinc-400">
                  {projMenu.nodeCount} node{projMenu.nodeCount === 1 ? "" : "s"} ·{" "}
                  {projMenu.ambitionCount} ambition{projMenu.ambitionCount === 1 ? "" : "s"}
                </p>
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
