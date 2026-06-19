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

## How things look (locked 2026-05-28)

Sirmathread has its own look, called **"Kraft & oxblood"** — a warm manila/kraft paper background and a deep oxblood red as the signature colour. Project names and the brand appear in a serif (book-style) typeface; small labels on nodes use a clean sans-serif. The intent: feel like a workbench/journal, not another dark-mode SaaS app, and visibly distinct from Anthropic's own cream-and-serif look (theirs is cream, ours is warmer manila; theirs never uses oxblood).

**Three independent things can be shown on a node**, and they never fight each other:

1. **Fill colour = the tag.** An untagged node shows in plain paper-cream with a thin oxblood outline. Give it one tag and the whole node takes that tag's colour. Give it more tags and the node fills with the *primary* tag's colour; each additional tag appears as a thin coloured **bar underneath the node** (small gaps between bars so they don't merge). When you zoom far out (3 months / 6 months across), bars fade away because nodes are too small to read — at those zooms you use the lens instead.
2. **Red border = the deadline.** A snug red outline hugs the node, filling in **clockwise from the top in four stages** as the deadline approaches: top edge → top+right → top+right+bottom → all four sides. The split is proportional: from the moment you set the deadline to the deadline date is the "runway," cut into quarters. Both due-today and overdue look the same (fully outlined) — we don't shout louder, we just show the deadline is here.
3. **Origin colour (Gmail vs manual) is gone.** Nodes no longer come in green or blue. Origin will only show up in a detail panel if we ever surface it again.

**Completing a deadline:** tick the node done → the red border vanishes and the node returns to its plain tag-coloured form, with a small check mark inside.

**Tag lens:** to find every node carrying a given tag across all your projects, pick the tag (using the magic wand you already know). Every matching node glows; everything else dims. Turn it off and the canvas calms down again. Works at every zoom level.

**Tags work the same on projects and nodes:** one shared list of tags, applied to either. Project tags show as readable pills under the project name on the left.

**Node-type icons (optional):** by default a node is plain. You can optionally tag it with a *type* (email, decision, meeting, payment, deadline, etc.) and it'll show a tiny line icon. Never required — only if you want it.

**Ambitions (future plans) are unchanged:** still drawn as dashed-outline circles on dashed wires.

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
- **Arrange** — sort lanes by Last updated / Date created / **Ambitiousness** (most ambitions first) / Deadline / Most inactive, with an ascending/descending toggle. **Last updated is the tiebreaker** for every sort (so within equal values, the most recently touched float up). Inactive projects naturally drift to the bottom under Last updated / Date created.
- **The Arrange menu learns from you:** it counts how often you pick each option (shown as a number beside it) and reorders them most-used-first — but **Last updated stays pinned at the top** as the default, so e.g. if you favour Ambitiousness it settles into the second slot. (Counts are stored in your browser for now; can move to your account later.)
- **Inactive projects are dimmed** (~55% opacity, colour kept) once they've had no activity for 45 days — a gentle "this has gone quiet" signal. They are not hidden or greyed out.
- **Filter** — Has-a-deadline, Hide completed, Show archived, Inactive only.
- **Tags** — placeholder for now ("coming soon"); we'll build tag filtering in a later pass but the data model already supports it.
- Note: filter/sort choices live in the page address for now (not yet saved permanently between sessions).

Currently filled with **20 dummy projects** (activity spread across the last ~6 months) so we can see how it behaves at scale. All dummy projects are marked "SAMPLE/" and can be wiped anytime. Re-seed with `node --env-file=.env.local supabase/seed-sample.mjs`.

**Timeline refined (session 2):** opens at **~1 month across** and has **zoom buttons (1w / 1m / 3m / 6m)** bottom-right. It loads the calendar **in chunks** — starts ~4 months back to ~2 months forward, with **"‹ Earlier" / "Later ›"** buttons that each add 2 more months (configurable later), plus a **"Today"** button to recenter. Much snappier than the old full-4-year canvas.

**Ambitions added (session 2) — the forward-looking feature!** Each project's latest node has a small **"+"** at its top-right. Click it → a box with a **mini-calendar** (European DD/MM/YYYY, week starts Monday) → set a **title + future target date** → it appears as a **round** marker out in the future, linked back by a **dashed wire** (round + dashed = "planned", vs solid squares = real past emails). **Click a round marker to tick it done** (muted + ✓); click again to reopen. Stored in a new `ambitions` table (`supabase/ambitions.sql`).

**Manual projects & nodes added (session 2).** A blue **"+ New project"** button (top-right) opens a flow: name + start date → then it repeatedly asks "Add a node?" Each node is a title + date, and **a node can't be dated earlier than the previous one** (earlier days are greyed in the calendar). **Empty projects can be backdated** (no floor) so you can recreate older history. **Picking a future date automatically makes it an Ambition (round) instead of a node (square).** Each project's "+" does the same add-anytime.

**Colour now means origin:** Gmail-sourced = **light green**, manual = **deep blue**. (Red stays for deadline fills; other colours reserved for tags later. Your 20 dummy projects show green.)

**Deleting/archiving (session 2):** click a **node** → Delete. Click a **project name** → **Archive** (hides it, reversible — toggle "Show archived" to see it) or **Delete permanently** (asks for confirmation, listing how many nodes/ambitions go too; your Gmail is never touched). Behind the scenes this needed one database update (`supabase/manual-support.sql`, already run) that lets projects exist without a Gmail label and stamps each project/node as gmail or manual.

**Tags added (session 2).** 5 default categories seeded (Users, Client, Work type, Spam, Not important), each with colour values. Tags show as **coloured dots** on project labels and inside node squares (they fade in). Apply a tag two ways: **(1)** click a node/project → its menu has a **Tags** area with chips to toggle, or **(2)** the **🪄 magic wand** in the toolbar's Tags section — click it, pick a tag, then click any node/project to stamp it (Esc or click the wand again to stop; the cursor turns into a wand). Tag changes are **instant** (saved in the background) and the dots **arrange like dice pips** so many tags pack neatly in a node. **Filtering:** one **"Filters ▾"** button opens a single panel (status/deadline toggles + tags by category + show spam/low-priority); active filters show as **removable chips** in the bar; and a **"Quick"** strip surfaces the **3 filters you use most** for one-click access (learns from you). Spam / Not important hide their projects by default. All pop-ups are centred so they work in split-screen.

**Tags Manage panel done (session 2):** Tags → Manage is now a full editor — create/rename categories, add/rename values, pick each value's colour, toggle a category as a hide-filter, and delete categories/values (with a confirm, since it removes the tag from any projects/nodes using it).

**Deadlines added (session 2).** Click a **node** → its menu has **"Set deadline"** → mini-calendar → a **red countdown** fills the node in stages (from today → the date); the menu then offers **✓ Complete** (mutes it) and **Clear deadline**. **Ambitions** can optionally be deadlines: when you create a future item, tick **"Also set as a deadline"** and the round ambition gets the red countdown (from the day you made it → its target date); clicking it marks it done. (One-line DB addition `supabase/ambition-deadline.sql`, already run.)

**Notes added (session 2) — Layer 1 complete!** Each project's **"+"** now asks **📝 Note or ◯ Ambition**. A note appears in **amber** by the latest node, joined by a **dotted line**. **Drag** a note anywhere in its lane (the dotted line follows); a plain **click opens it** into a bigger box for easy reading/editing; **Delete** is inside the opened box. Idle notes are **resizable** — drag the little corner handle to size them anywhere from a tiny dot to about node-size (text clamps/hides so it never overflows); the size is remembered in your browser. (No DB change — the notes table already existed.)

Next: **Layer 2** — clicking a lane opens the single-project detail view with draggable context/insight/note bubbles and curved wires. Also pending: make Ambitions/Earlier-Later configurable; connect Gmail so real labeled threads replace the dummy data.

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

---

## Wave 2 — the node panel (clicking a node in the overview)

**What changed (Phase 1):** Clicking a node used to pop up a small box in the
middle of the screen with a "Save title / date" button. That's gone. Now a
clean panel **slides in from the right** with the page dimmed behind it.

In the panel you can:
- **Rename** the node — just type in the title at the top. It saves by itself
  when you click away or press Enter (no Save button). If something goes wrong
  it puts the old title back and shows a small red message.
- **Change the date** (manual nodes only) — click the date under the title and
  pick a new one. Email nodes keep the email's date.
- **Deadline** — a chip shows "Due <date>" (with a little ✕ to clear it) or
  "Set deadline" if there isn't one. Click it to pick/change the date.
- **Complete** — a chip toggles the node between Complete (green) and Incomplete.
- **Tags** — the tags currently on the node show as coloured pills; hover one to
  get an ✕ to remove it. Click **+ Tag** to open a little menu listing every tag
  in every category so you can add from any of them.
- **Delete** — bottom-left, with a "Delete this node? Yes / Cancel" confirm step.

Close it with the ✕ in the corner or by clicking the dimmed area.

**Still coming (Phase 2):** under the metadata, the panel will also show the
email excerpt, all the Notes and Context bubbles attached to that node, and an
**"Open in Layer 2"** button — and the panel will scroll while the top stays put.

### Wave 2 Phase 2 — the panel now shows everything

The node panel got its lower half. Below the title/date/deadline/tags, it now shows:

- **The email** — who it's from and when, the first few lines, and a **"View full
  email →"** link that opens the original thread in Gmail. (Hidden for nodes you
  made by hand, which have no email.)
- **Notes** — every note on that node, in the same yellow sticky style. Click one
  to edit it, or hit **+** to add. Changes show up on the overview straight away
  and in Layer 2 next time you open it.
- **Context** — every context/information bubble on that node. Click to edit (you
  can switch between Context and Information), or **+** to add a new one.

The top part (title, date, deadline, tags) **stays put** while the lower part
**scrolls**, so long notes/emails never push the important bits off screen.

At the very bottom: **Delete node** on the left (with a confirm), and a big
**"Open in Layer 2 →"** button on the right that jumps straight to that project's
detailed view.

### Wave 2 Phase 3 — the "+" add menu, redesigned

Clicking **+** on a project row now opens a tidy little popover right where you
clicked (instead of a box in the middle of the screen). It matches the new node
panel's look.

- Header: "Add to <project>" with "What would you like to add?" and an × to close.
- Three cards, each with a matching icon:
  - **Node** — a square outline (like the squares on the timeline). "A past event, up to today."
  - **Ambition** — a circle outline (like the ambition dots). "Something planned, in the future."
  - **Note** — a note icon on a soft yellow card. "A sticky reminder."
- All three still create exactly what they did before.
- Bottom-right there's a small **Set deadline** link (calendar icon). Click it to
  pick a date — this sets a deadline for the **whole project**. Once set, the link
  shows the date (e.g. "Deadline · 29 May"); open it again to change or clear it.

Close it with × or by clicking anywhere outside.

### Layer 2 — nodes are now resizable too

You could already drag the main nodes around in Layer 2; now you can also **resize**
them. Hover a node and a small handle appears at its bottom-left — drag it to make
the node bigger or smaller. The node stays centered where it is while it grows.

Both moving and resizing only affect **Layer 2** — they never change where a node
sits or how big it is on the overview (Layer 1). The only thing that crosses over
is **renaming**: change a node's title and the new title shows in both layers.

(One-time setup: run `supabase/node-size.sql` in the Supabase SQL editor so the
sizes are remembered between visits. Until then you can resize, but it won't be
saved after a reload.)

### Layer 2 — notes are now draggable + resizable

The yellow notes shown in Layer 2 can now be **moved** (drag the card) and
**resized** (drag the small handle at the bottom-right to make them wider/narrower).
This is Layer-2-only: rearranging or resizing a note here never changes where it
sits on the overview (Layer 1). Editing a note's *text* still happens on the
overview / in the node panel and shows in both places.

(One-time setup: run `supabase/note-layout.sql` so note positions/sizes are saved
between visits.)

### New look for notes & context — "Pantone chips" + reference codes

All the little note/context cards now share **one clean design** everywhere they
show up (the overview swim-lane, the Layer-2 project page, and the node panel):

- A **coloured card** with the text written directly on the colour in our
  signature oxblood ink, a subtle 4px-rounded corner, and a soft shadow — like a
  paint-chip. One colour per type:
  - **Note** → warm yellow
  - **Context** → coral
  - **Information** → soft lavender
- Each card carries a small **reference code** in the bottom-right corner, e.g.
  **`NOTE · N-04`**, **`CONTEXT · C-02`**, **`INFO · I-01`**. The number counts up
  per node, separately for each type, in the order you added them. **Codes are
  permanent:** if you delete N-02, the others keep their numbers (N-01 stays N-01,
  N-03 stays N-03) and the next new one continues from the highest. You can use a
  code to refer to a specific note in conversation or when prompting the AI later.
- Cards **grow taller to fit their text** and fill the width of their spot — no
  more manually resizing the little sub-cards in Layer 2 (that was removed on
  purpose; you can still drag them to move them). The tiny notes on the overview
  stay small, so their code is hidden there — look on the project page or the node
  panel to see the code.

**One-time setup:** run **`supabase/pantone-codes.sql`** in Supabase so the
reference codes are saved and stay stable. (Until you run it, everything still
works — the cards just won't show a code yet.)

### "Generate a project" button + quick paste bar (AI not wired yet)

There's a new **Generate** button in the top toolbar, just left of "+ New
project". Click it and a dialog opens where you can:
- pick a **source** (Auto-detect, Gmail thread, Meeting notes, Brain dump),
- **paste** an email thread / notes / any text (up to 50,000 characters),
- optionally type a **project name** and **tag hints** (or leave them blank).

There's also a slim **quick paste bar** just under the toolbar. Type or paste
into it and a small **Generate** button appears on the right; press Enter or
click it to submit. You can even press **⌘V / Ctrl+V anywhere on the page** (when
you're not typing in another box) and your clipboard drops straight into that bar.

**Important — the AI isn't connected yet.** This is just the screen + the buttons.
When you submit, **nothing is created and no "imports" are used** — it simply
captures what you typed and shows a little message: *"Generation queued (AI not
yet wired up)."* The actual AI that reads your text and builds a project is a
separate piece of work coming next. (The "12 imports remaining" number is a
placeholder for now too.)

### Generate is now LIVE — the AI actually builds the project

(This replaces the "AI isn't connected yet" note above.) When you click **Generate**
(in the dialog) or hit Enter in the quick paste bar, Sirmathread now really reads
your pasted text with AI and builds a project for you:

- It runs in **two passes** — first it pulls out the **timeline of events** (the
  nodes), then it writes short **Context notes** on the events that need them.
- It only keeps **meaningful events** (it skips out-of-office replies, "thanks!",
  signatures, etc.), consolidates a back-and-forth about the same thing into one
  node, writes tight 2–6 word titles, and never invents dates or facts.
- Past/today events become **nodes**; future ones become **future items**. It picks
  a project title, detects tags (people, orgs, topics), and only sets a deadline if
  one was actually stated.

**What you see:** while it's working, a *"Generating your project…"* spinner shows
(it usually takes well under 30 seconds). On success it drops you straight onto the
new project's **Layer 2** page with a note: *"Project generated. Edit anything you
want — AI did a first pass."* Everything it made is fully editable — treat it as a
first draft, not a final answer.

**If something goes wrong** (too long, timed out, a hiccup), it tells you and **your
import is automatically refunded** — you only "spend" an import on a successful
generation. Your typed text stays in the box so you can just try again.

### Imports (your generation allowance)

- Each workspace starts with **20 free imports** (the welcome bonus). One generation
  = one import.
- You'll start seeing a small **"X imports remaining"** note next to the Generate
  button once you're running low (5 or fewer), and it turns a **warm amber** at 3 or
  fewer. The Generate dialog always shows your current balance at the bottom.
- At **0 imports** you'll see *"You're out of imports. Top up or upgrade to keep
  generating."* (Buying more is a later feature — for now it just stops at zero.)

**One-time setup:** the AI needs an API key — make sure **`ANTHROPIC_API_KEY`** is set
in `.env.local` (local) and in Netlify (for the live site). Without it, generation
fails cleanly and refunds the import.

### Shorter, tidier context notes

The AI now writes **shorter Context notes** — 2–3 short sentences instead of long
paragraphs — so they fit cleanly inside their bubbles. There's a hard safety limit
of 300 characters: if the AI ever writes a longer one, it's trimmed at the end of a
word with a "…". This only applies to **AI-written** contexts — anything **you** type
or edit is never trimmed, no matter how long.

### Two kinds of AI subnodes: Information and Context

When the AI reads your paste, it now creates **two distinct kinds** of little
subnodes on each event:

- **Information** (the *what*) — a single flat fact pulled straight from the source,
  e.g. *"The vendor confirmed delivery on April 15."* Kept very short (max 150
  characters).
- **Context** (the *why / how*) — a sentence or two of background that explains a
  fact, e.g. *"The vendor is a Tier-1 supplier providing 60% of our raw material."*
  (max 300 characters).

It splits mixed sentences so a fact and its explanation never end up crammed into the
same bubble. They show in their own colours (Information chips look different from
Context chips). **Notes stay 100% yours** — the AI never creates or touches Notes.

### Layer 2 now arranges itself to fit the content

When a project is generated, Layer 2 now **lays itself out around the actual size of
each bubble** — taller bubbles get more room, rows space themselves apart so nothing
overlaps, and bubbles show their full text (no more little up/down scroll arrows
inside them). You shouldn't have to drag things around just to make them readable.

- **Drag-and-drop still works exactly the same** — move or resize anything to fine-tune
  it, and your changes stick.
- There's a **"Re-run initial layout"** button at the top-right of a project. Click it
  to throw away your manual arrangement and snap everything back to the automatic,
  no-overlap layout — handy after you've added or deleted a lot of bubbles.

### "BYO LLM" — bring your own AI (free, private)

There's a **fifth tab** in the Generate dialog: **BYO LLM**. It lets you build a
project using **your own** AI (ChatGPT, Claude, whatever you like) instead of ours —
so it's **completely free** (no imports used) and your content never goes through our
AI at all.

How it works:
1. Open **Generate → BYO LLM**. The top box shows a **prompt template** — click
   **"Copy template"**.
2. Paste that template into your own LLM, and replace `[paste content here]` with your
   email thread / notes / whatever.
3. Your LLM spits out a neat formatted timeline. Copy it.
4. Paste it into the **"Paste your LLM output here"** box and click **"Parse · no
   import cost"**.

Sirmathread then reads that output **mechanically** (no AI on our side — just careful
text parsing) and builds the project, with the same Information and Context bubbles.
It's forgiving of messiness — extra chatter from your LLM, bullet points, and
different date formats all get handled. Events without a real date are skipped (it
tells you how many), and over-long bubbles get trimmed. You'll land on the new project
with a quick summary of what was parsed.

**One-time setup:** run **`supabase/byo-source.sql`** so BYO projects can be saved.

### BYO bugfix + tags & ambitions now actually save

Two fixes after testing the BYO tool on a real booking thread:

1. **BYO now works even with no blank lines.** The parser used to need a blank line
   between each event; if your LLM's output ran the lines together (which it did),
   the whole thing collapsed and **no events were created** — you'd get an empty
   project. It now reads each `DATE:` line as the start of a new event, so spacing
   no longer matters, and it shrugs off markdown like `**DATE:**` too. If it ever
   genuinely finds zero dated events, it now tells you instead of making an empty
   project.

2. **Tags and ambitions from AI/BYO now save.** Before, the AI *found* tags and
   spotted future events, but they were silently thrown away when the project was
   created. Now:
   - **Tags** — it reuses your existing tags when the name matches (so no
     duplicates), and any genuinely new ones it invents go into a new
     **"Auto-detected"** tag category you can rename or clean up later.
   - **Ambitions** — any future-dated item becomes a proper round **ambition**
     marker (like the ones you add by hand), instead of a normal past node sitting
     in the future. (Trade-off: those future markers don't carry the little AI
     info/context notes, since ambitions are simple markers.)

**One-time setup:** run **`supabase/ai-tags-ambitions.sql`** in Supabase. This one
migration now does three jobs (see the next note), so it's required for tags AND
ambitions to save correctly.

### Tags on nodes + ambitions visible on the project page

Two follow-ups after you noticed (a) ambitions were showing as squares and (b) tags
only landed on the project, not the individual nodes:

1. **Tags now land on individual nodes too.** When the AI reads your content it now
   decides which people/topics are involved in *each event* and tags that node — so
   nodes get individually coloured (the first tag sets the node's colour, like on the
   overview), not just the project as a whole. It still reuses your existing tags and
   only invents new ones under the **"Auto-detected"** category.
2. **Ambitions now show on the project page (Layer 2).** Future items appear as round
   dashed markers at the bottom of the thread, joined by a dashed line — the same idea
   as the overview. The header shows e.g. "5 nodes · 1 planned". (They're view-only on
   the project page for now — to rename/retime an ambition, use the overview.)

**Why the squares happened:** the `ai-tags-ambitions.sql` migration hadn't been run
yet, so the old database rule was still saving future items as ordinary nodes. **Run
that file in the Supabase SQL editor** and regenerate — future items will become round
ambitions and node tags will appear. Until it's run, generation still works; ambitions
just stay as plain nodes and node tags won't save.

### New-user walkthrough — an event-planner demo

Brand-new accounts no longer get the 10 random ad-agency demo projects. Instead, on
first sign-in they get a hand-built **event-planner walkthrough**: four events you'd
plan — a wedding, a 30th birthday, a corporate gala, and a conference — each with about
six milestones laid out on its timeline. The events go from **simple to advanced**:

- **Olivia & Daniel's Wedding** — the gentle intro: what a timeline/milestone is, how a
  tag colours a node, and a node deadline (the red ring).
- **Maya's 30th Birthday** — marking a milestone done (✓), multiple tags as colour bars,
  and opening a milestone's detail panel.
- **Acme Corp Summer Gala** — Context/Info notes around a milestone (open the event to
  see them), the tag lens, and renaming a milestone.
- **TechFwd Conference** — completed vs live deadlines, and ambitions (the round future
  markers — here, the conference dates).

About half the milestones carry a short amber note explaining the feature that's
actually switched on in that very milestone. Everything is tagged "tutorial" behind the
scenes, so it can be wiped in one go and never re-seeds once dismissed.

**To preview it on your own account** (which was seeded with the old demo already), see
the reset SQL Claude gives you — it clears the old tutorial projects and lets the new
one seed on your next login.

## On your phone (new)

Open Sirmathread on a phone (any screen up to 640px wide) and you now get a layout
built for the small screen — your normal desktop view is untouched on bigger screens.

- **Project list:** a clean vertical list of your projects. Each row shows a colour
  stripe (the project's main tag), a dot when a project needs your attention, up to two
  tag pills (with "+N" if there are more), and a one-line summary (how many events, plus
  the next deadline or — if none — when it was last updated). Tap **All / Needs me /
  Recent** at the top to switch what you see.
- **Tap a project → its timeline**, running top to bottom. Each event shows its date,
  title, your **notes first**, then the key **info**. If an event has extra background
  (**context**), tap it to expand — a little arrow shows there's more; tap again to close.
- **Back** returns you to the list right where you left off.

Notes: on a phone your own notes are always shown inline and first (never hidden behind a
tap); notes are **view-only on mobile in this version** (no note editing yet). Adding
projects and search aren't on the phone yet either — those stay on the desktop for now.
