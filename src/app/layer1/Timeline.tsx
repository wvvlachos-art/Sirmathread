"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createAmbition, toggleAmbition } from "./actions";
import MiniCalendar from "./MiniCalendar";

// Format a date European-style: DD/MM/YYYY.
const fmtEU = (d: string | number) =>
  new Date(typeof d === "string" ? d + "T00:00:00" : d).toLocaleDateString("en-GB");

type LaneNode = {
  id: string;
  label: string;
  t: number;
  stage: number;
  done: boolean;
  deadline: string | null;
};
type Ambition = { id: string; title: string; t: number; done: boolean };
type Lane = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  nodes: LaneNode[];
  ambitions: Ambition[];
};

const DAY = 86_400_000;
const NODE = 48;
const AMB_R = 22;
const AXIS_H = 46;
const LABEL_W = 220;
const LANES_PER_SCREEN = 5;
const MIN_LANE_H = 120;
const CHUNK_DAYS = 60; // "Earlier"/"Later" step (default 2 months)
const MAX_SPAN_DAYS = 5 * 365;
const INITIAL_BACK = 120;
const INITIAL_FWD = 60;

const ZOOMS = [
  { days: 7, label: "1w" },
  { days: 30, label: "1m" },
  { days: 90, label: "3m" },
  { days: 180, label: "6m" },
];

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

  // Ambition creation form state.
  const [newAmb, setNewAmb] = useState<{ projectId: string; projectName: string } | null>(null);
  const [ambTitle, setAmbTitle] = useState("");
  const [ambDate, setAmbDate] = useState("");
  const [busy, setBusy] = useState(false);

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

  const openNew = (projectId: string, projectName: string) => {
    setAmbTitle("");
    setAmbDate(new Date(Date.now() + 30 * DAY).toISOString().slice(0, 10));
    setNewAmb({ projectId, projectName });
  };
  const submitAmb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAmb) return;
    setBusy(true);
    const res = await createAmbition(newAmb.projectId, ambTitle, ambDate);
    setBusy(false);
    if (res.error) {
      alert("Could not create ambition: " + res.error);
      return;
    }
    setNewAmb(null);
    router.refresh();
  };
  const toggle = async (id: string, done: boolean) => {
    await toggleAmbition(id, done);
    router.refresh();
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
        label: cur.toLocaleString("en-US", { month: "short", year: "numeric" }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    const first = new Date(startMs);
    first.setHours(0, 0, 0, 0);
    for (let t = first.getTime(); t <= endMs; t += DAY) days.push(t);
  }
  const showDayNumbers = pxPerDay >= 16;

  const btn =
    "rounded-md border border-zinc-700 bg-zinc-900/90 px-2.5 py-1 text-sm text-zinc-200 hover:bg-zinc-800";
  const zoomBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-sm ${
      active
        ? "bg-zinc-100 text-zinc-900"
        : "border border-zinc-700 bg-zinc-900/90 text-zinc-200 hover:bg-zinc-800"
    }`;

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

              return (
                <div key={p.id} className="flex">
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-zinc-800 bg-zinc-950 px-4"
                    style={{ width: LABEL_W, height: laneH }}
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: p.color }}
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

                    {/* wires between real nodes */}
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

                    {/* dashed wires from the latest node to each ambition */}
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

                    {/* real (square) nodes */}
                    {p.nodes.map((n) => {
                      const cx = xFor(n.t);
                      const left = cx - NODE / 2;
                      const top = centerY - NODE / 2;
                      return (
                        <g key={n.id} opacity={n.done ? 0.4 : 1}>
                          <g transform={`translate(${left}, ${top})`}>
                            <rect
                              width={NODE}
                              height={NODE}
                              rx={10}
                              ry={10}
                              fill={n.done ? "#6b7280" : p.color}
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

                    {/* ambitions (round) */}
                    {p.ambitions.map((a) => {
                      const cx = xFor(a.t);
                      return (
                        <g key={a.id} className="cursor-pointer" onClick={() => toggle(a.id, !a.done)}>
                          <circle
                            cx={cx}
                            cy={centerY}
                            r={AMB_R}
                            fill={a.done ? "#3f3f46" : p.color}
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
                          <text
                            x={cx}
                            y={centerY + AMB_R + 15}
                            fill="#a1a1aa"
                            fontSize={11}
                            textAnchor="middle"
                          >
                            {a.title.length > 26 ? a.title.slice(0, 25) + "…" : a.title}
                          </text>
                        </g>
                      );
                    })}

                    {/* "+" to add an ambition, at the top-right of the latest node */}
                    <g className="cursor-pointer" onClick={() => openNew(p.id, p.name)}>
                      <circle cx={plusX} cy={plusY} r={10} fill="#18181b" stroke="#a1a1aa" strokeWidth={1.5} />
                      <text x={plusX} y={plusY + 4} fill="#e4e4e7" fontSize={14} textAnchor="middle">
                        +
                      </text>
                      <title>Add an ambition to {p.name}</title>
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

      {/* New-ambition modal */}
      {newAmb && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !busy && setNewAmb(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAmb}
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
          >
            <h2 className="mb-1 text-lg font-semibold text-zinc-100">New ambition</h2>
            <p className="mb-4 text-sm text-zinc-400">for {newAmb.projectName}</p>

            <label className="mb-1 block text-sm text-zinc-300">Title</label>
            <input
              autoFocus
              value={ambTitle}
              onChange={(e) => setAmbTitle(e.target.value)}
              placeholder="e.g. Ship v1 to first customer"
              className="mb-4 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />

            <label className="mb-1 block text-sm text-zinc-300">Target date</label>
            <MiniCalendar value={ambDate} onChange={setAmbDate} />
            <p className="mb-5 mt-1 text-xs text-zinc-500">
              Selected: {ambDate ? fmtEU(ambDate) : "—"}
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewAmb(null)}
                disabled={busy}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-60"
              >
                {busy ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
