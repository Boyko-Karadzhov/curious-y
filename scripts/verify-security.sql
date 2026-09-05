BEGIN READ ONLY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND (NOT c.relrowsecurity
      OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
      OR has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE')
      OR has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'))) THEN
    RAISE EXCEPTION 'An application table exposes browser mutations or anonymous data';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.proname<>'get_question_history'
    AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
    RAISE EXCEPTION 'A privileged function is executable by browser roles';
  END IF;
  IF has_column_privilege('authenticated','public.questions','correct_index','SELECT')
    OR has_schema_privilege('authenticated','vault','USAGE')
    OR has_schema_privilege('authenticated','public','CREATE')
    OR has_schema_privilege('anon','public','CREATE') THEN
    RAISE EXCEPTION 'Answer secrets, Vault, or schema creation is exposed';
  END IF;
  IF NOT has_function_privilege('authenticated','public.get_question_history(integer,integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.record_question_answer(uuid,uuid,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.score_question_internal(uuid,uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'History/answer function privileges are incorrect';
  END IF;
END $$;
SELECT 'PASS' AS security_permissions,
  (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS application_policy_count,
  (SELECT count(*) FROM public.questions WHERE answered_at IS NULL AND NOT trusted_issuance AND expires_at>now()) AS unsafe_active_legacy_questions;
ROLLBACK;
