"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setActiveOrg } from "./actions";

type Org = { id: string; name: string; role: "owner" | "member" | "viewer" };

export default function AccountMenu({
  email,
  displayName,
  activeOrgId,
  orgs,
}: {
  email: string;
  displayName: string;
  activeOrgId: string | null;
  orgs: Org[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const initial = (displayName || email || "?").slice(0, 1).toUpperCase();
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  const switchTo = async (orgId: string) => {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    const res = await setActiveOrg(orgId);
    setSwitching(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setOpen(false);
    // Reload the board against the newly-active workspace.
    router.push("/layer1");
    router.refresh();
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  const itemCls = "block w-full rounded-md px-2 py-1.5 text-left text-sm text-ink hover:bg-paper";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-oxblood text-sm font-medium text-paper hover:bg-oxblood-dark"
        title={email}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-hairline bg-paper-surface p-2 shadow-xl">
            <div className="px-2 py-1.5">
              <div className="truncate text-sm font-medium text-ink">{displayName}</div>
              <div className="truncate text-xs text-muted">{email}</div>
            </div>

            <div className="my-1 border-t border-hairline" />

            <div className="px-2 py-1 text-xs uppercase tracking-wide text-muted">Workspace</div>
            <div className="max-h-48 overflow-auto">
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => switchTo(o.id)}
                  disabled={switching}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper disabled:opacity-60 ${
                    o.id === activeOrgId ? "text-ink" : "text-muted"
                  }`}
                >
                  <span className="truncate">{o.name}</span>
                  {o.id === activeOrgId && <span className="ml-2 text-xs text-oxblood">● active</span>}
                </button>
              ))}
            </div>

            <div className="my-1 border-t border-hairline" />

            <Link href="/members" className={itemCls} onClick={() => setOpen(false)}>
              Members
            </Link>
            <Link href="/activity" className={itemCls} onClick={() => setOpen(false)}>
              Activity
            </Link>

            <div className="my-1 border-t border-hairline" />

            <button onClick={signOut} className={`${itemCls} text-oxblood`}>
              Sign out
            </button>

            {activeOrg && (
              <div className="px-2 pt-1 text-[10px] text-muted">
                You&apos;re a {activeOrg.role} here.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
