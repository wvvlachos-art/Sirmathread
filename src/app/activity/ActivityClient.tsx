"use client";

import { useState } from "react";
import { loadActivityPage } from "./actions";
import type { ActivityItem, Cursor } from "./query";

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

type Filter = "all" | "mine" | "others";

export default function ActivityClient({
  orgId,
  orgName,
  currentUserId,
  initialItems,
  initialCursor,
}: {
  orgId: string;
  orgName: string;
  currentUserId: string;
  initialItems: ActivityItem[];
  initialCursor: Cursor;
}) {
  const [items, setItems] = useState<ActivityItem[]>(initialItems);
  const [cursor, setCursor] = useState<Cursor>(initialCursor);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    const res = await loadActivityPage(orgId, cursor);
    setLoading(false);
    setItems((prev) => [...prev, ...res.items]);
    setCursor(res.nextCursor);
  };

  const shown = items.filter((it) =>
    filter === "all" ? true : filter === "mine" ? it.actorId === currentUserId : it.actorId !== currentUserId
  );

  const chip = (f: Filter, label: string) => (
    <button
      onClick={() => setFilter(f)}
      className={`rounded-full px-3 py-1 text-xs ${
        filter === f
          ? "bg-oxblood text-paper"
          : "border border-hairline text-pill-ink hover:bg-paper-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 text-ink">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="brand-serif text-2xl text-oxblood">Activity</h1>
          <p className="text-sm text-muted">{orgName}</p>
        </div>
        <a href="/layer1" className="text-sm text-muted hover:text-ink">← Back to board</a>
      </div>

      <div className="mb-5 flex gap-2">
        {chip("all", "All")}
        {chip("mine", "By me")}
        {chip("others", "By others")}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-hairline bg-paper-surface p-6 text-center text-sm text-muted">
          Nothing here yet. Activity shows up as you and your teammates create projects, add
          nodes, invite people, and so on.
        </p>
      ) : (
        <ul className="space-y-1">
          {shown.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-3 rounded-md border border-hairline bg-paper-surface px-4 py-3"
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-oxblood text-xs font-medium text-paper">
                {it.actorName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{it.actorName}</span>{" "}
                  <span className="text-ink">{it.description}</span>
                </p>
                <p className="text-xs text-muted" title={new Date(it.createdAt).toLocaleString("en-GB")}>
                  {relTime(it.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor && filter === "all" && (
        <div className="mt-5 text-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-hairline bg-paper-surface px-4 py-2 text-sm hover:bg-paper disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
