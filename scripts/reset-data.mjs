import pg from 'pg';

const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const RESET_SQL = `
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
`;

function localDatabaseUrl() {
    const connectionString = process.env.SUPABASE_DB_URL ?? LOCAL_DATABASE_URL;
    const hostname = new URL(connectionString).hostname;
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(hostname)) {
        throw new Error('Partial reset is limited to a local Supabase database.');
    }

    return connectionString;
}

async function resetData() {
    const client = new pg.Client({ connectionString: localDatabaseUrl() });
    await client.connect();
    try {
        const before = await client.query('SELECT count(*)::integer AS count FROM auth.users');
        await client.query(RESET_SQL);
        console.log(`Reset application data for ${before.rows[0].count} users; auth records were kept.`);
    } finally {
        await client.end();
    }
}

await resetData();
