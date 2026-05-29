-- ============================================================================
-- Multi-user organizations — PHASE 3 (Members slice): RLS + invite functions
-- ============================================================================
-- Adds what the Members page + invite/accept flow need:
--   - shares_org_with(): lets you read profiles of people in your workspaces
--   - peek_invite(): read an invite by token WITHOUT being a member yet
--   - accept_invite(): validate token + join the workspace, atomically
-- Idempotent / safe to re-run.

-- ---- Read co-members' profiles (names/emails for the Members page) ----
create or replace function public.shares_org_with(other_user uuid)
returns boolean language sql security definer set search_path = public stable
as $$
  select exists (
    select 1
      from public.memberships m1
      join public.memberships m2 on m2.organization_id = m1.organization_id
     where m1.user_id = auth.uid()
       and m2.user_id = other_user
  );
$$;

drop policy if exists "read co-member profiles" on public.profiles;
create policy "read co-member profiles" on public.profiles for select
  using (id = auth.uid() or public.shares_org_with(id));

-- ---- Peek at an invite by its token (invitee is not a member yet, so normal
--      RLS on pending_invites would hide it). SECURITY DEFINER bypasses RLS. ----
create or replace function public.peek_invite(invite_token text)
returns table (organization_id uuid, organization_name text, role text, invite_email text, expired boolean)
language sql security definer set search_path = public stable
as $$
  select pi.organization_id, o.name, pi.role, pi.email, (pi.expires_at < now())
    from public.pending_invites pi
    join public.organizations o on o.id = pi.organization_id
   where pi.token = invite_token;
$$;

-- ---- Accept an invite: validate token/expiry/email, enforce the member cap,
--      create the membership, delete the invite, log the join — all atomically. ----
create or replace function public.accept_invite(invite_token text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  inv public.pending_invites;
  org public.organizations;
  uid uuid := auth.uid();
  uemail text;
  member_count int;
begin
  if uid is null then
    return jsonb_build_object('error', 'You must be signed in to accept an invite.');
  end if;

  select * into inv from public.pending_invites where token = invite_token;
  if not found then
    return jsonb_build_object('error', 'This invite link is invalid or has already been used.');
  end if;
  if inv.expires_at < now() then
    return jsonb_build_object('error', 'This invite link has expired. Ask the owner for a new one.');
  end if;

  select email into uemail from auth.users where id = uid;
  if lower(uemail) <> lower(inv.email) then
    return jsonb_build_object('error', 'This invite was sent to ' || inv.email ||
      '. Please sign in with that email address to accept it.');
  end if;

  -- Already a member? Just clean up the invite and succeed.
  if exists (select 1 from public.memberships
              where organization_id = inv.organization_id and user_id = uid) then
    delete from public.pending_invites where id = inv.id;
    return jsonb_build_object('ok', true, 'organization_id', inv.organization_id, 'already', true);
  end if;

  select * into org from public.organizations where id = inv.organization_id;
  select count(*) into member_count from public.memberships where organization_id = inv.organization_id;
  if member_count >= org.member_limit then
    return jsonb_build_object('error', 'This workspace is full (' || org.member_limit || ' members).');
  end if;

  insert into public.memberships (organization_id, user_id, role, invited_by_user_id)
    values (inv.organization_id, uid, inv.role, inv.invited_by_user_id);
  delete from public.pending_invites where id = inv.id;

  insert into public.activity_log (organization_id, actor_user_id, action_type, target_type, target_id, description)
    values (inv.organization_id, uid, 'member.joined', 'membership', uid,
            coalesce((select display_name from public.profiles where id = uid), uemail) || ' joined the workspace');

  return jsonb_build_object('ok', true, 'organization_id', inv.organization_id);
end;
$$;
