// Seeds the 5 default tag categories (+ sample values) and tags a few sample
// projects/nodes so tags are visible immediately. Safe + re-runnable.
//
// Run with:  node --env-file=.env.local supabase/seed-tags.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const EMAIL = "wv.vlachos@gmail.com";
const DEFAULT_NAMES = ["Users", "Client", "Work type", "Spam", "Not important"];

const { data: list } = await sb.auth.admin.listUsers();
const user = list.users.find((u) => u.email === EMAIL);
if (!user) throw new Error(`No user ${EMAIL}`);
const userId = user.id;

// Reset the default categories (cascades to their values + assignments).
await sb.from("tag_categories").delete().eq("user_id", userId).in("name", DEFAULT_NAMES);

async function category(name, sortOrder, isHide) {
  const { data, error } = await sb
    .from("tag_categories")
    .insert({ user_id: userId, name, sort_order: sortOrder, is_default: true, is_hide_filter: !!isHide })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
async function value(categoryId, val, color) {
  const { data, error } = await sb
    .from("tag_values")
    .insert({ category_id: categoryId, value: val, color })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

const usersCat = await category("Users", 0, false);
const clientCat = await category("Client", 1, false);
const workCat = await category("Work type", 2, false);
const spamCat = await category("Spam", 3, true);
const notImpCat = await category("Not important", 4, true);

const vDinos = await value(usersCat, "Dinos", "#f43f5e");
const vWilliam = await value(usersCat, "William", "#8b5cf6");
const vMaria = await value(usersCat, "Maria", "#ec4899");
const vAcme = await value(clientCat, "Acme", "#f59e0b");
const vGlobex = await value(clientCat, "Globex", "#06b6d4");
const vInternal = await value(clientCat, "Internal", "#22c55e");
const vDesign = await value(workCat, "Design", "#a855f7");
const vDev = await value(workCat, "Dev", "#3b82f6");
const vAdmin = await value(workCat, "Admin", "#eab308");
await value(spamCat, "Junk", "#71717a");
await value(notImpCat, "Low priority", "#52525b");

// Tag a few sample projects.
const { data: projects } = await sb
  .from("projects")
  .select("id, display_name")
  .eq("user_id", userId)
  .like("gmail_label_name", "SAMPLE/%")
  .order("created_at");

const assignProject = async (projectId, tagValueId) =>
  sb.from("project_tag_values").upsert({ project_id: projectId, tag_value_id: tagValueId });

if (projects && projects.length >= 3) {
  await assignProject(projects[0].id, vAcme);
  await assignProject(projects[0].id, vDesign);
  await assignProject(projects[0].id, vDinos);
  await assignProject(projects[1].id, vGlobex);
  await assignProject(projects[1].id, vDev);
  await assignProject(projects[2].id, vInternal);

  // Tag a couple of nodes in the first project.
  const { data: nodes } = await sb
    .from("nodes")
    .select("id")
    .eq("project_id", projects[0].id)
    .limit(2);
  if (nodes) {
    for (const n of nodes) {
      await sb.from("node_tag_values").upsert({ node_id: n.id, tag_value_id: vWilliam });
    }
  }
  console.log(`Tagged projects: ${projects[0].display_name}, ${projects[1].display_name}, ${projects[2].display_name}`);
}

console.log("Seeded 5 categories + sample values.");
