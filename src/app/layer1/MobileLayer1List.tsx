"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ATTENTION_ALERT } from "@/lib/theme";
import { fmtEU } from "@/lib/dateFormat";
import type { Lane } from "./Timeline";

// Mobile Screen 1 — the phone "home". A vertical list of tappable project cards
// built from the SAME enriched `lanes` the desktop canvas consumes (no parallel
// types). The All / Needs me / Recent chips COMPOSE existing computed state — they
// don't introduce new filter params: "Needs me" = lane.attention === "alert",
// "Recent" = last-updated sort, "All" = everything as fetched.

type TagCat = { id: string; name: string; isHide: boolean; values: { id: string; value: string; color: string }[] };
type Filter = "all" | "needs" | "recent";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs", label: "Needs me" },
  { id: "recent", label: "Recent" },
];

export default function MobileLayer1List({ lanes, tagCatalog }: { lanes: Lane[]; tagCatalog: TagCat[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const tagById = useMemo(() => {
    const m = new Map<string, { value: string; color: string }>();
    for (const c of tagCatalog) for (const v of c.values) m.set(v.id, { value: v.value, color: v.color });
    return m;
  }, [tagCatalog]);

  const shown = useMemo(() => {
    if (filter === "needs") return lanes.filter((l) => l.attention === "alert");
    if (filter === "recent")
      return [...lanes].sort(
        (a, b) =>
          (b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0) -
          (a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0)
      );
    return lanes;
  }, [lanes, filter]);

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      {/* top bar — title only (no search / + on mobile) */}
      <header
        className="sticky top-0 z-10 border-b border-hairline bg-paper-surface px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <h1 className="brand-serif text-lg text-oxblood">Projects</h1>
      </header>

      {/* single-select segmented filter */}
      <div className="flex gap-1.5 border-b border-hairline bg-paper-surface px-4 py-2">
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className="rounded-full px-3 py-1.5 text-sm active:opacity-80"
              style={
                on
                  ? { background: "var(--oxblood)", color: "var(--paper)" }
                  : { color: "var(--muted)", border: "0.5px solid var(--hairline)" }
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {lanes.length === 0 ? (
          <EmptyState title="No projects yet" sub="Create a project on a larger screen and it will show up here." />
        ) : shown.length === 0 ? (
          <EmptyState title="Nothing needs you" sub="No projects are urgent right now." />
        ) : (
          <ul>
            {shown.map((l) => (
              <li key={l.id}>
                <ProjectCard lane={l} tagById={tagById} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function ProjectCard({ lane, tagById }: { lane: Lane; tagById: Map<string, { value: string; color: string }> }) {
  const primaryColor = (lane.tags[0] && tagById.get(lane.tags[0])?.color) || lane.spineColor || "#8f7f5b";
  const pills = lane.tags.slice(0, 2).map((id) => tagById.get(id)).filter(Boolean) as { value: string; color: string }[];
  const overflow = Math.max(0, lane.tags.length - 2);

  // ONE date: the next upcoming deadline/ambition if any, else last-updated.
  const now = Date.now();
  const dlMs = lane.deadline ? new Date(lane.deadline).getTime() : null;
  const ambSoon = lane.ambitions.filter((a) => !a.done && a.t >= now).map((a) => a.t);
  const upcoming = [dlMs, ...ambSoon].filter((x): x is number => typeof x === "number" && x >= now);
  const next = upcoming.length ? Math.min(...upcoming) : null;
  const meta =
    next !== null
      ? `${next === dlMs ? "Due" : "Next"} ${fmtEU(next)}`
      : lane.lastActivityAt
        ? `Updated ${fmtEU(new Date(lane.lastActivityAt).getTime())}`
        : null;
  const nodeCount = lane.nodes.length;

  return (
    <Link
      href={`/project/${lane.id}`}
      className="flex items-stretch gap-3 border-b border-hairline px-4 py-3 active:bg-paper-surface"
      style={{ minHeight: 64, opacity: lane.inactive ? 0.55 : 1 }}
    >
      {/* primary-tag spine */}
      <span className="w-1 shrink-0 rounded" style={{ background: primaryColor }} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex min-w-0 items-center gap-2">
          {lane.attention === "alert" && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ATTENTION_ALERT }} aria-label="Needs attention" />
          )}
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{lane.name}</span>
        </div>
        {pills.length > 0 && (
          <div className="flex min-w-0 items-center gap-1">
            {pills.map((p, i) => (
              <span
                key={i}
                className="flex min-w-0 items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-pill-ink"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span className="truncate">{p.value}</span>
              </span>
            ))}
            {overflow > 0 && <span className="shrink-0 text-xs text-muted">+{overflow}</span>}
          </div>
        )}
        <div className="text-xs text-muted">
          {nodeCount} node{nodeCount === 1 ? "" : "s"}
          {meta ? ` · ${meta}` : ""}
        </div>
      </div>
    </Link>
  );
}

function EmptyState({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-8 py-20 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      <p className="text-sm text-muted">{sub}</p>
    </div>
  );
}
