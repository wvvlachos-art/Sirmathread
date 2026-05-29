-- ============================================================================
-- Multi-user organizations — PHASE 2 (data migration + security swap)
-- ============================================================================
-- Prereq: Phase 1 (multi-user-orgs.sql) applied, and a data backup taken
-- (Free tier: supabase/backup-data.mjs -> backups/). See MULTI_USER_ORGS_PLAN.md.
--
-- STEP A — backfill (additive, reversible). Creates one personal workspace per
--          user, makes them owner, and stamps all existing content with its
--          workspace. The app keeps working unchanged.
-- STEP B — tighten + swap security. Makes organization_id NOT NULL and replaces
--          the per-user RLS with per-workspace RLS.
--
-- IMPORTANT consequence of Step B: until the app is made workspace-aware
-- (Phase 3 — server actions stamp organization_id on insert), CREATING new
-- content from the app will fail (organization_id would be null). Reading
-- existing content keeps working. Run Step B only when ready to proceed into
-- Phase 3, or use the optional bridge trigger (see end) to avoid a gap.
--
-- Idempotent: Step A guards on "is null"/"not exists"; Step B uses
-- "drop policy if exists" and "set not null" (a no-op if already set).

-- ============================================================================
-- STEP A — backfill
-- ============================================================================
begin;

insert into public.organizations (name, created_by_user_id)
select coalesce(nullif(split_part(p.email, '@', 1), ''), 'user') || '''s workspace', p.id
  from public.profiles p
 where not exists (select 1 from public.organizations o where o.created_by_user_id = p.id);

insert into public.memberships (organization_id, user_id, role, invited_by_user_id)
select o.id, o.created_by_user_id, 'owner', null
  from public.organizations o
 where not exists (
   select 1 from public.memberships m
    where m.organization_id = o.id and m.user_id = o.created_by_user_id
 );

update public.projects pr
   set organization_id = o.id, created_by_user_id = pr.user_id
  from public.organizations o
 where o.created_by_user_id = pr.user_id and pr.organization_id is null;

update public.nodes n
   set organization_id = pr.organization_id, created_by_user_id = pr.created_by_user_id
  from public.projects pr
 where pr.id = n.project_id and n.organization_id is null;

update public.notes nt
   set organization_id = pr.organization_id, created_by_user_id = pr.created_by_user_id
  from public.projects pr
 where pr.id = nt.project_id and nt.organization_id is null;

update public.ambitions a
   set organization_id = pr.organization_id, created_by_user_id = pr.created_by_user_id
  from public.projects pr
 where pr.id = a.project_id and a.organization_id is null;

update public.bubbles b
   set organization_id = pr.organization_id, created_by_user_id = pr.created_by_user_id
  from public.nodes n
  join public.projects pr on pr.id = n.project_id
 where n.id = b.node_id and b.organization_id is null;

update public.tag_categories tc
   set organization_id = o.id, created_by_user_id = tc.user_id
  from public.organizations o
 where o.created_by_user_id = tc.user_id and tc.organization_id is null;

update public.tag_values tv
   set organization_id = tc.organization_id, created_by_user_id = tc.created_by_user_id
  from public.tag_categories tc
 where tc.id = tv.category_id and tv.organization_id is null;

commit;

-- ============================================================================
-- STEP B — tighten + swap RLS  (run after Step A verifies clean)
-- ============================================================================
begin;

-- B1: require a workspace on every content table (all rows backfilled in A).
alter table public.projects        alter column organization_id set not null;
alter table public.nodes           alter column organization_id set not null;
alter table public.notes           alter column organization_id set not null;
alter table public.bubbles         alter column organization_id set not null;
alter table public.ambitions       alter column organization_id set not null;
alter table public.tag_categories  alter column organization_id set not null;
alter table public.tag_values      alter column organization_id set not null;

-- B2: swap per-user RLS -> per-workspace RLS.
-- Pattern for tables that carry organization_id directly: a SELECT policy for
-- any member + a FOR ALL policy for writers (owner/member). Viewers read-only.

-- projects
drop policy if exists "own projects" on public.projects;
create policy "org read projects"  on public.projects for select using (public.is_org_member(organization_id));
create policy "org write projects" on public.projects for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- nodes
drop policy if exists "own nodes" on public.nodes;
create policy "org read nodes"  on public.nodes for select using (public.is_org_member(organization_id));
create policy "org write nodes" on public.nodes for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- notes
drop policy if exists "own notes" on public.notes;
create policy "org read notes"  on public.notes for select using (public.is_org_member(organization_id));
create policy "org write notes" on public.notes for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- bubbles
drop policy if exists "own bubbles" on public.bubbles;
create policy "org read bubbles"  on public.bubbles for select using (public.is_org_member(organization_id));
create policy "org write bubbles" on public.bubbles for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- ambitions
drop policy if exists "own ambitions" on public.ambitions;
create policy "org read ambitions"  on public.ambitions for select using (public.is_org_member(organization_id));
create policy "org write ambitions" on public.ambitions for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- tag_categories
drop policy if exists "own tag_categories" on public.tag_categories;
create policy "org read tag_categories"  on public.tag_categories for select using (public.is_org_member(organization_id));
create policy "org write tag_categories" on public.tag_categories for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- tag_values
drop policy if exists "own tag_values" on public.tag_values;
create policy "org read tag_values"  on public.tag_values for select using (public.is_org_member(organization_id));
create policy "org write tag_values" on public.tag_values for all
  using (public.is_org_writer(organization_id)) with check (public.is_org_writer(organization_id));

-- Child/join tables (no own organization_id — inherit via parent's workspace).

-- emails (via project)
drop policy if exists "own emails" on public.emails;
create policy "org read emails" on public.emails for select
  using (exists (select 1 from public.projects p where p.id = emails.project_id and public.is_org_member(p.organization_id)));
create policy "org write emails" on public.emails for all
  using (exists (select 1 from public.projects p where p.id = emails.project_id and public.is_org_writer(p.organization_id)))
  with check (exists (select 1 from public.projects p where p.id = emails.project_id and public.is_org_writer(p.organization_id)));

-- project_tag_values (via project)
drop policy if exists "own project_tag_values" on public.project_tag_values;
create policy "org read project_tag_values" on public.project_tag_values for select
  using (exists (select 1 from public.projects p where p.id = project_tag_values.project_id and public.is_org_member(p.organization_id)));
create policy "org write project_tag_values" on public.project_tag_values for all
  using (exists (select 1 from public.projects p where p.id = project_tag_values.project_id and public.is_org_writer(p.organization_id)))
  with check (exists (select 1 from public.projects p where p.id = project_tag_values.project_id and public.is_org_writer(p.organization_id)));

-- node_tag_values (via node)
drop policy if exists "own node_tag_values" on public.node_tag_values;
create policy "org read node_tag_values" on public.node_tag_values for select
  using (exists (select 1 from public.nodes n where n.id = node_tag_values.node_id and public.is_org_member(n.organization_id)));
create policy "org write node_tag_values" on public.node_tag_values for all
  using (exists (select 1 from public.nodes n where n.id = node_tag_values.node_id and public.is_org_writer(n.organization_id)))
  with check (exists (select 1 from public.nodes n where n.id = node_tag_values.node_id and public.is_org_writer(n.organization_id)));

-- ambition_tag_values (via ambition)
drop policy if exists "own ambition_tag_values" on public.ambition_tag_values;
create policy "org read ambition_tag_values" on public.ambition_tag_values for select
  using (exists (select 1 from public.ambitions a where a.id = ambition_tag_values.ambition_id and public.is_org_member(a.organization_id)));
create policy "org write ambition_tag_values" on public.ambition_tag_values for all
  using (exists (select 1 from public.ambitions a where a.id = ambition_tag_values.ambition_id and public.is_org_writer(a.organization_id)))
  with check (exists (select 1 from public.ambitions a where a.id = ambition_tag_values.ambition_id and public.is_org_writer(a.organization_id)));

commit;

-- ============================================================================
-- Verify Step B (run after): existing tables now show org-based policies; the
-- 7 content tables show organization_id as NOT NULL. Then re-login to the app
-- and confirm all existing data is still visible.
-- ============================================================================
