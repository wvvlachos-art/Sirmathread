"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon, ClipboardIcon, Spinner } from "./GenerateIcons";
import { triggerGeneration, GENERATION_INPUT_LIMIT, GENERATED_FLAG } from "./generate";

// A persistent quick-capture row directly under the toolbar. Typing/pasting into
// it reveals an inline Generate; a page-level ⌘V/Ctrl+V capture (when focus is
// NOT in another field) drops the clipboard straight into it. On submit it hits
// the same /api/generate-project backend as the dialog and navigates to Layer 2.

const HAIRLINE_05 = "0.5px solid var(--hairline)";

function focusIsEditable(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export default function QuickPasteBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [limitHit, setLimitHit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = value.trim().length > 0;

  const setClamped = (val: string) => {
    if (val.length > GENERATION_INPUT_LIMIT) {
      setValue(val.slice(0, GENERATION_INPUT_LIMIT));
      setLimitHit(true);
    } else {
      setValue(val);
      setLimitHit(false);
    }
  };

  const submit = async () => {
    if (!active || busy) return;
    setError(null);
    setBusy(true);
    try {
      const { projectId } = await triggerGeneration({
        sourceType: "auto-detect",
        pasteContent: value,
        projectName: null,
        tagHints: null,
      });
      try {
        sessionStorage.setItem(GENERATED_FLAG, "Project generated. Edit anything you want — AI did a first pass.");
      } catch {}
      router.push(`/project/${projectId}`);
    } catch (err) {
      // Keep the typed content so the user can retry.
      setBusy(false);
      setError(err instanceof Error ? err.message : "Generation failed. Try again, or simplify your paste.");
    }
  };

  // Page-level ⌘V / Ctrl+V capture (only when focus is NOT in a text field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isPaste = (e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "V");
      if (!isPaste || focusIsEditable()) return;
      e.preventDefault();
      navigator.clipboard
        .readText()
        .then((text) => {
          if (text) setClamped(text);
          inputRef.current?.focus();
        })
        .catch(() => {
          inputRef.current?.focus();
        });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-paper px-6" style={{ borderTop: HAIRLINE_05, borderBottom: HAIRLINE_05 }}>
      <div className="flex items-center gap-2.5" style={{ height: 40 }}>
        <span className="shrink-0 text-muted">
          <ClipboardIcon size={16} />
        </span>
        <input
          ref={inputRef}
          value={value}
          disabled={busy}
          onChange={(e) => setClamped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Paste an email thread, meeting notes, or any text to generate a project…"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted disabled:opacity-60"
        />
        {busy ? (
          <span className="brand-serif flex shrink-0 items-center gap-1.5 text-[12px] italic text-oxblood">
            <Spinner size={13} />
            Generating your project…
          </span>
        ) : active ? (
          <button
            onClick={submit}
            className="flex shrink-0 items-center gap-1 rounded-md bg-oxblood font-medium text-paper hover:bg-oxblood-dark disabled:opacity-50"
            style={{ padding: "5px 11px", fontSize: 12 }}
          >
            <SparklesIcon size={13} />
            Generate · 1 import
          </button>
        ) : (
          <span className="brand-serif shrink-0 text-[11px] italic text-muted">⌘V works anywhere</span>
        )}
      </div>
      {(limitHit || error) && (
        <p className="pb-1 text-xs text-oxblood">
          {error ?? "Limit: 50,000 characters — pasted content was trimmed."}
        </p>
      )}
    </div>
  );
}
