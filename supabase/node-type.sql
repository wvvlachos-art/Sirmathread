-- ============================================================================
-- Layer 2 — optional node-type icon
-- ============================================================================
-- A node is born plain (node_type NULL = blank, the default). In Layer 2 the
-- user may optionally assign a type, which shows a small line icon. Never
-- required. AI auto-typing stays deferred (post-IP-waiver).
--
-- Safe to run more than once.

alter table public.nodes
  add column if not exists node_type text
    check (node_type in ('email','decision','meeting','call','payment','task','milestone'));

-- No index needed: node_type is only read alongside the per-project node fetch,
-- which is already scoped by project_id.
