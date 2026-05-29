-- ============================================================================
-- Verify PHASE 1 of the multi-user-orgs migration
-- ============================================================================
-- Paste into the Supabase SQL editor AFTER running multi-user-orgs.sql.
-- Each query notes its expected result.

-- 1. The four new tables exist.  -> expected: 4 rows
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('organizations', 'memberships', 'pending_invites', 'activity_log')
 order by table_name;

-- 2. RLS is enabled on each new table.  -> expected: all 4 rows rls_on = true
select c.relname as table_name, c.relrowsecurity as rls_on
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('organizations', 'memberships', 'pending_invites', 'activity_log');

-- 3. Each content table now has organization_id + created_by_user_id.
--    -> expected: 14 rows (7 tables x 2 columns)
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and column_name in ('organization_id', 'created_by_user_id')
   and table_name in ('projects', 'nodes', 'notes', 'bubbles', 'ambitions', 'tag_categories', 'tag_values')
 order by table_name, column_name;

-- 4. profiles.display_name exists and is backfilled.
--    -> expected: total_profiles == profiles_with_display_name
select count(*) as total_profiles,
       count(display_name) as profiles_with_display_name
  from public.profiles;

-- 5. Helper functions exist.  -> expected: 3 rows
select proname from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('is_org_member', 'is_org_writer', 'is_org_owner')
 order by proname;

-- 6. RLS policies on the new tables.
--    -> expected: 14 rows (orgs 4, memberships 4, invites 4, activity_log 2)
select tablename, policyname
  from pg_policies
 where schemaname = 'public'
   and tablename in ('organizations', 'memberships', 'pending_invites', 'activity_log')
 order by tablename, policyname;

-- 7. Sanity — existing tables are still untouched (per-user policies intact).
--    -> expected: each content table still shows its original policy_count = 1
select tablename, count(*) as policy_count
  from pg_policies
 where schemaname = 'public'
   and tablename in ('projects', 'nodes', 'notes', 'bubbles', 'ambitions', 'tag_categories', 'tag_values')
 group by tablename
 order by tablename;
