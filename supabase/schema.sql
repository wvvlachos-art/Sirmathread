-- ============================================================================
-- Sirmathread — database schema (first version)
-- ============================================================================
-- This script creates all the tables Sirmathread needs, and turns on
-- "Row-Level Security" (RLS) so each user can only ever see their own data.
--
-- Identity: we rely on Supabase's built-in login system. Every logged-in user
-- gets a unique id, available inside the database as auth.uid(). Each table
-- below ties its rows to a user (directly or through a parent table), and the
-- security policies say "you may only touch rows that are yours."
--
-- Safe to run more than once: it uses "if not exists" / "drop policy if exists"
-- so re-running won't error or duplicate things.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Helper: automatically keep an "updated_at" column current on row changes.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ----------------------------------------------------------------------------
-- profiles — one row per user, holding Sirmathread-specific account data.
-- (Maps to the "users" table in the spec. Supabase already stores the login
-- itself in auth.users; this table hangs extra info off of it.)
-- Gmail tokens will be stored ENCRYPTED later, when we build Gmail sign-in.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                            uuid primary key references auth.users(id) on delete cascade,
  email                         text,
  gmail_oauth_token_encrypted   text,
  gmail_refresh_token_encrypted text,
  created_at                    timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- user_preferences — one row per user; Layer 1 sort/filter choices + settings.
-- ----------------------------------------------------------------------------
create table if not exists public.user_preferences (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  layer1_arrangement_sort     text not null default 'last_updated'
                                check (layer1_arrangement_sort in
                                  ('date_created','last_updated','deadline','has_users_tag','inactive')),
  layer1_arrangement_direction text not null default 'desc'
                                check (layer1_arrangement_direction in ('asc','desc')),
  layer1_filters_jsonb        jsonb not null default '{}'::jsonb,
  inactive_threshold_days     int not null default 45,
  auto_archive_threshold_days int not null default 120,
  trash_purge_days            int not null default 60,   -- William's choice
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);


-- ----------------------------------------------------------------------------
-- projects — one per Gmail label the user has chosen to track.
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  gmail_label_name text not null,
  display_name     text,
  color            text,
  deadline         date,
  deadline_set_at  timestamptz,
  done             boolean not null default false,
  state            text not null default 'active'
                     check (state in ('active','archived','trash')),
  state_changed_at timestamptz not null default now(),
  archived_reason  text check (archived_reason in ('user','auto_inactive')),
  last_activity_at timestamptz not null default now(),
  synced_at        timestamptz,
  gmail_history_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, gmail_label_name)
);
create index if not exists projects_user_idx on public.projects(user_id);
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- emails — raw cache of every email under a tracked label.
-- ----------------------------------------------------------------------------
create table if not exists public.emails (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  gmail_message_id      text not null,
  gmail_thread_id       text,
  from_addr             text,
  to_addrs              text[],
  subject               text,
  body_text             text,
  date_sent             timestamptz,
  importance_score      int,
  is_node               boolean not null default false,
  scoring_prompt_version text,
  scored_at             timestamptz,
  created_at            timestamptz not null default now(),
  unique (project_id, gmail_message_id)
);
create index if not exists emails_project_idx on public.emails(project_id);


-- ----------------------------------------------------------------------------
-- nodes — the emails that made it onto the canvas.
-- ----------------------------------------------------------------------------
create table if not exists public.nodes (
  id              uuid primary key default gen_random_uuid(),
  email_id        uuid references public.emails(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  position_index  int,
  display_label   text,   -- Sirmathread-only rename; falls back to email.subject when null
  state           text not null default 'promoted'
                    check (state in ('promoted','demoted','deleted')),
  deadline        date,
  deadline_set_at timestamptz,
  done            boolean not null default false,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists nodes_project_idx on public.nodes(project_id);


-- ----------------------------------------------------------------------------
-- notes — Layer 1, user-written only. Can attach to a lane or a specific node.
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  node_id    uuid references public.nodes(id) on delete cascade,
  body       text,
  x          double precision,
  y          double precision,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notes_project_idx on public.notes(project_id);


-- ----------------------------------------------------------------------------
-- bubbles — Layer 2 only: context + insight + user-note bubbles.
-- ----------------------------------------------------------------------------
create table if not exists public.bubbles (
  id                        uuid primary key default gen_random_uuid(),
  node_id                   uuid not null references public.nodes(id) on delete cascade,
  kind                      text not null check (kind in ('context','insight','note')),
  body                      text,
  x                         double precision,
  y                         double precision,
  ai_generated              boolean not null default false,
  edited_by_user            boolean not null default false,
  generation_prompt_version text,
  deleted_at                timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists bubbles_node_idx on public.bubbles(node_id);
drop trigger if exists bubbles_set_updated_at on public.bubbles;
create trigger bubbles_set_updated_at before update on public.bubbles
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- tag_categories / tag_values / project_tag_values — user-customizable tags.
-- ----------------------------------------------------------------------------
create table if not exists public.tag_categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  is_default     boolean not null default false,
  is_hide_filter boolean not null default false,
  sort_order     int not null default 0
);
create index if not exists tag_categories_user_idx on public.tag_categories(user_id);

create table if not exists public.tag_values (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.tag_categories(id) on delete cascade,
  value       text not null,
  color       text
);
create index if not exists tag_values_category_idx on public.tag_values(category_id);

create table if not exists public.project_tag_values (
  project_id   uuid not null references public.projects(id) on delete cascade,
  tag_value_id uuid not null references public.tag_values(id) on delete cascade,
  primary key (project_id, tag_value_id)
);


-- ============================================================================
-- Row-Level Security: turn it on for every table, then add policies that
-- restrict each user to their own rows.
-- ============================================================================
alter table public.profiles           enable row level security;
alter table public.user_preferences   enable row level security;
alter table public.projects           enable row level security;
alter table public.emails             enable row level security;
alter table public.nodes              enable row level security;
alter table public.notes              enable row level security;
alter table public.bubbles            enable row level security;
alter table public.tag_categories     enable row level security;
alter table public.tag_values         enable row level security;
alter table public.project_tag_values enable row level security;

-- Tables owned directly by a user (they carry the user id themselves):
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "own preferences" on public.user_preferences;
create policy "own preferences" on public.user_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own projects" on public.projects;
create policy "own projects" on public.projects for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own tag_categories" on public.tag_categories;
create policy "own tag_categories" on public.tag_categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tables owned indirectly (ownership comes from their parent project/node/category):
drop policy if exists "own emails" on public.emails;
create policy "own emails" on public.emails for all
  using (exists (select 1 from public.projects p
                 where p.id = emails.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = emails.project_id and p.user_id = auth.uid()));

drop policy if exists "own nodes" on public.nodes;
create policy "own nodes" on public.nodes for all
  using (exists (select 1 from public.projects p
                 where p.id = nodes.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = nodes.project_id and p.user_id = auth.uid()));

drop policy if exists "own notes" on public.notes;
create policy "own notes" on public.notes for all
  using (exists (select 1 from public.projects p
                 where p.id = notes.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = notes.project_id and p.user_id = auth.uid()));

drop policy if exists "own bubbles" on public.bubbles;
create policy "own bubbles" on public.bubbles for all
  using (exists (select 1 from public.nodes n
                 join public.projects p on p.id = n.project_id
                 where n.id = bubbles.node_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.nodes n
                      join public.projects p on p.id = n.project_id
                      where n.id = bubbles.node_id and p.user_id = auth.uid()));

drop policy if exists "own tag_values" on public.tag_values;
create policy "own tag_values" on public.tag_values for all
  using (exists (select 1 from public.tag_categories c
                 where c.id = tag_values.category_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.tag_categories c
                      where c.id = tag_values.category_id and c.user_id = auth.uid()));

drop policy if exists "own project_tag_values" on public.project_tag_values;
create policy "own project_tag_values" on public.project_tag_values for all
  using (exists (select 1 from public.projects p
                 where p.id = project_tag_values.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = project_tag_values.project_id and p.user_id = auth.uid()));


-- ============================================================================
-- When a new user signs up, automatically create their profile + preferences.
-- (Default tag categories are intentionally NOT seeded here — that decision is
-- deferred until we build the onboarding flow.)
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.user_preferences (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
