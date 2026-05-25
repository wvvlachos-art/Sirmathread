"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useWand } from "./wand";

const COUNTS_KEY = "sirma:arrangeCounts";
const DEFAULT_SORT = "last_updated"; // always pinned first; usage reorders the rest

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

// Simple wand: a stick with a star at the tip. Uses currentColor.
function WandIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="3" y1="21" x2="14" y2="10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M18 2 l1.4 3.9 l3.9 1.4 l-3.9 1.4 l-1.4 3.9 l-1.4-3.9 l-3.9-1.4 l3.9-1.4 z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function Toolbar({ categories }: { categories: TagCat[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const { armed, setArmed } = useWand();
  const [tagsOpen, setTagsOpen] = useState(false);
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

  // Track how often each Arrange option is chosen (stored in this browser),
  // then reorder the menu most-used-first — but keep the default pinned at top.
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COUNTS_KEY);
      if (raw) setCounts(JSON.parse(raw));
    } catch {}
  }, []);
  const bump = (value: string) => {
    setCounts((prev) => {
      const next = { ...prev, [value]: (prev[value] ?? 0) + 1 };
      try {
        localStorage.setItem(COUNTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  const orderedSorts = [
    ...SORTS.filter((s) => s.value === DEFAULT_SORT),
    ...SORTS.filter((s) => s.value !== DEFAULT_SORT).sort(
      (a, b) => (counts[b.value] ?? 0) - (counts[a.value] ?? 0)
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
  const toggleTag = (id: string) => {
    const set = new Set(selectedTags);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    update({ tags: [...set].join(",") || null });
  };

  const selectCls = "rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-200";
  const checkLabel = "flex items-center gap-1.5 text-sm text-zinc-300";
  const overlay = "fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4";
  const card = "max-h-[80vh] w-full max-w-sm overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl";

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-800 px-6 py-2.5">
      {/* Arrangement */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Arrange</span>
        <select
          className={selectCls}
          value={sort}
          onChange={(e) => {
            bump(e.target.value);
            update({ sort: e.target.value });
          }}
        >
          {orderedSorts.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
              {counts[s.value] ? ` (${counts[s.value]})` : ""}
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

      {/* Filters (tag filter lives here) */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Filter</span>
        <label className={checkLabel}>
          Deadline
          <select className={selectCls} value={deadline} onChange={(e) => update({ deadline: e.target.value })}>
            <option value="">Any</option>
            <option value="all">Has a deadline</option>
          </select>
        </label>
        <label className={checkLabel}>
          <input type="checkbox" checked={hideCompleted} onChange={(e) => update({ hide_completed: e.target.checked ? "1" : null })} />
          Hide completed
        </label>
        <label className={checkLabel}>
          <input type="checkbox" checked={showArchived} onChange={(e) => update({ show_archived: e.target.checked ? "1" : null })} />
          Show archived
        </label>
        <label className={checkLabel}>
          <input type="checkbox" checked={inactiveOnly} onChange={(e) => update({ inactive_only: e.target.checked ? "1" : null })} />
          Inactive only
        </label>
        <button onClick={() => setTagsOpen(true)} className={selectCls}>
          Tags {selectedTags.length ? `(${selectedTags.length})` : ""} ▾
        </button>
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
            armed
              ? "border-blue-400 bg-blue-600 text-white"
              : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          }`}
        >
          <WandIcon />
          {armed ? `${armed.value} ✕` : ""}
        </button>
      </div>

      {/* Tag filter pop-up */}
      {tagsOpen && (
        <div className={overlay} onClick={() => setTagsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-3 text-lg font-semibold text-zinc-100">Filter by tags</h2>
            {categories.length === 0 && <p className="text-xs text-zinc-500">No tags yet.</p>}
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                  {c.name}
                  {c.isHide ? " · hidden by default" : ""}
                </div>
                <div className="flex flex-wrap gap-1">
                  {c.values.map((v) => {
                    const on = selectedTags.includes(v.id);
                    return (
                      <button
                        key={v.id}
                        onClick={() => toggleTag(v.id)}
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{ background: on ? v.color : "transparent", color: on ? "#fff" : "#d4d4d8", border: `1px solid ${v.color}` }}
                      >
                        {v.value}
                      </button>
                    );
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
            <div className="mt-4 flex justify-between">
              {selectedTags.length > 0 ? (
                <button onClick={() => update({ tags: null })} className="text-sm text-zinc-400 hover:text-zinc-200">
                  Clear
                </button>
              ) : (
                <span />
              )}
              <button onClick={() => setTagsOpen(false)} className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
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

      {/* Manage (listing only for now) */}
      {manageOpen && (
        <div className={overlay} onClick={() => setManageOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className={card}>
            <h2 className="mb-3 text-lg font-semibold text-zinc-100">Your tags</h2>
            {categories.map((c) => (
              <div key={c.id} className="mb-3">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{c.name}</div>
                <div className="flex flex-wrap gap-1">
                  {c.values.map((v) => (
                    <span key={v.id} className="rounded-full px-2 py-0.5 text-xs text-zinc-100" style={{ border: `1px solid ${v.color}` }}>
                      {v.value}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <p className="mt-2 text-xs text-zinc-500">Creating / renaming / deleting tags is the next step.</p>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setManageOpen(false)} className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
