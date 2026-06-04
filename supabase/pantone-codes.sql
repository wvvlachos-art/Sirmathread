-- ============================================================================
-- Sub-node Pantone codes (Phase 1 — visual polish pass)
-- ============================================================================
-- Each sub-node gets a small, stable "Pantone-style" code shown in the corner of
-- its chip and usable as a reference in conversation / AI prompts:
--
--   Notes    →  N-01, N-02, …   (notes table)
--   Context  →  C-01, C-02, …   (bubbles where bubble_type <> 'information')
--   Info     →  I-01, I-02, …   (bubbles where bubble_type  = 'information')
--
-- Numbering is sequential WITHIN A PARENT NODE, independent per type, in
-- creation order. Codes are STABLE: deleting one does NOT renumber the others;
-- new sub-nodes pick up at (highest existing number for that node+type) + 1.
-- The app generates the code on insert; this migration adds the column and
-- backfills existing rows. The app tolerates the column being absent (writes
-- that hit a missing column are swallowed), so the pages keep working pre-run.
--
-- Safe to run more than once.

-- ---- notes: N-NN per node, in creation order ------------------------------
alter table public.notes  add column if not exists pantone_code text;

with ranked as (
  select
    id,
    'N-' || lpad(
      (row_number() over (partition by node_id order by created_at, id))::text, 2, '0'
    ) as code
  from public.notes
  where pantone_code is null
)
update public.notes n
   set pantone_code = r.code
  from ranked r
 where n.id = r.id;

-- ---- bubbles: C-NN (context family) / I-NN (information), per node --------
alter table public.bubbles add column if not exists pantone_code text;

with ranked as (
  select
    id,
    case when bubble_type = 'information' then 'I-' else 'C-' end ||
    lpad(
      (row_number() over (
        partition by node_id, (bubble_type = 'information')
        order by created_at, id
      ))::text, 2, '0'
    ) as code
  from public.bubbles
  where pantone_code is null
)
update public.bubbles b
   set pantone_code = r.code
  from ranked r
 where b.id = r.id;
