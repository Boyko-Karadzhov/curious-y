-- =========================================================
-- Curious-Y Supabase Migration: Update Default Topics
-- Adds Biology, Computer Science, and WH40k: Horus Heresy
-- =========================================================

-- 1. Update the default value for the topics column in user_settings table
ALTER TABLE public.user_settings
    ALTER COLUMN topics SET DEFAULT 'Physics, Chemistry, Biology, Computer Science, Algebra, Calculus, History, WH40k: Horus Heresy';

-- 2. Update the handle_new_user trigger function for newly registered users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (id, provider, model, topics)
    VALUES (new.id, 'gemini', 'gemini-3.7-flash', 'Physics, Chemistry, Biology, Computer Science, Algebra, Calculus, History, WH40k: Horus Heresy')
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update existing users who still have the legacy default topics
UPDATE public.user_settings
SET topics = 'Physics, Chemistry, Biology, Computer Science, Algebra, Calculus, History, WH40k: Horus Heresy'
WHERE topics = 'Physics, Chemistry, Algebra, Calculus, History'
   OR topics = 'Physics, Chemistry, Biology, Algebra, Calculus, History, WH40k: Horus Heresy';
