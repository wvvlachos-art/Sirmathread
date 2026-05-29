// Manually (re-)seed the 10 tutorial projects + nodes + ambitions + notes +
// tag assignments for an existing user.
//
// Run from the project root (Windows PowerShell):
//   $env:NODE_OPTIONS="--use-system-ca"
//   node --env-file=.env.local supabase/seed-tutorial.mjs <email>
//
// On every run: WIPES the user's existing origin='tutorial' projects (cascades
// to their nodes, notes, ambitions, and tag joins), then re-inserts them
// fresh. Tag categories/values are reused by name where present.
//
// Mirrors the data + logic of src/lib/onboarding/{tutorialContent,seedTutorial}.ts
// — kept inline here so this script is plain Node with no TS build step.

import { createClient } from "@supabase/supabase-js";

const SPINE_PALETTE = [
  "#8a9a72", "#c2622a", "#b8902f", "#5a7d8c",
  "#8a5a6f", "#9c6b4a", "#6b8e6b", "#a8503a",
];

const TUTORIAL_TAG_CATEGORIES = [
  {
    name: "Discipline",
    isHide: false,
    values: [
      { value: "Brand", color: "#8a5a6f" },
      { value: "Campaign", color: "#c2622a" },
      { value: "Digital", color: "#5a7d8c" },
      { value: "Production", color: "#9c6b4a" },
    ],
  },
  {
    name: "Team lead",
    isHide: false,
    values: [
      { value: "Maya", color: "#8a9a72" },
      { value: "Jordan", color: "#b8902f" },
      { value: "Sam", color: "#6b8e6b" },
    ],
  },
  {
    name: "Spam",
    isHide: true,
    values: [{ value: "Junk", color: "#71717a" }],
  },
  {
    name: "Not important",
    isHide: true,
    values: [{ value: "Low priority", color: "#52525b" }],
  },
];

const TUTORIAL_PROJECTS = [
  {
    name: "Acme Beverages — Spring Campaign",
    tags: ["Campaign", "Maya"],
    ambitions: [{ title: "Wrap report due", dayOffset: 20 }],
    note: {
      body:
        "Welcome to Sirmathread. Each row is a project; each square is a milestone. " +
        "When you're done with one, click the project name on the left to Archive it " +
        "(hides it) or Delete it permanently. Try it on this project once you're done exploring.",
      yOffset: -82,
      anchorDayOffset: 5,
    },
    nodes: [
      { title: "Brief received", dayOffset: -84 },
      { title: "Kick-off call", dayOffset: -78 },
      { title: "Concepts presented", dayOffset: -60 },
      { title: "Round 1 feedback", dayOffset: -45 },
      { title: "Production sign-off", dayOffset: -22, tags: ["Maya"] },
      { title: "Final files delivered", dayOffset: -8 },
    ],
  },
  {
    name: "Vox Athletic — Brand Refresh",
    tags: ["Brand", "Maya"],
    note: {
      body:
        "Notes are amber boxes like this one, pinned to a project's latest milestone. " +
        "To add your own: click the + next to any project, choose Note, and drop in some " +
        "text. Drag a note anywhere — your placement is saved.",
      yOffset: -82,
      anchorDayOffset: 5,
    },
    nodes: [
      { title: "Discovery workshop", dayOffset: -72 },
      { title: "Mood boards", dayOffset: -58 },
      { title: "Logo direction picked", dayOffset: -40 },
      { title: "Guidelines draft", dayOffset: -18 },
      { title: "Stakeholder review", dayOffset: -3 },
    ],
  },
  {
    name: "Nimbus Tech — Product Launch",
    tags: ["Campaign", "Digital", "Jordan"],
    ambitions: [{ title: "Post-launch review", dayOffset: 12, isDeadline: true }],
    note: {
      body:
        "Top toolbar: Arrange sorts projects (by deadline, most recent, etc.). Filters " +
        "narrows what you see by status or tag. Find — top-left — searches every project " +
        "and milestone by name. Hit Enter from anywhere to open it.",
      yOffset: -86,
      anchorDayOffset: 6,
    },
    nodes: [
      { title: "Positioning workshop", dayOffset: -68 },
      { title: "Messaging draft", dayOffset: -54 },
      { title: "Launch deck v1", dayOffset: -38 },
      { title: "Press list locked", dayOffset: -20, tags: ["Jordan", "Digital"] },
      { title: "Embargo lifts", dayOffset: -5, tags: ["Jordan"] },
    ],
  },
  {
    name: "Tessera Hotels — Summer Push",
    tags: ["Campaign", "Jordan"],
    ambitions: [{ title: "Campaign goes live", dayOffset: 8, isDeadline: true }],
    nodes: [
      { title: "Brief from CMO", dayOffset: -76 },
      { title: "Audience workshop", dayOffset: -62 },
      { title: "Creative concepts", dayOffset: -44 },
      { title: "Media plan signed", dayOffset: -25, tags: ["Jordan"] },
    ],
  },
  {
    name: "Helix Health — Awareness Campaign",
    tags: ["Campaign", "Sam"],
    ambitions: [{ title: "Compliance final approval", dayOffset: 18, isDeadline: true }],
    nodes: [
      { title: "Compliance kickoff", dayOffset: -88 },
      { title: "Script v1", dayOffset: -70 },
      { title: "Medical-legal review", dayOffset: -52 },
      { title: "Shoot day", dayOffset: -30 },
      { title: "Cut delivered", dayOffset: -11 },
    ],
  },
  {
    name: "Polaris Auto — Dealer Co-op",
    tags: ["Production", "Jordan"],
    ambitions: [
      { title: "Rollout begins", dayOffset: 6, isDeadline: true },
      { title: "All dealers onboarded", dayOffset: 25 },
    ],
    nodes: [
      { title: "Co-op brief", dayOffset: -64 },
      { title: "Regional asset list", dayOffset: -48 },
      { title: "First proof round", dayOffset: -28 },
      { title: "Dealer approvals", dayOffset: -10, tags: ["Jordan", "Production", "Maya", "Sam"] },
    ],
  },
  {
    name: "Riveroak Estates — Listings Refresh",
    tags: ["Production", "Sam"],
    nodes: [
      { title: "Photography brief", dayOffset: -56 },
      { title: "Shoot scheduled", dayOffset: -42 },
      { title: "Copy edits", dayOffset: -19 },
    ],
  },
  {
    name: "Quill Press — Catalogue Q3",
    tags: ["Production", "Sam"],
    ambitions: [
      { title: "Sample copies in", dayOffset: 3 },
      { title: "Distribution drop", dayOffset: 18, isDeadline: true },
    ],
    nodes: [
      { title: "Title list received", dayOffset: -82 },
      { title: "Cover treatments", dayOffset: -66 },
      { title: "Layout review", dayOffset: -50 },
      { title: "Proofread", dayOffset: -32 },
      { title: "To printer", dayOffset: -14 },
    ],
  },
  {
    name: "Sundara Foods — Packaging Redesign",
    tags: ["Brand", "Maya"],
    ambitions: [{ title: "Production handover", dayOffset: 10 }],
    nodes: [
      { title: "Range audit", dayOffset: -74 },
      { title: "Concept directions", dayOffset: -58 },
      { title: "Shelf test", dayOffset: -36 },
      { title: "Production artwork", dayOffset: -12, tags: ["Maya"] },
    ],
  },
  {
    name: "Boréal Outdoor — Seasonal Lookbook",
    tags: ["Brand", "Sam"],
    ambitions: [
      { title: "Retail handoff", dayOffset: 14, isDeadline: true },
      { title: "Spring lookbook brief", dayOffset: 28 },
    ],
    nodes: [
      { title: "Trend research", dayOffset: -70 },
      { title: "Location scout", dayOffset: -54 },
      { title: "Shot list locked", dayOffset: -38 },
      { title: "Shoot week", dayOffset: -22 },
      { title: "Lookbook layout", dayOffset: -6 },
    ],
  },
];

const DAY_MS = 86_400_000;
const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
if (!email) {
  console.error("Usage: node supabase/seed-tutorial.mjs <email>");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: list, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) throw listErr;
const user = list.users.find((u) => u.email === email);
if (!user) throw new Error(`No user found with email ${email}`);
const userId = user.id;
console.log("Seeding tutorial for:", email, userId);

// Wipe any existing tutorial seed for this user (cascades to nodes, notes,
// ambitions, project_tag_values, node_tag_values, ambition_tag_values).
const { error: wipeErr } = await sb
  .from("projects")
  .delete()
  .eq("user_id", userId)
  .eq("origin", "tutorial");
if (wipeErr) throw wipeErr;

const tagValueIdByName = await ensureTagCatalog();

const now = Date.now();
const isoAt = (d) => new Date(now + d * DAY_MS).toISOString();

let totalNodes = 0;
let totalNotes = 0;
let totalAmbitions = 0;
let totalProjectTags = 0;
let totalNodeTags = 0;

for (let i = 0; i < TUTORIAL_PROJECTS.length; i++) {
  const tp = TUTORIAL_PROJECTS[i];
  const earliest = tp.nodes.reduce((m, n) => (n.dayOffset < m ? n.dayOffset : m), tp.nodes[0].dayOffset);
  const latest = tp.nodes.reduce((m, n) => (n.dayOffset > m ? n.dayOffset : m), tp.nodes[0].dayOffset);
  const spineColor = SPINE_PALETTE[i % SPINE_PALETTE.length];

  const { data: project, error: pErr } = await sb
    .from("projects")
    .insert({
      user_id: userId,
      display_name: tp.name,
      origin: "tutorial",
      gmail_label_name: null,
      spine_color: spineColor,
      spine_color_is_user_set: false,
      created_at: isoAt(earliest),
      updated_at: isoAt(latest),
      last_activity_at: isoAt(latest),
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  if (tp.tags?.length) {
    const rows = tp.tags
      .map((n) => tagValueIdByName.get(n))
      .filter(Boolean)
      .map((tag_value_id) => ({ project_id: project.id, tag_value_id }));
    if (rows.length) {
      const { error } = await sb.from("project_tag_values").insert(rows);
      if (error) throw error;
      totalProjectTags += rows.length;
    }
  }

  const sortedNodes = [...tp.nodes].sort((a, b) => a.dayOffset - b.dayOffset);
  const nodeRows = sortedNodes.map((n, idx) => ({
    project_id: project.id,
    display_label: n.title,
    node_date: isoAt(n.dayOffset),
    origin: "tutorial",
    state: "promoted",
    position_index: idx,
  }));
  const { data: insertedNodes, error: nErr } = await sb
    .from("nodes")
    .insert(nodeRows)
    .select("id, node_date");
  if (nErr) throw nErr;
  totalNodes += insertedNodes.length;

  const nodeTagRows = [];
  sortedNodes.forEach((n, idx) => {
    if (!n.tags?.length) return;
    for (const name of n.tags) {
      const tag_value_id = tagValueIdByName.get(name);
      if (tag_value_id) nodeTagRows.push({ node_id: insertedNodes[idx].id, tag_value_id });
    }
  });
  if (nodeTagRows.length) {
    const { error } = await sb.from("node_tag_values").insert(nodeTagRows);
    if (error) throw error;
    totalNodeTags += nodeTagRows.length;
  }

  if (tp.ambitions?.length) {
    const ambRows = tp.ambitions.map((a) => ({
      project_id: project.id,
      title: a.title,
      target_date: isoAt(a.dayOffset).slice(0, 10),
      is_deadline: !!a.isDeadline,
    }));
    const { error } = await sb.from("ambitions").insert(ambRows);
    if (error) throw error;
    totalAmbitions += ambRows.length;
  }

  if (tp.note) {
    const lastNode = insertedNodes.reduce((a, b) =>
      new Date(a.node_date).getTime() > new Date(b.node_date).getTime() ? a : b
    );
    const anchorT = new Date(lastNode.node_date).getTime();
    const { error: noteErr } = await sb.from("notes").insert({
      project_id: project.id,
      node_id: lastNode.id,
      body: tp.note.body,
      x: anchorT + tp.note.anchorDayOffset * DAY_MS,
      y: tp.note.yOffset,
    });
    if (noteErr) throw noteErr;
    totalNotes++;
  }
}

const { error: flagErr } = await sb
  .from("user_preferences")
  .update({ tutorial_seeded: true })
  .eq("user_id", userId);
if (flagErr) throw flagErr;

console.log(
  `Done. ${TUTORIAL_PROJECTS.length} projects, ${totalNodes} nodes, ` +
    `${totalAmbitions} ambitions, ${totalNotes} notes, ` +
    `${totalProjectTags} project tags, ${totalNodeTags} node tags.`
);

// ----- helpers --------------------------------------------------------------

async function ensureTagCatalog() {
  const out = new Map();

  const { data: existingCats } = await sb
    .from("tag_categories")
    .select("id, name, sort_order")
    .eq("user_id", userId);
  const catByName = new Map();
  let maxSort = -1;
  for (const c of existingCats ?? []) {
    catByName.set(c.name, { id: c.id, sort_order: c.sort_order });
    if (c.sort_order > maxSort) maxSort = c.sort_order;
  }

  for (const cat of TUTORIAL_TAG_CATEGORIES) {
    let categoryId = catByName.get(cat.name)?.id;
    if (!categoryId) {
      maxSort += 1;
      const { data, error } = await sb
        .from("tag_categories")
        .insert({
          user_id: userId,
          name: cat.name,
          sort_order: maxSort,
          is_default: false,
          is_hide_filter: cat.isHide,
        })
        .select("id")
        .single();
      if (error) throw error;
      categoryId = data.id;
    }

    const { data: existingVals } = await sb
      .from("tag_values")
      .select("id, value")
      .eq("category_id", categoryId);
    const valById = new Map();
    for (const v of existingVals ?? []) valById.set(v.value, v.id);

    for (const v of cat.values) {
      let valueId = valById.get(v.value);
      if (!valueId) {
        const { data, error } = await sb
          .from("tag_values")
          .insert({ category_id: categoryId, value: v.value, color: v.color })
          .select("id")
          .single();
        if (error) throw error;
        valueId = data.id;
      }
      out.set(v.value, valueId);
    }
  }
  return out;
}
