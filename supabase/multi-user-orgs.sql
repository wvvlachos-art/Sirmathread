-- ============================================================================
-- Multi-user organizations — PHASE 1 (schema only, no data migration)
-- ============================================================================
-- See MULTI_USER_ORGS_PLAN.md for the full task plan and phasing.
--
-- This migration is purely ADDITIVE and SAFE to run on the live database:
--   - No existing column is dropped or changed.
--   - No existing RLS policy is touched — the per-user policies on
--     projects/nodes/etc. stay exactly as they are, so the app keeps working.
--   - New tables get org-membership RLS from day 1, but they're empty, so this
--     affects nothing yet.
--   - New organization_id / created_by_user_id columns are added NULLABLE.
--
-- Phase 2 (separate migration) backfills the new columns, swaps the existing
-- tables' RLS to org-based, and then tightens the new columns to NOT NULL.
-- A NOT NULL column / org-based RLS CANNOT be applied here, because existing
-- rows have no org yet — that's exactly what Phase 2's backfill fixes first.
--
-- Idempotent: safe to run more than once.

-- ============================================================================
-- SECTION 1 — profiles.display_name
-- ============================================================================
-- Default = the local-part of the user's email (everything before the @).
-- Backfilled for existing users; the new-user trigger sets it going forward.

alter table public.profiles
  add column if not exists display_name text;

update public.profiles
   set display_name = split_part(email, '@', 1)
 where display_name is null
   and email is not null;

-- Update the new-user trigger so future signups get a display_name too.
-- (Org auto-creation on signup is deferred to Phase 3 — the app isn't
-- org-aware yet, and Phase 2 will create orgs for everyone existing.)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
    values (new.id, new.email, split_part(coalesce(new.email, ''), '@', 1))
    on conflict (id) do nothing;
  insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;
-- (The on_auth_user_created trigger already exists from schema.sql.)


-- ============================================================================
-- SECTION 2 — organizations
-- ============================================================================
-- One row per workspace. member_limit is per-org (soft cap) so we can lift the
-- cap on an individual org without a code change. The display name is set by
-- the app / Phase-2 migration to "{owner email-localpart}'s workspace".

create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  created_at          timestamptz not null default now(),
  created_by_user_id  uuid not null references auth.users(id) on delete restrict,
  member_limit        int not null default 5 check (member_limit > 0)
);
create index if not exists organizations_created_by_idx
  on public.organizations(created_by_user_id);


-- ============================================================================
-- SECTION 3 — memberships + RLS helper functions
-- ============================================================================
-- A user is "in an org" iff a row exists here. (organization_id, user_id) is
-- unique — one role per user per org. Roles use a CHECK constraint rather than
-- a Postgres enum type (same guarantee, far easier to extend later).

create table if not exists public.memberships (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  role                text not null check (role in ('owner', 'member', 'viewer')),
  joined_at           timestamptz not null default now(),
  invited_by_user_id  uuid references auth.users(id) on delete set null,
  unique (organization_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx on public.memberships(organization_id);

-- SECURITY DEFINER: these run as the table owner and bypass RLS, so they can be
-- called from inside another table's RLS policy without infinite recursion.

create or replace function public.is_org_member(org_id uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.memberships
     where organization_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_writer(org_id uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.memberships
     where organization_id = org_id and user_id = auth.uid()
       and role in ('owner', 'member')
  );
$$;

create or replace function public.is_org_owner(org_id uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.memberships
     where organization_id = org_id and user_id = auth.uid()
       and role = 'owner'
  );
$$;


-- ============================================================================
-- SECTION 4 — pending_invites
-- ============================================================================
-- Token-based invitations. v1 has no email send; the UI shows a Copy-link
-- button. One invite per (org, email) — re-inviting overwrites. Pending invites
-- count against member_limit (enforced in the app, Phase 3).

create table if not exists public.pending_invites (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  email               text not null,
  role                text not null check (role in ('member', 'viewer')),
  invited_by_user_id  uuid not null references auth.users(id) on delete cascade,
  token               text not null unique,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '7 days'),
  unique (organization_id, email)
);
create index if not exists pending_invites_org_idx on public.pending_invites(organization_id);
create index if not exists pending_invites_token_idx on public.pending_invites(token);


-- ============================================================================
-- SECTION 5 — activity_log
-- ============================================================================
-- Immutable audit trail. Retained indefinitely; never updated/deleted by the
-- app. Indexed for fast paginated retrieval per-org (newest first).

create table if not exists public.activity_log (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  actor_user_id     uuid references auth.users(id) on delete set null,
  action_type       text not null,   -- e.g. 'project.created', 'member.invited'
  target_type       text,            -- e.g. 'project', 'node', 'membership'
  target_id         uuid,
  description       text not null,
  metadata          jsonb,
  created_at        timestamptz not null default now()
);
-- Primary read pattern: newest entries for an org, paginated (cursor on the
-- (created_at, id) pair for stable ties).
create index if not exists activity_log_org_created_idx
  on public.activity_log(organization_id, created_at desc, id desc);
create index if not exists activity_log_actor_idx on public.activity_log(actor_user_id);


-- ============================================================================
-- SECTION 6 — Row-Level Security for the NEW tables only
-- ============================================================================
-- Existing tables keep their per-user RLS untouched (Phase 2 swaps those).

alter table public.organizations    enable row level security;
alter table public.memberships      enable row level security;
alter table public.pending_invites  enable row level security;
alter table public.activity_log     enable row level security;

-- ---- organizations ----
drop policy if exists "org member can read" on public.organizations;
create policy "org member can read" on public.organizations for select
  using (public.is_org_member(id));

-- Any signed-in user can create an org (their owner-membership is inserted
-- server-side via service role to avoid the chicken-and-egg with the policy).
drop policy if exists "any signed-in user can create" on public.organizations;
create policy "any signed-in user can create" on public.organizations for insert
  with check (auth.uid() is not null and created_by_user_id = auth.uid());

drop policy if exists "owner can update" on public.organizations;
create policy "owner can update" on public.organizations for update
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));

drop policy if exists "owner can delete" on public.organizations;
create policy "owner can delete" on public.organizations for delete
  using (public.is_org_owner(id));

-- ---- memberships ----
drop policy if exists "members read same-org memberships" on public.memberships;
create policy "members read same-org memberships" on public.memberships for select
  using (public.is_org_member(organization_id));

drop policy if exists "owner adds memberships" on public.memberships;
create policy "owner adds memberships" on public.memberships for insert
  with check (public.is_org_owner(organization_id));

drop policy if exists "owner updates memberships" on public.memberships;
create policy "owner updates memberships" on public.memberships for update
  using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists "owner removes memberships" on public.memberships;
create policy "owner removes memberships" on public.memberships for delete
  using (public.is_org_owner(organization_id));

-- ---- pending_invites ----
drop policy if exists "members read pending invites" on public.pending_invites;
create policy "members read pending invites" on public.pending_invites for select
  using (public.is_org_member(organization_id));

drop policy if exists "owner creates invites" on public.pending_invites;
create policy "owner creates invites" on public.pending_invites for insert
  with check (public.is_org_owner(organization_id));

drop policy if exists "owner updates invites" on public.pending_invites;
create policy "owner updates invites" on public.pending_invites for update
  using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));

drop policy if exists "owner deletes invites" on public.pending_invites;
create policy "owner deletes invites" on public.pending_invites for delete
  using (public.is_org_owner(organization_id));

-- ---- activity_log ----
-- Read: any org member. Insert: a member writing under their own identity
-- (server-side). No UPDATE/DELETE policies → immutable for clients.
drop policy if exists "members read activity" on public.activity_log;
create policy "members read activity" on public.activity_log for select
  using (public.is_org_member(organization_id));

drop policy if exists "members write activity as self" on public.activity_log;
create policy "members write activity as self" on public.activity_log for insert
  with check (public.is_org_member(organization_id) and actor_user_id = auth.uid());


-- ============================================================================
-- SECTION 7 — Add organization_id + created_by_user_id to content tables
-- ============================================================================
-- All NULLABLE for now. Phase 2 backfills + flips to NOT NULL, then swaps the
-- per-user RLS over to org-based atomically.
--
-- emails (inherits via project) and the *_tag_values join tables (inherit via
-- their parent) intentionally do NOT get organization_id.

alter table public.projects
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists projects_org_idx on public.projects(organization_id);

alter table public.nodes
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists nodes_org_idx on public.nodes(organization_id);

alter table public.notes
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists notes_org_idx on public.notes(organization_id);

-- bubbles — Layer 2 table; gets org_id so Phase 6 (project move) can re-stamp it
-- directly alongside nodes/notes.
alter table public.bubbles
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists bubbles_org_idx on public.bubbles(organization_id);

alter table public.ambitions
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists ambitions_org_idx on public.ambitions(organization_id);

alter table public.tag_categories
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists tag_categories_org_idx on public.tag_categories(organization_id);

alter table public.tag_values
  add column if not exists organization_id    uuid references public.organizations(id) on delete cascade,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null;
create index if not exists tag_values_org_idx on public.tag_values(organization_id);


-- ============================================================================
-- End of Phase 1. Verify with supabase/multi-user-orgs-verify.sql
-- ============================================================================
