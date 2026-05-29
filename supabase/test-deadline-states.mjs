// One-off helper: put 6 specific tutorial nodes into known deadline states so
// every variation (no-deadline / stage 1-4 / overdue / completed) is visible in
// one screenshot. Intended for visual verification of the perimeter-deadline
// system. Safe to re-run.
//
// Usage:
//   $env:NODE_OPTIONS="--use-system-ca"
//   node --env-file=.env.local supabase/test-deadline-states.mjs <email>

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const email = args[0];
if (!email) {
  console.error("Usage: node supabase/test-deadline-states.mjs <email>");
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const DAY = 86_400_000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const date = (ms) => iso(ms).slice(0, 10);

const { data: list, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) throw listErr;
const user = list.users.find((u) => u.email === email);
if (!user) throw new Error(`No user found with email ${email}`);

// 6 test cases — each one targets a specific node by project name + node title.
// elapsed_fraction in [0.00, 0.25) → stage 1, etc; past deadline → stage 4.
const cases = [
  // Stage 1: just set (10/100 = 0.10)
  { project: "Acme Beverages — Spring Campaign", node: "Brief received",
    set_at: now - 10 * DAY, deadline: now + 90 * DAY, done: false, label: "stage 1" },
  // Stage 2: 35/100 = 0.35
  { project: "Acme Beverages — Spring Campaign", node: "Kick-off call",
    set_at: now - 35 * DAY, deadline: now + 65 * DAY, done: false, label: "stage 2" },
  // Stage 3: 60/100 = 0.60
  { project: "Vox Athletic — Brand Refresh", node: "Discovery workshop",
    set_at: now - 60 * DAY, deadline: now + 40 * DAY, done: false, label: "stage 3" },
  // Stage 4 on a TAGGED node (Press list locked has Jordan + Digital)
  { project: "Nimbus Tech — Product Launch", node: "Press list locked",
    set_at: now - 85 * DAY, deadline: now + 15 * DAY, done: false, label: "stage 4 (tagged)" },
  // Overdue
  { project: "Nimbus Tech — Product Launch", node: "Positioning workshop",
    set_at: now - 95 * DAY, deadline: now - 5 * DAY, done: false, label: "overdue" },
  // Completed-with-deadline on the 4-tag node (Dealer approvals)
  { project: "Polaris Auto — Dealer Co-op", node: "Dealer approvals",
    set_at: now - 20 * DAY, deadline: now + 30 * DAY, done: true, label: "completed + deadline (4-tag)" },
];

for (const c of cases) {
  const { data: projects } = await sb
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("display_name", c.project);
  if (!projects?.length) {
    console.warn(`  - skip: project not found: ${c.project}`);
    continue;
  }
  const projectId = projects[0].id;
  const { data: nodes } = await sb
    .from("nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("display_label", c.node);
  if (!nodes?.length) {
    console.warn(`  - skip: node not found: ${c.project} / ${c.node}`);
    continue;
  }
  const { error } = await sb
    .from("nodes")
    .update({
      deadline: date(c.deadline),
      deadline_set_at: iso(c.set_at),
      done: c.done,
    })
    .eq("id", nodes[0].id);
  if (error) {
    console.error(`  ! failed: ${c.label}: ${error.message}`);
  } else {
    console.log(`  ✓ ${c.label}: ${c.project} / ${c.node}`);
  }
}
console.log("Done.");
