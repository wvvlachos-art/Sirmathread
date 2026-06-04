-- ============================================================================
-- Layer 2 — notes get their own canvas position + size
-- ============================================================================
-- Layer-1 notes are shown on the Layer 2 canvas. These columns let a user drag
-- and resize a note WITHIN Layer 2 without disturbing its Layer-1 placement
-- (the existing x/y are Layer-1 coordinates). NULL = default Layer-2 slot/size.
--
-- Safe to run more than once.

alter table public.notes
  add column if not exists l2_x double precision,
  add column if not exists l2_y double precision,
  add column if not exists l2_w double precision;
