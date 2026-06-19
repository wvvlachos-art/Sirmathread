-- Draggable deadline/ambition markers on Layer 2. Mirrors nodes' l2_x/l2_y:
-- a custom Layer-2 canvas position for an ambition (null = adaptive auto layout).
-- Layer-2 only — Layer 1 always lays ambitions out by date. Run in the Supabase
-- SQL Editor. Safe to run more than once.

alter table public.ambitions
  add column if not exists l2_x double precision,
  add column if not exists l2_y double precision;
