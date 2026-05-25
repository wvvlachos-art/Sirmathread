-- Let an ambition optionally double as a deadline (red countdown from when it
-- was made → its target date). Run in the Supabase SQL Editor. Re-runnable.

alter table public.ambitions add column if not exists is_deadline boolean not null default false;
