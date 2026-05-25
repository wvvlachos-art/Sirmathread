"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createCategory,
  renameCategory,
  setCategoryHide,
  deleteCategory,
  createTagValue,
  updateTagValue,
  deleteTagValue,
} from "./actions";

type Cat = {
  id: string;
  name: string;
  isHide: boolean;
  values: { id: string; value: string; color: string }[];
};

const PALETTE = ["#f43f5e", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function ManageTags({ categories, onClose }: { categories: Cat[]; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newVals, setNewVals] = useState<Record<string, string>>({});
  const [newColors, setNewColors] = useState<Record<string, string>>({});

  const act = async (p: Promise<{ error?: string }>) => {
    setBusy(true);
    const res = await p;
    setBusy(false);
    if (res?.error) alert(res.error);
    else router.refresh();
  };

  const input = "rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 outline-none focus:border-zinc-500";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-zinc-100">Manage tags</h2>

        {categories.map((c) => (
          <div key={c.id} className="mb-4 rounded-lg border border-zinc-800 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                key={`name-${c.id}-${c.name}`}
                defaultValue={c.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && act(renameCategory(c.id, e.target.value))}
                className={`${input} flex-1 font-medium`}
              />
              <label className="flex items-center gap-1 text-xs text-zinc-400" title="Projects with this tag are hidden by default">
                <input type="checkbox" checked={c.isHide} onChange={(e) => act(setCategoryHide(c.id, e.target.checked))} />
                hide
              </label>
              <button
                onClick={() => {
                  if (confirm(`Delete category "${c.name}" and its ${c.values.length} value(s)? Projects/nodes will lose these tags.`))
                    act(deleteCategory(c.id));
                }}
                className="rounded px-2 py-1 text-xs text-red-400 hover:bg-zinc-800"
              >
                Delete
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {c.values.map((v) => (
                <div key={v.id} className="flex items-center gap-2">
                  <input
                    type="color"
                    defaultValue={v.color}
                    onBlur={(e) => e.target.value !== v.color && act(updateTagValue(v.id, { color: e.target.value }))}
                    className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
                  />
                  <input
                    key={`val-${v.id}-${v.value}`}
                    defaultValue={v.value}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== v.value && act(updateTagValue(v.id, { value: e.target.value }))}
                    className={`${input} flex-1`}
                  />
                  <button
                    onClick={() => {
                      if (confirm(`Delete tag "${v.value}"? It will be removed from any projects/nodes using it.`))
                        act(deleteTagValue(v.id));
                    }}
                    className="rounded px-2 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* add value */}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={newColors[c.id] ?? PALETTE[c.values.length % PALETTE.length]}
                onChange={(e) => setNewColors((p) => ({ ...p, [c.id]: e.target.value }))}
                className="h-6 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent"
              />
              <input
                value={newVals[c.id] ?? ""}
                onChange={(e) => setNewVals((p) => ({ ...p, [c.id]: e.target.value }))}
                placeholder="Add a value…"
                className={`${input} flex-1`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (newVals[c.id] ?? "").trim()) {
                    act(createTagValue(c.id, newVals[c.id], newColors[c.id] ?? PALETTE[c.values.length % PALETTE.length]));
                    setNewVals((p) => ({ ...p, [c.id]: "" }));
                  }
                }}
              />
              <button
                disabled={busy || !(newVals[c.id] ?? "").trim()}
                onClick={() => {
                  act(createTagValue(c.id, newVals[c.id], newColors[c.id] ?? PALETTE[c.values.length % PALETTE.length]));
                  setNewVals((p) => ({ ...p, [c.id]: "" }));
                }}
                className="rounded bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        ))}

        {/* add category */}
        <div className="mt-2 flex items-center gap-2">
          <input
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            placeholder="New category…"
            className={`${input} flex-1`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCat.trim()) {
                act(createCategory(newCat, categories.length));
                setNewCat("");
              }
            }}
          />
          <button
            disabled={busy || !newCat.trim()}
            onClick={() => {
              act(createCategory(newCat, categories.length));
              setNewCat("");
            }}
            className="rounded bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-200 disabled:opacity-50"
          >
            Add category
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
