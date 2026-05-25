// Adds sample projects/emails/nodes so we can see Layer 1 take shape before
// real Gmail data exists. Safe + re-runnable: it first removes any existing
// projects whose label starts with "SAMPLE/" for this user, then re-adds them.
//
// Run with:  node --env-file=.env.local supabase/seed-sample.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const EMAIL = "wv.vlachos@gmail.com";

// Find the user id for the account we want to attach sample data to.
const { data: list, error: listErr } = await sb.auth.admin.listUsers();
if (listErr) throw listErr;
const user = list.users.find((u) => u.email === EMAIL);
if (!user) throw new Error(`No user found with email ${EMAIL}`);
const userId = user.id;
console.log("Seeding sample data for user:", EMAIL, userId);

// Remove previous sample projects (cascades to their emails + nodes).
await sb.from("projects").delete().eq("user_id", userId).like("gmail_label_name", "SAMPLE/%");

// Helper: insert one project with its emails+nodes.
async function makeProject({ label, name, color, deadline = null, deadlineSetAt = null, nodes }) {
  const { data: project, error: pErr } = await sb
    .from("projects")
    .insert({
      user_id: userId,
      gmail_label_name: label,
      display_name: name,
      color,
      deadline,
      deadline_set_at: deadlineSetAt,
    })
    .select("id")
    .single();
  if (pErr) throw pErr;

  let i = 0;
  for (const n of nodes) {
    const { data: email, error: eErr } = await sb
      .from("emails")
      .insert({
        project_id: project.id,
        gmail_message_id: `sample-${project.id}-${i}`,
        subject: n.subject,
        date_sent: n.date,
        is_node: true,
        from_addr: "someone@example.com",
      })
      .select("id")
      .single();
    if (eErr) throw eErr;

    const { error: nErr } = await sb.from("nodes").insert({
      email_id: email.id,
      project_id: project.id,
      position_index: i,
      deadline: n.deadline ?? null,
      deadline_set_at: n.deadlineSetAt ?? null,
      done: n.done ?? false,
    });
    if (nErr) throw nErr;
    i++;
  }
  console.log(`  + ${name} (${nodes.length} nodes)`);
}

await makeProject({
  label: "SAMPLE/Acme Website Redesign",
  name: "Acme Website Redesign",
  color: "#6366f1",
  nodes: [
    { subject: "Kickoff & scope agreed", date: "2026-02-10" },
    { subject: "Wireframes approved", date: "2026-03-05" },
    { subject: "Homepage build underway", date: "2026-03-28" },
    { subject: "Client feedback round 1", date: "2026-04-15" },
    { subject: "Launch plan drafted", date: "2026-05-12" },
  ],
});

await makeProject({
  label: "SAMPLE/Q3 Hiring",
  name: "Q3 Hiring",
  color: "#10b981",
  deadline: "2026-06-30",
  deadlineSetAt: "2026-04-01",
  nodes: [
    { subject: "Job spec finalized", date: "2026-04-02" },
    { subject: "First interviews", date: "2026-04-20" },
    // Overdue deadline -> should render fully red:
    { subject: "Shortlist due", date: "2026-05-10", deadline: "2026-05-20", deadlineSetAt: "2026-04-20" },
    // Mid-runway deadline -> partial red fill:
    { subject: "Offer drafting", date: "2026-05-22", deadline: "2026-07-10", deadlineSetAt: "2026-05-01" },
  ],
});

await makeProject({
  label: "SAMPLE/Office Move",
  name: "Office Move",
  color: "#f59e0b",
  nodes: [
    { subject: "Lease signed", date: "2026-01-15" },
    { subject: "Floorplan finalized", date: "2026-02-28" },
    // Completed -> should render muted gray:
    { subject: "Movers booked", date: "2026-04-10", done: true },
  ],
});

console.log("Done.");
