-- ============================================================================
-- Layer 2 — custom node size
-- ============================================================================
-- Lets a user resize a main (spine) node on the Layer 2 canvas (square glyph,
-- single dimension in px). NULL = the default size. Layer-2-only — does NOT
-- affect Layer 1, which always draws nodes at the fixed size.
--
-- Safe to run more than once.

alter table public.nodes
  add column if not exists l2_w double precision;
