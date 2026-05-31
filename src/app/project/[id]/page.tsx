import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Layer2Canvas, { type L2Node, type L2Bubble } from "./Layer2Canvas";

// Same deadline-stage rule as Layer 1 (0 = none, 1..4 = perimeter quarters).
function deadlineStage(deadline: string | null, setAt: string | null): number {
  if (!deadline) return 0;
  const end = new Date(deadline).getTime();
  const now = Date.now();
  if (now >= end) return 4;
  const start = setAt ? new Date(setAt).getTime() : end - 30 * 86_400_000;
  if (start >= end) return 4;
  const frac = (now - start) / (end - start);
  if (frac < 0.25) return 1;
  if (frac < 0.5) return 2;
  if (frac < 0.75) return 3;
  return 4;
}

type DbNode = {
  id: string;
  display_label: string | null;
  done: boolean;
  deadline: string | null;
  deadline_set_at: string | null;
  state: string;
  origin: string;
  node_date: string | null;
  emails: { subject: string | null; date_sent: string | null } | null;
  node_tag_values: { tag_value_id: string; position: number }[];
};
type DbProject = {
  id: string;
  organization_id: string;
  display_name: string | null;
  gmail_label_name: string | null;
  spine_color: string | null;
  project_tag_values: { tag_values: { value: string; color: string | null } | null }[];
  nodes: DbNode[];
};

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to projects in workspaces the user belongs to. A project the
  // user can't access simply returns nothing — no leak.
  const { data } = await supabase
    .from("projects")
    .select(
      "id, organization_id, display_name, gmail_label_name, spine_color, project_tag_values(tag_values(value, color)), nodes(id, display_label, done, deadline, deadline_set_at, state, origin, node_date, emails(subject, date_sent), node_tag_values(tag_value_id, position))"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const project = data as unknown as DbProject;

  const name = project.display_name ?? project.gmail_label_name ?? "(untitled project)";
  const tags = (project.project_tag_values ?? [])
    .map((t) => t.tag_values)
    .filter((v): v is { value: string; color: string | null } => !!v);

  const nodes: L2Node[] = (project.nodes ?? [])
    .filter((n) => n.state === "promoted" && (n.emails?.date_sent || n.node_date))
    .map((n) => ({
      id: n.id,
      label: n.display_label ?? n.emails?.subject ?? "(untitled)",
      t: new Date((n.emails?.date_sent ?? n.node_date)!).getTime(),
      done: n.done,
      deadline: n.deadline,
      stage: deadlineStage(n.deadline, n.deadline_set_at),
      tags: [...(n.node_tag_values ?? [])].sort((a, b) => a.position - b.position).map((t) => t.tag_value_id),
    }))
    .sort((a, b) => a.t - b.t);

  // Tag colours for this workspace (id → colour), for node fills + bars.
  const { data: tvRows } = await supabase
    .from("tag_values")
    .select("id, color")
    .eq("organization_id", project.organization_id);
  const tagColors: Record<string, string> = {};
  for (const v of (tvRows ?? []) as { id: string; color: string | null }[]) tagColors[v.id] = v.color ?? "#a1a1aa";

  // Context bubbles for this project.
  const { data: bubbleRows } = await supabase
    .from("bubbles")
    .select("id, node_id, content, position_side, source")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  const bubbles: L2Bubble[] = ((bubbleRows ?? []) as {
    id: string;
    node_id: string;
    content: string | null;
    position_side: "above" | "below";
    source: "manual" | "ai";
  }[]).map((b) => ({ id: b.id, nodeId: b.node_id, content: b.content ?? "", side: b.position_side, source: b.source }));

  // Can this user edit (owner/member) or only read (viewer)?
  const { data: mem } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const canEdit = mem?.role === "owner" || mem?.role === "member";

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-hairline bg-paper-surface px-6 py-3">
        <Link href="/layer1" className="text-sm text-muted hover:text-ink">
          ← Overview
        </Link>
        <div className="h-5 w-1 rounded" style={{ background: project.spine_color ?? "#8f7f5b" }} aria-hidden />
        <h1 className="brand-serif text-xl text-oxblood">{name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-pill-ink">
              <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "#a1a1aa" }} />
              {t.value}
            </span>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">
          {nodes.length} node{nodes.length === 1 ? "" : "s"}
        </span>
      </header>

      <Layer2Canvas
        nodes={nodes}
        bubbles={bubbles}
        tagColors={tagColors}
        canEdit={canEdit}
        projectId={project.id}
        projectName={name}
      />
    </main>
  );
}
