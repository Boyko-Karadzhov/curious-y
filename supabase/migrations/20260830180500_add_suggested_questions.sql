-- =========================================================
-- Curious-Y Supabase Migration: Add suggested_questions to questions
-- =========================================================

ALTER TABLE public.questions
ADD COLUMN IF NOT EXISTS suggested_questions JSONB;
