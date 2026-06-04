-- ============================================================================
-- import_events — record how many AI contexts were safety-truncated per import
-- ============================================================================
-- Monitoring only: lets us see how often generated Contexts hit the 300-char
-- ceiling (high counts → the Sonnet length prompt needs another tightening).
-- Additive + nullable; existing rows and the generation flow are unaffected.
--
-- Safe to run more than once.

alter table public.import_events
  add column if not exists truncations int;
