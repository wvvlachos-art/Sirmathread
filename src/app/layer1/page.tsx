import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../SignOutButton";
import Toolbar from "./Toolbar";
import ScrollArea from "./ScrollArea";

// ---- Types -------------------------------------------------------------------
type DbEmail = { subject: string | null; date_sent: string | null };
type DbNode = {
  id: string;
  position_index: number | null;
  display_label: string | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  emails: DbEmail | null;
};
type DbProject = {
  id: string;
  display_name: string | null;
  gmail_label_name: string;
  color: string | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  nodes: DbNode[];
};

// ---- Layout constants --------------------------------------------------------
const LABEL_W = 220;
const AXIS_H = 44;
const LANE_H = 110;
const NODE = 44;
const PX_PER_DAY = 6;
const DAY = 86_400_000;
const YEARS_EACH_SIDE = 2;
const INACTIVE_DAYS = 45;

function deadlineStage(deadline: string | null, setAt: string | null): number {
  if (!deadline) return 0;
  const end = new Date(deadline).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (!setAt) return 0;
  const start = new Date(setAt).getTime();
  if (start >= end) return 0;
  const frac = (now - start) / (end - start);
  if (frac <= 0) return 0;
  return Math.min(100, Math.floor(frac * 4) * 25);
}

function monthLabel(d: Date): string {
  return d.toLocaleString("en-US", { month: "short", year: "numeric" });
}

export default async function Layer1Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sort = sp.sort ?? "last_updated";
  const dir = sp.dir ?? "desc";
  const deadlineMode = sp.deadline ?? "";
  const hideCompleted = sp.hide_completed === "1";
  const showArchived = sp.show_archived === "1";
  const inactiveOnly = sp.inactive_only === "1";

  const states = showArchived ? ["active", "archived"] : ["active"];

  const { data } = await supabase
    .from("projects")
    .select(
      "id, display_name, gmail_label_name, color, deadline, deadline_set_at, done, state, created_at, updated_at, last_activity_at, nodes(id, position_index, display_label, deadline, deadline_set_at, done, state, emails(subject, date_sent))"
    )
    .in("state", states);

  let projects = (data ?? []) as DbProject[];

  // ---- Filters ----
  const nowMs = Date.now();
  if (hideCompleted) projects = projects.filter((p) => !p.done);
  if (deadlineMode === "all") projects = projects.filter((p) => p.deadline);
  if (inactiveOnly) {
    projects = projects.filter(
      (p) =>
        p.last_activity_at &&
        nowMs - new Date(p.last_activity_at).getTime() > INACTIVE_DAYS * DAY
    );
  }

  // ---- Sort ----
  const sortVal = (p: DbProject): number => {
    switch (sort) {
      case "date_created":
        return new Date(p.created_at).getTime();
      case "deadline":
        return p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
      case "inactive":
        return p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0;
      case "last_updated":
      default:
        return new Date(p.updated_at).getTime();
    }
  };
  projects.sort((a, b) => sortVal(a) - sortVal(b));
  if (dir === "desc") projects.reverse();

  // ---- Timeline geometry (fixed: 2 years back -> 2 years forward) ----
  const minTime = nowMs - YEARS_EACH_SIDE * 365 * DAY;
  const maxTime = nowMs + YEARS_EACH_SIDE * 365 * DAY;
  const canvasW = Math.round(((maxTime - minTime) / DAY) * PX_PER_DAY);
  const xFor = (t: number) => ((t - minTime) / DAY) * PX_PER_DAY;
  const todayX = xFor(nowMs);
  const scrollToX = Math.max(0, todayX - 200 * PX_PER_DAY); // show recent ~200 days

  const months: { x: number; label: string }[] = [];
  {
    const s = new Date(minTime);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur.getTime() <= maxTime) {
      months.push({ x: xFor(cur.getTime()), label: monthLabel(cur) });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  const totalActive = projects.length;

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sirmathread
          </Link>
          <span className="text-sm text-zinc-500">
            Overview · {totalActive} project{totalActive === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <Toolbar />

      {projects.length === 0 ? (
        <div className="p-10 text-zinc-400">No projects match the current filters.</div>
      ) : (
        <ScrollArea scrollToX={scrollToX}>
          <div style={{ width: LABEL_W + canvasW }}>
            {/* Axis row (sticky to top while scrolling vertically) */}
            <div className="sticky top-0 z-20 flex">
              <div
                className="sticky left-0 z-30 border-b border-r border-zinc-800 bg-zinc-950"
                style={{ width: LABEL_W, height: AXIS_H }}
              />
              <svg width={canvasW} height={AXIS_H} className="border-b border-zinc-800 bg-zinc-950">
                {months.map((m, i) => (
                  <g key={i}>
                    <line x1={m.x} y1={0} x2={m.x} y2={AXIS_H} stroke="#27272a" />
                    <text x={m.x + 5} y={27} fill="#71717a" fontSize={11}>
                      {m.label}
                    </text>
                  </g>
                ))}
                <line x1={todayX} y1={0} x2={todayX} y2={AXIS_H} stroke="#fbbf24" strokeWidth={1.5} />
                <text x={todayX + 5} y={13} fill="#fbbf24" fontSize={10}>
                  Today
                </text>
              </svg>
            </div>

            {/* Lanes */}
            {projects.map((p) => {
              const centerY = LANE_H / 2;
              const nodes = (p.nodes ?? [])
                .filter((n) => n.state === "promoted" && n.emails?.date_sent)
                .sort(
                  (a, b) =>
                    new Date(a.emails!.date_sent!).getTime() -
                    new Date(b.emails!.date_sent!).getTime()
                );

              return (
                <div key={p.id} className="flex">
                  {/* Project label (sticky to left while scrolling horizontally) */}
                  <div
                    className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-zinc-800 bg-zinc-950 px-4"
                    style={{ width: LABEL_W, height: LANE_H }}
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: p.color ?? "#71717a" }}
                    />
                    <span className="truncate text-sm font-medium">
                      {p.display_name ?? p.gmail_label_name}
                    </span>
                    {p.state === "archived" && (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        archived
                      </span>
                    )}
                  </div>

                  {/* Lane timeline */}
                  <svg width={canvasW} height={LANE_H} className="border-b border-zinc-800">
                    <defs>
                      {nodes.map((n) => (
                        <clipPath key={n.id} id={`clip-${n.id}`}>
                          <rect width={NODE} height={NODE} rx={9} ry={9} />
                        </clipPath>
                      ))}
                    </defs>

                    {/* month gridlines + today */}
                    {months.map((m, i) => (
                      <line key={i} x1={m.x} y1={0} x2={m.x} y2={LANE_H} stroke="#1c1c1f" />
                    ))}
                    <line x1={todayX} y1={0} x2={todayX} y2={LANE_H} stroke="#3f3722" />

                    {/* wires */}
                    {nodes.map((n, i) => {
                      if (i === 0) return null;
                      const x1 = xFor(new Date(nodes[i - 1].emails!.date_sent!).getTime());
                      const x2 = xFor(new Date(n.emails!.date_sent!).getTime());
                      return (
                        <line
                          key={`w-${n.id}`}
                          x1={x1}
                          y1={centerY}
                          x2={x2}
                          y2={centerY}
                          stroke="#3f3f46"
                          strokeWidth={2}
                        />
                      );
                    })}

                    {/* nodes */}
                    {nodes.map((n) => {
                      const cx = xFor(new Date(n.emails!.date_sent!).getTime());
                      const left = cx - NODE / 2;
                      const top = centerY - NODE / 2;
                      const stage = deadlineStage(n.deadline, n.deadline_set_at);
                      const base = p.color ?? "#71717a";
                      const label = n.display_label ?? n.emails!.subject ?? "(untitled)";

                      return (
                        <g key={n.id} opacity={n.done ? 0.4 : 1}>
                          <g transform={`translate(${left}, ${top})`}>
                            <rect
                              width={NODE}
                              height={NODE}
                              rx={9}
                              ry={9}
                              fill={n.done ? "#6b7280" : base}
                            />
                            {!n.done && stage > 0 && (
                              <rect
                                width={(NODE * stage) / 100}
                                height={NODE}
                                fill="#ef4444"
                                clipPath={`url(#clip-${n.id})`}
                              />
                            )}
                            <title>
                              {label}
                              {n.deadline ? ` — deadline ${n.deadline}` : ""}
                              {n.done ? " (done)" : ""}
                            </title>
                          </g>
                          <text
                            x={cx}
                            y={top + NODE + 14}
                            fill="#a1a1aa"
                            fontSize={10}
                            textAnchor="middle"
                          >
                            {label.length > 20 ? label.slice(0, 19) + "…" : label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </main>
  );
}
