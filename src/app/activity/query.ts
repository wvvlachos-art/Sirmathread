// Shared (non-action) activity-log reader. Keyset pagination on (created_at, id)
// so new entries arriving don't shift the pages — never loads everything at once.
import type { SupabaseClient } from "@supabase/supabase-js";

export const PAGE_SIZE = 50;

export type ActivityItem = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  description: string;
  createdAt: string;
};
export type Cursor = { createdAt: string; id: string } | null;

export async function fetchActivityPage(
  supabase: SupabaseClient,
  orgId: string,
  cursor: Cursor
): Promise<{ items: ActivityItem[]; nextCursor: Cursor }> {
  let q = supabase
    .from("activity_log")
    .select("id, actor_user_id, action_type, description, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (cursor) {
    q = q.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }
  const { data } = await q;
  const rows = (data ?? []) as {
    id: string;
    actor_user_id: string | null;
    action_type: string;
    description: string;
    created_at: string;
  }[];

  // Resolve actor display names (no direct FK to embed, so a second read).
  const ids = [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, email").in("id", ids);
    for (const p of (profs ?? []) as { id: string; display_name: string | null; email: string | null }[]) {
      nameById.set(p.id, p.display_name ?? p.email?.split("@")[0] ?? "Someone");
    }
  }

  const items: ActivityItem[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actor_user_id,
    actorName: r.actor_user_id ? nameById.get(r.actor_user_id) ?? "Someone" : "System",
    action: r.action_type,
    description: r.description,
    createdAt: r.created_at,
  }));

  const nextCursor: Cursor =
    items.length === PAGE_SIZE
      ? { createdAt: items[items.length - 1].createdAt, id: items[items.length - 1].id }
      : null;
  return { items, nextCursor };
}
