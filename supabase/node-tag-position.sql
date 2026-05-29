-- Per-node tag ordering. The first applied tag (position 0) is the "primary"
-- tag, which colours the node fill on Layer 1. Subsequent tags render as
-- thin colour bars stacked below the node.
--
-- Backfill: existing rows have no insertion timestamp, so we assign
-- positions in tag_value_id order — deterministic, even if arbitrary.
-- Run this in the Supabase SQL Editor. Safe to run more than once.

alter table public.node_tag_values
  add column if not exists position int not null default 0;

with ranked as (
  select node_id,
         tag_value_id,
         row_number() over (partition by node_id order by tag_value_id) - 1 as pos
  from public.node_tag_values
)
update public.node_tag_values ntv
set position = r.pos
from ranked r
where ntv.node_id = r.node_id
  and ntv.tag_value_id = r.tag_value_id;
