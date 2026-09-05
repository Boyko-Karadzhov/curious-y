-- Make quiz issuance, answer validation, and learning/game progress server-authoritative.

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS required_concepts JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS concept_definition TEXT,
  ADD COLUMN IF NOT EXISTS prerequisites_met BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.game_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  day_stamp DATE NOT NULL DEFAULT CURRENT_DATE,
  castle_level INTEGER NOT NULL DEFAULT 1 CHECK (castle_level >= 1),
  castle_xp INTEGER NOT NULL DEFAULT 0 CHECK (castle_xp BETWEEN 0 AND 100),
  gold INTEGER NOT NULL DEFAULT 0 CHECK (gold >= 0),
  gems INTEGER NOT NULL DEFAULT 0 CHECK (gems >= 0),
  keys INTEGER NOT NULL DEFAULT 0 CHECK (keys >= 0),
  knowledge JSONB NOT NULL DEFAULT '{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}'::jsonb,
  answers_today INTEGER NOT NULL DEFAULT 0 CHECK (answers_today >= 0),
  correct_today INTEGER NOT NULL DEFAULT 0 CHECK (correct_today >= 0),
  daily_claimed BOOLEAN NOT NULL DEFAULT false,
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  trophies INTEGER NOT NULL DEFAULT 1000 CHECK (trophies >= 0),
  war_pressure NUMERIC NOT NULL DEFAULT 50 CHECK (war_pressure BETWEEN 0 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.backend_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, action)
);

ALTER TABLE public.backend_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.backend_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.backend_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_backend_rate_limit(
  p_user_id UUID,
  p_action TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_limit public.backend_rate_limits%ROWTYPE;
BEGIN
  IF p_max_requests < 1 OR p_window_seconds < 1 THEN RETURN false; END IF;

  INSERT INTO public.backend_rate_limits (user_id, action, request_count)
  VALUES (p_user_id, p_action, 0)
  ON CONFLICT (user_id, action) DO NOTHING;

  SELECT * INTO current_limit FROM public.backend_rate_limits
  WHERE user_id = p_user_id AND action = p_action
  FOR UPDATE;

  IF current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN
    UPDATE public.backend_rate_limits SET window_started_at = now(), request_count = 1
    WHERE user_id = p_user_id AND action = p_action;
    RETURN true;
  END IF;

  IF current_limit.request_count >= p_max_requests THEN RETURN false; END IF;
  UPDATE public.backend_rate_limits SET request_count = request_count + 1
  WHERE user_id = p_user_id AND action = p_action;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_backend_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_backend_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;

ALTER TABLE public.game_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own game stats" ON public.game_stats;
CREATE POLICY "Users can view their own game stats"
  ON public.game_stats FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- The browser may read its own stats, but may never manufacture progress.
REVOKE ALL ON TABLE public.game_stats FROM anon, authenticated;
GRANT SELECT ON TABLE public.game_stats TO authenticated;
GRANT ALL ON TABLE public.game_stats TO service_role;

-- Correct answers must not be discoverable by querying the table before submission.
DROP POLICY IF EXISTS "Users can view their own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can insert their own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can update their own questions" ON public.questions;
DROP POLICY IF EXISTS "Users can delete their own questions" ON public.questions;
REVOKE ALL ON TABLE public.questions FROM anon, authenticated;
GRANT ALL ON TABLE public.questions TO service_role;

-- Concept mastery is a statistic. Clients can inspect it but only trusted backend code can change it.
DROP POLICY IF EXISTS "Users can insert their own concepts" ON public.concepts;
DROP POLICY IF EXISTS "Users can update their own concepts" ON public.concepts;
DROP POLICY IF EXISTS "Users can delete their own concepts" ON public.concepts;
REVOKE ALL ON TABLE public.concepts FROM anon, authenticated;
GRANT SELECT ON TABLE public.concepts TO authenticated;
GRANT ALL ON TABLE public.concepts TO service_role;

-- Chat rows are also written by the Edge Function so assistant messages cannot be forged.
DROP POLICY IF EXISTS "Users can insert their own chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Users can delete their own chat messages" ON public.chat_messages;
REVOKE ALL ON TABLE public.chat_messages FROM anon, authenticated;
GRANT SELECT ON TABLE public.chat_messages TO authenticated;
GRANT ALL ON TABLE public.chat_messages TO service_role;

-- Keep one encrypted Gemini key per user. Browser roles cannot read this mapping or the
-- Vault secret; only the service-role Edge Function can set, retrieve, or remove a key.
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE TABLE IF NOT EXISTS public.user_ai_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gemini_secret_id UUID NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_ai_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.user_ai_settings TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_gemini_key(p_user_id UUID, p_api_key TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_secret_id UUID;
  new_secret_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_api_key IS NULL OR length(trim(p_api_key)) < 10 OR length(p_api_key) > 512 THEN
    RAISE EXCEPTION 'Invalid Gemini API key';
  END IF;

  SELECT gemini_secret_id INTO existing_secret_id
  FROM public.user_ai_settings
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF existing_secret_id IS NULL THEN
    SELECT vault.create_secret(
      trim(p_api_key),
      'curious-y-gemini-' || p_user_id::TEXT,
      'User-owned Gemini API key for Curious-Y'
    ) INTO new_secret_id;

    INSERT INTO public.user_ai_settings (user_id, gemini_secret_id)
    VALUES (p_user_id, new_secret_id);
  ELSE
    PERFORM vault.update_secret(
      existing_secret_id,
      trim(p_api_key),
      'curious-y-gemini-' || p_user_id::TEXT,
      'User-owned Gemini API key for Curious-Y'
    );
    UPDATE public.user_ai_settings SET updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_gemini_key(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets AS secret
  JOIN public.user_ai_settings AS settings ON settings.gemini_secret_id = secret.id
  WHERE settings.user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_gemini_key(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.user_ai_settings
  WHERE user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_user_gemini_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = old.gemini_secret_id;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_user_gemini_secret ON public.user_ai_settings;
CREATE TRIGGER cleanup_user_gemini_secret
  AFTER DELETE ON public.user_ai_settings
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_gemini_secret();

REVOKE ALL ON FUNCTION public.set_user_gemini_key(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_gemini_key(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_user_gemini_key(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_user_gemini_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_gemini_key(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_gemini_key(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_user_gemini_key(UUID) TO service_role;

-- Migrate existing Gemini keys into Vault before removing the legacy provider/model table.
DO $$
DECLARE
  old_setting RECORD;
BEGIN
  FOR old_setting IN
    SELECT id, api_key FROM public.user_settings
    WHERE provider = 'gemini' AND api_key IS NOT NULL AND length(trim(api_key)) >= 10
  LOOP
    PERFORM public.set_user_gemini_key(old_setting.id, old_setting.api_key);
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TABLE IF EXISTS public.user_settings;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.game_stats (user_id) VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.game_stats (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- Answered history is exposed through a constrained RPC. The base question table stays hidden,
-- which prevents reading correct_index/explanation for an active question.
CREATE OR REPLACE FUNCTION public.get_question_history()
RETURNS SETOF public.questions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT q.*
  FROM public.questions q
  WHERE q.user_id = auth.uid()
    AND q.answered_at IS NOT NULL
  ORDER BY q.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_question_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_question_history() TO authenticated, service_role;

-- Only the service-role Edge Function can call this. The row lock makes an answer single-use,
-- even when the same request is raced or replayed.
CREATE OR REPLACE FUNCTION public.record_question_answer(
  p_user_id UUID,
  p_question_id UUID,
  p_selected_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  q public.questions%ROWTYPE;
  s public.game_stats%ROWTYPE;
  v_is_correct BOOLEAN;
  reasoning_multiplier NUMERIC;
  boss_multiplier NUMERIC;
  correctness_multiplier NUMERIC;
  reward_multiplier NUMERIC;
  knowledge_amount INTEGER;
  reward_gold INTEGER;
  reward_keys INTEGER;
  resource_key TEXT;
  next_track JSONB;
  next_mastery TEXT;
  core_sum INTEGER;
  advanced_sum INTEGER;
BEGIN
  IF p_selected_index NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'selected_index must be between 0 and 3';
  END IF;

  SELECT * INTO q
  FROM public.questions
  WHERE id = p_question_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF q.answered_at IS NOT NULL THEN RAISE EXCEPTION 'Question has already been answered'; END IF;
  IF q.expires_at IS NOT NULL AND q.expires_at < now() THEN RAISE EXCEPTION 'Question has expired'; END IF;

  v_is_correct := p_selected_index = q.correct_index;
  UPDATE public.questions
  SET selected_index = p_selected_index, is_correct = v_is_correct, answered_at = now()
  WHERE id = q.id;

  INSERT INTO public.game_stats (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.game_stats
  SET day_stamp = CURRENT_DATE, answers_today = 0, correct_today = 0, daily_claimed = false
  WHERE user_id = p_user_id AND day_stamp <> CURRENT_DATE;

  reasoning_multiplier := CASE q.reasoning_complexity
    WHEN 'composition' THEN 1.15 WHEN 'discrimination' THEN 1.20
    WHEN 'transfer' THEN 1.30 WHEN 'counterfactual' THEN 1.40
    WHEN 'synthesis' THEN 1.55 WHEN 'derivation' THEN 1.75 ELSE 1 END;
  boss_multiplier := CASE WHEN COALESCE(q.is_boss_question, false) THEN 4 ELSE 1 END;
  correctness_multiplier := CASE WHEN v_is_correct THEN 1 ELSE 0.2 END;
  reward_multiplier := reasoning_multiplier * boss_multiplier * correctness_multiplier;
  knowledge_amount := GREATEST(CASE WHEN v_is_correct THEN 10 ELSE 3 END, ROUND(20 * reward_multiplier)::INTEGER);
  reward_gold := CASE WHEN v_is_correct THEN CASE WHEN COALESCE(q.is_boss_question, false) THEN 160 ELSE 32 END ELSE 8 END;
  reward_keys := CASE WHEN v_is_correct AND COALESCE(q.is_boss_question, false) THEN 1 ELSE 0 END;
  resource_key := CASE q.topic
    WHEN 'Mathematics & Logic' THEN 'runes' WHEN 'Chemistry' THEN 'reagents'
    WHEN 'Life' THEN 'essence' WHEN 'Computer Science' THEN 'cores'
    WHEN 'Earth & Space' THEN 'astral' WHEN 'Mind & Behavior' THEN 'insight'
    WHEN 'Society & History' THEN 'influence' ELSE 'force' END;

  UPDATE public.game_stats
  SET knowledge = jsonb_set(knowledge, ARRAY[resource_key], to_jsonb(COALESCE((knowledge ->> resource_key)::INTEGER, 0) + knowledge_amount)),
      gold = gold + reward_gold,
      keys = keys + reward_keys,
      answers_today = answers_today + 1,
      correct_today = correct_today + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
      castle_xp = LEAST(100, castle_xp + CASE WHEN v_is_correct THEN 8 ELSE 2 END),
      war_pressure = LEAST(94, war_pressure + CASE WHEN v_is_correct THEN 2 ELSE 0.5 END),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO s;

  IF q.concept IS NOT NULL THEN
    INSERT INTO public.concepts (
      user_id, canonical_name, definition, aliases, topics, prerequisites,
      mastery, reasoning_track, is_atomic
    ) VALUES (
      p_user_id, q.concept, COALESCE(q.concept_definition, q.explanation), '[]'::jsonb,
      jsonb_build_object(q.topic, 1), q.required_concepts, 'unseen',
      '{"directInference":0,"composition":0,"discrimination":0,"transfer":0,"counterfactual":0,"synthesis":0,"derivation":0}'::jsonb,
      false
    ) ON CONFLICT (user_id, canonical_name) DO NOTHING;
  END IF;

  IF v_is_correct AND q.concept IS NOT NULL AND q.reasoning_complexity IS NOT NULL THEN
    SELECT reasoning_track INTO next_track FROM public.concepts
    WHERE user_id = p_user_id AND lower(canonical_name) = lower(q.concept)
    FOR UPDATE;

    IF FOUND THEN
      next_track := jsonb_set(next_track, ARRAY[q.reasoning_complexity],
        to_jsonb(COALESCE((next_track ->> q.reasoning_complexity)::INTEGER, 0) + 1));
      core_sum := COALESCE((next_track ->> 'directInference')::INTEGER, 0)
        + COALESCE((next_track ->> 'composition')::INTEGER, 0)
        + COALESCE((next_track ->> 'discrimination')::INTEGER, 0);
      advanced_sum := COALESCE((next_track ->> 'transfer')::INTEGER, 0)
        + COALESCE((next_track ->> 'synthesis')::INTEGER, 0)
        + COALESCE((next_track ->> 'derivation')::INTEGER, 0);
      next_mastery := CASE
        WHEN (SELECT bool_and(COALESCE((next_track ->> item.key)::INTEGER, 0) >= 3)
              FROM unnest(ARRAY['directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation']) AS item(key)) THEN 'mastered'
        WHEN COALESCE((next_track ->> 'directInference')::INTEGER, 0) >= 1
          AND COALESCE((next_track ->> 'composition')::INTEGER, 0) >= 1
          AND COALESCE((next_track ->> 'discrimination')::INTEGER, 0) >= 1
          AND core_sum >= 5 AND advanced_sum >= 3 THEN 'proficient'
        ELSE 'learning' END;
      UPDATE public.concepts SET reasoning_track = next_track, mastery = next_mastery,
        last_asked = now(), updated_at = now()
      WHERE user_id = p_user_id AND lower(canonical_name) = lower(q.concept);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'question', to_jsonb(q) || jsonb_build_object('selected_index', p_selected_index, 'is_correct', v_is_correct, 'answered_at', now()),
    'stats', to_jsonb(s),
    'reward', jsonb_build_object(
      'id', q.id::text, 'correct', v_is_correct, 'gold', reward_gold, 'keys', reward_keys,
      'totalKnowledge', knowledge_amount, 'multiplier', reward_multiplier,
      'multiplierLabel', CASE WHEN NOT v_is_correct THEN 'Recovery reward' WHEN COALESCE(q.is_boss_question, false) THEN 'Boss encounter' ELSE 'Server-verified learning' END,
      'lines', jsonb_build_array(jsonb_build_object('key', resource_key, 'amount', knowledge_amount))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_question_answer(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_question_answer(UUID, UUID, INTEGER) TO service_role;

-- Prevent future migrations from accidentally giving browser roles write access by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
