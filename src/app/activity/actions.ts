"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchActivityPage, type Cursor } from "./query";

// Load the next page of activity for a workspace. RLS guarantees the caller can
// only read activity for orgs they're a member of.
export async function loadActivityPage(orgId: string, cursor: Cursor) {
  const supabase = await createClient();
  return fetchActivityPage(supabase, orgId, cursor);
}
