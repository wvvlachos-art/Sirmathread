-- Tutorial onboarding: seed 10 demo projects on a brand-new user's first login.
--
-- Two changes:
--   1. Add a third allowed value 'tutorial' to the origin check on projects and
--      nodes, so tutorial-seeded rows are visually identical to manual ones but
--      can be bulk-wiped later with a single query:
--        DELETE FROM projects WHERE origin = 'tutorial';
--   2. Add user_preferences.tutorial_seeded — set to true the first time the
--      seed runs, so deleting the demo projects doesn't bring them back on
--      next login.
--
-- Run this in the Supabase SQL Editor. Safe to run more than once.

-- Widen the origin constraints to include 'tutorial'.
do $$ begin
  alter table public.projects drop constraint if exists projects_origin_chk;
  alter table public.projects add constraint projects_origin_chk
    check (origin in ('gmail','manual','tutorial'));
end $$;

do $$ begin
  alter table public.nodes drop constraint if exists nodes_origin_chk;
  alter table public.nodes add constraint nodes_origin_chk
    check (origin in ('gmail','manual','tutorial'));
end $$;

-- Flag so the seed runs exactly once per user.
alter table public.user_preferences
  add column if not exists tutorial_seeded boolean not null default false;
