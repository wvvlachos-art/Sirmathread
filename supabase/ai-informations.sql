-- ============================================================================
-- generate_ai_project — also persist AI INFORMATION subnodes (alongside CONTEXT)
-- ============================================================================
-- Sonnet now emits two subnode families per node: INFORMATION (flat facts) and
-- CONTEXT (background). Both are rows in the existing `bubbles` table, source='ai',
-- distinguished by `bubble_type` ('information' vs 'context'). The legacy NOT-NULL
-- `kind` column stays 'context' for every row (its own check constraint doesn't
-- know 'information'; it's unused for display). Informations stack above the node,
-- contexts below — the adaptive layout pass refines positions later.
--
-- Replaces the function from imports-ledger.sql. No table/column changes.
-- Safe to run more than once.

create or replace function public.generate_ai_project(p_org uuid, p_user uuid, p_payload jsonb)
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

    -- INFORMATION subnodes (facts) — above the node.
    for v_sub in select * from jsonb_array_elements(coalesce(v_node->'informations', '[]'::jsonb))
    loop
      v_body := nullif(trim(v_sub->>'body'), '');
      if v_body is not null then
        insert into public.bubbles
          (organization_id, project_id, node_id, created_by_user_id,
           bubble_type, kind, source, content, position_side)
        values
          (p_org, v_project_id, v_node_id, p_user,
           'information', 'context', 'ai', v_body, 'above');
      end if;
    end loop;

    -- CONTEXT subnodes (background) — below the node.
    for v_sub in select * from jsonb_array_elements(coalesce(v_node->'contexts', '[]'::jsonb))
    loop
      v_body := nullif(trim(v_sub->>'body'), '');
      if v_body is not null then
        insert into public.bubbles
          (organization_id, project_id, node_id, created_by_user_id,
           bubble_type, kind, source, content, position_side)
        values
          (p_org, v_project_id, v_node_id, p_user,
           'context', 'context', 'ai', v_body, 'below');
      end if;
    end loop;
  end loop;

  return v_project_id;
end;
$$;
