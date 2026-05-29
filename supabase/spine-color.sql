-- Spine colour for the enriched left project column (locked 2026-05-28).
--
-- The 4px coloured spine on the frozen left rail is its own identity colour,
-- separate from tag colours and from the existing per-project `color` override.
-- New projects get the next colour in the 8-slot earthy palette (cycled by
-- creation order). `spine_color_is_user_set = true` opts out of any future
-- auto-reassignment so the user's override sticks.
--
-- IMPORTANT: run this in TWO separate Supabase SQL editor queries — the
-- editor pre-parses the whole script, so a single submission can fail with
-- "column spine_color does not exist" because the WHERE clause is validated
-- before the ALTER TABLE has been applied.

-- =========================================================================
-- STEP 1 — add the columns. Run this on its own first.
-- =========================================================================

ALTER TABLE projects ADD COLUMN spine_color text;
ALTER TABLE projects ADD COLUMN spine_color_is_user_set boolean NOT NULL DEFAULT false;

-- =========================================================================
-- STEP 2 — backfill existing projects, cycling the 8-colour palette in
-- each user's creation order. Run this only AFTER step 1 succeeded.
-- =========================================================================

WITH palette(slot, color) AS (
  VALUES
    (0, '#8a9a72'::text),
    (1, '#c2622a'),
    (2, '#b8902f'),
    (3, '#5a7d8c'),
    (4, '#8a5a6f'),
    (5, '#9c6b4a'),
    (6, '#6b8e6b'),
    (7, '#a8503a')
),
ordered AS (
  SELECT id,
         ((ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at)) - 1) % 8 AS slot
  FROM projects
  WHERE spine_color IS NULL
)
UPDATE projects p
SET spine_color = pal.color
FROM ordered o
JOIN palette pal ON pal.slot = o.slot
WHERE p.id = o.id;
