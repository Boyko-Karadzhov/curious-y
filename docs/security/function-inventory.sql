BEGIN READ ONLY;
SELECT jsonb_build_object(
  'definitions', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT p.proname, pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' ORDER BY p.proname
  ) x),
  'column_grants', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT table_name, column_name, grantee, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    ORDER BY table_name, column_name, grantee, privilege_type
  ) x),
  'api_roles', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls
    FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')
  ) x),
  'api_settings', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT pg_get_userbyid(s.setrole) AS role, setting
    FROM pg_db_role_setting s CROSS JOIN LATERAL unnest(s.setconfig) setting
    WHERE setting LIKE 'pgrst.db_schemas=%' OR setting LIKE 'pgrst.db_extra_search_path=%'
  ) x)
) AS audit;
ROLLBACK;
