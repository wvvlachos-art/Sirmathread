"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteMember, cancelInvite, removeMember, changeRole } from "./actions";

export type MemberRow = {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "member" | "viewer";
  joinedAt: string;
};
export type InviteRow = {
  email: string;
  role: "member" | "viewer";
  expiresAt: string;
  token: string;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

export default function MembersClient({
  orgId,
  orgName,
  isOwner,
  currentUserId,
  members,
  invites,
  memberLimit,
}: {
  orgId: string;
  orgName: string;
  isOwner: boolean;
  currentUserId: string;
  members: MemberRow[];
  invites: InviteRow[];
  memberLimit: number;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const used = members.length + invites.length;
  const full = used >= memberLimit;

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLink(null);
    setBusy(true);
    const res = await inviteMember(orgId, email, role);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setLink(res.link ?? null);
    setEmail("");
    router.refresh();
  };

  const doRemove = async (userId: string) => {
    if (!confirm("Remove this member? Their content stays in the workspace.")) return;
    const res = await removeMember(orgId, userId);
    if (res.error) alert(res.error);
    else router.refresh();
  };

  const doRole = async (userId: string, next: "owner" | "member" | "viewer") => {
    const res = await changeRole(orgId, userId, next);
    if (res.error) alert(res.error);
    else router.refresh();
  };

  const doCancel = async (inviteEmail: string) => {
    const res = await cancelInvite(orgId, inviteEmail);
    if (res.error) alert(res.error);
    else router.refresh();
  };

  const roleBadge =
    "rounded-full border border-hairline px-2 py-0.5 text-xs capitalize text-pill-ink";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 text-ink">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="brand-serif text-2xl text-oxblood">Members</h1>
          <p className="text-sm text-muted">
            {orgName} · {members.length} member{members.length === 1 ? "" : "s"}
            {invites.length > 0 && `, ${invites.length} pending`} · limit {memberLimit}
          </p>
        </div>
        <a href="/layer1" className="text-sm text-muted hover:text-ink">
          ← Back to board
        </a>
      </div>

      {/* Invite form — owners only */}
      {isOwner && (
        <form
          onSubmit={submitInvite}
          className="mb-8 rounded-lg border border-hairline bg-paper-surface p-4"
        >
          <div className="mb-2 text-sm font-medium">Invite someone</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={full || busy}
              className="min-w-56 flex-1 rounded-md border border-hairline bg-paper px-3 py-2 text-sm outline-none disabled:opacity-60"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "viewer")}
              disabled={full || busy}
              className="rounded-md border border-hairline bg-paper px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="member">Member (can edit)</option>
              <option value="viewer">Viewer (read-only)</option>
            </select>
            <button
              type="submit"
              disabled={full || busy}
              className="rounded-md bg-oxblood px-4 py-2 text-sm font-medium text-paper hover:bg-oxblood-dark disabled:opacity-60"
            >
              {busy ? "…" : "Create invite"}
            </button>
          </div>
          {full && (
            <p className="mt-2 text-xs text-muted">
              Workspace is at its {memberLimit}-member limit.
            </p>
          )}
          {error && <p className="mt-2 text-sm text-oxblood">{error}</p>}
          {link && (
            <div className="mt-3 rounded-md border border-hairline bg-paper p-3">
              <p className="mb-1 text-xs text-muted">
                Invite created. Copy this link and send it to them (no email is sent automatically):
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-paper-surface px-2 py-1 text-xs">{link}</code>
                <button
                  type="button"
                  onClick={() => copy(link)}
                  className="rounded-md border border-hairline px-3 py-1 text-xs hover:bg-paper-surface"
                >
                  {copied ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Members table */}
      <div className="overflow-hidden rounded-lg border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-paper-surface text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              {isOwner && <th className="px-4 py-2" />}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.userId === currentUserId;
              return (
                <tr key={m.userId} className="border-t border-hairline">
                  <td className="px-4 py-2">
                    {m.displayName}
                    {isSelf && <span className="ml-1 text-xs text-muted">(you)</span>}
                  </td>
                  <td className="px-4 py-2 text-muted">{m.email}</td>
                  <td className="px-4 py-2">
                    {isOwner && !isSelf ? (
                      <select
                        value={m.role}
                        onChange={(e) => doRole(m.userId, e.target.value as "owner" | "member" | "viewer")}
                        className="rounded-md border border-hairline bg-paper px-2 py-1 text-xs capitalize"
                      >
                        <option value="owner">owner</option>
                        <option value="member">member</option>
                        <option value="viewer">viewer</option>
                      </select>
                    ) : (
                      <span className={roleBadge}>{m.role}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted">{fmtDate(m.joinedAt)}</td>
                  {isOwner && (
                    <td className="px-4 py-2 text-right">
                      {!isSelf && (
                        <button
                          onClick={() => doRemove(m.userId)}
                          className="text-xs text-oxblood hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-sm font-medium">Pending invites</h2>
          <div className="overflow-hidden rounded-lg border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-paper-surface text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Expires</th>
                  {isOwner && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.email} className="border-t border-hairline">
                    <td className="px-4 py-2">{inv.email}</td>
                    <td className="px-4 py-2"><span className={roleBadge}>{inv.role}</span></td>
                    <td className="px-4 py-2 text-muted">{fmtDate(inv.expiresAt)}</td>
                    {isOwner && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() =>
                            copy(`${window.location.origin}/accept-invite?token=${inv.token}`)
                          }
                          className="mr-3 text-xs text-ink hover:underline"
                        >
                          Copy link
                        </button>
                        <button
                          onClick={() => doCancel(inv.email)}
                          className="text-xs text-oxblood hover:underline"
                        >
                          Cancel
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
