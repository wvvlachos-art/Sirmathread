// Canonical, importable copy of the BYO prompt template. Mirror of
// byo-template.txt (kept identical) — this `.ts` is what the app imports so the
// string is always bundled for both server and client (an fs read of the .txt
// wouldn't be reliably traced into the production build). If you edit one, edit
// the other.
export const BYO_TEMPLATE = `Convert the content below into a timeline. Output ONLY this format. No commentary.
Put the WHOLE output inside one code block (\`\`\`) so a copy button appears — that block is what gets pasted into Sirmathread.

PROJECT: <3-6 word title>
TAGS: <comma-separated, max 5>

DATE: YYYY-MM-DD
TITLE: <2-6 word verb phrase>
TAGS: <which project TAGS this event involves, max 4>
INFO: <something that actually happened, under 150 chars>
CONTEXT: <relationship/dynamic at play, under 300 chars>

(repeat per event, separate blocks with blank line)

RULES:
- Per-event TAGS = the subset of the project TAGS directly involved in THAT event
  (e.g. the person who acted, the org concerned). Use the EXACT project-tag strings —
  never invent new ones here. Leave blank if none clearly apply. This auto-colours the node.
- People tags: use each person's FULL name (e.g. "Ting Lee", not "Ting" or "TL") and spell
  it the SAME way everywhere. Merge short names/nicknames into the one fullest name so the
  same person never becomes two different tags.
- INFO = important facts about actual events — concrete things that happened ("X did Y").
- CONTEXT = pertinent background that shapes the relationship, dynamics, or stakes —
  whether stated directly, implied, or reasonably inferred. Keep it minimal (only what
  matters), though it may run slightly longer than INFO.
- Future events: add "TYPE: ambition" inside the block.
- Skip pleasantries. Skip events without a known date.
- Max 3 INFO + 3 CONTEXT per event. Max 50 events.
- Third person, factual, never invent.

EXAMPLE:

PROJECT: Vendor Contract Renewal
TAGS: contracts, supplier

DATE: 2026-04-12
TITLE: Negotiation opens
TAGS: supplier
INFO: The vendor submitted a renewal proposal.
CONTEXT: Tier-1 supplier providing 60% of raw material.

DATE: 2026-04-15
TITLE: Pricing agreed
TAGS: contracts, supplier
INFO: Both sides agreed on a 3% price increase.
CONTEXT: Lower than supplier's 7% ask due to competitive bids.

CONTENT:
<
[paste content here]
>>>
`;
