-- Support manually-created projects and nodes (no Gmail behind them).
-- Run this in the Supabase SQL Editor. Safe to run more than once.

-- Projects can now exist without a Gmail label, and carry an origin.
alter table public.projects alter column gmail_label_name drop not null;
alter table public.projects add column if not exists origin text not null default 'gmail';
do $$ begin
  alter table public.projects add constraint projects_origin_chk check (origin in ('gmail','manual'));
exception when duplicate_object then null; end $$;

-- Nodes can be manual too, with their own date/title (no email needed).
alter table public.nodes add column if not exists origin text not null default 'gmail';
alter table public.nodes add column if not exists node_date timestamptz;
do $$ begin
  alter table public.nodes add constraint nodes_origin_chk check (origin in ('gmail','manual'));
exception when duplicate_object then null; end $$;
