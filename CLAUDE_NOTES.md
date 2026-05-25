# CLAUDE_NOTES.md — Sirmathread

> Detailed context for Claude. Read this first at the start of every session on this project.

## What Sirmathread is

A web application that turns labeled Gmail threads into navigable project flowcharts. The name combines the Greek **σύρμα** (síma) — wire — with the English **thread**, which has the double meaning of "email conversation" and "the wires connecting nodes on the canvas." Originally just "Sirma," renamed to Sirmathread on 2026-05-25 because (a) Sirma Group Holding JSC, a large Bulgarian software/AI company, owns sirma.com and sirma.ai and ships products in the AI/SaaS space, making the bare name a brand/SEO collision; (b) the compound name is more distinctive and search-friendly anyway.

**Two layers:**
- **Layer 1 (overview)** — All projects as horizontal node-chains flowing left-to-right along a calendar axis. Each project is one lane. Nodes are important emails. Only user-written **notes** can be attached at this layer. No AI clutter here.
- **Layer 2 (project detail)** — Click any project lane to open it. That project's node chain takes center stage. Around it, **context bubbles** (gray), **insight bubbles** (purple), and **user notes** (amber) float freely, each connected by a curved wire to its source email node. Bubbles are draggable; user-arranged positions persist forever.

## Bubble interactions (Layer 2)

- **Hover/tap a node** → a small `+` button appears next to it
- **Click `+`** → tiny menu: Context / Insight / Note
- **Pick one** → empty bubble of that type spawns, wire pre-drawn, text input focused
- **Drag** any bubble freely; wire follows
- **Single-click** selects a bubble; Delete key or small × on the bubble removes it. A toast appears at bottom ("Deleted · Undo") for ~5 seconds, after which the deletion is permanent. Same pattern for Layer 1 notes.
- **Double-click** a bubble to edit text inline
- AI-generated bubbles and user-added bubbles look visually identical once they exist. Origin tracked in DB (`ai_generated`, `edited_by_user`) but not surfaced visually unless we add a filter toggle later.

## Node interactions

- **Layer 1 nodes are read-only.** No text editing on the overview. Click a node opens Layer 2.
- **Layer 2 nodes are editable.** Double-click to rename. The rename is a Sirmathread-only `display_label` override — the underlying Gmail email subject is untouched. The renamed label propagates to Layer 1 automatically. Rule of thumb: **all editing happens in Layer 2; Layer 1 reflects what's been done.**
- **Node menu (right-click or hover-dot):** Edit label · Set deadline · Demote · Delete
- **Demote vs delete:**
  - **Demote** — node is removed from Layer 1 entirely, AND on Layer 2 it transforms from a spine-node into a branching bubble (treated like context). Reversible: in Layer 2, demoted nodes have a "promote" action that restores them to the spine. Useful when Claude over-promoted an email.
  - **Delete** — node is removed from both layers. The underlying Gmail email is untouched. Same undo-toast pattern as bubbles.

## Source of truth: user decisions made so far

1. **Projects = Gmail labels.** User applies labels manually in Gmail. Every email with a given label belongs to that project. No AI guessing project membership.
2. **Nodes = Claude-scored important emails.** For each email in a labeled thread, Claude judges importance (decision? action item? scope change?). Important emails become nodes; noise (auto-replies, thanks, scheduling pings) stays reachable but doesn't appear on the canvas.
3. **Context vs Insight (semantic distinction, set by William):**
   - **Context** = important background to understand the project better. Backward-looking. Who, what was agreed before, constraints.
   - **Insight** = key point drivers. What should drive your attention or decisions. Flags, risks, unanswered questions, scope shifts.
4. **Bubbles are draggable and editable.** Claude generates initial content AND initial position. User drag overrides position forever. User edits override text forever. Persisted to DB.
5. **Each bubble links to exactly one node** (for now). Multi-node links deferred until proven needed.
6. **Eventually a product for others.** Multi-tenant from day one. Each user connects their own Gmail.
7. **Layer 1 may eventually become swim-lanes.** Confirmed in mockup. Each project = one horizontal lane on a shared calendar axis. Easier to read than overlapping canvas once 10+ active projects.
8. **Layer 1 only allows notes**, written by the user. Not AI-generated. AI output is confined to Layer 2.
9. **Arrangement is sort order, not an entity.** Confirmed by William 2026-05-25. It is the user's chosen sort for Layer 1 lanes — which projects appear at the top, which require scrolling. Stored as a per-user UI preference, not a table. Sort fields: date_created, last_updated, deadline, has_employee_tag (probably). The earlier page 2 sketch showing parallel "Project" / "Arrangement" tracks was an exploration William has dropped — DO NOT model Arrangement as a parallel chain.
10. **Tag categories are user-customizable.** Default categories ship pre-seeded: Users, Client, Work type, Spam, Not important. Users can rename, delete, or add new categories. Each category holds a list of values (e.g. Users = [Dinos, William, Maria, ...]). No Claude inference. No per-node tags yet — tags apply to projects only. Tags drive filtering at Layer 1. "Spam" and "Not important" categories act as hide filters by default.
11. **"Employee" renamed to "Users."** More general — staff, freelancers, anyone. Use "Users" in DB and UI.
12. **Deadline is a state on the project/node, not a tag.** Each project and each node can independently have a `deadline` (nullable date), a `deadline_set_at` (timestamp — when the deadline was first assigned, used as start of runway), and a `done` (bool) field. Visual model:
    - **No deadline** → node renders in its project's base color, unchanged.
    - **Deadline set** → a red overlay fills the node left-to-right as time elapses between `deadline_set_at` and `deadline`. Project color stays visible on the unfilled portion. Implemented in **4 stages: 0% (just set), 25%, 50%, 75%, 100% (deadline reached or passed = fully red)**. Stages chosen over smooth fill for legibility at small node sizes (~40px wide).
    - **Done (tickbox checked)** → node goes muted gray, low opacity, regardless of fill stage. Tickbox only exists when a deadline is set.
    - Project lanes on Layer 1 don't have a single deadline state of their own — the lane's urgency is implied by its nodes' fills. (Optional later: show the most-urgent node's stage as a small indicator on the lane label.)
    The visual replaces the earlier amber-badge concept entirely. Tickbox still appears next to any node with a deadline.
13. **Filter taxonomy on Layer 1:**
    - **Tags** — filter projects by any tag category/value
    - **Deadline** — projects/nodes that have a deadline (any state)
    - **Flat deadline** — has a deadline but no Users tag assigned (early-warning view)
    - **Employee deadline** *(rename to "User deadline")* — has a deadline AND a Users tag assigned
    - **Hide completed** — toggle to hide things where the tickbox is checked
    - **Inactive** — projects in the 45–120 day window (stale but not yet auto-archived)
    Deadline filters are mutually exclusive with each other. Tags filter stacks independently. Inactive filter stacks too.
14. **Project lifecycle: Active → Archived → Trash → Purged.**
    - **Active** = on Layer 1 by default, syncing on, Claude scoring running.
    - **Archived** = hidden from Layer 1 by default (toggle "show archived" in toolbar to reveal as grayed lanes). Sirmathread **stops syncing new emails** from the Gmail label while archived. Unarchiving resumes sync. Manual archive available; also auto-archive at 120 days inactive (see point 16).
    - **Trash** = grace state before permanent deletion. User can restore from Trash at any time within the window.
    - **Purged** = data gone from Sirmathread. Gmail label and emails are **never touched** — re-applying the label in Gmail brings the project back from scratch (no bubbles, no notes, just re-synced emails). This is the safety floor.
    - Transitions: Active→Archived (one click), Archived→Active (one click), Active→Trash (skip archive, requires typed confirmation), Archived→Trash (one click), Trash→Active or Trash→Archived (restore).
15. **Trash auto-purge window: 60 days** (confirmed by William 2026-05-25, overriding the earlier 30-day proposal). User-configurable in settings.
16. **Inactive logic (project-level only).**
    - "Inactive" = no new emails arrived AND no user edits (notes, bubbles, drag, rename, tag changes) for **45 days** (default, user-configurable).
    - At **120 days** of continued inactivity, the project is **silently auto-archived**. No notification (user explicitly chose this). Unarchive any time to bring it back.
    - Both thresholds (45d for "inactive" flag, 120d for auto-archive) are user settings.
    - **Visual treatment:** inactive projects are NOT grayed or hidden. They simply sink to the bottom of the lane stack on Layer 1 under all sort orders. To triage them, user picks the **"Inactive"** option in the Arrangement sort, which brings them to the top.
    - Node-level inactivity does NOT exist. Only whole projects.
17. **Deletion confirmation pattern: cascade visibly.**
    - Deleting a project shows a confirm dialog listing what else dies with it: "Deleting Project X will also remove: 47 bubbles, 12 notes, 8 demoted nodes, 3 tag associations, all email cache for this project." User types the project name or clicks confirm.
    - Deleting a tag value still applied to projects: **warn + cascade** — show how many projects currently use it, untag all on confirm, then delete the value.
    - Deleting a tag category with values inside: same pattern, warns about how many values and project links will go.
    - Deletion at smaller scopes (bubbles, notes, demoted nodes) uses the toast-with-undo pattern — no confirm dialog.
18. **Arrangement sort options (Layer 1):** date_created, last_updated, deadline (earliest first), has_users_tag, **inactive** (most inactive first). Plus an asc/desc toggle on each.
19. **Sync model.**
    - Sirmathread polls Gmail on a schedule (likely every 15 min for active users; more like every 24h for users who haven't opened the app in a while — TBD).
    - Per project, sync state: `synced_at` timestamp, `gmail_history_id` cursor for incremental fetches.
    - Archived projects: sync paused. Trash projects: sync paused. Purged: no row.
    - When unarchived, sync resumes from the saved cursor — catches up on missed emails in one batch.

## Open questions (resolved or deferred)

All major design blockers cleared as of 2026-05-25. Remaining minor:
- Bubble multi-node links — deferred to v2.
- Domain — **sirmathread.com**, purchased on Porkbun (confirmed 2026-05-25).
- Default tag pre-seeding behavior — should new users get the 5 defaults immediately, or should there be an onboarding step where they pick which defaults they want? Deferred until we hit onboarding flow.

## Proposed stack (pending confirmation)

- **Frontend + backend:** Next.js (App Router, React 19, TypeScript). One framework for both, easy hosting.
- **Hosting:** Netlify. William already has an account. Netlify supports Next.js as a first-class citizen via @netlify/plugin-nextjs (App Router, server components, API routes, ISR, middleware all work). Free tier (100 GB bandwidth/mo, 300 build min/mo) is plenty for dev. Note: cron-style background work goes through **Netlify Scheduled Functions** (different syntax from Vercel Cron but same capability).
- **Database + auth + Gmail OAuth token storage:** Supabase. Postgres under the hood. Row-level security for multi-tenancy.
- **Gmail integration:** Gmail API via OAuth 2.0. Scopes: `gmail.readonly` + `gmail.labels`. NEVER request send/modify — read-only product.
- **Claude API:** Anthropic SDK. Used for (a) scoring email importance, (b) generating context bubbles, (c) generating insight bubbles. Cache by email message_id + prompt version to avoid re-paying.
- **Canvas rendering:** SVG with vanilla React for now. If performance suffers past ~200 nodes per project, consider react-flow or a canvas-based lib. SVG keeps it simple and accessible until then.
- **Drag-and-drop:** Native pointer events. Already prototyped in the chat mockup — bend a quadratic Bézier wire from node center to bubble center, recompute on drag.

## Data model (first pass — will iterate)

```
users
  id, email, gmail_oauth_token_encrypted, gmail_refresh_token_encrypted, created_at

projects
  id, user_id, gmail_label_name, display_name, color,
  deadline (nullable date),
  deadline_set_at (nullable timestamp — runway start),
  done (bool, default false),
  state ('active' | 'archived' | 'trash', default 'active'),
  state_changed_at (timestamp — used for 30-day trash purge clock + archive timing),
  archived_reason ('user' | 'auto_inactive', nullable),
  last_activity_at (timestamp — bumped on new email arrival OR any user edit; used for inactive logic),
  synced_at (nullable timestamp),
  gmail_history_id (nullable text — Gmail's incremental sync cursor),
  created_at, updated_at

user_preferences
  user_id,
  layer1_arrangement_sort ('date_created' | 'last_updated' | 'deadline' | 'has_users_tag' | 'inactive'),
  layer1_arrangement_direction ('asc' | 'desc'),
  layer1_filters_jsonb       -- {tag_filters: [{category_id, value_ids}], deadline_mode: 'all'|'flat'|'with_user'|null, hide_completed: bool, inactive_only: bool, show_archived: bool}
  inactive_threshold_days (int, default 45),
  auto_archive_threshold_days (int, default 120),
  trash_purge_days (int, default 30)

emails                      -- raw cache of every email under a labeled thread
  id, project_id, gmail_message_id, gmail_thread_id,
  from_addr, to_addrs, subject, body_text, date_sent,
  importance_score, is_node (bool, derived from score + threshold),
  scoring_prompt_version, scored_at

nodes                       -- the emails that made it onto the canvas
  id, email_id, project_id, position_index,
  display_label (nullable text — Sirmathread-only rename; falls back to email.subject when null),
  state ('promoted' | 'demoted' | 'deleted', default 'promoted'),
  deadline (nullable date),
  deadline_set_at (nullable timestamp — runway start),
  done (bool, default false),
  deleted_at (nullable timestamp — for undo grace window),
  created_at

notes                       -- Layer 1, user-written only
  id, project_id, node_id (nullable — can attach to lane or node), body, x, y,
  deleted_at (nullable timestamp — for undo grace window),
  created_at

bubbles                     -- Layer 2 only; context + insights + user notes
  id, node_id, kind ('context' | 'insight' | 'note'),
  body, x, y,
  ai_generated (bool), edited_by_user (bool),
  generation_prompt_version (nullable — null for user-added),
  deleted_at (nullable timestamp — for undo grace window),
  created_at, updated_at

tag_categories              -- user-customizable categories of tags
  id, user_id, name (text — e.g. 'Users', 'Client', 'Priority'),
  is_default (bool — true for pre-seeded categories, helps with migration),
  is_hide_filter (bool — true for Spam / Not important style categories),
  sort_order (int)

tag_values                  -- the actual tag values within a category
  id, category_id, value (text — e.g. 'Dinos', 'Smith family'),
  color

project_tag_values          -- join: which tag values apply to which projects
  project_id, tag_value_id
```

## File structure (proposed)

```
sirmathread/
  app/
    (auth)/login/page.tsx
    (app)/
      layer1/page.tsx              # overview, all projects as lanes
      project/[id]/page.tsx        # Layer 2, single project view
    api/
      gmail/sync/route.ts          # pull labeled threads, store emails
      claude/score/route.ts        # batch-score emails for importance
      claude/generate/route.ts     # generate context + insight bubbles
  components/
    Canvas/
      Layer1Lanes.tsx
      Layer2Project.tsx
      Bubble.tsx
      Wire.tsx
      Node.tsx
  lib/
    gmail.ts                       # Gmail API client wrapper
    anthropic.ts                   # Claude client + prompt templates
    supabase.ts                    # DB client
  prompts/
    score_email.md                 # versioned prompt for importance scoring
    generate_context.md
    generate_insight.md
  CLAUDE_NOTES.md
  WILLIAM_NOTES.md
  README.md
```

## Prompt versioning rule

Every Claude prompt template lives in `prompts/*.md` with a `# Version: N` header. When we change a prompt, bump the version. Stored alongside each scored email / generated bubble so we can re-process old data with new prompts later without confusing the cache.

## Background jobs (scheduled, server-side)

Three jobs run on a schedule via **Netlify Scheduled Functions** (or fall back to Supabase Edge Functions if Netlify's free-tier scheduled-function limits bite at scale):

1. **Gmail sync** — for each active project, pull new emails since `gmail_history_id`. Default cadence: 15 min for projects edited in last 24h; 24h cadence for the rest. Updates `synced_at` and `gmail_history_id`. Bumps `last_activity_at` on the project if new emails arrived.
2. **Auto-archive** — daily. Find projects where `state = 'active'` AND `last_activity_at < now() - auto_archive_threshold_days`. Set `state = 'archived'`, `archived_reason = 'auto_inactive'`, `state_changed_at = now()`. Silent.
3. **Trash purge** — daily. Find projects where `state = 'trash'` AND `state_changed_at < now() - trash_purge_days`. Cascade-delete: bubbles, notes, nodes, emails, project_tag_values, project row itself. Tag categories/values are user-scoped and persist.

Soft-delete sweeper (also daily): any bubble/note with `deleted_at < now() - 7 days` gets hard-deleted from the DB. The 5-second toast undo is enforced client-side; the 7-day window is server-side garbage collection in case the toast was dismissed without a hard-delete signal reaching the server.

## Status

**2026-05-25 (session 1, final):** Design phase complete. Two-layer model locked. Stack confirmed: Next.js + Netlify + Supabase + Anthropic SDK. Domain sirmathread.com purchased on Porkbun. Anthropic API key created and stored by William. All major design decisions captured in this file. **Status: ready to bootstrap. Next session: scaffold the Next.js project, set up Supabase schema, ship a deployable "hello sirmathread" page on Netlify with the Anthropic SDK wired in.**

## Gotchas to remember

- Gmail API has aggressive rate limits. Batch requests. Use the `historyId` cursor for incremental sync, not full re-fetch.
- OAuth tokens MUST be encrypted at rest. Supabase Vault or `pgcrypto`. Never store raw.
- Claude prompts that score emails should return structured JSON (importance: 1-5, reason: string). Use tool-use / structured outputs, not free text parsing.
- Layer 1 swim-lanes will need vertical scrolling once projects exceed ~6. Plan for it from the start.
- SVG drag math: convert client coords → SVG coords via `getScreenCTM().inverse()`. Already working in the mockup.
- William knows zero code. Every change goes through Claude. Keep WILLIAM_NOTES.md plain-English.
