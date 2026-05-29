import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AccountMenu from "../account/AccountMenu";
import { resolveActiveOrg, listMyOrgs } from "@/lib/activeOrg";
import Toolbar from "./Toolbar";
import Timeline from "./Timeline";
import NewProjectButton from "./NewProjectButton";
import { WandProvider } from "./wand";

// ---- Types -------------------------------------------------------------------
type DbEmail = { subject: string | null; date_sent: string | null };
type DbNode = {
  id: string;
  display_label: string | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  origin: string;
  node_date: string | null;
  emails: DbEmail | null;
  node_tag_values: { tag_value_id: string; position: number }[];
};
type DbTagValue = { id: string; value: string; color: string | null };
type DbCategory = {
  id: string;
  name: string;
  is_hide_filter: boolean;
  sort_order: number;
  tag_values: DbTagValue[];
};
type DbAmbition = {
  id: string;
  title: string;
  target_date: string;
  done: boolean;
  is_deadline: boolean;
  created_at: string;
};
type DbProject = {
  id: string;
  display_name: string | null;
  gmail_label_name: string | null;
  origin: string;
  color: string | null;
  spine_color: string | null;
  spine_color_is_user_set: boolean | null;
  deadline: string | null;
  deadline_set_at: string | null;
  done: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string | null;
  nodes: DbNode[];
  ambitions: DbAmbition[];
  project_tag_values: { tag_value_id: string }[];
  notes: { id: string; node_id: string | null; body: string | null; x: number | null; y: number | null }[];
};

const DAY = 86_400_000;
const INACTIVE_DAYS = 45;

// 0 = no deadline. 1..4 = perimeter-border stages (top edge → full ring).
// Fallbacks: missing `setAt` → treat as deadline - 30 days (legacy rows).
// `setAt >= deadline` (data error) → stage 4. Past deadline → stage 4 (overdue).
function deadlineStage(deadline: string | null, setAt: string | null): number {
  if (!deadline) return 0;
  const end = new Date(deadline).getTime();
  const now = Date.now();
  if (now >= end) return 4;
  const start = setAt
    ? new Date(setAt).getTime()
    : end - 30 * 86_400_000;
  if (start >= end) return 4;
  const frac = (now - start) / (end - start);
  if (frac < 0.25) return 1;
  if (frac < 0.5) return 2;
  if (frac < 0.75) return 3;
  return 4;
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

  // Which workspace are we viewing? (cookie-backed switcher)
  const activeOrg = await resolveActiveOrg(supabase, user.id);
  const myOrgs = await listMyOrgs(supabase, user.id);
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const displayName =
    ((profileRow?.display_name as string | undefined) ?? user.email?.split("@")[0]) || "You";

  const sort = sp.sort ?? "last_updated";
  const dir = sp.dir ?? "desc";
  const deadlineMode = sp.deadline ?? "";
  const hideCompleted = sp.hide_completed === "1";
  const showArchived = sp.show_archived === "1";
  const inactiveOnly = sp.inactive_only === "1";
  const selectedTags = (sp.tags ?? "").split(",").filter(Boolean);
  const showHidden = sp.show_hidden === "1";

  // Always fetch every real project (active + archived) so we can tell how many
  // are being held back by the current filters and report a "hidden" count.
  let projectsQuery = supabase
    .from("projects")
    .select(
      "id, display_name, gmail_label_name, origin, color, spine_color, spine_color_is_user_set, deadline, deadline_set_at, done, state, created_at, updated_at, last_activity_at, project_tag_values(tag_value_id), nodes(id, display_label, deadline, deadline_set_at, done, state, origin, node_date, emails(subject, date_sent), node_tag_values(tag_value_id, position)), ambitions(id, title, target_date, done, is_deadline, created_at), notes(id, node_id, body, x, y)"
    )
    .in("state", ["active", "archived"]);
  // Scope the board to the active workspace.
  if (activeOrg) projectsQuery = projectsQuery.eq("organization_id", activeOrg.id);
  const { data, error } = await projectsQuery;

  if (error) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-paper p-10 text-center text-ink">
        <p className="text-lg font-medium">Couldn&apos;t load your projects.</p>
        <p className="max-w-md text-sm text-muted">
          A database update may still be pending. Details: {error.message}
        </p>
      </main>
    );
  }

  // The full set of the user's real projects — the baseline for the hidden count.
  // (Cast via unknown: Supabase infers to-one relations like `emails` as arrays,
  // but at runtime they're single objects, which is what DbProject describes.)
  const universe = (data ?? []) as unknown as DbProject[];
  let projects = universe;

  // Archived projects are hidden unless "Show archived" is on.
  if (!showArchived) projects = projects.filter((p) => p.state !== "archived");

  // ---- Tag catalog ----
  let catQuery = supabase
    .from("tag_categories")
    .select("id, name, is_hide_filter, sort_order, tag_values(id, value, color)");
  if (activeOrg) catQuery = catQuery.eq("organization_id", activeOrg.id);
  const { data: catData } = await catQuery.order("sort_order");
  const categories = (catData ?? []) as DbCategory[];
  const tagColors: Record<string, string> = {};
  const hideValueIds = new Set<string>();
  for (const c of categories) {
    for (const v of c.tag_values ?? []) {
      tagColors[v.id] = v.color ?? "#a1a1aa";
      if (c.is_hide_filter) hideValueIds.add(v.id);
    }
  }
  // ---- Ambition tags ----
  // Fetched separately and defensively: if the ambition_tag_values table hasn't
  // been created yet, this just yields no tags rather than breaking the page.
  const ambTagMap: Record<string, string[]> = {};
  const ambIds = universe.flatMap((p) => (p.ambitions ?? []).map((a) => a.id));
  if (ambIds.length) {
    const { data: ambTagRows } = await supabase
      .from("ambition_tag_values")
      .select("ambition_id, tag_value_id")
      .in("ambition_id", ambIds);
    for (const r of (ambTagRows ?? []) as { ambition_id: string; tag_value_id: string }[]) {
      (ambTagMap[r.ambition_id] ??= []).push(r.tag_value_id);
    }
  }

  // Every tag value applied to a project, including via its nodes and ambitions.
  const projTagSet = (p: DbProject): Set<string> => {
    const ids = new Set<string>();
    for (const t of p.project_tag_values ?? []) ids.add(t.tag_value_id);
    for (const n of p.nodes ?? []) for (const t of n.node_tag_values ?? []) ids.add(t.tag_value_id);
    for (const a of p.ambitions ?? []) for (const t of ambTagMap[a.id] ?? []) ids.add(t);
    return ids;
  };

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
  // Hide-filter categories (Spam / Not important) drop their projects by default.
  if (!showHidden && hideValueIds.size) {
    projects = projects.filter((p) => {
      const ids = projTagSet(p);
      for (const h of hideValueIds) if (ids.has(h)) return false;
      return true;
    });
  }
  // Tag filter: keep projects carrying any selected tag value.
  if (selectedTags.length) {
    projects = projects.filter((p) => {
      const ids = projTagSet(p);
      return selectedTags.some((t) => ids.has(t));
    });
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
  // Last updated (newest first) is the general tiebreaker for every sort.
  const updatedDesc = (a: DbProject, b: DbProject) =>
    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();

  if (sort === "ambitiousness") {
    // Most ambitions first; ties (incl. all the zero-ambition projects) fall
    // back to last updated — a "stealth" secondary sort.
    projects.sort((a, b) => {
      const d = (b.ambitions?.length ?? 0) - (a.ambitions?.length ?? 0);
      return d !== 0 ? d : updatedDesc(a, b);
    });
    if (dir === "asc") projects.reverse();
  } else {
    projects.sort((a, b) => {
      const pa = sortVal(a);
      const pb = sortVal(b);
      let primary = pa === pb ? 0 : pa < pb ? -1 : 1;
      if (dir === "desc") primary = -primary;
      return primary !== 0 ? primary : updatedDesc(a, b);
    });
  }

  // ---- Shape the data for the timeline ----
  const lanes = projects.map((p) => {
    const nodes = (p.nodes ?? [])
      .filter((n) => n.state === "promoted" && (n.emails?.date_sent || n.node_date))
      .map((n) => {
        const dateStr = n.emails?.date_sent ?? n.node_date!;
        return {
          id: n.id,
          label: n.display_label ?? n.emails?.subject ?? "(untitled)",
          t: new Date(dateStr).getTime(),
          stage: deadlineStage(n.deadline, n.deadline_set_at),
          done: n.done,
          deadline: n.deadline,
          origin: n.origin === "manual" ? "manual" : "gmail",
          tags: [...(n.node_tag_values ?? [])]
            .sort((a, b) => a.position - b.position)
            .map((t) => t.tag_value_id),
        };
      })
      .sort((a, b) => a.t - b.t);

    const nodeTimeById: Record<string, number> = {};
    for (const n of nodes) nodeTimeById[n.id] = n.t;
    const lastT = nodes.length ? nodes[nodes.length - 1].t : nowMs;

    const notes = (p.notes ?? []).map((nt) => ({
      id: nt.id,
      body: nt.body ?? "",
      x: typeof nt.x === "number" ? nt.x : lastT,
      y: typeof nt.y === "number" ? nt.y : -60,
      anchorT: (nt.node_id && nodeTimeById[nt.node_id]) || lastT,
    }));

    const inactive = !!(
      p.last_activity_at &&
      nowMs - new Date(p.last_activity_at).getTime() > INACTIVE_DAYS * DAY
    );
    // Attention status drives the dot before the project name.
    // - inactive: faded gray (the 45-day quiet threshold)
    // - alert: at least one node has a deadline at stage 3 (≥50% elapsed) or worse
    // - normal: active, nothing urgent
    let attention: "inactive" | "alert" | "normal" = inactive ? "inactive" : "normal";
    if (!inactive) {
      const hasUrgent = nodes.some((n) => n.deadline && !n.done && n.stage >= 3);
      if (hasUrgent) attention = "alert";
    }

    return {
      id: p.id,
      name: p.display_name ?? p.gmail_label_name ?? "(untitled project)",
      origin: p.origin === "manual" ? "manual" : "gmail",
      color: p.color,
      spineColor: p.spine_color ?? null,
      spineUserSet: !!p.spine_color_is_user_set,
      attention,
      lastActivityAt: p.last_activity_at,
      archived: p.state === "archived",
      inactive,
      nodes,
      tags: (p.project_tag_values ?? []).map((t) => t.tag_value_id),
      ambitions: (p.ambitions ?? [])
        .map((a) => ({
          id: a.id,
          title: a.title,
          t: new Date(a.target_date).getTime(),
          done: a.done,
          isDeadline: a.is_deadline,
          stage: a.is_deadline ? deadlineStage(a.target_date, a.created_at) : 0,
          tags: ambTagMap[a.id] ?? [],
        }))
        .sort((a, b) => a.t - b.t),
      notes,
    };
  });

  const tagCatalog = categories.map((c) => ({
    id: c.id,
    name: c.name,
    isHide: c.is_hide_filter,
    values: (c.tag_values ?? []).map((v) => ({
      id: v.id,
      value: v.value,
      color: v.color ?? "#a1a1aa",
    })),
  }));

  return (
    <main className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-hairline bg-paper-surface px-6 py-3">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="brand-serif text-xl text-oxblood">
            Sirmathread
          </Link>
          <span className="text-sm text-muted">
            Overview · {lanes.length} project{lanes.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <NewProjectButton />
          <AccountMenu
            email={user.email ?? ""}
            displayName={displayName}
            activeOrgId={activeOrg?.id ?? null}
            orgs={myOrgs.map((o) => ({ id: o.id, name: o.name, role: o.role }))}
          />
        </div>
      </header>

      <WandProvider>
        <Toolbar categories={tagCatalog} hiddenCount={universe.length - lanes.length} />

        {lanes.length === 0 ? (
          <div className="p-10 text-muted">No projects match the current filters.</div>
        ) : (
          <Timeline
            lanes={lanes}
            nowMs={nowMs}
            tagColors={tagColors}
            categories={tagCatalog}
            selectedTags={selectedTags}
            deadlineActive={deadlineMode === "all"}
          />
        )}
      </WandProvider>
    </main>
  );
}
