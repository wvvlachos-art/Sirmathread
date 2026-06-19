"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import SubnodeChip from "@/app/SubnodeChip";
import { ATTENTION_ALERT, OXBLOOD } from "@/lib/theme";
import { fmtEU, humanGap, GAP_NOTE_DAYS } from "@/lib/dateFormat";
import type { L2Node, L2Bubble, L2Ambition, L2NoteItem } from "./Layer2Canvas";

// Mobile Screen 2 — one project as a vertical timeline. Composes the SAME L2 data
// the desktop canvas uses. Per-node order is NOTES (inline, first) → INFO (inline)
// → CONTEXT (tap to expand). CONTEXT is the only collapsible element; a node with
// no context is not a button and shows no chevron. Notes are view-only here.

const DAY = 86_400_000;

export default function MobileProjectTimeline({
  name,
  nodes,
  bubbles,
  notes,
  ambitions,
  tagColors,
}: {
  name: string;
  nodes: L2Node[];
  bubbles: L2Bubble[];
  notes: L2NoteItem[];
  ambitions: L2Ambition[];
  tagColors: Record<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null); // accordion: one context open
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const infoByNode = useMemo(() => groupBubbles(bubbles, "information"), [bubbles]);
  const ctxByNode = useMemo(() => groupBubbles(bubbles, "context"), [bubbles]);
  const notesByNode = useMemo(() => {
    const m = new Map<string, L2NoteItem[]>();
    for (const n of notes) {
      if (!n.nodeId) continue;
      (m.get(n.nodeId) ?? m.set(n.nodeId, []).get(n.nodeId)!).push(n);
    }
    return m;
  }, [notes]);
  const laneNotes = useMemo(() => notes.filter((n) => !n.nodeId), [notes]);

  const toggle = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    // Keep the tapped node visible; anchoring to it avoids a jump on collapse and
    // brings the revealed panel into view on expand.
    requestAnimationFrame(() => rowRefs.current[id]?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const dotColor = (tags: string[]) => (tags[0] && tagColors[tags[0]]) || "#8f7f5b";
  const empty = nodes.length === 0 && ambitions.length === 0;

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      {/* top bar — back + title */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-hairline bg-paper-surface px-4 py-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <Link href="/layer1" className="text-sm text-muted active:text-ink" aria-label="Back to projects">
          ←
        </Link>
        <h1 className="brand-serif min-w-0 flex-1 truncate text-lg text-oxblood">{name}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}>
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-1 px-8 py-20 text-center">
            <p className="text-base font-medium text-ink">No events yet</p>
            <p className="text-sm text-muted">This project doesn&apos;t have any timeline events.</p>
          </div>
        ) : (
          <>
            {/* project-level notes (not attached to a node) */}
            {laneNotes.length > 0 && (
              <div className="mb-4 flex flex-col gap-2">
                {laneNotes.map((nt) => (
                  <SubnodeChip key={nt.id} type="note" body={nt.body} showCode={false} compact />
                ))}
              </div>
            )}

            <ol className="relative">
              {nodes.map((n, i) => {
                const gapDays = i === 0 ? 0 : (n.t - nodes[i - 1].t) / DAY;
                const showGap = gapDays > GAP_NOTE_DAYS;
                const nodeNotes = notesByNode.get(n.id) ?? [];
                const nodeInfo = infoByNode.get(n.id) ?? [];
                const nodeCtx = ctxByNode.get(n.id) ?? [];
                const hasCtx = nodeCtx.length > 0;
                const open = openId === n.id;
                const deadlineActive = !n.done && n.stage > 0;

                const head = (
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-muted">{fmtEU(n.t)}</div>
                    <div className="line-clamp-2 text-[15px] font-medium text-ink">{n.label}</div>
                  </div>
                );

                return (
                  <li key={n.id} ref={(el) => { rowRefs.current[n.id] = el; }}>
                    {showGap && <div className="py-1 pl-9 text-xs italic text-muted">{humanGap(gapDays)}</div>}
                    <div className="flex gap-3">
                      <Spine color={dotColor(n.tags)} deadlineActive={deadlineActive} done={n.done && !!n.deadline} />
                      <div className="min-w-0 flex-1 pb-4">
                        {/* header: tappable only when there's context */}
                        {hasCtx ? (
                          <button
                            onClick={() => toggle(n.id)}
                            aria-expanded={open}
                            className="flex w-full items-start gap-2 rounded-md text-left active:bg-paper-surface"
                          >
                            {head}
                            <Chevron open={open} />
                          </button>
                        ) : (
                          <div className="flex items-start gap-2">{head}</div>
                        )}

                        {/* NOTES — inline, FIRST, never behind the tap */}
                        {nodeNotes.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {nodeNotes.map((nt) => (
                              <SubnodeChip key={nt.id} type="note" body={nt.body} showCode={false} compact />
                            ))}
                          </div>
                        )}

                        {/* INFO — inline (clamped to 2 lines) */}
                        {nodeInfo.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2">
                            {nodeInfo.map((b) => (
                              <SubnodeChip key={b.id} type="information" body={b.content} showCode={false} compact clampLines={2} />
                            ))}
                          </div>
                        )}

                        {/* CONTEXT — revealed on tap only */}
                        {hasCtx && open && (
                          <div className="mt-2 flex flex-col gap-2">
                            {nodeCtx.map((b) => (
                              <SubnodeChip key={b.id} type="context" body={b.content} showCode={false} compact />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}

              {/* ambitions — future markers (dashed hollow ring); not expandable */}
              {ambitions.map((a) => (
                <li key={a.id}>
                  <div className="flex gap-3">
                    <Spine color={dotColor(a.tags)} ambition />
                    <div className="min-w-0 flex-1 pb-4">
                      <div className="text-xs text-muted">{fmtEU(a.date)}</div>
                      <div className="line-clamp-2 text-[15px] font-medium text-ink">{a.title}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </main>
  );
}

function groupBubbles(bubbles: L2Bubble[], kind: "information" | "context") {
  const m = new Map<string, L2Bubble[]>();
  for (const b of bubbles) {
    if (b.kind !== kind) continue;
    (m.get(b.nodeId) ?? m.set(b.nodeId, []).get(b.nodeId)!).push(b);
  }
  return m;
}

// Vertical spine column with a centred line and the node's dot on top.
function Spine({
  color,
  deadlineActive = false,
  done = false,
  ambition = false,
}: {
  color: string;
  deadlineActive?: boolean;
  done?: boolean;
  ambition?: boolean;
}) {
  return (
    <div className="relative flex w-6 shrink-0 justify-center">
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-hairline" aria-hidden />
      <span
        className="relative z-[1] mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] leading-none text-paper"
        style={
          ambition
            ? { background: "var(--paper)", border: `1.5px dashed ${color}` }
            : { background: color, border: deadlineActive ? `2px solid ${ATTENTION_ALERT}` : "none" }
        }
        aria-hidden
      >
        {done ? "✓" : ""}
      </span>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={OXBLOOD}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-1 shrink-0 transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "none" }}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
