-- ============================================================================
-- generate_ai_project — route FUTURE items to ambitions + persist tag links
-- ============================================================================
-- Two fixes vs the byo-source.sql version, both of which DETECTED data the old
-- function then dropped:
--
-- 1. AMBITIONS. The structure stage classifies each item as "node" (past/today)
--    or "ambition" (future); the payload carries it as nodes[].node_type. The old
--    function ignored it and inserted EVERY item into `nodes` (so future events
--    became square past-style nodes). Now: node_type='ambition' → insert into
--    `ambitions` (round marker, title + target_date); otherwise → `nodes` (+ AI
--    information/context bubbles). Ambitions hold no bubbles, so an ambition's AI
--    subnodes are dropped by design.
--
-- 2. TAGS. The payload now carries RESOLVED tag_value ids (the API layer reuses
--    existing workspace tags + auto-creates new ones; see src/lib/tags/). This
--    function LINKS them: project.tag_value_ids → project_tag_values; each
--    node.tag_value_ids → node_tag_values (array order = position, 0 = primary
--    fill colour); each ambition's tag_value_ids → ambition_tag_values.
--
-- Replaces the function from byo-source.sql (same 4-arg signature incl. p_source).
-- Safe to run more than once.

drop function if exists public.generate_ai_project(uuid, uuid, jsonb, text);

create or replace function public.generate_ai_project(p_org uuid, p_user uuid, p_payload jsonb, p_source text default 'ai')
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_deadline   text;
  v_node       jsonb;
  v_node_id    uuid;
  v_amb_id     uuid;
  v_type       text;
  v_sub        jsonb;
  v_body       text;
begin
  if not public.is_org_writer(p_org) then
    raise exception 'forbidden';
  end if;
  if p_source not in ('ai', 'byo', 'manual') then
    raise exception 'invalid source';
  end if;

  v_deadline := nullif(p_payload->'project'->>'deadline', '');

  insert into public.projects
    (user_id, organization_id, created_by_user_id, display_name, origin,
     gmail_label_name, spine_color, spine_color_is_user_set, deadline, last_activity_at)
  values
    (p_user, p_org, p_user,
     coalesce(nullif(trim(p_payload->'project'->>'title'), ''), 'Generated project'),
     'manual', null,
     p_payload->'project'->>'spine_color', false,
     case when v_deadline is null then null else v_deadline::date end,
     now())
  returning id into v_project_id;

  -- project-level tags
  insert into public.project_tag_values (project_id, tag_value_id)
  select v_project_id, t::uuid
  from jsonb_array_elements_text(coalesce(p_payload->'project'->'tag_value_ids', '[]'::jsonb)) as t
  on conflict do nothing;

  for v_node in select * from jsonb_array_elements(coalesce(p_payload->'nodes', '[]'::jsonb))
  loop
    v_type := coalesce(nullif(trim(v_node->>'node_type'), ''), 'node');

    -- FUTURE item → ambition marker (round; no subnodes — ambitions hold none).
    if v_type = 'ambition' then
      insert into public.ambitions
        (project_id, organization_id, created_by_user_id, title, target_date)
      values
        (v_project_id, p_org, p_user,
         coalesce(nullif(trim(v_node->>'title'), ''), '(untitled)'),
         (v_node->>'date')::date)
      returning id into v_amb_id;

      insert into public.ambition_tag_values (ambition_id, tag_value_id)
      select v_amb_id, t::uuid
      from jsonb_array_elements_text(coalesce(v_node->'tag_value_ids', '[]'::jsonb)) as t
      on conflict do nothing;

      continue;
    end if;

    -- PAST/TODAY item → spine node (+ AI information/context subnodes + tags).
    insert into public.nodes
      (project_id, organization_id, created_by_user_id, display_label, node_date, origin, state)
    values
      (v_project_id, p_org, p_user,
       coalesce(nullif(trim(v_node->>'title'), ''), '(untitled)'),
       ((v_node->>'date') || 'T09:00:00Z')::timestamptz,
       'manual', 'promoted')
    returning id into v_node_id;

    -- node-level tags (array order = position; 0 = primary fill colour)
    insert into public.node_tag_values (node_id, tag_value_id, position)
    select v_node_id, t.value::uuid, (t.ordinality - 1)::int
    from jsonb_array_elements_text(coalesce(v_node->'tag_value_ids', '[]'::jsonb))
         with ordinality as t(value, ordinality)
    on conflict do nothing;

    for v_sub in select * from jsonb_array_elements(coalesce(v_node->'informations', '[]'::jsonb))
    loop
      v_body := nullif(trim(v_sub->>'body'), '');
      if v_body is not null then
        insert into public.bubbles
          (organization_id, project_id, node_id, created_by_user_id,
           bubble_type, kind, source, content, position_side)
        values
          (p_org, v_project_id, v_node_id, p_user,
           'information', 'context', p_source, v_body, 'above');
      end if;
    end loop;

    for v_sub in select * from jsonb_array_elements(coalesce(v_node->'contexts', '[]'::jsonb))
    loop
      v_body := nullif(trim(v_sub->>'body'), '');
      if v_body is not null then
        insert into public.bubbles
          (organization_id, project_id, node_id, created_by_user_id,
           bubble_type, kind, source, content, position_side)
        values
          (p_org, v_project_id, v_node_id, p_user,
           'context', 'context', p_source, v_body, 'below');
      end if;
    end loop;
  end loop;

  return v_project_id;
end;
$$;
