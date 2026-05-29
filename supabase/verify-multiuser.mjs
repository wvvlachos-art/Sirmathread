// Read-only data-integrity check for the multi-user migration + features.
// Uses the service-role key (bypasses RLS) to inspect the whole database.
//   $env:NODE_OPTIONS="--use-system-ca"
//   node --env-file=.env.local supabase/verify-multiuser.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const count = async (table, filter) => {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count: c, error } = await q;
  if (error) return `ERR(${error.message})`;
  return c ?? 0;
};

const pass = (b) => (b ? "PASS ✅" : "FAIL ❌");
const ORG_TABLES = ["projects", "nodes", "notes", "bubbles", "ambitions", "tag_categories", "tag_values"];

console.log("\n=== Multi-user data integrity ===\n");

// 1. No content row is missing a workspace.
let allStamped = true;
for (const t of ORG_TABLES) {
  const missing = await count(t, (q) => q.is("organization_id", null));
  if (missing !== 0) allStamped = false;
  console.log(`  ${t.padEnd(16)} missing org_id: ${missing}`);
}
console.log(`  -> every content row has a workspace: ${pass(allStamped)}\n`);

// 2. Users / orgs / owner memberships line up.
const users = await count("profiles");
const orgs = await count("organizations");
const owners = await count("memberships", (q) => q.eq("role", "owner"));
console.log(`  profiles=${users}  organizations=${orgs}  owner-memberships=${owners}`);
console.log(`  -> one workspace + owner per user: ${pass(users === orgs && orgs === owners)}\n`);

// 3. display_name backfilled on every profile.
const { data: profs } = await supabase.from("profiles").select("display_name");
const named = (profs ?? []).filter((p) => p.display_name).length;
console.log(`  profiles with display_name: ${named}/${profs?.length ?? 0}  ${pass(named === (profs?.length ?? 0))}\n`);

// 4. Feature tables present + populated as expected.
console.log(`  activity_log entries: ${await count("activity_log")}`);
console.log(`  pending_invites: ${await count("pending_invites")}`);
console.log(`  memberships (all roles): ${await count("memberships")}\n`);

// 5. Every project's workspace is owned by that project's user (no cross-wires).
const { data: projRows } = await supabase
  .from("projects")
  .select("user_id, organizations(created_by_user_id)");
const mismatched = (projRows ?? []).filter(
  (p) => p.organizations && p.organizations.created_by_user_id !== p.user_id
).length;
console.log(`  projects whose workspace owner != project user: ${mismatched}  ${pass(mismatched === 0)}`);
console.log("\nNote: true RLS isolation (user A can't see user B's data) must be");
console.log("confirmed in-app while signed in as each user — service role bypasses RLS.\n");
