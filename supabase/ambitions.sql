-- Ambitions: forward-looking, manually-created to-do markers per project.
-- Run this in the Supabase SQL Editor. Safe to run more than once.

create table if not exists public.ambitions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  target_date date not null,
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists ambitions_project_idx on public.ambitions(project_id);

-- Row-Level Security: you may only touch ambitions belonging to your projects.
alter table public.ambitions enable row level security;

drop policy if exists "own ambitions" on public.ambitions;
create policy "own ambitions" on public.ambitions for all
  using (exists (select 1 from public.projects p
                 where p.id = ambitions.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = ambitions.project_id and p.user_id = auth.uid()));
