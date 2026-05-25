"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SORTS: { value: string; label: string }[] = [
  { value: "last_updated", label: "Last updated" },
  { value: "date_created", label: "Date created" },
  { value: "deadline", label: "Deadline" },
  { value: "inactive", label: "Most inactive" },
];

export default function Toolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const update = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  const sort = sp.get("sort") ?? "last_updated";
  const dir = sp.get("dir") ?? "desc";
  const deadline = sp.get("deadline") ?? "";
  const hideCompleted = sp.get("hide_completed") === "1";
  const showArchived = sp.get("show_archived") === "1";
  const inactiveOnly = sp.get("inactive_only") === "1";

  const selectCls =
    "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200";
  const checkLabel = "flex items-center gap-1.5 text-sm text-zinc-300";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-800 px-6 py-2.5">
      {/* Arrangement */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Arrange
        </span>
        <select
          className={selectCls}
          value={sort}
          onChange={(e) => update({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => update({ dir: dir === "asc" ? "desc" : "asc" })}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
          title={dir === "asc" ? "Ascending" : "Descending"}
        >
          {dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Filter
        </span>
        <label className={checkLabel}>
          Deadline
          <select
            className={selectCls}
            value={deadline}
            onChange={(e) => update({ deadline: e.target.value })}
          >
            <option value="">Any</option>
            <option value="all">Has a deadline</option>
          </select>
        </label>
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={hideCompleted}
            onChange={(e) => update({ hide_completed: e.target.checked ? "1" : null })}
          />
          Hide completed
        </label>
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => update({ show_archived: e.target.checked ? "1" : null })}
          />
          Show archived
        </label>
        <label className={checkLabel}>
          <input
            type="checkbox"
            checked={inactiveOnly}
            onChange={(e) => update({ inactive_only: e.target.checked ? "1" : null })}
          />
          Inactive only
        </label>
      </div>

      {/* Tags — placeholder for a future pass */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Tags
        </span>
        <span
          className="cursor-not-allowed rounded-md border border-dashed border-zinc-700 px-2 py-1 text-sm text-zinc-500"
          title="Tag filtering is coming in a later pass"
        >
          coming soon
        </span>
      </div>
    </div>
  );
}
