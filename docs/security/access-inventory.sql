-- Read-only metadata and aggregate inspection; never returns keys or user content.
BEGIN READ ONLY;
SELECT jsonb_build_object(
  'relations', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT n.nspname AS schema, c.relname AS name, c.relkind,
      c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls, c.reloptions,
      r.rolname AS role,
      has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
      has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
      has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
      has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
      has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN pg_roles r
    WHERE n.nspname IN ('public', 'vault', 'storage')
      AND c.relkind IN ('r', 'p', 'v', 'm') AND r.rolname IN ('anon', 'authenticated')
    ORDER BY n.nspname, c.relname, r.rolname
  ) x),
  'policies', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname IN ('public', 'vault', 'storage')
    ORDER BY schemaname, tablename, policyname
  ) x),
  'functions', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT n.nspname AS schema, p.proname AS name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prosecdef AS security_definer, p.proconfig,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'vault') ORDER BY n.nspname, p.proname
  ) x),
  'schema_privileges', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT n.nspname, r.rolname,
      has_schema_privilege(r.oid, n.oid, 'USAGE') AS usage,
      has_schema_privilege(r.oid, n.oid, 'CREATE') AS create_objects
    FROM pg_namespace n CROSS JOIN pg_roles r
    WHERE n.nspname IN ('public', 'vault', 'storage', 'graphql_public')
      AND r.rolname IN ('anon', 'authenticated') ORDER BY n.nspname, r.rolname
  ) x),
  'defaults', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT pg_get_userbyid(d.defaclrole) AS owner, n.nspname AS schema,
      d.defaclobjtype, d.defaclacl::text
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public' OR d.defaclnamespace = 0
  ) x),
  'publications', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT pubname, schemaname, tablename FROM pg_publication_tables
    WHERE schemaname = 'public'
  ) x),
  'storage_buckets', (SELECT jsonb_agg(to_jsonb(x)) FROM (
    SELECT id, public FROM storage.buckets
  ) x),
  'question_aggregate', (SELECT jsonb_build_object(
    'total', count(*),
    'null_expiry', count(*) FILTER (WHERE expires_at IS NULL),
    'selected_but_unanswered', count(*) FILTER (WHERE selected_index IS NOT NULL AND answered_at IS NULL),
    'unanswered_without_expiry', count(*) FILTER (WHERE answered_at IS NULL AND expires_at IS NULL),
    'invalid_gate_unanswered', count(*) FILTER (WHERE answered_at IS NULL AND NOT prerequisites_met)
  ) FROM public.questions),
  'concept_aggregate', (SELECT jsonb_build_object(
    'total', count(*), 'created_before_security_migration', count(*) FILTER (WHERE created_at < '2026-09-04T19:00:00Z'::timestamptz)
  ) FROM public.concepts)
) AS audit;
ROLLBACK;
