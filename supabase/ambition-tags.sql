-- Let tags be applied to individual ambitions (mirrors node_tag_values).
-- Run this in the Supabase SQL Editor. Safe to run more than once.

create table if not exists public.ambition_tag_values (
  ambition_id  uuid not null references public.ambitions(id) on delete cascade,
  tag_value_id uuid not null references public.tag_values(id) on delete cascade,
  primary key (ambition_id, tag_value_id)
);

alter table public.ambition_tag_values enable row level security;

drop policy if exists "own ambition_tag_values" on public.ambition_tag_values;
create policy "own ambition_tag_values" on public.ambition_tag_values for all
  using (
    exists (
      select 1 from public.ambitions a
      join public.projects p on p.id = a.project_id
      where a.id = ambition_tag_values.ambition_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ambitions a
      join public.projects p on p.id = a.project_id
      where a.id = ambition_tag_values.ambition_id and p.user_id = auth.uid()
    )
  );
