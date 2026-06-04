-- ============================================================================
-- BYO LLM — source='byo' subnodes + a source param on generate_ai_project
-- ============================================================================
-- BYO mechanically parses the user's own-LLM output and creates a project with
-- NO AI on our side. Persistence reuses generate_ai_project (same atomic insert
-- path as AI), parameterised by source. Subnodes get source='byo'; the import is
-- logged as event_type='byo' (free — no quota consumed).
--
-- Replaces the function from ai-informations.sql (adds p_source, default 'ai', so
-- the existing 3-arg AI call keeps working). Safe to run more than once.

-- ---- widen the enums (minimal, additive) -----------------------------------
alter table public.bubbles drop constraint if exists bubbles_source_check;
alter table public.bubbles
  add constraint bubbles_source_check check (source in ('manual', 'ai', 'byo'));

alter table public.import_events drop constraint if exists import_events_event_type_check;
alter table public.import_events
  add constraint import_events_event_type_check check (event_type in ('consumed', 'refunded', 'top_up', 'byo'));

-- ---- generate_ai_project gains p_source (default 'ai') ----------------------
drop function if exists public.generate_ai_project(uuid, uuid, jsonb);

create or replace function public.generate_ai_project(p_org uuid, p_user uuid, p_payload jsonb, p_source text default 'ai')
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_deadline   text;
  v_node       jsonb;
  v_node_id    uuid;
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

  for v_node in select * from jsonb_array_elements(coalesce(p_payload->'nodes', '[]'::jsonb))
  loop
    insert into public.nodes
      (project_id, organization_id, created_by_user_id, display_label, node_date, origin, state)
    values
      (v_project_id, p_org, p_user,
       coalesce(nullif(trim(v_node->>'title'), ''), '(untitled)'),
       ((v_node->>'date') || 'T09:00:00Z')::timestamptz,
       'manual', 'promoted')
    returning id into v_node_id;

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
