"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useWand } from "./wand";
import ManageTags from "./ManageTags";

const ARRANGE_COUNTS_KEY = "sirma:arrangeCounts";
const FILTER_COUNTS_KEY = "sirma:filterCounts";
const DEFAULT_SORT = "last_updated";

const SORTS: { value: string; label: string }[] = [
  { value: "last_updated", label: "Last updated" },
  { value: "date_created", label: "Date created" },
  { value: "ambitiousness", label: "Ambitiousness" },
  { value: "deadline", label: "Deadline" },
  { value: "inactive", label: "Most inactive" },
];

type TagCat = {
  id: string;
  name: string;
  isHide: boolean;
  values: { id: string; value: string; color: string }[];
};

type FilterOpt = { id: string; label: string; color?: string; isActive: boolean; toggle: () => void };

function WandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="3" y1="21" x2="14" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 2 l1.4 3.9 l3.9 1.4 l-3.9 1.4 l-1.4 3.9 l-1.4-3.9 l-3.9-1.4 l3.9-1.4 z" fill="currentColor" />
    </svg>
  );
}

export default function Toolbar({ categories, hiddenCount }: { categories: TagCat[]; hiddenCount: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { armed, setArmed } = useWand();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [wandOpen, setWandOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const update = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  // Reset every filter and reveal all projects — archived and spam/low-priority included.
  const showEverything = () =>
    update({
      tags: null,
      hide_completed: null,
      inactive_only: null,
      deadline: null,
      show_archived: "1",
      show_hidden: "1",
    });

  // --- Arrange usage counts (reorders the sort menu) ---
  const [arrangeCounts, setArrangeCounts] = useState<Record<string, number>>({});
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const a = localStorage.getItem(ARRANGE_COUNTS_KEY);
      if (a) setArrangeCounts(JSON.parse(a));
      const f = localStorage.getItem(FILTER_COUNTS_KEY);
      if (f) setFilterCounts(JSON.parse(f));
    } catch {}
  }, []);
  const bumpArrange = (value: string) => {
    setArrangeCounts((prev) => {
      const next = { ...prev, [value]: (prev[value] ?? 0) + 1 };
      try {
        localStorage.setItem(ARRANGE_COUNTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const bumpFilter = (id: string) => {
    setFilterCounts((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      try {
        localStorage.setItem(FILTER_COUNTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const orderedSorts = [
    ...SORTS.filter((s) => s.value === DEFAULT_SORT),
    ...SORTS.filter((s) => s.value !== DEFAULT_SORT).sort(
      (a, b) => (arrangeCounts[b.value] ?? 0) - (arrangeCounts[a.value] ?? 0)
    ),
  ];

  const sort = sp.get("sort") ?? "last_updated";
  const dir = sp.get("dir") ?? "desc";
  const deadline = sp.get("deadline") ?? "";
  const hideCompleted = sp.get("hide_completed") === "1";
  const showArchived = sp.get("show_archived") === "1";
  const inactiveOnly = sp.get("inactive_only") === "1";
  const selectedTags = (sp.get("tags") ?? "").split(",").filter(Boolean);
  const showHidden = sp.get("show_hidden") === "1";
  const hasHide = categories.some((c) => c.isHide);

  const toggleTagParam = (id: string) => {
    const set = new Set(selectedTags);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ tags: [...set].join(",") || null });
  };

  // A click that counts usage only when turning a filter ON.
  const makeToggle = (id: string, isActive: boolean, doToggle: () => void) => () => {
    if (!isActive) bumpFilter(id);
    doToggle();
  };

  // All filter options (status flags + every tag value) in one model.
  const flagOpts: FilterOpt[] = [
    {
      id: "flag:deadline_all",
      label: "Has a deadline",
      isActive: deadline === "all",
      toggle: makeToggle("flag:deadline_all", deadline === "all", () =>
        update({ deadline: deadline === "all" ? null : "all" })
      ),
    },
    {
      id: "flag:hide_completed",
      label: "Hide completed",
      isActive: hideCompleted,
      toggle: makeToggle("flag:hide_completed", hideCompleted, () =>
        update({ hide_completed: hideCompleted ? null : "1" })
      ),
    },
    {
      id: "flag:show_archived",
      label: "Show archived",
      isActive: showArchived,
      toggle: makeToggle("flag:show_archived", showArchived, () =>
        update({ show_archived: showArchived ? null : "1" })
      ),
    },
    {
      id: "flag:inactive_only",
      label: "Inactive only",
      isActive: inactiveOnly,
      toggle: makeToggle("flag:inactive_only", inactiveOnly, () =>
        update({ inactive_only: inactiveOnly ? null : "1" })
      ),
    },
  ];
  const tagOpts: FilterOpt[] = categories.flatMap((c) =>
    c.values.map((v) => {
      const isActive = selectedTags.includes(v.id);
      return {
        id: `tag:${v.id}`,
        label: v.value,
        color: v.color,
        isActive,
        toggle: makeToggle(`tag:${v.id}`, isActive, () => toggleTagParam(v.id)),
      };
    })
  );
  const allOpts = [...flagOpts, ...tagOpts];
  const optById = (id: string) => allOpts.find((o) => o.id === id);

  const activeOpts = allOpts.filter((o) => o.isActive);
  const quickOpts = allOpts
    .filter((o) => (filterCounts[o.id] ?? 0) > 0)
    .sort((a, b) => (filterCounts[b.id] ?? 0) - (filterCounts[a.id] ?? 0))
    .slice(0, 3);

  const selectCls = "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200";
  const overlay = "fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4";
  const card = "max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl";

  const chip = (o: FilterOpt, removable: boolean) => (
    <button
      key={o.id}
      onClick={o.toggle}
      title={removable ? "Remove filter" : o.isActive ? "Active — click to remove" : "Apply filter"}
      className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: o.isActive ? o.color ?? "#3f3f46" : "transparent",
        color: o.isActive ? "#fff" : "#d4d4d8",
        border: `1px solid ${o.color ?? "#52525b"}`,
      }}
    >
      {o.label}
      {removable && <span className="opacity-80">✕</span>}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-zinc-800 px-6 py-2.5">
      {/* Arrange */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Arrange</span>
        <select
          className={selectCls}
          value={sort}
          onChange={(e) => {
            bumpArrange(e.target.value);
            update({ sort: e.target.value });
          }}
        >
          {orderedSorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
              {arrangeCounts[s.value] ? ` (${arrangeCounts[s.value]})` : ""}
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

      {/* Filters: button + quick-select + active chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Filter</span>
        <button onClick={() => setFiltersOpen(true)} className={selectCls}>
          Filters{activeOpts.length ? ` (${activeOpts.length})` : ""} ▾
        </button>

        {/* quick-select: your most-used filters */}
        {quickOpts.length > 0 && (
          <>
            <span className="text-[10px] uppercase tracking-wide text-zinc-600">Quick</span>
            {quickOpts.map((o) => chip(o, false))}
          </>
        )}

        {/* active filters as removable chips */}
        {activeOpts.length > 0 && <span className="text-zinc-700">|</span>}
        {activeOpts.map((o) => chip(o, true))}

        {/* how many projects are currently held back, with a one-click escape hatch */}
        {hiddenCount > 0 && (
          <button
            onClick={showEverything}
            title="Some projects are hidden by the current filters (including archived and spam/low-priority). Click to show every project."
            className="flex items-center gap-1 rounded-full border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-500/25"
          >
            {hiddenCount} hidden <span className="font-medium underline">show all</span>
          </button>
        )}
      </div>

      {/* Tags: manage + magic wand */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Tags</span>
        <button onClick={() => setManageOpen(true)} className={selectCls}>
          Manage
        </button>
        <button
          onClick={() => (armed ? setArmed(null) : setWandOpen(true))}
          title={armed ? "Put the wand down (Esc)" : "Magic wand — stamp a tag onto things"}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${
            armed ? "border-blue-400 bg-blue-600 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <WandIcon />
          {armed ? `${armed.value} ✕` : ""}
        </button>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className={overlay} onClick={() => setFiltersOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-3 text-lg font-semibold text-zinc-100">Filters</h2>

            <div className="mb-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Status &amp; deadline</div>
              <div className="flex flex-wrap gap-1">{flagOpts.map((o) => chip(o, false))}</div>
            </div>

            <div className="mb-2 text-[10px] uppercase tracking-wide text-zinc-500">Tags</div>
            {categories.length === 0 && <p className="text-xs text-zinc-500">No tags yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">
                  {c.name}
                  {c.isHide ? " · hidden by default" : ""}
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.values.map((v) => {
                    const o = optById(`tag:${v.id}`);
                    return o ? chip(o, false) : null;
                  })}
                </div>
              </div>
            ))}
            {hasHide && (
              <label className="mt-1 flex items-center gap-1.5 text-sm text-zinc-300">
                <input type="checkbox" checked={showHidden} onChange={(e) => update({ show_hidden: e.target.checked ? "1" : null })} />
                Show spam / low-priority
              </label>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-800 pt-4">
              <button
                onClick={showEverything}
                title="Reset every filter and reveal all projects — including archived and spam/low-priority"
                className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
              >
                Clear all filters
              </button>
              <button onClick={() => setFiltersOpen(false)} className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wand: choose a tag to load */}
      {wandOpen && !armed && (
        <div className={overlay} onClick={() => setWandOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-zinc-100">
              <WandIcon size={18} /> Magic wand
            </h2>
            <p className="mb-3 text-sm text-zinc-400">Load a tag, then click nodes/projects to stamp it on. Esc to stop.</p>
            {categories.length === 0 && <p className="text-xs text-zinc-500">No tags yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{c.name}</div>
                <div className="flex flex-wrap gap-1">
                  {c.values.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setArmed({ id: v.id, value: v.value, color: v.color });
                        setWandOpen(false);
                      }}
                      className="rounded-full px-2 py-0.5 text-xs text-zinc-100"
                      style={{ border: `1px solid ${v.color}`, background: `${v.color}33` }}
                    >
                      {v.value}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manage tags */}
      {manageOpen && <ManageTags categories={categories} onClose={() => setManageOpen(false)} />}
    </div>
  );
}
