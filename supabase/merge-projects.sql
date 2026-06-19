-- ============================================================================
-- merge_projects — fold one project entirely into another
-- ============================================================================
-- Built on a reusable primitive, move_nodes_to_project, so a FUTURE "split nodes
-- out of a project" feature can reuse the same engine (just call it with a subset
-- of node ids + a different target). Run in the Supabase SQL Editor. Idempotent.
--
-- What travels automatically (no work needed): node_tag_values and
-- ambition_tag_values are keyed by node_id / ambition_id, so re-parenting a node
-- or ambition carries its tags with it. Bubbles (information/context) and notes
-- carry BOTH a node_id and a project_id, so those need their project_id repointed.

-- ---------------------------------------------------------------------------
-- Primitive: move a set of nodes (and the bubbles + notes hanging off them) to
-- a target project. All nodes must live in the SAME workspace as the target.
-- Powers merge today; a future split calls this with a chosen subset.
-- ---------------------------------------------------------------------------
create or replace function public.move_nodes_to_project(p_target uuid, p_node_ids uuid[])
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_org uuid;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return; -- nothing to move
  end if;

  select organization_id into v_org from public.projects where id = p_target;
  if v_org is null then raise exception 'target project not found'; end if;
  if not public.is_org_writer(v_org) then raise exception 'forbidden'; end if;

  -- Refuse to pull nodes in from a different workspace.
  if exists (
    select 1 from public.nodes n
    join public.projects p on p.id = n.project_id
    where n.id = any(p_node_ids) and p.organization_id <> v_org
  ) then
    raise exception 'cannot move nodes across workspaces';
  end if;

  update public.nodes   set project_id = p_target where id = any(p_node_ids);
  update public.bubbles set project_id = p_target where node_id = any(p_node_ids);
  update public.notes   set project_id = p_target where node_id = any(p_node_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- merge_projects: SOURCE is absorbed into TARGET, then deleted. The target keeps
-- its own name / deadline / colours. Source nodes interleave into the target's
-- timeline by date (the serpentine is date-ordered, so no manual re-ordering).
-- Atomic: a failure rolls the whole thing back.
-- ---------------------------------------------------------------------------
create or replace function public.merge_projects(p_target uuid, p_source uuid)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_org_t uuid;
  v_org_s uuid;
begin
  if p_target = p_source then raise exception 'cannot merge a project into itself'; end if;

  select organization_id into v_org_t from public.projects where id = p_target;
  select organization_id into v_org_s from public.projects where id = p_source;
  if v_org_t is null or v_org_s is null then raise exception 'project not found'; end if;
  if v_org_t <> v_org_s then raise exception 'projects are in different workspaces'; end if;
  if not public.is_org_writer(v_org_t) then raise exception 'forbidden'; end if;

  -- Nodes (+ their bubbles/notes) via the shared primitive.
  perform public.move_nodes_to_project(
    p_target,
    array(select id from public.nodes where project_id = p_source)
  );

  -- Ambitions (future markers); ambition_tag_values travel by ambition_id.
  update public.ambitions set project_id = p_target where project_id = p_source;

  -- Lane-level notes/bubbles (no node_id) still pointing at the source.
  update public.notes   set project_id = p_target where project_id = p_source;
  update public.bubbles set project_id = p_target where project_id = p_source;

  -- Union the source's project-level tags into the target (skip duplicates).
  insert into public.project_tag_values (project_id, tag_value_id)
  select p_target, tag_value_id from public.project_tag_values where project_id = p_source
  on conflict do nothing;

  update public.projects set last_activity_at = now() where id = p_target;

  -- Delete the now-empty source (cascades its remaining project_tag_values, etc.).
  delete from public.projects where id = p_source;

  return p_target;
end;
$$;
