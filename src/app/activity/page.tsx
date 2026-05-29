import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrg } from "../members/orgContext";
import { fetchActivityPage } from "./query";
import ActivityClient from "./ActivityClient";

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getActiveOrg(supabase, user.id);
  if (!org) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-paper text-center text-ink">
        <p className="text-lg font-medium">No workspace found.</p>
        <a href="/layer1" className="mt-2 text-sm text-oxblood hover:underline">← Back to board</a>
      </main>
    );
  }

  const { items, nextCursor } = await fetchActivityPage(supabase, org.id, null);

  return (
    <main className="min-h-screen bg-paper">
      <ActivityClient
        orgId={org.id}
        orgName={org.name}
        currentUserId={user.id}
        initialItems={items}
        initialCursor={nextCursor}
      />
    </main>
  );
}
