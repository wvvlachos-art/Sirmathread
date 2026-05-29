-- ============================================================================
-- Layer 2 — context bubbles (Phase 1 schema)
-- ============================================================================
-- A `bubbles` table already existed from the original schema (an unused Layer-2
-- placeholder, 0 rows) and already carries organization_id + created_by_user_id
-- and per-workspace RLS from the multi-user migration. Rather than create a new
-- table, we reshape this empty one to match the Layer 2 spec by ADDING the
-- columns the app will use. The legacy columns (kind/body/x/y/ai_generated/...)
-- are left in place, unused and harmless.
--
-- Safe to run more than once.

alter table public.bubbles
  add column if not exists project_id      uuid references public.projects(id) on delete cascade,
  add column if not exists bubble_type     text not null default 'context' check (bubble_type in ('context', 'insight')),
  add column if not exists source          text not null default 'manual'  check (source in ('manual', 'ai')),
  add column if not exists content         text,
  add column if not exists position_side   text not null default 'above'   check (position_side in ('above', 'below')),
  add column if not exists position_offset int  not null default 0;

create index if not exists bubbles_project_idx on public.bubbles(project_id);

-- ---- RLS (re-asserted; same per-workspace pattern as the other content tables) ----
alter table public.bubbles enable row level security;

drop policy if exists "org read bubbles" on public.bubbles;
create policy "org read bubbles" on public.bubbles for select
  using (public.is_org_member(organization_id));

drop policy if exists "org write bubbles" on public.bubbles;
create policy "org write bubbles" on public.bubbles for all
  using (public.is_org_writer(organization_id))
  with check (public.is_org_writer(organization_id));

-- Activity log action types used by Layer 2 (free-text column, no schema change):
--   bubble.created, bubble.edited, bubble.deleted
