// Adds 20 dummy projects (activity spread across the last ~6 months) so we can
// see how Layer 1 behaves at realistic scale before real Gmail data exists.
// Safe + re-runnable: first removes any existing "SAMPLE/" projects for this
// user, then recreates them deterministically.
//
// Run with:  node --env-file=.env.local supabase/seed-sample.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const EMAIL = "wv.vlachos@gmail.com";
const DAY = 86_400_000;

// Deterministic pseudo-random so re-runs produce the same layout.
let seed = 12345;
const rand = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));
const isoDay = (msAgoFromToday) =>
  new Date(Date.now() - msAgoFromToday).toISOString().slice(0, 10);

const { data: list, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) throw listErr;
const user = list.users.find((u) => u.email === EMAIL);
if (!user) throw new Error(`No user found with email ${EMAIL}`);
const userId = user.id;
console.log("Seeding for:", EMAIL, userId);

await sb.from("projects").delete().eq("user_id", userId).like("gmail_label_name", "SAMPLE/%");

const NAMES = [
  "Acme Website Redesign", "Q3 Hiring", "Office Move", "Mobile App v2",
  "Brand Refresh", "Supplier Negotiation", "Annual Audit", "Customer Portal",
  "Marketing Campaign", "Data Migration", "Security Review", "Partnership: Globex",
  "Product Launch", "Cost Reduction", "Onboarding Revamp", "API Integration",
  "Warehouse Setup", "Investor Update", "Compliance 2026", "Support Overhaul",
];
const COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899",
  "#14b8a6", "#f97316", "#3b82f6", "#a855f7", "#22c55e", "#eab308", "#0ea5e9",
  "#f43f5e", "#84cc16", "#d946ef", "#64748b", "#fb7185", "#2dd4bf",
];
const SUBJECTS = [
  "Kickoff", "Scope agreed", "First draft", "Review meeting", "Decision made",
  "Revisions sent", "Milestone reached", "Blocker raised", "Sign-off", "Follow-up",
];

let totalNodes = 0;

for (let p = 0; p < NAMES.length; p++) {
  const numNodes = randInt(3, 7);

  // Pick sorted dates within the last ~180 days.
  const offsets = [];
  for (let k = 0; k < numNodes; k++) offsets.push(randInt(2, 180));
  offsets.sort((a, b) => b - a); // oldest first
  const dates = offsets.map((o) => isoDay(o * DAY));
  const minDate = dates[0];
  const maxDate = dates[dates.length - 1];

  const projectDone = rand() < 0.1; // ~10% fully done
  const archived = p === 5 || p === 12; // a couple archived to test "show archived"
  const hasProjectDeadline = rand() < 0.3;

  const { data: project, error: pErr } = await sb
    .from("projects")
    .insert({
      user_id: userId,
      gmail_label_name: `SAMPLE/${NAMES[p]}`,
      display_name: NAMES[p],
      color: COLORS[p % COLORS.length],
      done: projectDone,
      state: archived ? "archived" : "active",
      deadline: hasProjectDeadline ? isoDay(-randInt(15, 120) * DAY) : null,
      deadline_set_at: hasProjectDeadline ? isoDay(randInt(10, 50) * DAY) : null,
      created_at: `${minDate}T09:00:00Z`,
      updated_at: `${maxDate}T09:00:00Z`,
      last_activity_at: `${maxDate}T09:00:00Z`,
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  for (let i = 0; i < numNodes; i++) {
    const { data: email, error: eErr } = await sb
      .from("emails")
      .insert({
        project_id: project.id,
        gmail_message_id: `sample-${project.id}-${i}`,
        subject: SUBJECTS[i % SUBJECTS.length],
        date_sent: `${dates[i]}T09:00:00Z`,
        is_node: true,
        from_addr: "someone@example.com",
      })
      .select("id")
      .single();
    if (eErr) throw eErr;

    const isLast = i === numNodes - 1;
    const nodeHasDeadline = !projectDone && rand() < 0.25;

    const { error: nErr } = await sb.from("nodes").insert({
      email_id: email.id,
      project_id: project.id,
      position_index: i,
      done: isLast && rand() < 0.2,
      deadline: nodeHasDeadline ? isoDay(-randInt(5, 90) * DAY) : null,
      deadline_set_at: nodeHasDeadline ? isoDay(randInt(20, 60) * DAY) : null,
    });
    if (nErr) throw nErr;
    totalNodes++;
  }
}

console.log(`Done. Created ${NAMES.length} projects, ${totalNodes} nodes.`);
