# WILLIAM_NOTES.md — Sirmathread

Plain-English reference. No code knowledge needed.

## What this is

Sirmathread turns your Gmail into visual project flowcharts.

- You label important emails in Gmail (you already do this, or will start).
- Each label becomes a **project** in Sirmathread.
- Sirmathread reads those emails, picks the important ones, and lays them out as a chain on a timeline.
- **Layer 1** shows all your projects flowing across a calendar — bird's-eye view.
- **Layer 2** opens when you click one project — you see that project's emails in detail, with context and insights Claude generates around each one.

## The name

**Sirmathread** — Greek σύρμα (síma, "wire") + English "thread." The double meaning is the whole point: emails come in *threads*, and we connect them with *wires* on a canvas. Originally just "Sirma," but a Bulgarian software company (Sirma Group) owns sirma.com and sirma.ai and would dominate any search for our brand. Sirmathread is distinctive enough to stand alone.

## What you can do at each layer

**Layer 1:**
- See all projects at a glance, on a shared timeline
- **Arrangement** control at the top — re-orders the lanes by your chosen sort:
  - Date created · Last updated · Deadline · Has users tag · **Inactive** (most stagnant first, for triage)
- **Filters** — narrow what's showing:
  - By tag (any category/value you've defined)
  - By deadline status: all deadlined / flat deadline (no user assigned) / user deadline
  - Hide completed (toggle)
  - **Inactive** (show only projects that have gone quiet — 45+ days no activity)
  - **Show archived** (toggle to reveal archived projects, grayed out)
- Add your own written notes anywhere
- Click a project to dive in
- Inactive projects sink to the bottom of the lane stack under all sort orders. Pick "Inactive" arrangement to bring them up for triage.

**Deadlines (project or node level):**
- Assign a date to any project or any email node
- The node fills with red from left to right as the deadline approaches, in 4 stages (25%, 50%, 75%, 100% = overdue and fully red)
- The project's underlying color stays visible on the unfilled portion, so you don't lose project identity
- Tick the deadline checkbox when work is done → node goes muted gray, no more shouting
- No deadline = node stays in its plain project color

**Tags — fully customizable:**
- Five default categories ship pre-seeded: Users, Client, Work type, Spam, Not important
- You can rename them, delete them, or add your own (e.g. "Priority", "Region", "Status")
- Each category holds a list of values you maintain (e.g. Users = Dinos, William, Maria...)
- Tags apply to whole projects, not to individual emails (for now)
- "Spam" and "Not important" hide tagged projects from the default view

**Layer 2:**
- See one project zoomed in
- **Email nodes are editable here.** Double-click any node to rename it (Sirmathread-only label, your Gmail is untouched). The rename also shows on Layer 1.
- Right-click or hover a node to get its menu: Edit label · Set deadline · Demote · Delete
- Read Claude's automatic notes around each email:
  - **Context bubbles (gray)** — background to help you understand what's going on
  - **Insight bubbles (purple)** — important points you should pay attention to
- Hover any email node to reveal a **+** button → add your own Context, Insight, or Note bubble
- Drag bubbles wherever you want. They stay where you put them.
- Edit the text of any bubble. Your edits are saved.
- Delete bubbles or notes you don't want. A small "Undo" toast appears for 5 seconds in case of mistakes.

## Project lifecycle: archive, trash, inactive

Sirmathread never deletes Gmail data — at worst you lose Sirmathread-only stuff (bubbles, notes, custom labels). Re-applying the Gmail label brings the project back from scratch.

**Four states:**
- **Active** — your normal project. Visible on Layer 1, syncing emails from Gmail, Claude generating insights.
- **Archived** — hidden from Layer 1 by default. Sirmathread stops syncing new emails. Unarchive to bring back.
- **Trash** — grace state before permanent deletion. Default 60 days, configurable. Restorable any time.
- **Purged** — gone from Sirmathread. Gmail still has everything.

**You can:**
- Archive any project manually (one click)
- Send any project to Trash (with a typed confirmation if skipping archive)
- Restore from Trash before it auto-purges
- Empty Trash manually if you want it gone now

**Sirmathread will auto-archive a project** if it has no new emails AND no edits from you for 120 days (default — change in settings). Silent move, no notification. You can unarchive any time.

**Inactive projects (45+ days quiet, default)** don't disappear — they just sink to the bottom of Layer 1. Pick "Inactive" arrangement to bring them to the top for triage.

**Node demote vs. delete:**
- **Demote** = remove the email from Layer 1, but keep it on Layer 2 as a small branch bubble (treated like context). You can promote it back to a real node any time. Good for when Claude over-promoted something.
- **Delete** = remove from both layers. Gmail untouched.

**Deleting a project** shows a confirmation: "this will also remove X bubbles, Y notes, Z demoted nodes." Same for deleting a tag value that's in use ("this tag is on N projects — untag all and delete?").

## What Sirmathread will never do

- Send emails for you
- Delete or modify emails
- Touch any Gmail label you didn't tell it to

Read-only product. Your inbox is safe.

## Status right now

**Updated 2026-05-25 (session 2):** The app now exists and runs! We:
- Confirmed your computer has the needed tools (Node.js, npm, Git).
- Built the blank Next.js + TypeScript + Tailwind project skeleton in this folder.
- Replaced the generic starter page with your branded **"Sirmathread"** welcome page.
- Ran it locally — visible at http://localhost:3000 while the dev server is on.
- Saved the first Git snapshot (a permanent, restorable backup of everything so far).

**To see it again later:** ask Claude to "start the server," then open http://localhost:3000 in a browser. Ask Claude to "stop the server" when done.

**Also done in session 2:** Supabase (the database) is created and connected — we ran a test that confirmed the app can reach it. Your keys live in a private file (`.env.local`) that Git never uploads.

**Database tables created (session 2).** All 10 tables now exist in Supabase — projects, emails, nodes, notes, bubbles, tags (3 tables), profiles, preferences — each with per-user security locks ("Row-Level Security") so users only ever see their own data. We chose to build it multi-user-ready from the start so there's no rebuild later. The table design is saved in your project at `supabase/schema.sql`.

**"Sign in with Google" now works (session 2).** You can log in at http://localhost:3000 with your Google account, and the app shows you as signed in. Signing in automatically creates your profile + settings in the database. Two accounts exist from testing (wv.vlachos@gmail.com and williamvlachos1995@gmail.com) — the second can be cleaned up later.

- Setup involved: registering the app in Google Cloud Console, enabling Google in Supabase, and building the login screen + behind-the-scenes session handling.
- Snag we hit & fixed: Supabase's newer-style keys (sb_publishable.../sb_secret...) were rejected by the login service, so we switched to the classic "legacy" keys (the long eyJ... ones), which work everywhere.

**Layer 1 overview screen built & expanded (session 2) — first real screen!** Visit http://localhost:3000 → "Open your projects →" (or /layer1). Projects shown as horizontal lanes on a shared **calendar timeline that spans 2 years back → 2 years forward** (scroll both ways; it auto-jumps to recent activity on load). The month axis stays frozen at the top and project names freeze on the left as you scroll. Nodes are placed by date, joined by wires; deadline nodes fill red in stages; "done" nodes go muted gray. Lanes are tall enough for labels/annotations.

**Toolbar** at the top now has:
- **Arrange** — sort lanes by Last updated / Date created / Deadline / Most inactive, with an ascending/descending toggle.
- **Filter** — Has-a-deadline, Hide completed, Show archived, Inactive only.
- **Tags** — placeholder for now ("coming soon"); we'll build tag filtering in a later pass but the data model already supports it.
- Note: filter/sort choices live in the page address for now (not yet saved permanently between sessions).

Currently filled with **20 dummy projects** (activity spread across the last ~6 months) so we can see how it behaves at scale. All dummy projects are marked "SAMPLE/" and can be wiped anytime. Re-seed with `node --env-file=.env.local supabase/seed-sample.mjs`.

**Timeline refined (session 2):** opens at **~1 month across** and has **zoom buttons (1w / 1m / 3m / 6m)** bottom-right. It loads the calendar **in chunks** — starts ~4 months back to ~2 months forward, with **"‹ Earlier" / "Later ›"** buttons that each add 2 more months (configurable later), plus a **"Today"** button to recenter. Much snappier than the old full-4-year canvas.

**Ambitions added (session 2) — the forward-looking feature!** Each project's latest node has a small **"+"** at its top-right. Click it → a box with a **mini-calendar** (European DD/MM/YYYY, week starts Monday) → set a **title + future target date** → it appears as a **round** marker out in the future, linked back by a **dashed wire** (round + dashed = "planned", vs solid squares = real past emails). **Click a round marker to tick it done** (muted + ✓); click again to reopen. Stored in a new `ambitions` table (`supabase/ambitions.sql`).

Next: clicking a lane should open Layer 2 (single-project detail with draggable context/insight/note bubbles). Make Ambitions/Earlier-Later configurable. Build tag filtering. Connect Gmail so real labeled threads replace the dummy data.

## What I need from you next

All design blockers cleared. Stack locked. Domain bought. API key created.

**Next session, Claude will bootstrap the actual project:**
- Create the Next.js + TypeScript skeleton
- Set up Supabase (free tier) and create the database tables from CLAUDE_NOTES
- Wire up the Anthropic SDK with a tiny test prompt to confirm the key works
- Deploy a "hello sirmathread" page to a Netlify preview URL so we have something live

After that, we build features in this order: Gmail OAuth → email sync → Claude scoring → Layer 1 canvas → Layer 2 canvas → bubbles → deadlines → tags → archive/delete → polish.

**Domain confirmed:** sirmathread.com (purchased on Porkbun).

## Logins / accounts (to be added as we go)

- Netlify: _account exists, will use this for hosting_
- Supabase: ✅ _project created (sirmathread); database connected and tested. Keys stored privately in `.env.local` (never uploaded). Database password saved by William._
- Domain (Porkbun): ✅ _sirmathread.com — purchased_
- Google Cloud Console: ✅ _project "Sirmathread" created; OAuth set up for "Sign in with Google" (used for login now, will extend to Gmail later). Client ID/secret stored privately in `.env.local`._
- Anthropic API key: ✅ _created, stored securely by William — will live in Netlify env var when deployed_
