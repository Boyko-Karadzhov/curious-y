-- =========================================================
-- Curious-Y Supabase Migration: Drop Topics from User Settings
-- Topics are now canonically defined in the application code.
-- =========================================================

-- 1. Drop the topics column from user_settings table
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS topics;

-- 2. Update the handle_new_user trigger function to no longer reference topics
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (id, provider, model)
    VALUES (new.id, 'gemini', 'gemini-3.5-flash-lite')
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
