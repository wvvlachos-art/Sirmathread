-- ============================================================================
-- Layer 2 — context sub-node styling (editable title, size, shape)
-- ============================================================================
-- Context bubbles gain an editable title (defaults to the start of the body
-- text when null), a custom size (width/height in px; null = auto), and a
-- shape. All optional — existing bubbles keep working with NULLs.
--
-- Safe to run more than once.

alter table public.bubbles
  add column if not exists title  text,
  add column if not exists width  int,
  add column if not exists height int,
  add column if not exists shape  text;

-- The app tolerates these columns being absent (writes that hit a missing
-- column are swallowed), so the page keeps working before this migration runs.
