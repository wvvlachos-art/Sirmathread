import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Layer2Canvas, { type L2Node } from "./Layer2Canvas";

type DbNode = {
  id: string;
  display_label: string | null;
  done: boolean;
  deadline: string | null;
  state: string;
  origin: string;
  node_date: string | null;
  emails: { subject: string | null; date_sent: string | null } | null;
};
type DbProject = {
  id: string;
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
      "id, display_name, gmail_label_name, spine_color, project_tag_values(tag_values(value, color)), nodes(id, display_label, done, deadline, state, origin, node_date, emails(subject, date_sent))"
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
      hasDeadline: !!n.deadline,
    }))
    .sort((a, b) => a.t - b.t);

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-hairline bg-paper-surface px-6 py-3">
        <Link href="/layer1" className="text-sm text-muted hover:text-ink">
          ← Overview
        </Link>
        <div
          className="h-5 w-1 rounded"
          style={{ background: project.spine_color ?? "#8f7f5b" }}
          aria-hidden
        />
        <h1 className="brand-serif text-xl text-oxblood">{name}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((t, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-pill-ink"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "#a1a1aa" }} />
              {t.value}
            </span>
          ))}
        </div>
        <span className="ml-auto text-xs text-muted">
          {nodes.length} node{nodes.length === 1 ? "" : "s"}
        </span>
      </header>

      <Layer2Canvas nodes={nodes} />
    </main>
  );
}
