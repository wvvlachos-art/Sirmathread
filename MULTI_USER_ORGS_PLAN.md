# Multi-user organizations — task plan (single source of truth)

Foundational refactor: turn Sirmathread from single-user into shared
**workspaces (organizations)** with role-based access, invites, an immutable
activity log, and the ability to move projects between workspaces.

**Branch:** `multi-user-orgs` (off the post-`layer1-improvements`-merge `main`).
**Do NOT merge to `main` until William reviews Phase 5 screenshots and approves.**
Work phase by phase; **pause and report after each**; pause earlier if anything
looks risky or ambiguous.

---

## Goal

Multiple users share a workspace under one organization, with role-based access,
a soft cap of **5 members/org (configurable per-org, not hardcoded)**. Existing
single-user data migrates cleanly to each user's own **personal organization**.
Users can belong to multiple workspaces (their personal one + any company orgs
they're invited to) and can move projects between workspaces they're a member of.

Roles: **owner** (full control), **member** (can edit), **viewer** (read-only).

---

## Phases (pause + report after each)

- [x] **Phase 1 — Schema** (new tables, alter existing, RLS on *new* tables).
      DONE 2026-05-29: applied cleanly, no errors; verify passed (14 new
      columns, display_name backfilled, 4 new tables with RLS, existing
      per-user policies untouched = policy_count 1 each).
- [x] **Phase 2 — Data migration.** DONE 2026-05-29: Step A backfill verified
      (3 workspaces/owners, no orphans, A3=0); Step B applied NOT NULL + swapped
      RLS to per-workspace (incl. emails + tag-link tables); app reloaded and all
      data still visible. *Known gap until Phase 3:* app can't CREATE new items
      yet (not workspace-aware) — reads work.
      - BACKUP TAKEN: `2026-05-29T15:33:47.782Z` → `backups/backup-2026-05-29T15-33-47-782Z.json`
        (3 profiles, 26 projects, 115 nodes, 27 ambitions, 8 notes, 10 tag cats,
        24 tag values; via `supabase/backup-data.mjs`, read-only). Free tier — no
        dashboard backups, so this JSON snapshot is the restore path.
      - Split into **Step A** (backfill, reversible) → verify → **Step B**
        (NOT NULL + swap RLS). Do not run Step B until Step A verifies clean.
- [ ] **Phase 3 — Backend logic.** Invite flow, member management, activity-log
      insertion on relevant events, personal-org auto-create on signup. Report:
      server-side logic works in isolation.
- [ ] **Phase 4 — Frontend.** Members page, Activity page, account menu (top
      right), org switcher, org-context awareness throughout. Report: pages
      render, basic flows work.
- [ ] **Phase 5 — Integration testing** (full testing checklist below) →
      screenshots → **William reviews & approves**.
- [ ] **Phase 6 — Project move between workspaces.** Independent of 1–5; can be a
      separate PR if 1–5 ship first.

### Sequencing reconciliation (agreed 2026-05-29)
`organization_id NOT NULL` and the swap of existing tables to org-based RLS
**cannot** happen in Phase 1 — existing rows have no org yet, so it would reject
the change / lock the user out of their own data. Therefore:
- **Phase 1** is purely additive: new tables, new columns left **nullable/empty**,
  RLS only on the **new** tables. Existing app keeps working untouched.
- **Phase 2** backfills every row, *then* flips columns to `NOT NULL` and swaps
  existing tables' RLS to org-based — all in one transaction, on a backup first.

---

## Schema (Supabase)

1. **`organizations`** — id (uuid pk), name (text; default
   "{owner email-localpart}'s workspace", set by app/migration), created_at,
   created_by_user_id (fk users), member_limit (int default 5, configurable).
2. **`memberships`** — id, organization_id (fk, cascade), user_id (fk, cascade),
   role (owner|member|viewer), joined_at, invited_by_user_id (fk, nullable —
   null for the creator), UNIQUE(organization_id, user_id).
3. **`pending_invites`** — id, organization_id (fk), email, role (member|viewer),
   invited_by_user_id (fk), token (unique, used in link), created_at, expires_at
   (default +7 days), UNIQUE(organization_id, email). Pending invites count
   against member_limit (enforced in app, Phase 3).
4. **`activity_log`** — id, organization_id (fk, cascade), actor_user_id (fk),
   action_type (text), target_type (text), target_id (uuid, nullable),
   description (text), metadata (jsonb, nullable), created_at. INDEX on
   (organization_id, created_at desc, id desc). **Retained indefinitely**; no
   pruning. Pagination handles the UI.
5. **`profiles.display_name`** (text) — default = email local-part
   (wv.vlachos@gmail.com → "wv.vlachos"). Backfilled. New-user trigger updated.
   Used in Members + Activity for readable identity (email shown contextually).
   *No display-name editing UI in this PR.*
6. **Add `organization_id` (fk orgs) + `created_by_user_id` (fk users)** to:
   `projects, nodes, notes, bubbles, ambitions, tag_categories, tag_values`.
   (`emails` and the `*_tag_values` join tables inherit access via their parent —
   no own org_id.) **Nullable in Phase 1; NOT NULL after Phase 2 backfill.**

**Role storage note:** roles are enforced with `CHECK (role in (...))` on a text
column rather than a Postgres `enum` type — same guarantee, but far easier to
extend later (altering enum types in Postgres is painful). Behavior matches the
spec's three roles exactly.

---

## RLS

Helper functions (SECURITY DEFINER, to avoid recursive policy lookups):
`is_org_member(org)`, `is_org_writer(org)` (owner|member), `is_org_owner(org)`.

For each content table with `organization_id` (swapped in **Phase 2**):
- SELECT: `is_org_member(organization_id)` (any role).
- INSERT/UPDATE/DELETE: `is_org_writer(organization_id)` (owner|member). Viewers
  read-only.

New tables (live from **Phase 1**):
- `organizations`: SELECT if member; UPDATE/DELETE if owner; INSERT by signed-in
  user setting themselves as creator (the owner membership is created server-side).
- `memberships`: SELECT all rows in your orgs; INSERT/UPDATE/DELETE only by owner.
- `pending_invites`: SELECT if member; INSERT/UPDATE/DELETE only by owner.
- `activity_log`: SELECT if member; INSERT if member writing as self; no
  UPDATE/DELETE (immutable).

---

## Data migration (Phase 2 — one-time, atomic, in a transaction)

**Confirm a backup exists / take one first (record timestamp).** Then per existing
user: create their org ("{localpart}'s workspace", member_limit 5) → create owner
membership (invited_by null) → backfill every owned row in
projects/nodes/notes/bubbles/ambitions/tag_categories/tag_values with the new
organization_id + created_by_user_id → backfill profiles.display_name if null.
Then flip the new columns to NOT NULL and swap existing-table RLS to org-based.
Roll back fully on any failure; test on a backup snapshot first.

Verify post-migration: every project has a valid org_id; each existing user has
exactly one membership (owner of their own org); no orphans / no NULL org_ids on
now-required columns; original data visible to original users after re-login;
User A cannot reach User B's org data via any query.

---

## Multi-org-per-user (works from day one)

(a) On signup, auto-create a personal org ("{localpart}'s workspace"), user as
sole owner+member. (b) Accepting a company invite keeps the personal org and adds
a membership — user now in 2+ orgs. (c) Account-menu **org switcher is functional**
with 2+ orgs; active workspace id persists across reloads (session/local prefs).
(d) New projects/tags are created in the currently-active workspace (no
"which workspace" dropdown at creation).

---

## Application changes (Phases 3–4)

- **Account menu** (replaces standalone Sign Out): avatar/initials button top
  right → dropdown: email + display_name; "Workspace: {current}" with switcher
  (functional at 2+ orgs); links to Members + Activity; Sign out at bottom. Kraft
  & oxblood.
- **Invite flow (copy-link only; NO email in v1):** Members page (members can
  view; owners act) lists members (display_name, email, role, joined) + pending
  invites (email, role, invited by, expires) + "Invite member" (owner) → form
  (email + role) → creates `pending_invites` row → shows tokenized link
  `https://sirmathread.com/accept-invite?token=...` + Copy link. Design the
  endpoint so adding Resend later is additive. Accept: click link → sign in/up →
  validate token → create membership → delete invite → log. Enforce member_limit
  (refuse 6th with clear message). Remove member (owner): hard-delete membership;
  their content stays in the org.
- **Activity page (paginated):** all members; entries for current org, newest
  first; **cursor-based 50 at a time** (cursor on created_at+id); "load more" /
  infinite scroll; each row = display_name + avatar, description, relative time
  (absolute on hover), link to item; filter chips All / By me / By others; date
  range optional. Respects RLS.
- **Logged actions (server-side):** project.created/.renamed/.archived/.deleted/
  .restored/.moved_in/.moved_out; node.created/.edited/.deleted;
  tag.created/.applied/.removed/.deleted; bubble.created/.edited/.deleted;
  deadline.set/.changed/.completed; member.invited/.joined/.removed/.role_changed.
  **Do NOT log** views, scrolls, zooms, sort/filter/span/density changes.

---

## Phase 6 — Project move between workspaces

"Move workspace" on a project's settings/menu. User must be **owner or member
(not viewer) of BOTH** source and destination.

Confirmation dialog lists consequences explicitly, e.g.:
> Move 'Asana Billing' from 'Ume Foundation' to 'William's workspace'? This will:
> remove access for [other source members], clear all tag associations on this
> project (tags are workspace-specific), and add an audit entry in both
> workspaces.

(Omit the "remove access for" line if source has no other members.)

On move: update organization_id on the project AND all dependent rows (nodes,
notes, bubbles, any project-scoped data); **strip all tag associations** from the
project + its nodes (tag-association rows deleted; nodes otherwise untouched);
`created_by_user_id` stays (historical fact). Activity log: leave historical
entries in the source; add ONE entry each side — source `project.moved_out`
("…moved to '{dest}' by {actor}"), destination `project.moved_in` ("…imported
from '{source}' by {actor}"). Source-workspace members lose access immediately
(except the actor, who follows the project; destination becomes their active ws).

---

## Not in scope (defer)

Email delivery for invites (copy-link only; add Resend later); real-time
collab/WebSocket (refresh-based ok); private/personal projects within a shared org
(use a separate personal workspace); granular per-resource permissions (role is
org-wide); billing/plans (the 5 is just a number); display-name editing UI.

---

## Testing (all before committing)

Fresh signup → user + personal org + owner membership atomically, no null fks •
existing users post-migration see data exactly as before, nothing missing/leaked •
RLS: A can't reach B's org data via any query • invite: row created, link
copyable, accept creates membership • remove member: access revoked immediately,
content stays • 5-member limit enforced (6th refused, clear message) • activity
log records correct event/actor/target/time • activity pagination cursor-based,
fast, stable • activity respects RLS across orgs • Phase 6 move: only with
owner/member on both; tags strip; source loses access; both workspaces show audit
entries; nodes/data otherwise intact.

---

## Deliverables

Summary of schema + migration results • screenshots (Members, Activity, account
menu open, invite flow create→link, project-move dialog, before/after of a moved
project) • confirmation existing functionality still works • **`CLAUDE_NOTES.md`
updated** with new schema, RLS model, roles, multi-org behavior, project-move
semantics.

**Commit (single PR, or split Phase 6):**
`feat: multi-user organizations + memberships + activity log + project move (with migration)`
