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
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  // Clear every filter back to the default view (keeps sort/dir).
  const clearFilters = () =>
    update({
      tags: null,
      hide_completed: null,
      inactive_only: null,
      deadline: null,
      show_archived: null,
      show_hidden: null,
    });

  // Reveal absolutely everything, archived + spam/low-priority included (used by the
  // "N hidden — show all" pill).
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
  // Anything that makes the view differ from the clean default.
  const anyFilter =
    selectedTags.length > 0 || deadline === "all" || hideCompleted || inactiveOnly || showArchived || showHidden;

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
    .slice(0, 2);

  // Compact control style for the Arrange select + asc/desc button — sits flush
  // with the editorial rail, hairline edge, paper fill.
  const selectCls = "rounded-[7px] border border-hairline bg-paper px-2 py-1 text-sm text-ink hover:bg-paper-surface";
  const overlay = "fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4";
  const card = "max-h-[80vh] w-full max-w-md overflow-auto rounded-lg border border-hairline bg-paper-surface p-5 text-ink shadow-xl";
  // Zone-header style: serif italic in oxblood, sentence case (not all-caps).
  const zone = "brand-serif italic text-[12px] text-oxblood";
  // Editorial pill: paper bg, hairline-y border, muted ink. Active = oxblood.
  const chip = (o: FilterOpt, removable: boolean) => (
    <button
      key={o.id}
      onClick={o.toggle}
      title={removable ? "Remove filter" : o.isActive ? "Active — click to remove" : "Apply filter"}
      className="flex items-center gap-1 px-2 py-0.5 text-xs"
      style={{
        background: o.isActive ? o.color ?? "var(--oxblood)" : "var(--paper)",
        color: o.isActive ? "#fff" : "var(--pill-ink)",
        border: `1px solid ${o.isActive ? (o.color ?? "var(--oxblood)") : "var(--pill-edge)"}`,
        borderRadius: 9,
      }}
    >
      {o.label}
      {removable && <span className="opacity-80">✕</span>}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t-2 border-t-oxblood border-b border-b-hairline bg-paper-surface px-6 py-2.5">
      {/* Arrange zone */}
      <div className="flex items-center gap-2">
        <span className={zone}>Arrange</span>
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
          className={selectCls}
          title={dir === "asc" ? "Ascending" : "Descending"}
        >
          {dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Hairline zone divider */}
      <div className="h-[18px] w-px bg-hairline" />

      {/* Filter zone */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={zone}>Filter</span>
        <button onClick={() => setFiltersOpen(true)} className={selectCls}>
          Filters{activeOpts.length ? ` (${activeOpts.length})` : ""} ▾
        </button>

        {/* one-click clear, shown whenever the view is filtered */}
        {anyFilter && (
          <button
            onClick={clearFilters}
            title="Clear all filters"
            className="text-xs text-muted hover:text-oxblood"
          >
            Clear ✕
          </button>
        )}

        {/* quick-select: your most-used filters */}
        {quickOpts.length > 0 && quickOpts.map((o) => chip(o, false))}

        {/* active filters as removable chips */}
        {activeOpts.length > 0 && quickOpts.length > 0 && <span className="text-hairline">·</span>}
        {activeOpts.map((o) => chip(o, true))}

        {/* how many projects are currently held back, with a one-click escape hatch */}
        {hiddenCount > 0 && (
          <button
            onClick={showEverything}
            title="Some projects are hidden by the current filters (including archived and spam/low-priority). Click to show every project."
            className="flex items-center gap-1 rounded-full border border-oxblood/60 bg-oxblood/10 px-2 py-0.5 text-xs text-oxblood hover:bg-oxblood/20"
          >
            {hiddenCount} hidden <span className="font-medium underline">show all</span>
          </button>
        )}
      </div>

      {/* Flexible spacer pushes Tags zone to the right edge */}
      <div className="flex-1" />

      {/* Hairline zone divider */}
      <div className="h-[18px] w-px bg-hairline" />

      {/* Tags zone (right-aligned) */}
      <div className="flex items-center gap-3">
        <span className={zone}>Tags</span>
        <button
          onClick={() => setManageOpen(true)}
          className="text-sm text-ink hover:text-oxblood"
        >
          Manage
        </button>
        <button
          onClick={() => (armed ? setArmed(null) : setWandOpen(true))}
          title={armed ? "Put the wand down (Esc)" : "Magic wand — stamp a tag onto things"}
          className={`flex items-center gap-1 px-2 py-1 text-sm ${
            armed ? "bg-oxblood text-paper" : "bg-transparent text-oxblood hover:bg-oxblood/10"
          }`}
          style={{ border: `0.5px solid var(--oxblood)`, borderRadius: 7 }}
        >
          <WandIcon />
          {armed ? `${armed.value} ✕` : ""}
        </button>
      </div>

      {/* Filters panel */}
      {filtersOpen && (
        <div className={overlay} onClick={() => setFiltersOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="brand-serif mb-3 text-lg text-oxblood">Filters</h2>

            <div className="mb-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">Status &amp; deadline</div>
              <div className="flex flex-wrap gap-1">{flagOpts.map((o) => chip(o, false))}</div>
            </div>

            <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">Tags</div>
            {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">
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
              <label className="mt-1 flex items-center gap-1.5 text-sm text-ink">
                <input type="checkbox" checked={showHidden} onChange={(e) => update({ show_hidden: e.target.checked ? "1" : null })} />
                Show spam / low-priority
              </label>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-4">
              <button
                onClick={clearFilters}
                title="Clear every filter back to the default view"
                className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm font-medium text-ink hover:bg-paper-surface"
              >
                Clear all filters
              </button>
              <button onClick={() => setFiltersOpen(false)} className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-paper hover:bg-oxblood-dark">
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
            <h2 className="brand-serif mb-1 flex items-center gap-2 text-lg text-oxblood">
              <WandIcon size={18} /> Magic wand
            </h2>
            <p className="mb-3 text-sm text-muted">Load a tag, then click nodes/projects to stamp it on. Esc to stop.</p>
            {categories.length === 0 && <p className="text-xs text-muted">No tags yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">{c.name}</div>
                <div className="flex flex-wrap gap-1">
                  {c.values.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setArmed({ id: v.id, value: v.value, color: v.color });
                        setWandOpen(false);
                      }}
                      className="rounded-full px-2 py-0.5 text-xs text-ink"
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
