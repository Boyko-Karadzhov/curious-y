-- Migration: Add concepts table and question concept columns

-- 1. Create concepts table
CREATE TABLE IF NOT EXISTS public.concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canonical_name TEXT NOT NULL,
    definition TEXT NOT NULL,
    aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    topics JSONB NOT NULL DEFAULT '{}'::jsonb,
    prerequisites JSONB NOT NULL DEFAULT '[]'::jsonb,
    mastery TEXT NOT NULL DEFAULT 'unseen',
    reasoning_track JSONB NOT NULL DEFAULT '{"directInference":0,"composition":0,"discrimination":0,"transfer":0,"counterfactual":0,"synthesis":0,"derivation":0}'::jsonb,
    last_asked TIMESTAMP WITH TIME ZONE,
    is_atomic BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, canonical_name)
);

-- Index on user_id
CREATE INDEX IF NOT EXISTS idx_concepts_user_id ON public.concepts(user_id);

-- Enable RLS
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

-- Policies for concepts
CREATE POLICY "Users can view their own concepts"
    ON public.concepts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own concepts"
    ON public.concepts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own concepts"
    ON public.concepts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own concepts"
    ON public.concepts FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Add columns to questions table
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS concept TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS reasoning_complexity TEXT;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS is_boss_question BOOLEAN DEFAULT false;

-- Grant permissions to public API roles
GRANT ALL ON TABLE public.concepts TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
