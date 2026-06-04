-- ============================================================================
-- Layer 2 — custom node positions
-- ============================================================================
-- Lets a user drag a main (spine) node to a custom spot on the Layer 2 canvas,
-- so the thread can be reshaped to make room for annotations. NULL = use the
-- automatic serpentine position. These are Layer-2-only canvas coordinates and
-- do NOT affect Layer 1 (which lays nodes out by date).
--
-- Safe to run more than once.

alter table public.nodes
  add column if not exists l2_x double precision,
  add column if not exists l2_y double precision;
