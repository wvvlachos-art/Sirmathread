"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardIcon, XIcon, Spinner } from "./GenerateIcons";
import { parseByoPreview, parseByoRequest, GENERATED_FLAG } from "./generate";
import { BYO_TEMPLATE } from "@/lib/prompts/byoTemplate";

// Dedicated, single-purpose entry for the BYO ("bring your own LLM") path. Unlike
// the AI Generate dialog, this is FREE (mechanical parse, no import cost), so it
// gets its own header button. The flow is deliberately short:
//   click button → prompt auto-copied → paste your LLM's output → Import.
// Paste auto-runs a tag preview, so any brand-new tags surface for approval
// without a separate "parse" click.

const FEATURED_BTN =
  "flex items-center gap-1.5 rounded-md border border-oxblood bg-transparent px-3 py-1.5 text-sm font-medium text-oxblood hover:bg-oxblood/10 disabled:opacity-50";
const PRIMARY_BTN =
  "flex items-center gap-1.5 rounded-md bg-oxblood px-3 py-1.5 text-sm font-medium text-paper hover:bg-oxblood-dark disabled:opacity-50";
const FIELD = "w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood disabled:opacity-60";
const HAIRLINE_05 = "0.5px solid var(--hairline)";

export default function ByoButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  // Tag review: null until a preview has run; then the new (not-yet-existing) tags
  // plus a ticked/unticked map (all ticked initially). [] = previewed, none new.
  const [newTags, setNewTags] = useState<string[] | null>(null);
  const [tagChecked, setTagChecked] = useState<Record<string, boolean>>({});
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Copy is ALWAYS an explicit user action (Step 1) — never automatic. Auto-copying
  // on open silently overwrites the user's clipboard, which then collides with the
  // output they're about to paste. So this only runs when they click.
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(BYO_TEMPLATE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowPrompt(true); // clipboard blocked — reveal the text so they can copy manually
    }
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setOutput("");
    setCopied(false);
    setShowPrompt(false);
    setNewTags(null);
    setTagChecked({});
    setChecking(false);
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

  // Auto-detect tags shortly after the user pastes/edits — no separate "parse"
  // click. Debounced so we don't fire on every keystroke. Errors stay quiet here;
  // the Import button surfaces them on commit.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (!open || !output.trim()) {
      setNewTags(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    previewTimer.current = setTimeout(async () => {
      try {
        const { newTags: nt } = await parseByoPreview(output);
        setNewTags(nt);
        setTagChecked(Object.fromEntries(nt.map((t) => [t, true])));
      } catch {
        setNewTags(null); // leave it to the Import click to re-check + report
      } finally {
        setChecking(false);
      }
    }, 500);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [output, open]);

  const importNow = async () => {
    if (!output.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      // Safety net: if the debounced preview hasn't run yet (fast paste → click),
      // run it now. If it turns up new tags, pause for approval instead of
      // silently dropping them.
      if (newTags === null) {
        const { newTags: nt } = await parseByoPreview(output);
        if (nt.length > 0) {
          setNewTags(nt);
          setTagChecked(Object.fromEntries(nt.map((t) => [t, true])));
          setBusy(false);
          return;
        }
      }
      const approvedNewTags = newTags ? newTags.filter((t) => tagChecked[t]) : [];
      const { projectId, summary } = await parseByoRequest(output, approvedNewTags);
      let msg = `Parsed ${summary.events} events · ${summary.informations} info · ${summary.contexts} contexts.`;
      if (summary.skipped > 0) msg += ` Skipped ${summary.skipped} with invalid dates.`;
      try {
        sessionStorage.setItem(GENERATED_FLAG, msg);
      } catch {}
      router.push(`/project/${projectId}`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const hasNewTags = !!newTags && newTags.length > 0;
  const canImport = output.trim().length > 0 && !busy;

  return (
    <>
      <button onClick={() => setOpen(true)} className={FEATURED_BTN} title="Import a timeline you generated with your own LLM (free)">
        <ClipboardIcon size={15} />
        Import from your LLM
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
                Import from your LLM
              </h2>
              <button onClick={close} disabled={busy} title="Close" className="text-muted hover:text-ink disabled:opacity-40">
                <XIcon size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 overflow-auto px-5 py-4" style={busy ? { opacity: 0.5, pointerEvents: "none" } : undefined} aria-hidden={busy}>
              {/* 3-step instructions. Step 1 carries the explicit Copy button — copy
                  only ever happens on this click, never automatically. */}
              <ol className="flex flex-col gap-3">
                <li className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oxblood text-[11px] font-medium text-paper">1</span>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <span>Copy the prompt and paste it into your LLM (ChatGPT, Claude, …)</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={copyPrompt}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-sm font-semibold ${
                          copied ? "" : "bg-oxblood text-paper hover:bg-oxblood-dark"
                        }`}
                        style={copied ? { background: "rgba(34,197,94,0.15)", color: "#15803d", border: "1px solid rgba(34,197,94,0.5)" } : undefined}
                      >
                        {copied ? (
                          "✓ Copied"
                        ) : (
                          <>
                            <ClipboardIcon size={15} />
                            Copy prompt
                          </>
                        )}
                      </button>
                      <button onClick={() => setShowPrompt((v) => !v)} className="text-[11px] text-muted underline hover:text-ink">
                        {showPrompt ? "Hide" : "Show prompt"}
                      </button>
                    </div>
                    {showPrompt && (
                      <textarea
                        readOnly
                        value={BYO_TEMPLATE}
                        onFocus={(e) => e.currentTarget.select()}
                        className={`${FIELD} mt-1 resize-none`}
                        style={{ minHeight: 110, fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.4 }}
                      />
                    )}
                  </div>
                </li>
                <li className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oxblood text-[11px] font-medium text-paper">2</span>
                  <span>Paste your content (emails, notes, chat) into the same conversation</span>
                </li>
                <li className="flex items-start gap-2 text-sm text-ink">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-oxblood text-[11px] font-medium text-paper">3</span>
                  <span>Paste the LLM&apos;s output in the box below</span>
                </li>
              </ol>

              {/* Step 3: paste box */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-muted">Paste your LLM output</span>
                  {checking && <span className="flex items-center gap-1 text-[11px] text-muted"><Spinner size={11} /> checking tags…</span>}
                </div>
                <textarea
                  autoFocus
                  value={output}
                  onChange={(e) => setOutput(e.target.value)}
                  placeholder="Paste the formatted timeline your LLM produced…"
                  className={`${FIELD} resize-y`}
                  style={{ minHeight: 140 }}
                />
              </div>

              {/* New-tag review */}
              {hasNewTags && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-muted">New tags found — pick which to create</div>
                  <p className="mb-2 text-[11px] italic text-muted">
                    These aren&apos;t in your workspace yet. Ticked ones are created and colour your nodes; existing tags always apply.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {newTags!.map((t) => {
                      const on = tagChecked[t];
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTagChecked((p) => ({ ...p, [t]: !p[t] }))}
                          className="rounded-md px-2.5 py-1 text-xs font-medium"
                          style={on ? { background: "var(--oxblood)", color: "var(--paper)" } : { background: "transparent", color: "var(--muted)", border: HAIRLINE_05 }}
                        >
                          {on ? "✓ " : ""}
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-oxblood">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-3" style={{ borderTop: HAIRLINE_05 }}>
              <span className="brand-serif text-[11px] italic text-muted">Free — no import cost</span>
              {busy ? (
                <span className="brand-serif flex items-center gap-2 text-[13px] italic text-oxblood">
                  <Spinner size={14} />
                  Parsing…
                </span>
              ) : (
                <button onClick={importNow} disabled={!canImport} className={PRIMARY_BTN}>
                  <ClipboardIcon size={15} />
                  {hasNewTags ? "Create tags & import" : "Import"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
