import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../SignOutButton";

// ---- Types for the data we pull from the database ----------------------------
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
  nodes: DbNode[];
};

// ---- Layout constants --------------------------------------------------------
const LABEL_W = 210; // width of the left project-name column
const AXIS_H = 40; // height of the calendar axis at the top
const LANE_H = 92; // height of each project lane
const NODE = 44; // node square size
const PX_PER_DAY = 7; // horizontal pixels per calendar day
const PAD_DAYS = 7; // breathing room on each side of the timeline
const DAY = 86_400_000; // ms in a day

// How "full" a deadline node is, in 5 legibility stages (0/25/50/75/100).
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

export default async function Layer1Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("projects")
    .select(
      "id, display_name, gmail_label_name, color, nodes(id, position_index, display_label, deadline, deadline_set_at, done, state, emails(subject, date_sent))"
    )
    .eq("state", "active")
    .order("created_at", { ascending: true });

  const projects = (data ?? []) as DbProject[];

  // Collect every node (with a usable date) so we can size the timeline.
  const allTimes: number[] = [];
  for (const p of projects) {
    for (const n of p.nodes ?? []) {
      if (n.state === "promoted" && n.emails?.date_sent) {
        allTimes.push(new Date(n.emails.date_sent).getTime());
      }
    }
  }

  const now = Date.now();
  const minTime = (allTimes.length ? Math.min(...allTimes) : now - 120 * DAY) - PAD_DAYS * DAY;
  const maxTime = (allTimes.length ? Math.max(...allTimes) : now) + PAD_DAYS * DAY;
  const spanDays = Math.max(1, (maxTime - minTime) / DAY);
  const canvasW = Math.max(700, Math.round(spanDays * PX_PER_DAY));
  const svgH = AXIS_H + projects.length * LANE_H + 16;

  const xFor = (t: number) => ((t - minTime) / DAY) * PX_PER_DAY;

  // Build the list of month gridlines/labels across the timeline.
  const months: { x: number; label: string }[] = [];
  {
    const start = new Date(minTime);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur.getTime() <= maxTime) {
      months.push({ x: xFor(cur.getTime()), label: monthLabel(cur) });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sirmathread
          </Link>
          <span className="text-sm text-zinc-500">Overview</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="p-10 text-zinc-400">
          No active projects yet. (Sample data may not have loaded.)
        </div>
      ) : (
        <div className="flex">
          {/* Left column: project names */}
          <div className="shrink-0 border-r border-zinc-800" style={{ width: LABEL_W }}>
            <div style={{ height: AXIS_H }} />
            {projects.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 border-b border-zinc-800 px-4"
                style={{ height: LANE_H }}
              >
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: p.color ?? "#71717a" }}
                />
                <span className="truncate text-sm font-medium">
                  {p.display_name ?? p.gmail_label_name}
                </span>
              </div>
            ))}
          </div>

          {/* Right column: scrollable timeline canvas */}
          <div className="flex-1 overflow-x-auto">
            <svg width={canvasW} height={svgH} className="block">
              <defs>
                {projects.flatMap((p) =>
                  (p.nodes ?? []).map((n) => (
                    <clipPath key={n.id} id={`clip-${n.id}`}>
                      <rect width={NODE} height={NODE} rx={9} ry={9} />
                    </clipPath>
                  ))
                )}
              </defs>

              {/* Month gridlines + labels */}
              {months.map((m, i) => (
                <g key={i}>
                  <line x1={m.x} y1={AXIS_H} x2={m.x} y2={svgH} stroke="#27272a" strokeWidth={1} />
                  <text x={m.x + 6} y={24} fill="#71717a" fontSize={12}>
                    {m.label}
                  </text>
                </g>
              ))}

              {/* Lanes */}
              {projects.map((p, laneIdx) => {
                const laneTop = AXIS_H + laneIdx * LANE_H;
                const centerY = laneTop + LANE_H / 2;
                const nodes = (p.nodes ?? [])
                  .filter((n) => n.state === "promoted" && n.emails?.date_sent)
                  .sort(
                    (a, b) =>
                      new Date(a.emails!.date_sent!).getTime() -
                      new Date(b.emails!.date_sent!).getTime()
                  );

                return (
                  <g key={p.id}>
                    {/* lane bottom divider */}
                    <line
                      x1={0}
                      y1={laneTop + LANE_H}
                      x2={canvasW}
                      y2={laneTop + LANE_H}
                      stroke="#27272a"
                      strokeWidth={1}
                    />

                    {/* wires connecting consecutive nodes */}
                    {nodes.map((n, i) => {
                      if (i === 0) return null;
                      const prev = nodes[i - 1];
                      const x1 = xFor(new Date(prev.emails!.date_sent!).getTime());
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
                            {/* base square in project color (gray if done) */}
                            <rect
                              width={NODE}
                              height={NODE}
                              rx={9}
                              ry={9}
                              fill={n.done ? "#6b7280" : base}
                            />
                            {/* red deadline fill (left-to-right), clipped to the square */}
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
                          {/* short label beneath the node */}
                          <text
                            x={cx}
                            y={top + NODE + 14}
                            fill="#a1a1aa"
                            fontSize={10}
                            textAnchor="middle"
                          >
                            {label.length > 18 ? label.slice(0, 17) + "…" : label}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </main>
  );
}
