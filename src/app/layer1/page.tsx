import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../SignOutButton";
import Toolbar from "./Toolbar";
import Timeline from "./Timeline";

// ---- Types -------------------------------------------------------------------
type DbEmail = { subject: string | null; date_sent: string | null };
type DbNode = {
  id: string;
  display_label: string | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  emails: DbEmail | null;
};
type DbAmbition = {
  id: string;
  title: string;
  target_date: string;
  done: boolean;
};
type DbProject = {
  id: string;
  display_name: string | null;
  gmail_label_name: string;
  color: string | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  nodes: DbNode[];
  ambitions: DbAmbition[];
};

const DAY = 86_400_000;
const INACTIVE_DAYS = 45;

function deadlineStage(deadline: string | null, setAt: string | null): number {
  if (!deadline) return 0;
  const end = new Date(deadline).getTime();
  const now = Date.now();
  if (now >= end) return 100;
  if (!setAt) return 0;
  const start = new Date(setAt).getTime();
  if (start >= end) return 0;
  const frac = (now - start) / (end - start);
  if (frac <= 0) return 0;
  return Math.min(100, Math.floor(frac * 4) * 25);
}

export default async function Layer1Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sort = sp.sort ?? "last_updated";
  const dir = sp.dir ?? "desc";
  const deadlineMode = sp.deadline ?? "";
  const hideCompleted = sp.hide_completed === "1";
  const showArchived = sp.show_archived === "1";
  const inactiveOnly = sp.inactive_only === "1";

  const states = showArchived ? ["active", "archived"] : ["active"];

  const { data } = await supabase
    .from("projects")
    .select(
      "id, display_name, gmail_label_name, color, deadline, deadline_set_at, done, state, created_at, updated_at, last_activity_at, nodes(id, display_label, deadline, deadline_set_at, done, state, emails(subject, date_sent)), ambitions(id, title, target_date, done)"
    )
    .in("state", states);

  let projects = (data ?? []) as DbProject[];

  // ---- Filters ----
  const nowMs = Date.now();
  if (hideCompleted) projects = projects.filter((p) => !p.done);
  if (deadlineMode === "all") projects = projects.filter((p) => p.deadline);
  if (inactiveOnly) {
    projects = projects.filter(
      (p) =>
        p.last_activity_at &&
        nowMs - new Date(p.last_activity_at).getTime() > INACTIVE_DAYS * DAY
    );
  }

  // ---- Sort ----
  const sortVal = (p: DbProject): number => {
    switch (sort) {
      case "date_created":
        return new Date(p.created_at).getTime();
      case "deadline":
        return p.deadline ? new Date(p.deadline).getTime() : Number.POSITIVE_INFINITY;
      case "inactive":
        return p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0;
      case "last_updated":
      default:
        return new Date(p.updated_at).getTime();
    }
  };
  projects.sort((a, b) => sortVal(a) - sortVal(b));
  if (dir === "desc") projects.reverse();

  // ---- Shape the data for the timeline ----
  const lanes = projects.map((p) => ({
    id: p.id,
    name: p.display_name ?? p.gmail_label_name,
    color: p.color ?? "#71717a",
    archived: p.state === "archived",
    nodes: (p.nodes ?? [])
      .filter((n) => n.state === "promoted" && n.emails?.date_sent)
      .map((n) => ({
        id: n.id,
        label: n.display_label ?? n.emails!.subject ?? "(untitled)",
        t: new Date(n.emails!.date_sent!).getTime(),
        stage: deadlineStage(n.deadline, n.deadline_set_at),
        done: n.done,
        deadline: n.deadline,
      }))
      .sort((a, b) => a.t - b.t),
    ambitions: (p.ambitions ?? [])
      .map((a) => ({
        id: a.id,
        title: a.title,
        t: new Date(a.target_date).getTime(),
        done: a.done,
      }))
      .sort((a, b) => a.t - b.t),
  }));

  return (
    <main className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Sirmathread
          </Link>
          <span className="text-sm text-zinc-500">
            Overview · {lanes.length} project{lanes.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">{user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <Toolbar />

      {lanes.length === 0 ? (
        <div className="p-10 text-zinc-400">No projects match the current filters.</div>
      ) : (
        <Timeline lanes={lanes} nowMs={nowMs} />
      )}
    </main>
  );
}
