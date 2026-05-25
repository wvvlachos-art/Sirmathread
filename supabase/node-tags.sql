-- Let tags be applied to individual nodes (projects already have project_tag_values).
-- Run this in the Supabase SQL Editor. Safe to run more than once.

create table if not exists public.node_tag_values (
  node_id      uuid not null references public.nodes(id) on delete cascade,
  tag_value_id uuid not null references public.tag_values(id) on delete cascade,
  primary key (node_id, tag_value_id)
);

alter table public.node_tag_values enable row level security;

drop policy if exists "own node_tag_values" on public.node_tag_values;
create policy "own node_tag_values" on public.node_tag_values for all
  using (
    exists (
      select 1 from public.nodes n
      join public.projects p on p.id = n.project_id
      where n.id = node_tag_values.node_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.nodes n
      join public.projects p on p.id = n.project_id
      where n.id = node_tag_values.node_id and p.user_id = auth.uid()
    )
  );
