// ============================================================================
// One-shot DATA backup — exports every table's rows to a timestamped JSON file
// under ./backups/. Read-only: it never writes to the database.
//
// Why: Free-tier Supabase has no automatic backups, and there's no pg_dump /
// Supabase CLI installed here. This uses the service-role key already in
// .env.local to read every row (bypassing RLS) and save a local snapshot.
// The schema itself is already version-controlled in supabase/*.sql, so a data
// snapshot is the missing piece needed before the Phase 2 data migration.
//
// Run:
//   $env:NODE_OPTIONS="--use-system-ca"
//   node --env-file=.env.local supabase/backup-data.mjs
// ============================================================================
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Every data-bearing table. Missing ones (e.g. a *_tag_values table that was
// never created) are skipped gracefully rather than aborting the backup.
const TABLES = [
  "profiles",
  "user_preferences",
  "projects",
  "emails",
  "nodes",
  "notes",
  "bubbles",
  "ambitions",
  "tag_categories",
  "tag_values",
  "project_tag_values",
  "node_tag_values",
  "ambition_tag_values",
  "organizations",
  "memberships",
  "pending_invites",
  "activity_log",
];

// Pull a whole table in pages of 1000 so we never hit a row cap.
async function dumpTable(name) {
  const all = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(name).select("*").range(from, from + PAGE - 1);
    if (error) return { error: error.message };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows: all };
}

const takenAt = new Date().toISOString();
const out = { takenAt, source: url, tables: {} };
const counts = {};
let hadError = false;

for (const t of TABLES) {
  const res = await dumpTable(t);
  if (res.error) {
    counts[t] = `(skipped: ${res.error})`;
    out.tables[t] = { error: res.error };
    if (!/does not exist|could not find/i.test(res.error)) hadError = true;
  } else {
    counts[t] = res.rows.length;
    out.tables[t] = res.rows;
  }
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `backup-${takenAt.replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify(out, null, 2), "utf8");

console.log("\n=== Backup complete ===");
console.log("Taken at:", takenAt);
console.log("Saved to:", file);
console.log("\nRow counts per table:");
for (const [t, c] of Object.entries(counts)) console.log(`  ${t.padEnd(22)} ${c}`);
if (hadError) {
  console.error("\nWARNING: one or more tables errored for a reason other than 'missing'. Review above before proceeding.");
  process.exit(2);
}
