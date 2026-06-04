"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon, XIcon, Spinner } from "./GenerateIcons";
import { triggerGeneration, parseByoRequest, GENERATION_INPUT_LIMIT, GENERATED_FLAG, type GenerationSourceType } from "./generate";
import { BYO_TEMPLATE } from "@/lib/prompts/byoTemplate";

// The dialog's tab union: the four AI source types + the BYO LLM tab, which
// follows a different (mechanical, free) submit path.
type Tab = GenerationSourceType | "byo";
const SOURCES: { value: Tab; label: string }[] = [
  { value: "auto-detect", label: "Auto-detect" },
  { value: "gmail-thread", label: "Gmail thread" },
  { value: "meeting-notes", label: "Meeting notes" },
  { value: "brain-dump", label: "Brain dump" },
  { value: "byo", label: "BYO LLM" },
];

const FEATURED_BTN = "flex items-center gap-1.5 rounded-md bg-oxblood px-3 py-1.5 text-sm font-medium text-paper hover:bg-oxblood-dark disabled:opacity-50";
const SMALLCAPS = "mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted";
const FIELD = "w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood disabled:opacity-60";
const HAIRLINE_05 = "0.5px solid var(--hairline)";
const WARN_TONE = "#b06a2c"; // warm amber for the low-imports state

function importsLabel(n: number) {
  return `${n} import${n === 1 ? "" : "s"} remaining`;
}

export default function GenerateButton({
  importsRemaining,
  welcomeBonusConsumed,
}: {
  importsRemaining: number;
  welcomeBonusConsumed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sourceType, setSourceType] = useState<Tab>("auto-detect");
  const [pasteContent, setPasteContent] = useState("");
  const [projectName, setProjectName] = useState("");
  const [tagHints, setTagHints] = useState("");
  const [byoOutput, setByoOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isByo = sourceType === "byo";

  // Close discards everything — no autosave. Blocked while in-flight.
  const close = () => {
    if (busy) return;
    setOpen(false);
    setSourceType("auto-detect");
    setPasteContent("");
    setProjectName("");
    setTagHints("");
    setByoOutput("");
    setCopied(false);
    setLimitHit(false);
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const onPasteChange = (val: string) => {
    if (val.length > GENERATION_INPUT_LIMIT) {
      setPasteContent(val.slice(0, GENERATION_INPUT_LIMIT));
      setLimitHit(true);
    } else {
      setPasteContent(val);
      setLimitHit(false);
    }
  };

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(BYO_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select + copy manually */
    }
  };

  const canSubmit = (isByo ? byoOutput.trim().length > 0 : pasteContent.trim().length > 0) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      if (sourceType === "byo") {
        const { projectId, summary } = await parseByoRequest(byoOutput);
        let msg = `Parsed ${summary.events} events · ${summary.informations} info · ${summary.contexts} contexts.`;
        if (summary.skipped > 0) msg += ` Skipped ${summary.skipped} events with invalid dates.`;
        if (summary.truncated > 0) msg += ` ${summary.truncated} subnodes truncated.`;
        try {
          sessionStorage.setItem(GENERATED_FLAG, msg);
        } catch {}
        router.push(`/project/${projectId}`);
      } else {
        const { projectId } = await triggerGeneration({
          sourceType,
          pasteContent,
          projectName: projectName.trim() || null,
          tagHints: tagHints.trim() || null,
        });
        try {
          sessionStorage.setItem(GENERATED_FLAG, "Project generated. Edit anything you want — AI did a first pass.");
        } catch {}
        router.push(`/project/${projectId}`);
      }
    } catch (err) {
      // Keep the dialog open with inputs preserved so the user can retry.
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const lowTone = importsRemaining <= 3;

  return (
    <div className="flex items-center gap-2">
      {/* Toolbar indicator — only once the welcome bonus is used up AND running low */}
      {welcomeBonusConsumed && importsRemaining <= 5 && (
        <span className="brand-serif text-[11px] italic" style={{ color: lowTone ? WARN_TONE : "var(--muted)" }}>
          {importsLabel(importsRemaining)}
        </span>
      )}

      <button onClick={() => setOpen(true)} className={FEATURED_BTN} title="Generate a project from pasted content">
        <SparklesIcon size={15} />
        Generate
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-hairline bg-paper-surface text-ink shadow-xl"
            style={{ maxHeight: "85vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: HAIRLINE_05 }}>
              <h2 className="brand-serif text-oxblood" style={{ fontSize: 16, fontWeight: 500 }}>
                Generate a project
              </h2>
              <button onClick={close} disabled={busy} title="Close" className="text-muted hover:text-ink disabled:opacity-40">
                <XIcon size={18} />
              </button>
            </div>

            {/* Body (dimmed + locked while in-flight) */}
            <div
              className="flex flex-col gap-4 overflow-auto px-5 py-4"
              style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined}
              aria-hidden={busy}
            >
              {/* Source type (5 tabs) */}
              <div>
                <div className={SMALLCAPS}>Source</div>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCES.map((s) => {
                    const active = sourceType === s.value;
                    return (
                      <button
                        key={s.value}
                        onClick={() => {
                          setSourceType(s.value);
                          setError(null);
                        }}
                        className="rounded-md px-3 py-1.5 text-sm font-medium"
                        style={
                          active
                            ? { background: "var(--oxblood)", color: "var(--paper)" }
                            : { background: "transparent", color: "var(--oxblood)", border: HAIRLINE_05 }
                        }
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isByo ? (
                <>
                  {/* BYO: prompt template (read-only) + copy */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wide text-muted">Prompt template</span>
                      <button onClick={copyTemplate} className="rounded border border-hairline px-2 py-0.5 text-[11px] text-oxblood hover:bg-paper">
                        {copied ? "Copied!" : "Copy template"}
                      </button>
                    </div>
                    <textarea
                      readOnly
                      value={BYO_TEMPLATE}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`${FIELD} resize-none`}
                      style={{ minHeight: 120, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.4 }}
                    />
                    <p className="mt-1 text-[11px] italic text-muted">
                      Copy this, run it through your own LLM with your content, then paste the result below.
                    </p>
                  </div>

                  {/* BYO: paste the LLM output */}
                  <div>
                    <div className={SMALLCAPS}>Paste your LLM output here</div>
                    <textarea
                      autoFocus
                      value={byoOutput}
                      onChange={(e) => setByoOutput(e.target.value)}
                      placeholder="Paste the formatted timeline your LLM produced…"
                      className={`${FIELD} resize-y`}
                      style={{ minHeight: 130 }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {/* AI: paste content */}
                  <div>
                    <div className={SMALLCAPS}>Paste content</div>
                    <textarea
                      autoFocus
                      value={pasteContent}
                      onChange={(e) => onPasteChange(e.target.value)}
                      placeholder="Paste an email thread, meeting notes, or any text content…"
                      className={`${FIELD} resize-y`}
                      style={{ minHeight: 130 }}
                    />
                    {limitHit && <p className="mt-1 text-xs text-oxblood">Limit: 50,000 characters. Paste a smaller section.</p>}
                  </div>

                  {/* AI: project name (optional) */}
                  <div>
                    <div className={SMALLCAPS}>
                      Project name <span className="font-normal normal-case italic tracking-normal">— optional, AI will suggest one</span>
                    </div>
                    <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Leave blank to let AI choose" className={FIELD} />
                  </div>

                  {/* AI: tag hints (optional) */}
                  <div>
                    <div className={SMALLCAPS}>
                      Tag hints <span className="font-normal normal-case italic tracking-normal">— optional, AI will detect tags from content</span>
                    </div>
                    <input value={tagHints} onChange={(e) => setTagHints(e.target.value)} placeholder="e.g. Asana, Ting, Billing" className={FIELD} />
                  </div>
                </>
              )}

              {error && <p className="text-xs text-oxblood">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: HAIRLINE_05 }}>
              {isByo ? (
                <span className="brand-serif text-[11px] italic text-muted">Free — no import cost</span>
              ) : (
                <span className="brand-serif text-[11px] italic" style={{ color: lowTone ? WARN_TONE : "var(--muted)" }}>
                  {importsLabel(importsRemaining)}
                </span>
              )}
              {busy ? (
                <span className="brand-serif flex items-center gap-2 text-[13px] italic text-oxblood">
                  <Spinner size={14} />
                  {isByo ? "Parsing…" : "Generating your project…"}
                </span>
              ) : (
                <button onClick={submit} disabled={!canSubmit} className={FEATURED_BTN}>
                  <SparklesIcon size={15} />
                  {isByo ? "Parse · no import cost" : "Generate · 1 import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
