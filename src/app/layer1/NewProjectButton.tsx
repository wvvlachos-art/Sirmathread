"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject, createManualNode, createAmbition } from "./actions";
import MiniCalendar from "./MiniCalendar";

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtEU = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB");

type Step = "closed" | "project" | "prompt" | "node";

export default function NewProjectButton() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [busy, setBusy] = useState(false);

  const [projName, setProjName] = useState("");
  const [projStart, setProjStart] = useState(todayIso());
  const [projectId, setProjectId] = useState<string | null>(null);

  // floor date for the next node (start date, then each created node's date)
  const [floor, setFloor] = useState(todayIso());
  const [nodeTitle, setNodeTitle] = useState("");
  const [nodeDate, setNodeDate] = useState(todayIso());
  const [nodeAsDeadline, setNodeAsDeadline] = useState(false);

  const open = () => {
    setProjName("");
    setProjStart(todayIso());
    setProjectId(null);
    setStep("project");
  };
  const close = () => {
    setStep("closed");
    router.refresh();
  };

  const submitProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await createProject(projName, projStart);
    setBusy(false);
    if (res.error || !res.id) {
      alert("Could not create project: " + (res.error ?? "unknown error"));
      return;
    }
    setProjectId(res.id);
    setFloor(projStart);
    router.refresh();
    setStep("prompt");
  };

  const startNode = () => {
    setNodeTitle("");
    setNodeDate(floor);
    setNodeAsDeadline(false);
    setStep("node");
  };

  const submitNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setBusy(true);
    // A future date becomes an Ambition (round); today/past becomes a node (square).
    const isFuture = nodeDate > todayIso();
    const res = isFuture
      ? await createAmbition(projectId, nodeTitle, nodeDate, nodeAsDeadline)
      : await createManualNode(projectId, nodeTitle, nodeDate);
    setBusy(false);
    if (res.error) {
      alert("Could not add: " + res.error);
      return;
    }
    setFloor(nodeDate); // next item can't be earlier than this one
    router.refresh();
    setStep("prompt");
  };

  const card =
    "w-full max-w-sm rounded-lg border border-hairline bg-paper-surface p-5 text-ink shadow-xl";
  const input =
    "w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-oxblood";
  const primary =
    "rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-paper hover:bg-oxblood-dark disabled:opacity-60";
  const ghost =
    "rounded-md border border-hairline px-4 py-2 text-sm text-ink hover:bg-paper";

  return (
    <>
      <button
        onClick={open}
        className="rounded-md bg-oxblood px-3 py-1.5 text-sm font-medium text-paper hover:bg-oxblood-dark"
      >
        + New project
      </button>

      {step !== "closed" && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && close()}
        >
          <div onClick={(e) => e.stopPropagation()}>
            {step === "project" && (
              <form onSubmit={submitProject} className={card}>
                <h2 className="brand-serif mb-4 text-lg text-oxblood">New project</h2>

                <label className="mb-1 block text-sm text-ink">Project name</label>
                <input
                  autoFocus
                  value={projName}
                  onChange={(e) => setProjName(e.target.value)}
                  placeholder="e.g. Kitchen renovation"
                  className={`mb-4 ${input}`}
                />

                <label className="mb-1 block text-sm text-ink">Start date</label>
                <MiniCalendar value={projStart} onChange={setProjStart} />
                <p className="mb-5 mt-1 text-xs text-muted">Selected: {fmtEU(projStart)}</p>

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} disabled={busy} className={ghost}>
                    Cancel
                  </button>
                  <button type="submit" disabled={busy} className={primary}>
                    {busy ? "Creating…" : "Create project"}
                  </button>
                </div>
              </form>
            )}

            {step === "prompt" && (
              <div className={card}>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">
                  {projName || "Project"} created
                </h2>
                <p className="mb-5 text-sm text-muted">Add a node to it?</p>
                <div className="flex justify-end gap-2">
                  <button onClick={close} className={ghost}>
                    Good, done
                  </button>
                  <button onClick={startNode} className={primary}>
                    Add a node
                  </button>
                </div>
              </div>
            )}

            {step === "node" && (
              <form onSubmit={submitNode} className={card}>
                <h2 className="brand-serif mb-1 text-lg text-oxblood">New node</h2>
                <p className="mb-4 text-sm text-muted">for {projName}</p>

                <label className="mb-1 block text-sm text-ink">Node title</label>
                <input
                  autoFocus
                  value={nodeTitle}
                  onChange={(e) => setNodeTitle(e.target.value)}
                  placeholder="e.g. Signed the contract"
                  className={`mb-4 ${input}`}
                />

                <label className="mb-1 block text-sm text-ink">Date</label>
                <MiniCalendar value={nodeDate} onChange={setNodeDate} minDate={floor} />
                <p className="mb-1 mt-1 text-xs text-muted">
                  Selected: {fmtEU(nodeDate)} · can&apos;t be before {fmtEU(floor)}
                </p>
                <p className="mb-2 text-xs">
                  {nodeDate > todayIso() ? (
                    <span className="text-oxblood">Future date → added as an Ambition (round)</span>
                  ) : (
                    <span className="text-muted">Today or past → added as a node (square)</span>
                  )}
                </p>
                {nodeDate > todayIso() && (
                  <label className="mb-5 flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={nodeAsDeadline}
                      onChange={(e) => setNodeAsDeadline(e.target.checked)}
                    />
                    Also set as a deadline (red countdown)
                  </label>
                )}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setStep("prompt")} disabled={busy} className={ghost}>
                    Back
                  </button>
                  <button type="submit" disabled={busy} className={primary}>
                    {busy ? "Adding…" : "Add node"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
