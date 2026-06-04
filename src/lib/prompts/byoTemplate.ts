// Canonical, importable copy of the BYO prompt template. Mirror of
// byo-template.txt (kept identical) — this `.ts` is what the app imports so the
// string is always bundled for both server and client (an fs read of the .txt
// wouldn't be reliably traced into the production build). If you edit one, edit
// the other.
export const BYO_TEMPLATE = `Convert the content below into a timeline. Output ONLY this format. No commentary.

PROJECT: <3-6 word title>
TAGS: <comma-separated, max 5>

DATE: YYYY-MM-DD
TITLE: <2-6 word verb phrase>
INFO: <one fact, under 150 chars>
CONTEXT: <background explanation, under 300 chars>

(repeat per event, separate blocks with blank line)

RULES:
- INFO = facts ("X happened"). CONTEXT = background ("X matters because Y").
- Future events: add "TYPE: ambition" inside the block.
- Skip pleasantries. Skip events without a known date.
- Max 3 INFO + 3 CONTEXT per event. Max 50 events.
- Third person, factual, never invent.

EXAMPLE:

PROJECT: Vendor Contract Renewal
TAGS: contracts, supplier

DATE: 2026-04-12
TITLE: Negotiation opens
INFO: The vendor submitted a renewal proposal.
CONTEXT: Tier-1 supplier providing 60% of raw material.

DATE: 2026-04-15
TITLE: Pricing agreed
INFO: Both sides agreed on a 3% price increase.
CONTEXT: Lower than supplier's 7% ask due to competitive bids.

CONTENT:
<
[paste content here]
>>>
`;
