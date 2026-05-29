// Create Layer-2 test projects (3, 8, 12, 20, 35 nodes) in a user's personal
// workspace, so the serpentine layout can be eyeballed/screenshotted. The nodes
// are spread across time with some texture (for Phase 3 spacing too).
//
//   $env:NODE_OPTIONS="--use-system-ca"
//   node --env-file=.env.local supabase/seed-layer2-test.mjs <your-email>
//
// Clean up later from Layer 1 (delete each "L2 test —" project) or via SQL:
//   delete from projects where display_name like 'L2 test —%';
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node --env-file=.env.local supabase/seed-layer2-test.mjs <email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const COUNTS = [3, 8, 12, 20, 35];
const DAY = 86_400_000;

const { data: prof } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
if (!prof) {
  console.error(`No profile found for ${email}`);
  process.exit(1);
}
const userId = prof.id;

const { data: org } = await supabase
  .from("organizations")
  .select("id, name")
  .eq("created_by_user_id", userId)
  .limit(1)
  .maybeSingle();
if (!org) {
  console.error("No personal workspace found for that user.");
  process.exit(1);
}
console.log(`Seeding into "${org.name}" (${email})\n`);

for (const count of COUNTS) {
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      organization_id: org.id,
      created_by_user_id: userId,
      display_name: `L2 test — ${count} nodes`,
      origin: "manual",
      gmail_label_name: null,
    })
    .select("id")
    .single();
  if (pErr || !project) {
    console.error(`  ${count} nodes: project insert failed:`, pErr?.message);
    continue;
  }
  // Spread `count` nodes across the past, with uneven gaps for time texture.
  const now = Date.now();
  let offset = count * 6; // days ago for the earliest node
  const rows = [];
  for (let i = 0; i < count; i++) {
    const gap = [0.5, 1, 2, 3, 7, 14, 30][i % 7]; // varied gaps
    offset -= gap;
    rows.push({
      project_id: project.id,
      organization_id: org.id,
      created_by_user_id: userId,
      display_label: `Step ${i + 1}`,
      node_date: new Date(now - offset * DAY).toISOString(),
      origin: "manual",
      state: "promoted",
      position_index: i,
    });
  }
  const { error: nErr } = await supabase.from("nodes").insert(rows);
  console.log(`  ${count} nodes: ${nErr ? "FAILED " + nErr.message : "ok"}`);
}
console.log("\nDone. Open each from Layer 1 → project menu → Open detail view.");
