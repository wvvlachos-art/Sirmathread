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

## Pantone-chip sub-nodes (visual polish pass — Phase 1 DONE)

Unified the THREE places notes/contexts render into one shared visual. There was
no shared "Wave-1" component — the styling was duplicated inline; it now is not.

- **Shared component:** `src/app/SubnodeChip.tsx` (presentational, `"use client"`).
  Renders a coloured band with the body text in **oxblood serif 13px / lh 1.4**
  (NOT white — default colour is what reads on the light band), 4px radius, soft
  shadow `0 2px 5px rgba(0,0,0,.1)`, padding `10px 14px 16px` (extra bottom for
  the code). A small italic serif **Pantone code** ("`NOTE · N-04`" / "`CONTEXT ·
  C-02`" / "`INFO · I-01`") is absolute-positioned bottom-right (8px/9px, letter-
  spacing .18em, muted ink). The PARENT controls width + positioning; the chip
  auto-sizes height to content, `minWidth 140`, `minHeight 36` (empty state).
  `compact` mode (L1 swim-lane): tighter padding, no 140 floor, `clampLines`, and
  the code is hidden (`showCode={false}`) — L1 stickies are always below the size
  threshold so the code only ever surfaces on Layer 2 + the node panel.
- **Three band families** (one colour per type — `CHIP` map in `theme.ts`):
  Note = yellow `--note-fill #f2e4a8`; Context = coral `--context-fill #e8b89a`;
  Information = lavender `--info-fill #d8c6e4`. Each has a muted `*-code` ink.
  Decision (William): keep Information distinct (3rd family, prefix `I`), and L1
  stickies get the chip *look* but stay compact with the code hidden.
- **Applied at:** Layer 2 sub-node chips + L1-notes-on-L2 (`Layer2Canvas.tsx`,
  `<SubnodeChip type={b.kind}…>` / `type="note"`); Wave-2 node panel Notes +
  Context sections (`Timeline.tsx`, wraps a click button); L1 swim-lane stickies
  (`Timeline.tsx`, compact). L2 connector/socket colour now = `darken(CHIP[kind]
  .fill)` so the wire matches the chip family.
- **Pantone codes — generation + persistence.** Migration
  `supabase/pantone-codes.sql` adds `pantone_code text` to **`notes`** and
  **`bubbles`** and backfills existing rows (N-NN per node; C-NN context-family /
  I-NN information, per node, in `created_at` order). Numbering rule lives in
  `src/lib/pantone.ts` (`nextPantoneCode(prefix, existing)` = max existing number
  for that prefix + 1 → **stable across deletes, never reuses a freed number**;
  `bubblePrefix(type)`). Generated server-side: `createNote` (layer1/actions) and
  `createBubble` (project/[id]/actions) insert the row, then a SEPARATE tolerant
  UPDATE sets the code (so creation still works pre-migration — code stays null
  until the backfill runs); both now return `{ id, code }`. `updateBubbleMeta`
  reassigns the code when the type family flips C↔I so the prefix keeps matching
  the type. Codes surfaced to the client via tolerant overlay queries in
  `project/[id]/page.tsx` (bubbles + notes) and `getNodeDetail` (panel); `L2Bubble`/
  `L2NoteItem`/`NodeDetail` gained a `code` field. L1 lane notes are NOT plumbed a
  code (compact, hidden) to avoid making the main `/layer1` query column-fragile.
- **Resize: KEPT** (manual, user-controlled). The spec's OUT-OF-SCOPE line was
  first read as "remove manual resize"; William then asked for it back, so the L2
  sub-node corner handle (width+height, 104–380 × 32–440) and the L2-note width
  handle (104–320) are restored, persisting via `updateBubbleSize` /
  `updateNoteLayout`. Resize min-width (104) == `SubnodeChip` minWidth floor (104,
  enough for the corner code on one line) == chip minHeight 30, ON PURPOSE: if the
  chip's floors exceeded the wrapper width/height it would render bigger than its
  wrapper and shove the corner handle off the corner. `SubnodeChip` is a flex
  column whose body flexes + scrolls,
  so a pinned height never spills past the band; with no height set it auto-grows.
  `bubbleLayout` resolves w/h as live override → persisted width/height → default
  (BUBBLE_W / auto). The bubble editor still persists `title`/`shape`, but the
  chip ignores them now (fixed 4px radius, body-in-band): a harmless dead control
  to retire in a later pass.

## AI project generation — UI scaffolding (AI parser NOT wired yet)

Interactive Generate UI in Layer 1 that captures input and hands it to a STUB.
The real parser is a separate forthcoming brief — this is just the harness.

- **🔌 Plug-in point:** `src/app/layer1/generateStub.ts` —
  `triggerGenerationStub(input: GenerationInput)` with a big `TODO(ai-brief)`
  banner. Logs the input + resolves; creates no projects, consumes no imports.
  `GenerationInput = { sourceType: 'auto-detect'|'gmail-thread'|'meeting-notes'|
  'brain-dump'; pasteContent; projectName: string|null; tagHints: string|null }`.
  Shared cap `GENERATION_INPUT_LIMIT = 50_000`. The AI brief replaces the BODY,
  keeps the signature; both callers pass a validated `GenerationInput`.
- **Toolbar Generate button + dialog:** `src/app/layer1/GenerateButton.tsx`
  (client). Rendered in `page.tsx` header **left of `<NewProjectButton/>`**, same
  filled-oxblood style. Dialog reuses the app's modal pattern (`fixed inset-0 z-40
  bg-black/40` + stopPropagation card): header (serif 16/500 + ti-x), SOURCE pills
  (Auto-detect default = filled oxblood; others 0.5px-hairline outline), PASTE
  CONTENT textarea (min-h 130, resize-y, 50k clamp + inline warning), optional
  PROJECT NAME + TAG HINTS, footer (hardcoded `12 imports remaining`, always
  shown + `Generate · 1 import`). Submit disabled until paste non-empty; on submit
  → build input → `triggerGenerationStub` → close (discards) → toast. ×/backdrop/
  Esc close and discard.
- **Quick paste bar:** `src/app/layer1/QuickPasteBar.tsx` (client). Rendered in
  `page.tsx` **between `</header>` and `<WandProvider>`** (above the Arrange/Filter
  `Toolbar` row). 40px row, `bg-paper` (a touch darker than the toolbar's
  `bg-paper-surface`), 0.5px hairline top+bottom, `px-6` to match the toolbar.
  Clipboard icon · flex input · right side = italic "⌘V works anywhere" hint when
  empty, swapped for a SMALLER inline `Generate · 1 import` (5×11px, 12px) when it
  has content. Enter ≡ inline Generate. Fires the SAME stub with
  `{ sourceType:'auto-detect', pasteContent:value, projectName:null, tagHints:null }`,
  then clears. 50k truncate + warning.
- **Global ⌘V capture:** single `window` `keydown` listener in QuickPasteBar's
  `useEffect` (cleaned up on unmount). On (meta|ctrl)+V, if focus is NOT in an
  INPUT/TEXTAREA/contenteditable (`focusIsEditable()`), `preventDefault` + read
  `navigator.clipboard.readText()` → clamp into the bar → focus it; on
  rejection (permission/unavailable) it just focuses the bar (graceful). When
  focus IS in a field, it's left alone → native paste, no double-paste.
- **Toast (new — app had none, used `alert`):** `src/app/layer1/Toast.tsx` —
  `showToast(msg)` dispatches a `sirma:toast` CustomEvent; `<ToastHost/>` (mounted
  once at the end of `page.tsx`) renders a bottom-centre transient. Both Generate
  surfaces toast *"Generation queued (AI not yet wired up)"*.
- **Icons:** `src/app/layer1/GenerateIcons.tsx` — hand-rolled ti-sparkles / ti-x /
  ti-clipboard SVGs (no icon lib in the project).
- **Token note:** the brief's "border-tertiary" maps to the existing `--hairline`
  token, used inline at `0.5px` (Tailwind `border-*` is 1px).

## AI project generation — pipeline (Phases 1–3, WIRED)

Paste content → Haiku (structure) → Sonnet (context) → a real project in Layer 2.
The stub from the UI brief is gone; `triggerGeneration` POSTs to the backend.

### Architecture / files
- **Route:** `src/app/api/generate-project/route.ts` (POST). Imports the LLM
  factory — NOT the SDK. Flow: validate size (413 before any debit) → auth (401)
  → resolve workspace + writer check (403) → `consume_import` (402 if exhausted)
  → provider.generateStructure → provider.generateContexts → total-token check →
  `generate_ai_project` RPC (atomic persist) → link 'consumed' event to project
  (+ tokens, via service role) → `{ projectId }`. ANY failure after the debit
  calls `refund_import` and returns `GenerationError.httpStatus` (504 timeout / 500).
- **Provider abstraction** (swappable LLM): `src/lib/llm/`
  - `types.ts` — `LLMProvider` interface (`generateStructure`, `generateContexts`),
    `StructureInput/Output`, `ContextsInput/Output`, `StageResult<T>`,
    `GenerationError{httpStatus}`, `TOKEN_BUDGET`, `OUTPUT_CAPS`.
  - `providers/anthropic.ts` — the ONLY file importing `@anthropic-ai/sdk`. The
    Haiku→Sonnet pipeline. To add OpenAI/Google: new file here + a `case` in the
    factory + set `LLM_PROVIDER`. Nothing else changes.
  - `index.ts` — `getLLMProvider()` factory (`LLM_PROVIDER`, default `anthropic`)
    + `toGenerationPayload()` mapper (re-clamps caps; guarantees ≥ 1 node).
- **Frontend:** `src/app/layer1/generate.ts` (`triggerGeneration`, `GENERATED_FLAG`),
  `GenerateButton.tsx` (dialog, loading spinner, success→`router.push`, error keeps
  input), `QuickPasteBar.tsx` (same), `project/[id]/GenerationToast.tsx` (reads the
  sessionStorage flag, flashes the Layer-2 toast once + hosts `<ToastHost/>`).

### Models + SDK patterns
- Haiku `claude-haiku-4-5` (structure), Sonnet `claude-sonnet-4-6` (context) — user
  spec, NOT the Opus default. `client.messages.create({...}, { signal })`.
- **NO `output_config`/structured-outputs** — prompt-instructed JSON + `extractJson`
  (strips ``` fences) + hand-rolled validator + ONE corrective retry (feeds the exact
  error back as an assistant+user turn; the retry turn ends on `user`, so no
  last-assistant-prefill 400). Second failure → throw → refund.
- **Token caps** (input+output+cache, from `response.usage`): Haiku ≤ 30k, Sonnet ≤
  70k (checked per stage), total ≤ 100k (checked in the route). `max_tokens` 8k/16k.
- **Timeouts:** 30s/stage via `AbortController` (`{ signal }`); abort → `GenerationError(504)`.
- **Prompt caching:** `cache_control:{type:"ephemeral"}` on the stable system block;
  volatile bits (today, paste, hints) live in the USER turn. (Prompts may sit below
  Haiku's 4096-token cache minimum — harmless; caches when long enough.)

### JSON schemas
- **Haiku (structure):** `{ project: { title, deadline: string|null, primary_participant: string|null, tags: string[] }, nodes: [ { id, title, date(YYYY-MM-DD), type: "node"|"ambition", tags: string[] } ] }` (node `tags` = subset of project tags relevant to that event; optional in the validator)
- **Sonnet (context):** same, each node + `contexts: [ { body } ]` (0–5).

### System prompts — VERBATIM (keep in sync with `providers/anthropic.ts`)

**HAIKU_SYSTEM:**
> You are the STRUCTURE-EXTRACTION stage of Sirmathread's project parser. You read raw source content (an email thread, meeting notes, or freeform text) and extract a project and its timeline of events as strict JSON. You do NOT write narrative context — that is a later stage.
>
> PROCESSING RULES
> - Identify events that have a known or reasonably inferable date from the source content.
> - Create a node ONLY when the event is meaningful. EXCLUDE routine acknowledgments, administrative confirmations, out-of-office replies, pleasantries, and signature blocks.
> - One node per distinct EVENT — not per email and not per message. Consolidate a multi-message discussion of the same event into a SINGLE node.
> - Node titles are 2–6 words, an active verb phrase. Good: "Ting provides card number". Bad: "Card number information from Ting".
> - If an event's date is genuinely unknown and cannot be reasonably inferred, SKIP the event rather than fabricate a date.
> - Classify each node by its date relative to TODAY (the parse date is given in the user message): past or today → "node"; future → "ambition".
> - Project metadata: a declarative, concise title; a deadline ONLY if one is explicitly stated in the source (otherwise null); identify the primary participant — the main "character" — when there is a clear one (otherwise null).
> - Tag detection: extract people, organizations, and recurring topics as tags. Normalize variants to the fullest form (e.g. "Ting" and "Ting Lee" → "Ting Lee"). Any user-supplied tag hints take PRIORITY and must be included. Maximum 5 tags.
> - Per-node tags: for EACH node, also set "tags" to the subset of project tags directly involved in THAT event (exact same strings; do not invent node-only tags). Empty array if none. Max 4 per node.
> - Prefer FEWER nodes over more when uncertain. Skip noise. NEVER invent facts, dates, names, or events that are not supported by the source.
> - When the content is genuinely unstructurable, output a minimal valid result: one project with a single node titled to signal that it could not be structured further (e.g. "Unstructured note captured").
> - HARD CAP: at most 50 nodes per project. If you approach that, consolidate aggressively.
>
> OUTPUT — Return ONLY a single JSON object (no markdown/fences/commentary) matching the structure schema; generate a unique "id" per node; every "date" MUST be ISO YYYY-MM-DD.

**SONNET_SYSTEM:**
> You are the SUBNODE-GENERATION stage of Sirmathread's project parser. You receive (1) a structured project + node list produced by an earlier stage, and (2) the ORIGINAL source content for grounding. Your job is to attach short factual subnodes — INFORMATION and CONTEXT — to the nodes. You do NOT change the project, and you do NOT add, remove, rename, or re-date any node.
>
> VOICE — Declarative, factual, third person, neutral. NO opinion, speculation, or attempts to mimic anyone's voice.
>
> SUBNODES — INFORMATION vs CONTEXT
> For each node, output up to 3 INFORMATION (facts, 1 sentence, ≤150 chars) and up to 3 CONTEXT (explanatory background, 2-3 sentences, ≤300 chars).
> - INFORMATION = the "what." Direct factual claim from the source. Example: "The vendor confirmed delivery on April 15."
> - CONTEXT = the "why" or "how." Background that explains a fact. Example: "The vendor is a Tier-1 supplier providing 60% of raw material."
> - Split mixed sentences — facts to INFORMATION, background to CONTEXT. Never combine both in one subnode. When unsure, choose INFORMATION.
> - Voice: declarative, factual, third person. Never invent.
>
> OUTPUT — Return ONLY a single JSON object (no markdown/fences/commentary). Per-node shape: `{ id, title, date, type, "informations": [ string ], "contexts": [ string ] }` (each 0–3 plain strings); preserve every node's id/title/date/type EXACTLY.
- **Schema change:** Stage-2 per-node went from `contexts: [{body}]` to flat string
  arrays `informations: [string]` + `contexts: [string]`. Persisted as `bubbles`
  rows, `source='ai'`: `bubble_type='information'` (above the node) /
  `'context'` (below). `supabase/ai-informations.sql` replaces `generate_ai_project`
  to insert both loops (legacy `kind` stays `'context'`).

### Subnode safety truncation
- `truncateAtWord(text, max)` in `lib/llm/index.ts` (called by `mapSubnodes` inside
  `toGenerationPayload`): cuts at the nearest word boundary before `max`, appends `…`
  (final length ≤ max); hard-cuts only when there's no word break past 60% of the
  limit (one long token). **Caps: INFORMATION ≤ 150, CONTEXT ≤ 300.** Runs ONLY at
  generation (everything here is `source='ai'`). Returns
  `{ payload, contextsTruncated, informationsTruncated }`; the route logs the pair
  `{ contexts_truncated, informations_truncated }` and stores the SUM in the
  `consumed` import_events `truncations` column (`supabase/import-truncations.sql`
  adds it — tolerant: route retries without it if unmigrated). A user edit
  (`updateBubble`) flips the row to `source='manual'`, so it never re-enters
  truncation. **Notes are NOT AI-generated** (user-only by design).

### Imports ledger (`supabase/imports-ledger.sql`)
- `workspace_imports` (welcome bonus = 20) + `import_events` audit. RLS read-own;
  writes locked to SECURITY DEFINER funcs / service role.
- `consume_import(org)` — guarded atomic decrement + `consumed` event; flips
  `welcome_bonus_consumed` at ≥5 used; returns `{ ok, reason?, remaining?, event_id }`.
- `refund_import(org, project, tokens)` — increment + `refunded` event.
- `generate_ai_project(org, user, payload)` — project + nodes + Contexts (`source='ai'`)
  in ONE transaction; returns project id. **Persists every item as a `nodes` row** —
  AI `type:"ambition"` items become future-dated nodes (NOT the native `ambitions`
  table). One-line RPC change if that's ever wanted.

### Error matrix (route → client copy)
| Status | When | Copy |
|---|---|---|
| 413 | paste > 50,000 chars (before debit) | "That's too long — paste a smaller section (max 50,000 characters)." |
| 401 / 403 | not signed in / viewer / no workspace | surfaced as-is |
| 402 | `imports_remaining` = 0 | "You're out of imports. Top up or upgrade to keep generating." |
| 504 | a stage timed out (30s) | "Generation failed. Your import is back in the bag. Try again, or simplify your paste." |
| 500 | parse/validation/persist failure | same as 504 |
- Client (`triggerGeneration`) surfaces the API's `error` field; dialog/bar stay open
  with input preserved on every error. Success: set `GENERATED_FLAG`, navigate to
  `/project/<id>`, flash toast there.

### Imports indicator
- Toolbar (`GenerateButton` header): shown only when `welcome_bonus_consumed` AND
  `imports_remaining ≤ 5`; warm amber (`#b06a2c`) when ≤ 3. Dialog footer: ALWAYS
  shows the real remaining count. Data fetched in `layer1/page.tsx` (tolerant; no row
  = 20 / not-consumed).

### Env
- `ANTHROPIC_API_KEY` — server only (`.env.local` + Netlify). `LLM_PROVIDER` optional
  (default `anthropic`). SDK install needed `NODE_OPTIONS=--use-system-ca` (corporate CA).

## Adaptive Layer-2 layout (content-aware, no overlap)

The serpentine layout in `Layer2Canvas.tsx` now sizes itself to actual sub-node
footprints instead of fixed slots — fixing the overlap/clipping that AI projects
(many Information + Context chips per node) produced.

- **Chip natural height:** `SubnodeChip` body is `overflow: visible` by default
  (`scroll` prop, only `true` when a user pins a height via resize → `overflow:auto`).
  No more internal scroll arrows; a 4-line context is a 4-line chip.
- **Real-height stacking:** `estChipH(text, w)` estimates a chip's height from text
  length ÷ chars-per-line (≈ `(w-28)/6.6`) × line-height ~18 + 26 vpad (min 36). Each
  node's bubbles stack per side with CUMULATIVE real heights + `SUB_GAP` (12), giving
  `bubbleOffset` (per-bubble centre offset) and `reachAbove`/`reachBelow` (how far the
  stack extends). `bubbleLayout` uses `bubbleOffset` as the default (drag/persisted
  offsets still win). The old fixed `SUBNODE_H`/`STACK` slot survives only as a
  fallback; `ROW_H` is gone.
- **Adaptive rows:** per row, `maxAbove`/`maxBelow` = max reach of its nodes; row Y is
  cumulative: `rowY[r] = rowY[r-1] + maxBelow[r-1] + ROW_VPAD(30) + maxAbove[r]`. So a
  row with tall stacks pushes the next row down exactly enough — no overlap.
- **Horizontal/time-gap layout UNTOUCHED:** x-spacing is still `spacingFor(gapDays)`
  (≥ `MIN_SPACING` 200 ≥ `BUBBLE_W` 190, so adjacent chips already clear). The "~N
  weeks later" annotations are unchanged.
- **"Initial layout" = the render-time computation.** A fresh AI project has no
  position overrides, so the adaptive layout IS what renders (no persist step, no
  server-side layout). **"Re-run initial layout"** button (top-right of the canvas,
  `canEdit` only) calls `resetL2Layout(projectId)` → nulls `nodes.l2_x/l2_y`,
  `bubbles.x/y`, `notes.l2_x/l2_y/l2_w`, clears in-session overrides, `router.refresh()`
  → algorithmic layout. This intentionally discards manual drags (per brief). Drag/
  resize themselves are unchanged.
- **Design note:** the brief framed this as "write positions to the layout store";
  clearing overrides (so the responsive computed layout renders) is equivalent and
  more robust than persisting absolute coordinates (which wouldn't survive a width
  change). Per-row gap uses each row's own max reach (close to the brief's
  "max(descending N, ascending N+1)").

## BYO LLM (mechanical parse — zero AI on our side)

User runs their content through their OWN LLM with our template, pastes the output
back, and we parse it deterministically. No Anthropic call, no import cost.

- **Architecture (5 files):**
  - `src/lib/prompts/byo-template.txt` — the prompt template (canonical text).
  - `src/lib/prompts/byoTemplate.ts` — `BYO_TEMPLATE` string mirror (imported by the
    UI so it's always bundled; keep identical to the `.txt`).
  - `src/lib/byo/parser.ts` — `parseByo(raw)` (pure) + `parser.test.ts` (vitest, `npm test`).
  - `src/app/api/parse-byo/route.ts` — the endpoint.
  - UI: the **BYO LLM** tab in `GenerateButton.tsx`; `parseByoRequest` in `layer1/generate.ts`.
- **Sentinel grammar:** blocks separated by blank lines / `--- *** ___` rules. Each
  line `KEY: VALUE` split on the FIRST colon, KEY trimmed+uppercased. Single-value:
  `PROJECT TAGS DATE TITLE TYPE` (last wins). Repeating arrays: `INFO CONTEXT`.
  Unknown keys / colon-less lines skipped silently. A block with PROJECT = metadata;
  with DATE = event; neither = skip.
- **Parser algorithm:** preprocess (CRLF→\n, strip leading whitespace + bullets
  `- * •` + numbers `1. 2)` per line) → block-split → per-block parse → classify
  (dates via **chrono-node**, multi-format; unparseable date → `skippedCount`) →
  auto-project `Imported timeline · <earliest>` (sets `autoGenerated`) when no PROJECT
  → sort by date asc → word-boundary truncate (INFO 150 / CONTEXT 300 → `truncatedCount`)
  → cap 50. Returns `{ project{title,tags,autoGenerated}, events[{date,title,type,
  informations[],contexts[]}], skippedCount, truncatedCount }`. (No per-event count
  cap — template asks LLM for ≤3; parser keeps what it's given, char-truncates only.)
- **API contract:** `POST /api/parse-byo { rawText }`. 400 empty / >200,000 chars;
  401/403 auth/writer; **422** when 0 events parsed (any reason — "No dated events
  found…"; never creates an empty project); 200 `{ project_id, summary: { events, informations, contexts,
  skipped, truncated } }`. Persists via `generate_ai_project(…, p_source:"byo")` — the
  SAME atomic RPC as AI, now parameterised by source. **FREE:** no quota consume.
- **Schema (`supabase/byo-source.sql`):** `bubbles.source` += `'byo'`;
  `import_events.event_type` += `'byo'` (needed for the audit log — minimal additive
  widening beyond the brief's "source only", flagged); `generate_ai_project` gains
  `p_source text default 'ai'` (3-arg AI call still resolves via the default).
  Audit row `event_type='byo'` stores `truncations` (tolerant); the fuller count
  breakdown is returned in the response + console-logged (no columns for it).
- **UI:** 5th tab "BYO LLM" → read-only template textarea + "Copy template" button,
  editable "Paste your LLM output here", AI fields hidden, footer shows "Free — no
  import cost" + submit "Parse · no import cost". Success → navigate + summary toast
  (built client-side from `summary`, omitting the skipped/truncated clauses at 0).
  422/400 → inline error (no navigate); other errors → message kept in the dialog.
  The Layer-2 flash toast now reads a MESSAGE from `GENERATED_FLAG` (AI sets a fixed
  string, BYO sets the parse summary).

### BYO parser hardening — DATE-delimited, blank-line-independent

`parseByo` (`src/lib/byo/parser.ts`) was a blank-line BLOCK splitter: an LLM (or a
clipboard paste) that dropped the blank lines between blocks collapsed the whole
paste into one block, and because it held a `PROJECT:` line the parser took the
header and discarded EVERY event (`events_count:0`, project still created → empty
project). Rewritten as a **line-driven scan**: a new event starts at each `DATE:`
line; TITLE/TYPE/INFO/CONTEXT attach to the event under construction; PROJECT/TAGS
set the header (TAGS before PROJECT is buffered in `pendingTags`). Blank lines are
now optional, not load-bearing. Also tolerant of **markdown-decorated keys**
(`**DATE:**`, `### TITLE:`, `> INFO:`) via `normalizeKey()` + a leading-emphasis
strip on the value (only when the marker run is followed by whitespace/end, so a
genuine `*emphasis*` inside a value survives). Route guard tightened: `parse-byo`
now 422s whenever `events.length === 0` (previously only when the project was also
auto-generated — the exact gap the run-together paste fell through). Regression
tests in `parser.test.ts` cover both cases.

## AI/BYO generation — tag persistence (project + node) + ambition routing

Both generators DETECTED tags + ambitions but the persistence layer dropped both,
AND tags were only ever project-level. Fixed in `supabase/ai-tags-ambitions.sql`
(RPC links everything atomically) + a tag-resolution helper.

- **Ambitions (RPC).** `generate_ai_project` previously inserted EVERY payload node
  into `nodes` (hardcoded `state='promoted'`), ignoring `node_type`. Now the node
  loop branches: `node_type='ambition'` (future, classified by Haiku) → `insert into
  ambitions (project_id, organization_id, created_by_user_id, title, target_date)`
  then `continue` (NO bubbles — the `ambitions` table holds none, so an ambition's AI
  info/context is dropped BY DESIGN); else → the existing node + info/context inserts.
  `ambitions.organization_id` is NOT NULL (multi-user-orgs), so the insert passes it.
- **Tags — resolved in TS, LINKED in the RPC (atomic).** The payload now carries
  RESOLVED `tag_value_ids` (NOT tag strings): `project.tag_value_ids` + per-node
  `tag_value_ids`. The RPC links `project_tag_values`, `node_tag_values` (array order
  = `position`; 0 = primary fill colour), and `ambition_tag_values`. Resolution lives
  in `src/lib/tags/`: `resolveTags.ts` (pure: case-insensitive/trimmed match vs the
  workspace's existing `tag_values`, first-casing-wins, returns `{linkIds, toCreate,
  matched}` + a `tagIdsFor(names, map)` lookup; unit-tested) and `ensureTagValueIds.ts`
  (reuses existing + auto-creates new under a find-or-create **"Auto-detected"**
  category, colours cycled from `SPINE_PALETTE`; **NEVER throws** — returns a possibly
  empty `lower(name)→id` map so a tag hiccup can't fail/refund a generation).
- **Per-node tags (AI only).** Haiku emits `nodes[].tags` (subset of project tags for
  that event). The route builds `nodeTagsById` from the STRUCTURE stage (keyed by AI
  node id — NOT trusted to survive Sonnet) and `toGenerationPayload` maps each node's
  tag strings → ids via the resolved map. BYO has no per-node tags (template doesn't
  ask) — its nodes get `tag_value_ids: []`; project tags still link.
- **Route flow.** `generate-project`: gather project+node tag strings → `ensureTagValueIds`
  → `toGenerationPayload({tagMap, nodeTagsById})` → RPC. `parse-byo`: `ensureTagValueIds`
  on project tags → `tagIdsFor` → payload. (The old post-hoc `applyDetectedTags` helper
  is gone — linking is now inside the RPC transaction.)
- **The LLM is NOT given the existing tag vocabulary** as a prompt hint — reuse is
  match-on-persist only; feeding the catalog to Haiku (so "John" aligns to existing
  "John Smith") is a deferred option.

### Layer 2 now renders ambitions (`project/[id]`)

Ambitions were Layer-1-only; the project page query didn't even fetch the table, so
AI/manual future items vanished after generation. `page.tsx` now selects
`ambitions(id, title, target_date, done)` in the main query + an ambition-tags overlay
(`ambition_tag_values`, tolerant) → `L2Ambition[]`. `Layer2Canvas` renders them as
**round dashed markers** in a row beneath the last spine row (wrapping past COL_W),
joined to the thread by a dashed wire; fill = primary tag colour, done → muted + check.
READ-ONLY on Layer 2 (create/edit stays on Layer 1) to keep the change contained — no
drag/edit handlers. Header shows `· N planned`. Edge case: an all-future project (0
spine nodes) still hits the "only future items" empty-state message rather than a
bespoke ambitions-only canvas.

## Mobile breakpoint (≤640px) — Layer 1 list + vertical timeline

A NEW responsive layer, not a restyle. Desktop (>640px) is byte-identical to before.

- **Breakpoint source of truth:** `src/app/useIsMobile.ts` (`MOBILE_MAX = 640`,
  `matchMedia('(max-width:640px)')`, re-reads on resize; returns `boolean | null`).
  `src/app/ResponsiveSwitch.tsx` renders `desktop` OR `mobile`: while `null` (first
  paint) BOTH render, each wrapped in `hidden min-[641px]:block` / `min-[641px]:hidden`
  so CSS shows the right one with no flash/hydration-mismatch; after mount only the
  matched subtree stays mounted (heavy desktop canvas never mounts on phones). The
  `min-[641px]` classes mirror `MOBILE_MAX` so JS+CSS can't disagree.
- **Pages compose, not fork:** `layer1/page.tsx` and `project/[id]/page.tsx` fetch+shape
  data exactly as before, then return `<ResponsiveSwitch desktop={…} mobile={…}/>`.
- **Reused (no parallel types):** `Lane`/`LaneNode`/`Ambition`/`Note` (now exported from
  `Timeline.tsx`); `L2Node`/`L2Bubble`/`L2Ambition`/`L2NoteItem` (Layer2Canvas);
  `SubnodeChip` + `CHIP` (note/information/context fills); `deadlineStage`+`lane.attention`;
  `tagColors` + primary = `tags[0]`.
- **Shared util lift (verbatim, no signature change):** `src/lib/dateFormat.ts` now owns
  `fmtEU` (was Timeline.tsx) and `humanGap`+`GAP_NOTE_DAYS` (was Layer2Canvas.tsx); both
  desktop files import them. Output unchanged.
- **Screen 1 — `MobileLayer1List.tsx`:** vertical cards from `lanes`. Left spine =
  primary-tag colour; attention dot only when `attention==='alert'`; ≤2 tag pills + "+N"
  (truncating); meta = node count + ONE date (next deadline/ambition else last-updated).
  Chips All/Needs me/Recent = single-select segmented control composing `attention` +
  last-updated sort (NO new filter params). No search/+ rendered.
- **Screen 2 — `MobileProjectTimeline.tsx`:** vertical spine; per node NOTES (inline,
  first) → INFO (inline, `clampLines={2}`) → CONTEXT (tap to expand). CONTEXT is the only
  collapsible (accordion; node is a real `<button aria-expanded>` only when it has context;
  chevron rotates; `scrollIntoView({block:'nearest'})` keeps tapped node visible). Ambitions
  = dashed hollow ring; deadline nodes = solid alert-colour ring on the dot (the desktop
  4-quarter clock is desktop-only — too small to read on a mobile dot). Gaps reuse
  `humanGap`/`GAP_NOTE_DAYS`. **Sub-tag bars are DROPPED on mobile** (too cramped on a
  narrow row) — only the primary tag colours the dot. Project-level notes (no nodeId) show
  in a block above the timeline. Notes are view-only on mobile in this PR.
