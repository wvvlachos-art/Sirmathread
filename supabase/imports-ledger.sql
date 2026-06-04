-- ============================================================================
-- AI project generation — imports ledger (Phase 1: backend foundation)
-- ============================================================================
-- One "import" = one AI generation. New workspaces get a 20-import welcome
-- bonus. Generating decrements the ledger and writes a 'consumed' audit event,
-- both in the SAME transaction; any downstream failure refunds the import and
-- writes a 'refunded' event. All mutating logic lives in SECURITY DEFINER
-- functions so the audit table can stay write-locked to ordinary users.
--
-- Depends on: organizations, memberships, is_org_member()/is_org_writer()
-- (multi-user-orgs.sql), and projects/nodes/bubbles (schema.sql + layer2).
--
-- Safe to run more than once.

-- ---- ledger -----------------------------------------------------------------
create table if not exists public.workspace_imports (
  workspace_id            uuid primary key references public.organizations(id) on delete cascade,
  imports_remaining       int  not null default 20,   -- welcome bonus
  imports_used_total      int  not null default 0,
  welcome_bonus_consumed  boolean not null default false, -- true once ~5 used
  last_top_up_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.workspace_imports enable row level security;
drop policy if exists "read own workspace imports" on public.workspace_imports;
create policy "read own workspace imports" on public.workspace_imports for select
  using (public.is_org_member(workspace_id));
-- Writers may update their own row directly; the guarded decrement still goes
-- through consume_import() (which enforces the > 0 check atomically).
drop policy if exists "update own workspace imports" on public.workspace_imports;
create policy "update own workspace imports" on public.workspace_imports for update
  using (public.is_org_writer(workspace_id))
  with check (public.is_org_writer(workspace_id));

-- ---- audit events -----------------------------------------------------------
create table if not exists public.import_events (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.organizations(id) on delete cascade,
  project_id   uuid references public.projects(id) on delete set null, -- set on success
  event_type   text not null check (event_type in ('consumed', 'refunded', 'top_up')),
  tokens_used  int,
  created_at   timestamptz not null default now()
);
create index if not exists import_events_workspace_idx on public.import_events(workspace_id);

alter table public.import_events enable row level security;
drop policy if exists "read own import events" on public.import_events;
create policy "read own import events" on public.import_events for select
  using (public.is_org_member(workspace_id));
-- NO insert/update/delete policy for users — writes happen via the SECURITY
-- DEFINER functions below (and the service-role key in the API route).

-- ---- consume one import (atomic) -------------------------------------------
-- Ensures a ledger row exists, decrements only if remaining > 0, bumps the
-- used counter, flips welcome_bonus_consumed at ~5 used, and writes a
-- 'consumed' event — all in one statement-group / one transaction. Returns
-- { ok, reason?, remaining?, used_total?, event_id? }.
create or replace function public.consume_import(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_remaining int;
  v_used      int;
  v_event_id  uuid;
begin
  if not public.is_org_writer(p_org) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  insert into public.workspace_imports (workspace_id)
       values (p_org)
  on conflict (workspace_id) do nothing;

  update public.workspace_imports
     set imports_remaining      = imports_remaining - 1,
         imports_used_total     = imports_used_total + 1,
         welcome_bonus_consumed = (imports_used_total + 1 >= 5),
         updated_at             = now()
   where workspace_id = p_org
     and imports_remaining > 0
  returning imports_remaining, imports_used_total into v_remaining, v_used;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  insert into public.import_events (workspace_id, event_type)
       values (p_org, 'consumed')
  returning id into v_event_id;

  return jsonb_build_object('ok', true, 'remaining', v_remaining,
                            'used_total', v_used, 'event_id', v_event_id);
end;
$$;

-- ---- refund one import ------------------------------------------------------
-- Called when anything fails AFTER a successful consume. Increments remaining,
-- decrements the used counter (floored at 0), and writes a 'refunded' event.
create or replace function public.refund_import(p_org uuid, p_project uuid, p_tokens int)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_org) then
    return;
  end if;
  update public.workspace_imports
     set imports_remaining  = imports_remaining + 1,
         imports_used_total = greatest(0, imports_used_total - 1),
         updated_at         = now()
   where workspace_id = p_org;
  insert into public.import_events (workspace_id, project_id, event_type, tokens_used)
       values (p_org, p_project, 'refunded', p_tokens);
end;
$$;

-- ---- create the generated project (single transaction) ----------------------
-- Inserts the project, its nodes, and each node's AI Contexts (bubbles with
-- source='ai') atomically — a function body is one transaction, so a failure
-- anywhere rolls back the whole project (no partial state). Returns the new
-- project id. Payload shape:
--   { "project": { "title": text, "deadline": date|null, "spine_color": text,
--                  "primary_participant": text|null, "tags": text[] },
--     "nodes":   [ { "title": text, "date": "YYYY-MM-DD",
--                    "node_type": "node"|"ambition",
--                    "contexts": [ { "body": text }, ... ] }, ... ] }
-- (node_type is carried for the AI brief; Phase 1 inserts every node as a node.)
create or replace function public.generate_ai_project(p_org uuid, p_user uuid, p_payload jsonb)
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_project_id uuid;
  v_deadline   text;
  v_node       jsonb;
  v_node_id    uuid;
  v_ctx        jsonb;
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

    for v_ctx in select * from jsonb_array_elements(coalesce(v_node->'contexts', '[]'::jsonb))
    loop
      v_body := nullif(trim(v_ctx->>'body'), '');
      if v_body is not null then
        insert into public.bubbles
          (organization_id, project_id, node_id, created_by_user_id,
           bubble_type, kind, source, content, position_side)
        values
          (p_org, v_project_id, v_node_id, p_user,
           'context', 'context', 'ai', v_body, 'above');
      end if;
    end loop;
  end loop;

  return v_project_id;
end;
$$;
