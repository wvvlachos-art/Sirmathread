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

## Visual system (locked 2026-05-28)

**VISUAL IDENTITY:** "Kraft & oxblood" — warm manila/kraft paper background (~#e7dcc4), deep oxblood-red as the signature accent (~#7a2718), serif headings (Georgia-class serif) for brand + project names, clean sans for small node labels. This is a deliberate move AWAY from generic dark-mode SaaS and away from Anthropic's own cream/serif look. The paper is warm manila, not cream; the accent is oxblood, which Anthropic never uses.

**NODE COLOR SYSTEM** (three independent channels, no conflicts):
- **FILL = tag.** Untagged node = default paper-cream fill with oxblood outline. One tag = whole node takes that tag's color. Multiple tags = node takes the PRIMARY tag's color as fill, and each ADDITIONAL tag shows as a thin colored base bar beneath the node.
- **BASE BARS = additional (non-primary) tags only.** Spaced apart (~3px gap between bars, ~3px below the node) so they never touch or merge. Bars fade out at zoomed-out spans (3m/6m) where nodes shrink — lens becomes the only node-tag readout at those zooms.
- **PERIMETER = deadline.** A snug red border that hugs the node's rounded-rectangle edge (no floating gap). Proportional 4-stage fill: runway = time between `deadline_set_at` and `deadline`, divided into quarters. As each quarter of runway elapses, the red border advances one segment clockwise from top: stage1 = top edge, stage2 = top+right, stage3 = top+right+bottom, stage4 = full border. Due and overdue both show the full border (no extra escalation).
- **COMPLETED:** when a deadline node is ticked complete, the red border clears entirely and the node returns to plain tag-colored state, with a small check mark (likely replacing the inner dot).

**ORIGIN COLOR: REMOVED.** We no longer color nodes green (Gmail) vs blue (manual). Origin is no longer a node-fill signal. (If origin is ever needed, it lives in the node detail panel, not on the node body.)

**TAG MODEL:** one shared tag vocabulary (Model A), appliable to either a project OR a node. Project tags display as readable pills under the project name in the frozen left column. Node tags display via the fill/bars system above.

**TAG LENS:** node tags are explored via a "lens" / highlight mode. User picks a tag (reusing the existing magic-wand mechanism) → every node carrying that tag glows across ALL lanes, everything else dims. Turn off → canvas returns to calm. Works at every zoom level. This is the primary way to see node tags across the canvas; bars are the at-a-glance per-node readout.

**NODE-TYPE ICONS:** optional, default BLANK. A node is born plain. User may optionally assign a type (email / decision / meeting / payment / deadline / etc.) via a picker, which shows a small line icon. Never required. (AI auto-typing deferred until the paste-to-generate feature, which is on hold pending IP waiver.)

**AMBITIONS:** unchanged — dashed-outline circles on dashed wires, representing future/planned events.

## Status

**2026-05-25 (session 1, final):** Design phase complete. Two-layer model locked. Stack confirmed: Next.js + Netlify + Supabase + Anthropic SDK. Domain sirmathread.com purchased on Porkbun. Anthropic API key created and stored by William. All major design decisions captured in this file. **Status: ready to bootstrap. Next session: scaffold the Next.js project, set up Supabase schema, ship a deployable "hello sirmathread" page on Netlify with the Anthropic SDK wired in.**

## Gotchas to remember

- Gmail API has aggressive rate limits. Batch requests. Use the `historyId` cursor for incremental sync, not full re-fetch.
- OAuth tokens MUST be encrypted at rest. Supabase Vault or `pgcrypto`. Never store raw.
- Claude prompts that score emails should return structured JSON (importance: 1-5, reason: string). Use tool-use / structured outputs, not free text parsing.
- Layer 1 swim-lanes will need vertical scrolling once projects exceed ~6. Plan for it from the start.
- SVG drag math: convert client coords → SVG coords via `getScreenCTM().inverse()`. Already working in the mockup.
- William knows zero code. Every change goes through Claude. Keep WILLIAM_NOTES.md plain-English.

## Layer 2 — dedicated project page (`/project/[id]`)

**Navigation.** Layer 1 → Layer 2: click a project's **name** in the left rail
(direct link), or its settings menu → **Open detail view →**. Layer 2 → Layer 1:
the **← Overview** link (and browser back). Direct URLs are shareable.

**Access control.** The page loads the project through the normal RLS-scoped
query; a user who isn't a member of the project's workspace gets `null` →
`notFound()` (clean 404, no data leak). `canEdit` = the user's membership role is
owner/member (viewers are read-only — no "+", no edit).

**Serpentine layout (Layer2Canvas).** Time flows ALONG THE THREAD, not the
horizontal axis. ≤8 nodes that fit on one row → centered linear chain; otherwise
a downward snake whose rows alternate L→R / R→L, joined by rounded
(quadratic-bezier, ~30px) curve transitions; the page scrolls vertically. Rows
fill to the canvas edges before wrapping. **Spacing is time-aware:** distance =
`clamp(MIN + LOG_FACTOR·ln(1+gapDays), MIN, MAX)` so bursts cluster and quiet
stretches open up. Gaps > 14 days get an italic "~N weeks later" annotation. A soft, **approximate**
month band runs down the left (each month labelled near its first node; not
to-scale by design — it's an orientation aid, not a ruler).

**Context bubbles = draggable sub-nodes (`bubbles` table).** Reshaped from the
old empty placeholder. Columns used: `organization_id` (RLS), `project_id`,
`node_id`, `bubble_type` ('context' | 'insight'), `source` ('manual' | 'ai'),
`content`, `position_side` ('above' | 'below'), `x`/`y` (legacy double-precision
columns, now repurposed for the dragged position — stored as an OFFSET from the
parent node centre so it survives layout/zoom changes; null = default stack
slot), timestamps, `created_by_user_id`. **GOTCHA: the legacy `kind` column is
still NOT NULL** (the layer2-bubbles migration added `bubble_type` alongside it
but never dropped it) — `createBubble` MUST also set `kind: "context"` or the
insert fails with a "null value in column kind" error. RLS: read = org member,
write = org owner/member.
Render (redesigned 2026-06-04 per William — old faint italic "margin notes" were
too faint / didn't read as attached / weren't draggable): each bubble is a
**visible sub-node card** (rounded, 1.5px dusty-blue `MANUAL_EDGE` border,
paper-surface bg, shadow; solid dusty-blue header strip with a tiny square glyph
+ "CONTEXT · YOU"; body in INK serif, not faint), centre-anchored, connected to
its parent node by a **solid** connector with a filled socket dot on the node
edge (computed via the node→card vector). Cards are **draggable** (pointer-
capture; `dist>4` = drag vs click, mirroring Layer 1 notes): optimistic
`bubblePos` override + `bubblePosRef`, persisted on pointer-up via
`updateBubblePosition(id,x,y)` (fire-and-forget, no activity log); a click (no
drag) opens the editor. Un-dragged bubbles fall back to a default above/below
stack slot (`defaultOffset`). Canvas `height` grows to include dragged bubbles.
CRUD via `src/app/project/[id]/actions.ts`, logged as
`bubble.created/.edited/.deleted` (position changes are not logged).

**Layer-1 notes shown on Layer 2 (read-only).** The `notes` table (user notes
from Layer 1) is fetched in page.tsx and rendered as amber cards (NOTE_FILL /
NOTE_BORDER) anchored to their `node_id` via a dotted amber connector (lane-level
notes with null node_id attach to the first node). READ-ONLY here — notes.x/y are
Layer-1 coordinates (x = a timestamp) so they don't translate; cards use a
default lower-left stack slot instead. Editing/positioning stays in Layer 1. No
migration (notes table pre-existed).

**Draggable main nodes (migration `supabase/node-position.sql` — adds `l2_x`,
`l2_y`).** Spine nodes can be dragged to custom Layer-2 canvas positions so the
thread can be reshaped around annotations. Drag the node hit-area (pointer-
capture, `dist>4` = drag vs click; double-click still renames; the +/⋯ buttons
`stopPropagation` so clicking them doesn't drag). Persisted as absolute canvas
coords via `updateNodePosition`; null = automatic serpentine slot. `positions`
is overridden (live drag → persisted px/py → auto) BEFORE everything downstream
(wire, bubbles, demoted branches, month band, height) so they all follow a
dragged node. Layer-2-only — does NOT touch Layer 1 (which lays out by date).
page.tsx fetches l2_x/l2_y in a separate tolerant query; writes swallow the
missing-column error (`isMissingColumn`) so it's an in-session no-op until the
migration runs.

**Two sub-node kinds (migration `supabase/bubble-information.sql`).** `context`
(dusty-blue `MANUAL_EDGE`, SOLID connector) and `information` (muted-violet
`INFO_EDGE` #6f5a8c, DOTTED connector). Stored in `bubble_type` — the migration
widens its check constraint (named `bubbles_bubble_type_check`, confirmed) from
('context','insight') to also allow 'information'. The legacy NOT-NULL `kind`
column stays 'context' for every bubble (its own constraint only knows
context/insight/note; it's unused for display). Editor has a Context/Information
toggle (both create + edit); `createBubble` takes the kind, `updateBubbleMeta`
can change `bubble_type`. Only colour + connector dash differ — same card,
title, size, shape, drag, editor. NOTE: creating an 'information' bubble BEFORE
the migration fails the check (code 23514) and surfaces an alert (context still
works); run the migration to enable it.

**Sub-node title / size / shape (migration `supabase/bubble-style.sql` — adds
`title`, `width`, `height`, `shape`).** Each card shows a **title** (header
strip): editable, and when null it defaults to `deriveTitle(content)` (first
line / first ~48 chars). The body is shown below only when it differs from the
title (so a short note isn't duplicated). Title is edited via an input in the
bubble editor (empty field = auto). **Resize:** a corner handle (shown on hover)
drags width/height; top-left stays put (the centre offset is shifted by half the
delta), persisted via `updateBubbleSize`. **Shape:** picker in the editor —
rounded (default) / square / soft / pill — maps to border-radius (`SHAPE_RADIUS`),
persisted via `updateBubbleMeta`. **The bubble editor is a centred fixed modal**
(backdrop click = cancel) rather than a popup anchored to the bubble — a bubble
near (or dragged to) an edge used to open the editor off-screen. The node `⋯`
menu and inline rename stay anchored but are clamped within the canvas bounds.
Title+shape go through `updateBubbleMeta`,
SEPARATE from `updateBubble` (content) so content edits keep working before the
migration. **Resilience: writes to not-yet-added columns are swallowed** — note
the WRITE error is PostgREST `PGRST204` (schema-cache miss), the READ error is
Postgres `42703`; `isMissingColumn()` handles both. page.tsx overlays
title/width/height/shape from a separate tolerant query so bubbles always load.

**Reserved for post-IP-waiver (DO NOT BUILD YET):** AI-generated bubbles
(`source='ai'`, oxblood styling, "CONTEXT · AI" label) and **insight** bubbles
(`bubble_type='insight'`). The enums/columns exist so they slot in with no
schema rework; only manual context bubbles are created/rendered in v1.

**Node editing (Layer 2 is the editable layer).** All node editing lives here;
Layer 1 reflects the result. On each spine node, hover shows two affordances:
`+` (add context note, top-right) and `⋯` (node actions, bottom-right);
double-click a node to rename inline.
- **Rename** → writes `display_label` (Sirmathread-only override; Gmail subject
  untouched) and propagates to Layer 1. Optimistic local override + fire-and-
  forget save; Enter/blur save, Esc cancels (guarded by a `renameCancel` ref so
  blur doesn't override a cancel). Logged `node.renamed`.
- **Type icon** → optional `nodes.node_type` (null = plain). Picker in the ⋯
  menu; tapping the active type clears it. 7 types (email/decision/meeting/call/
  payment/task/milestone) drawn as stroke-only line glyphs in a 24-box; shown as
  a small badge at the node's top-left corner. Optimistic. **Migration
  `supabase/node-type.sql` adds the column** — page.tsx fetches node_type in a
  SEPARATE error-tolerant query (NOT the main select) so the page keeps working
  before the migration runs; icons simply stay absent until then.
- **Demote / Promote** → flips `nodes.state` between 'promoted' and 'demoted'.
  Layer 1 only shows promoted, so demote removes a node from the overview; on
  Layer 2 the demoted node renders as a small dashed "off" glyph branching off
  its time-nearest spine node, with Promote/Rename on hover. Reversible, nothing
  destroyed. Uses `router.refresh()` (not optimistic) since it reshapes the
  serpentine spine. Logged `node.demoted` / `node.promoted`.
- New server actions in `actions.ts`: `renameNode`, `setNodeState`,
  `setNodeType` (resolve org via node→project, RLS blocks viewers, activity-
  logged). page.tsx also captures the main-query `error` and shows a graceful
  "database update may be pending" notice instead of a misleading 404.

## Wave 2 — unified node detail panel (Layer 1)

**Phase 1 (metadata) DONE.** The old centered node-editor modal in
`src/app/layer1/Timeline.tsx` (the `{nodeMenu && …}` block, ~120 lines) is
REPLACED by a right-docked slide-over panel. Same `nodeMenu` state + `openNode`
trigger; same server actions (`updateNode`, `setNodeDeadline`, `clearNodeDeadline`,
`setNodeDone`, `deleteNode`, optimistic `applyNodeTag`/`toggleNodeTag`).

- **Container:** `fixed inset-0 flex items-center justify-end bg-black/30`
  backdrop (click = close); inner panel `w-[400px]`, `maxHeight: min(720px,85vh)`,
  right-docked (`mr-3`), `flex flex-col overflow-hidden`. Built as an IIFE so it
  can derive `lane`/`projectName`/`cur` (current tags, read reactively from lane
  state)/`tagInfo` (valueId→{value,color} from `categories`).
- **Header region** (`border-b`, becomes sticky in Phase 2): inline title input
  (borderless, saves on blur + Enter→blur via `panelSaveTitle` — reverts field +
  sets `titleErr` on failure); subtitle `<date> · <project>` (date is a button
  that opens `MiniCalendar` for manual nodes via `panelSaveDate`; static for
  gmail); status chips row (Deadline chip: "Due <date>" w/ inline ✕ clear +
  click-to-change, or dashed "Set deadline" → opens an inline MiniCalendar
  popover `nodeCalOpen`; Complete chip toggles `completeNode`, sage-green when
  done); tag row = applied pills (per-category colour, ✕ on hover removes) + a
  dashed "+ Tag" button opening a popover that lists ALL categories/values with
  ✓ on applied.
- **Footer** (`border-t`): Delete with a two-step confirm (`confirmDeleteNode`).
  The old "Save title / date" button + `saveNodeEdits` are REMOVED (saves are
  automatic). "Open in Layer 2" + content sections come in Phase 2.
- New state: `titleErr`, `confirmDeleteNode`, `tagPopoverOpen`. Handlers
  `saveNodeDeadline`/`removeNodeDeadline`/`completeNode` now update `nodeMenu` in
  place (keep the panel open) instead of closing it.
- Data gaps to resolve in Phase 2: notes need `node_id` threaded into the
  Timeline `Note` type (raw query already selects it); contexts (bubbles) and
  email body/sender/thread-url are NOT loaded in Layer 1 yet.

**Phase 2 (content + scroll + Layer 2 link) DONE.**
- **Data fetch strategy:** on-demand. New server action `getNodeDetail(nodeId)` in
  `layer1/actions.ts` returns `{ email, notes, contexts }` — email via nested
  `nodes → emails(from_addr, body_text, date_sent, gmail_thread_id)` (snippet =
  first 3 non-blank lines; threadUrl = `https://mail.google.com/mail/u/0/#all/<thread_id>`);
  notes from `notes` where `node_id`; contexts from `bubbles` where `node_id`
  (kind from `bubble_type`). Fetched in a `useEffect` keyed on `nodeMenu?.id`
  (kept out of the heavy `/layer1` query). State: `nodeDetail`, `detailLoading`.
- **Scroll structure:** the panel itself is the scroll container
  (`overflow-y-auto`, `maxHeight: min(720px,85vh)`); the metadata header is
  `sticky top-0 z-10 bg-paper-surface`; email/notes/context/footer flow below and
  scroll. Footer is NOT sticky (scrolls with body) — by design.
- **Sections:** email excerpt (mail icon + "From … · <relative>" via
  `relTimeAgo`, 3-line snippet, "View full email →" opens Gmail thread in a new
  tab; whole section hidden when the node has no email). Notes (yellow
  `NOTE_FILL`/`NOTE_BORDER` cards, click-to-edit inline, "+" adds; reuses
  `createNote`/`updateNoteBody`/`deleteNote` AND syncs the lane via
  `addNoteToLane`/`updateNoteIn`/`removeNoteFromLane` so the L1 canvas updates
  live). Context (left-accent cards coloured by kind — context #5a7d8c /
  information #6f5a8c; click-to-edit with a kind toggle, "+" adds; reuses Wave-1
  `createBubble`/`updateBubble`/`deleteBubble` imported from
  `../project/[id]/actions`). Panel-local edit state: `noteEdit`, `ctxEdit`.
- **Footer:** Delete (left, two-step confirm) + "Open in Layer 2 →" (right,
  `next/link` to `/project/<lane.id>`).
- **Tag popover centred** (`left-1/2 -translate-x-1/2`) per request so it can't
  spill off the panel edge.
- **Cross-layer sync:** both layers read the same tables; panel writes hit the DB
  and show in Layer 2 on next load (and vice-versa). Notes also sync to the live
  L1 canvas immediately via the lane helpers.

**Phase 3 (Add popover redesign) DONE.** The `addChoice` popover (project "+"
button) was a centered modal; now it's an **anchored floating popover**. The "+"
`onClick` captures `e.clientX/clientY` into `addChoice.{x,y}`; the popover renders
`position: fixed` at those coords, clamped to the viewport (width 288). Transparent
click-catcher backdrop (no dimming — it's a quick action, not the slide-over).
- Card style matches the node panel (`rounded-lg border-hairline bg-paper-surface
  shadow-2xl`). Header: medium-weight sans "Add to <project>" + muted subtitle +
  ✕. Sentence case, no emojis, weights 400/500 only.
- Three full-width option cards (icon | title/subtitle, `hover:bg-paper-surface`):
  Node (inline square-outline SVG), Ambition (inline circle-outline SVG), Note
  (inline **ti-note** Tabler SVG, `NOTE_FILL` tint, amber text `#7a5c12`/`#9a7c3a`,
  `hover:brightness-95`). Each still triggers the existing flow (`openAdd(...,
  "node"|"ambition")`, `setNoteCompose`). Node card still gated by the minDate rule.
- Footer (border-top, bottom-right): a small muted text button with an inline
  **ti-calendar-plus** SVG (14px) — "Set deadline" or "Deadline · <d MMM>" when set.
  Toggles an inline `MiniCalendar` (`addDeadlineOpen`) that writes a PROJECT-level
  deadline. **No migration: `projects.deadline` already existed.** New action
  `setProjectDeadline(projectId, date|null)` (sets `deadline` + `deadline_set_at`).
  `Lane` type gained `deadline`; page.tsx maps `p.deadline`; optimistic
  `saveProjectDeadline` via `patchLane` + revert on error. Footer text updates
  reactively from lane state. No Tabler dependency added — icons inlined as SVG.

**Resizable main nodes (migration `supabase/node-size.sql` — adds `l2_w`).**
Layer-2 spine nodes are now resizable as well as draggable; both are Layer-2-only
(text/rename still propagates to Layer 1 via `display_label`, but position+size do
NOT). Square/uniform size: a bottom-left `nesw-resize` handle (shown on hover/while
resizing) drags `l2_w` between 32–140px, center-anchored so the node's position is
unchanged. Resolved size = live `nodeSize` override → persisted `pw` (l2_w) →
default `NODE` (56); exposed via a `sizeById` map + `szOf(id)` helper. Node glyph
(scale = sz/GLYPH), type badge, tag bars, label offset, hit-area, drag clamp,
connector sockets (bubble/note use `szOf(parent)/2`), demoted/note/default-bubble
offsets, node-menu anchor, and canvas height all read per-node size. `GSCALE`
const removed (scale now per-node). Persist via new `updateNodeSize(nodeId, w)`
action (swallows missing-column → in-session no-op until the migration runs).
page.tsx fetches `l2_w` in its own tolerant query (separate from l2_x/l2_y so a
pending migration doesn't break position persistence). `L2Node` gained `pw`.

**Notes draggable + resizable on Layer 2 (migration `supabase/note-layout.sql`
— adds `l2_x`, `l2_y`, `l2_w` to `notes`).** SUPERSEDES the earlier "read-only"
note rendering. Note cards now carry their OWN Layer-2 position (absolute centre,
`l2_x/l2_y`) and width (`l2_w`) — independent of the Layer-1 x/y, so moving/
resizing a note in Layer 2 never disturbs the overview. Whole card drags
(pointer-capture, dist>4 = drag); bottom-right `ew-resize` handle (on hover)
changes width 120–320px (height stays auto). Persisted via new
`updateNoteLayout(id, {x?,y?,w?})` in layer1/actions.ts (swallows missing-column
→ in-session no-op until the migration). Resolved like bubbles: live override →
persisted l2_* → default lower-left stack slot. page.tsx fetches l2_* in a
separate tolerant query; `L2NoteItem` gained x/y/w. Text is still edited in
Layer 1 / the node panel (cross-layer via shared `notes.body`); only L2
position/size are L2-only. (Note: the Wave-2 turn that added spine-node *resize*
was a misread of "nodes" for "notes"; spine-node resize was kept at the user's
request, and this adds the notes behaviour they actually meant.)
