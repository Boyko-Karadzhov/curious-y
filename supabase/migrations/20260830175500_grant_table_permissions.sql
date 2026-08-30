-- =========================================================
-- Curious-Y Supabase Migration: Grant Table & Schema Privileges
-- Fixes PostgreSQL Error 42501 (permission denied for table questions/user_settings/chat_messages)
-- =========================================================

-- 1. Grant USAGE on public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant table-level permissions for all Curious-Y tables
GRANT ALL ON TABLE public.user_settings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.questions TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.chat_messages TO anon, authenticated, service_role;

-- 3. Grant sequence permissions if any sequences are created
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Grant execute permissions on custom database functions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated, service_role;

-- 5. Set default privileges for any future tables and sequences created in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
