-- ============================================================================
-- Layer 2 — "information" sub-node variant
-- ============================================================================
-- A second context-style sub-node. Same shape/behaviour as a context bubble;
-- only the colour + connector style differ. Stored in the existing `bubble_type`
-- column, whose check constraint currently allows only ('context','insight').
-- Widen it to also allow 'information'. (The legacy NOT-NULL `kind` column stays
-- 'context' for every bubble — it's unused for display and its own constraint
-- doesn't know about 'information'.)
--
-- Safe to run more than once.

alter table public.bubbles drop constraint if exists bubbles_bubble_type_check;
alter table public.bubbles
  add constraint bubbles_bubble_type_check
  check (bubble_type in ('context', 'insight', 'information'));
