import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Layer2Canvas, { type L2Node, type L2Bubble, type NodeType, type TagCategory, type L2NoteItem, type L2Ambition } from "./Layer2Canvas";
import GenerationToast from "./GenerationToast";
import ResponsiveSwitch from "../../ResponsiveSwitch";
import MobileProjectTimeline from "./MobileProjectTimeline";

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
  ambitions: { id: string; title: string; target_date: string; done: boolean }[];
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
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, organization_id, display_name, gmail_label_name, spine_color, project_tag_values(tag_values(value, color)), nodes(id, display_label, done, deadline, deadline_set_at, state, origin, node_date, emails(subject, date_sent), node_tag_values(tag_value_id, position)), ambitions(id, title, target_date, done)"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    // A pending DB migration shouldn't read as a 404. Mirror Layer 1's notice.
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-paper p-10 text-center text-ink">
        <p className="text-lg font-medium">Couldn&apos;t load this project.</p>
        <p className="max-w-md text-sm text-muted">A database update may still be pending. Details: {error.message}</p>
      </main>
    );
  }
  if (!data) notFound();
  const project = data as unknown as DbProject;

  // Optional node types live in a column added by a later migration. Fetch them
  // separately and tolerate the column not existing yet, so the page keeps
  // working before the migration is run — type icons just stay absent.
  const nodeType: Record<string, NodeType | null> = {};
  {
    const { data: typeRows, error: typeErr } = await supabase
      .from("nodes")
      .select("id, node_type")
      .eq("project_id", id);
    if (!typeErr) {
      for (const r of (typeRows ?? []) as { id: string; node_type: string | null }[]) {
        nodeType[r.id] = (r.node_type as NodeType | null) ?? null;
      }
    }
  }

  // Custom Layer-2 node positions (column added by a later migration; tolerate
  // its absence so dragging just doesn't persist until the migration is run).
  const nodePos: Record<string, { x: number; y: number }> = {};
  {
    const { data: posRows, error: posErr } = await supabase
      .from("nodes")
      .select("id, l2_x, l2_y")
      .eq("project_id", id);
    if (!posErr) {
      for (const r of (posRows ?? []) as { id: string; l2_x: number | null; l2_y: number | null }[]) {
        if (r.l2_x != null && r.l2_y != null) nodePos[r.id] = { x: r.l2_x, y: r.l2_y };
      }
    }
  }

  // Custom Layer-2 node size (separate tolerant query — its own later migration).
  const nodeSize: Record<string, number> = {};
  {
    const { data: szRows, error: szErr } = await supabase.from("nodes").select("id, l2_w").eq("project_id", id);
    if (!szErr) {
      for (const r of (szRows ?? []) as { id: string; l2_w: number | null }[]) {
        if (r.l2_w != null) nodeSize[r.id] = r.l2_w;
      }
    }
  }

  const name = project.display_name ?? project.gmail_label_name ?? "(untitled project)";
  const tags = (project.project_tag_values ?? [])
    .map((t) => t.tag_values)
    .filter((v): v is { value: string; color: string | null } => !!v);

  const toL2Node = (n: DbNode): L2Node => ({
    id: n.id,
    label: n.display_label ?? n.emails?.subject ?? "(untitled)",
    t: new Date((n.emails?.date_sent ?? n.node_date)!).getTime(),
    done: n.done,
    deadline: n.deadline,
    stage: deadlineStage(n.deadline, n.deadline_set_at),
    tags: [...(n.node_tag_values ?? [])].sort((a, b) => a.position - b.position).map((t) => t.tag_value_id),
    type: nodeType[n.id] ?? null,
    px: nodePos[n.id]?.x ?? null,
    py: nodePos[n.id]?.y ?? null,
    pw: nodeSize[n.id] ?? null,
  });

  // Spine = promoted nodes (what Layer 1 shows too). Demoted nodes are kept off
  // the spine and rendered as branching bubbles, with a promote action to
  // restore them. Both need a real date to place on the thread.
  const dated = (project.nodes ?? []).filter((n) => n.emails?.date_sent || n.node_date);
  const nodes: L2Node[] = dated
    .filter((n) => n.state === "promoted")
    .map(toL2Node)
    .sort((a, b) => a.t - b.t);
  const demoted: L2Node[] = dated
    .filter((n) => n.state === "demoted")
    .map(toL2Node)
    .sort((a, b) => a.t - b.t);

  // Ambitions (future round markers). Their tags live in ambition_tag_values —
  // fetched separately and tolerantly so a missing table can't break the page
  // (ambitions just render untagged in that case).
  const ambRows = project.ambitions ?? [];
  const ambTagsById: Record<string, string[]> = {};
  if (ambRows.length > 0) {
    const { data: atvRows, error: atvErr } = await supabase
      .from("ambition_tag_values")
      .select("ambition_id, tag_value_id")
      .in(
        "ambition_id",
        ambRows.map((a) => a.id)
      );
    if (!atvErr) {
      for (const r of (atvRows ?? []) as { ambition_id: string; tag_value_id: string }[]) {
        (ambTagsById[r.ambition_id] ??= []).push(r.tag_value_id);
      }
    }
  }
  // Custom Layer-2 ambition positions (columns from ambition-l2-position.sql;
  // tolerate their absence so dragging just doesn't persist until the migration runs).
  const ambPos: Record<string, { x: number; y: number }> = {};
  if (ambRows.length > 0) {
    const { data: ambPosRows, error: ambPosErr } = await supabase.from("ambitions").select("id, l2_x, l2_y").eq("project_id", id);
    if (!ambPosErr) {
      for (const r of (ambPosRows ?? []) as { id: string; l2_x: number | null; l2_y: number | null }[]) {
        if (r.l2_x != null && r.l2_y != null) ambPos[r.id] = { x: r.l2_x, y: r.l2_y };
      }
    }
  }
  const ambitions: L2Ambition[] = ambRows
    .filter((a) => a.target_date)
    .map((a) => ({
      id: a.id,
      title: a.title,
      date: a.target_date,
      t: new Date(a.target_date + "T00:00:00Z").getTime(),
      done: a.done,
      tags: ambTagsById[a.id] ?? [],
      px: ambPos[a.id]?.x ?? null,
      py: ambPos[a.id]?.y ?? null,
    }))
    .sort((x, y) => x.t - y.t);

  // Tag catalog for this workspace: categories + their values. Drives both the
  // node fill/bar colours and the apply-tags picker in the node ⋯ menu.
  const { data: catData } = await supabase
    .from("tag_categories")
    .select("id, name, sort_order, tag_values(id, value, color)")
    .eq("organization_id", project.organization_id)
    .order("sort_order");
  const tagCatalog: TagCategory[] = ((catData ?? []) as {
    id: string;
    name: string;
    tag_values: { id: string; value: string; color: string | null }[] | null;
  }[]).map((c) => ({ id: c.id, name: c.name, values: c.tag_values ?? [] }));
  const tagColors: Record<string, string> = {};
  for (const c of tagCatalog) for (const v of c.values) tagColors[v.id] = v.color ?? "#a1a1aa";

  // Context bubbles for this project.
  const { data: bubbleRows } = await supabase
    .from("bubbles")
    .select("id, node_id, content, position_side, source, bubble_type, x, y")
    .eq("project_id", id)
    .order("created_at", { ascending: true });
  const bubbles: L2Bubble[] = ((bubbleRows ?? []) as {
    id: string;
    node_id: string;
    content: string | null;
    position_side: "above" | "below";
    source: "manual" | "ai";
    bubble_type: string | null;
    x: number | null;
    y: number | null;
  }[]).map((b) => ({
    id: b.id,
    nodeId: b.node_id,
    content: b.content ?? "",
    side: b.position_side,
    source: b.source,
    kind: b.bubble_type === "information" ? "information" : "context",
    x: b.x,
    y: b.y,
    title: null as string | null,
    width: null as number | null,
    height: null as number | null,
    shape: null as string | null,
    code: null as string | null,
  }));

  // Optional sub-node styling (title/size/shape) lives in columns added by a
  // later migration. Overlay them tolerantly so the page works before it runs.
  {
    const { data: styleRows, error: styleErr } = await supabase
      .from("bubbles")
      .select("id, title, width, height, shape")
      .eq("project_id", id);
    if (!styleErr) {
      const byId = new Map(
        ((styleRows ?? []) as { id: string; title: string | null; width: number | null; height: number | null; shape: string | null }[]).map((r) => [r.id, r])
      );
      for (const b of bubbles) {
        const s = byId.get(b.id);
        if (s) {
          b.title = s.title;
          b.width = s.width;
          b.height = s.height;
          b.shape = s.shape;
        }
      }
    }
  }

  // Stable Pantone codes (column from supabase/pantone-codes.sql). Tolerant
  // overlay so the page still renders before that migration runs.
  {
    const { data: codeRows, error: codeErr } = await supabase.from("bubbles").select("id, pantone_code").eq("project_id", id);
    if (!codeErr) {
      const byId = new Map(((codeRows ?? []) as { id: string; pantone_code: string | null }[]).map((r) => [r.id, r.pantone_code]));
      for (const b of bubbles) b.code = byId.get(b.id) ?? null;
    }
  }

  // Layer-1 user notes for this project — shown on Layer 2 (draggable/resizable
  // there via their own l2_* columns; the basic fetch always works).
  const { data: noteRows } = await supabase
    .from("notes")
    .select("id, node_id, body")
    .eq("project_id", id)
    .is("deleted_at", null);
  const notes: L2NoteItem[] = ((noteRows ?? []) as { id: string; node_id: string | null; body: string | null }[])
    .filter((n) => (n.body ?? "").trim() !== "")
    .map((n) => ({ id: n.id, nodeId: n.node_id, body: n.body ?? "", x: null as number | null, y: null as number | null, w: null as number | null, code: null as string | null }));
  // Layer-2 note position/size (separate tolerant query — later migration).
  {
    const { data: layoutRows, error: layoutErr } = await supabase
      .from("notes")
      .select("id, l2_x, l2_y, l2_w")
      .eq("project_id", id)
      .is("deleted_at", null);
    if (!layoutErr) {
      const byId = new Map(((layoutRows ?? []) as { id: string; l2_x: number | null; l2_y: number | null; l2_w: number | null }[]).map((r) => [r.id, r]));
      for (const n of notes) {
        const r = byId.get(n.id);
        if (r) {
          n.x = r.l2_x;
          n.y = r.l2_y;
          n.w = r.l2_w;
        }
      }
    }
  }
  // Note Pantone codes (column from supabase/pantone-codes.sql). Tolerant.
  {
    const { data: codeRows, error: codeErr } = await supabase.from("notes").select("id, pantone_code").eq("project_id", id).is("deleted_at", null);
    if (!codeErr) {
      const byId = new Map(((codeRows ?? []) as { id: string; pantone_code: string | null }[]).map((r) => [r.id, r.pantone_code]));
      for (const n of notes) n.code = byId.get(n.id) ?? null;
    }
  }

  // Can this user edit (owner/member) or only read (viewer)?
  const { data: mem } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  const canEdit = mem?.role === "owner" || mem?.role === "member";

  const desktop = (
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
          {ambitions.length > 0 ? ` · ${ambitions.length} planned` : ""}
        </span>
      </header>

      <Layer2Canvas
        nodes={nodes}
        demoted={demoted}
        ambitions={ambitions}
        bubbles={bubbles}
        notes={notes}
        tagColors={tagColors}
        tagCatalog={tagCatalog}
        canEdit={canEdit}
        projectId={project.id}
        projectName={name}
      />
    </main>
  );

  // ≤640px → vertical mobile timeline; >640px → the desktop canvas above.
  return (
    <>
      <ResponsiveSwitch
        desktop={desktop}
        mobile={<MobileProjectTimeline name={name} nodes={nodes} bubbles={bubbles} notes={notes} ambitions={ambitions} tagColors={tagColors} />}
      />
      <GenerationToast />
    </>
  );
}
