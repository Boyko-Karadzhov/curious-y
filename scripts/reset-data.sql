BEGIN;

DELETE FROM public.user_ai_settings;

DO $$
DECLARE
  table_names text;
BEGIN
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO table_names
  FROM pg_tables
  WHERE schemaname = 'public';

  IF table_names IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE ' || table_names || ' RESTART IDENTITY';
  END IF;
END
$$;

INSERT INTO public.game_stats (user_id)
SELECT id FROM auth.users;

INSERT INTO public.kingdom_state (user_id)
SELECT id FROM auth.users;

COMMIT;

SELECT count(*)::integer AS preserved_users FROM auth.users;
