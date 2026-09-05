-- Browser state is never imported into the verified account economy.
CREATE TABLE public.kingdom_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{"version":1,"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0},"rewarded":[],"cleared":0,"battle":null}',
  revision bigint NOT NULL DEFAULT 0,
  generation bigint NOT NULL DEFAULT 0,
  battle_clock timestamptz,
  issuance_lease uuid,
  issuance_until timestamptz,
  CHECK (jsonb_typeof(state) = 'object')
);
CREATE TABLE public.kingdom_commands (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  generation bigint NOT NULL,
  command jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
CREATE TABLE public.learning_reward_events (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  generation bigint NOT NULL,
  selected_index integer NOT NULL,
  topic text NOT NULL,
  tokens integer NOT NULL CHECK (tokens IN (3,10)),
  reward jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, question_id)
);
ALTER TABLE public.kingdom_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kingdom_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_reward_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kingdom_state, public.kingdom_commands, public.learning_reward_events FROM PUBLIC, anon, authenticated;
GRANT SELECT (user_id,state,revision,generation) ON public.kingdom_state TO authenticated;
CREATE POLICY "Read own kingdom" ON public.kingdom_state FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT ALL ON public.kingdom_state, public.kingdom_commands, public.learning_reward_events TO service_role;
INSERT INTO public.kingdom_state(user_id) SELECT id FROM auth.users;

ALTER TABLE public.questions ADD COLUMN trusted_issuance boolean NOT NULL DEFAULT false,
  ADD COLUMN generation bigint;
-- Preserve old history, but no previously exposed/client-authored question can score.
UPDATE public.questions SET answered_at = created_at WHERE selected_index IS NOT NULL AND answered_at IS NULL;
UPDATE public.questions SET expires_at = now() WHERE answered_at IS NULL;
-- Preserve legacy definitions without trusting formerly editable mastery/atomic claims.
UPDATE public.concepts SET mastery='unseen', is_atomic=false,
  reasoning_track='{"directInference":0,"composition":0,"discrimination":0,"transfer":0,"counterfactual":0,"synthesis":0,"derivation":0}'
WHERE created_at < '2026-09-04T19:00:00Z'::timestamptz;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.game_stats(user_id) VALUES(new.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.kingdom_state(user_id) VALUES(new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END $$;

CREATE FUNCTION public.kingdom_snapshot(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('state',state,'revision',revision,'generation',generation)
  FROM public.kingdom_state WHERE user_id=p_user_id;
$$;

CREATE FUNCTION public.kingdom_command_context(p_user_id uuid, p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id;
  IF k.generation <> p_generation THEN RAISE EXCEPTION 'Progress was reset; refresh your Castle.'; END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('battle_clock',k.battle_clock,'server_now',clock_timestamp());
END $$;

CREATE FUNCTION public.commit_kingdom_command(p_user_id uuid, p_generation bigint,
  p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; previous public.kingdom_commands%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation <> p_generation THEN RAISE EXCEPTION 'Progress was reset; refresh your Castle.'; END IF;
  SELECT * INTO previous FROM public.kingdom_commands WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.command <> p_command OR previous.generation <> p_generation THEN RAISE EXCEPTION 'Command ID was already used.'; END IF;
    RETURN public.kingdom_snapshot(p_user_id);
  END IF;
  IF k.revision <> p_revision THEN RETURN NULL; END IF;
  IF p_request_id IS NULL OR p_command->>'type' NOT IN ('exchange','castle','building','start','deploy','tick','retreat')
    OR p_state IS NULL OR p_state->'rewarded' <> '[]'::jsonb THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  -- Time-only polling is inherently idempotent and needs no permanent command log.
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command) VALUES(p_user_id,p_request_id,p_generation,p_command);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id);
END $$;

CREATE FUNCTION public.find_kingdom_command(p_user_id uuid,p_request_id uuid,p_generation bigint,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.kingdom_commands%ROWTYPE;
BEGIN
  SELECT * INTO previous FROM public.kingdom_commands WHERE user_id=p_user_id AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF previous.command <> p_command OR previous.generation <> p_generation OR
    (SELECT generation FROM public.kingdom_state WHERE user_id=p_user_id) <> p_generation THEN
    RAISE EXCEPTION 'Command ID was already used or progress was reset.';
  END IF;
  RETURN public.kingdom_snapshot(p_user_id);
END $$;

CREATE FUNCTION public.begin_question_generation(p_user_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; lease uuid;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance
    AND generation=k.generation AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.kingdom_state SET issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  RETURN jsonb_build_object('lease',lease,'generation',k.generation);
END $$;

CREATE FUNCTION public.cancel_question_generation(p_user_id uuid,p_lease uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  UPDATE public.kingdom_state SET issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id AND issuance_lease=p_lease;
$$;

CREATE FUNCTION public.finish_question_generation(p_user_id uuid,p_lease uuid,p_generation bigint,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now() THEN
    RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.';
  END IF;
  INSERT INTO public.questions(user_id,topic,subtopic,angle,angle_fit,question_text,options,correct_index,
    explanation,suggested_questions,concept,concept_definition,reasoning_complexity,is_boss_question,
    required_concepts,prerequisites_met,expires_at,trusted_issuance,generation)
  VALUES(p_user_id,p_question->>'topic',p_question->>'subtopic',p_question->>'angle',p_question->>'angle_fit',
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',p_question->'suggested_questions',p_question->>'concept',p_question->>'concept_definition',
    p_question->>'reasoning_complexity',(p_question->>'is_boss_question')::boolean,p_question->'required_concepts',
    true,now()+interval '30 minutes',true,k.generation) RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

-- Retain the tested scorer as an owner-only internal implementation. The public
-- service entry point always locks the account before the question/stats/concepts.
ALTER FUNCTION public.record_question_answer(uuid,uuid,integer) RENAME TO score_question_internal;
REVOKE ALL ON FUNCTION public.score_question_internal(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE;
  previous public.learning_reward_events%ROWTYPE; result jsonb; amount integer;
BEGIN
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Invalid answer.'; END IF;
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF NOT q.trusted_issuance OR q.generation IS DISTINCT FROM k.generation OR q.expires_at IS NULL OR NOT q.prerequisites_met THEN
    RAISE EXCEPTION 'Question has expired';
  END IF;
  SELECT * INTO previous FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id;
  IF FOUND THEN
    IF previous.selected_index<>p_selected_index THEN RAISE EXCEPTION 'Question has already been answered with a different selection'; END IF;
    RETURN jsonb_build_object('question',to_jsonb(q),'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id),
      'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  amount:=CASE WHEN (result->'question'->>'is_correct')::boolean THEN 10 ELSE 3 END;
  UPDATE public.kingdom_state SET state=jsonb_set(state,ARRAY['tokens',q.topic],
    to_jsonb(COALESCE((state->'tokens'->>q.topic)::bigint,0)+amount)),revision=revision+1 WHERE user_id=p_user_id;
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,amount,result->'reward');
  RETURN result || jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id));
END $$;

CREATE FUNCTION public.reset_learning_progress(p_user_id uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation <> p_generation THEN RETURN jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id),
    'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id)); END IF;
  DELETE FROM public.questions WHERE user_id=p_user_id;
  DELETE FROM public.chat_messages WHERE user_id=p_user_id;
  DELETE FROM public.concepts WHERE user_id=p_user_id;
  DELETE FROM public.game_stats WHERE user_id=p_user_id;
  INSERT INTO public.game_stats(user_id) VALUES(p_user_id);
  UPDATE public.kingdom_state SET state=DEFAULT,generation=generation+1,revision=revision+1,
    battle_clock=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id),'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id));
END $$;

CREATE FUNCTION public.delete_learning_question(p_user_id uuid,p_question_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  DELETE FROM public.questions WHERE id=p_question_id AND user_id=p_user_id AND answered_at IS NOT NULL;
  -- Reward events deliberately have no cascading FK to question content.
END $$;

DROP FUNCTION public.get_question_history();
CREATE FUNCTION public.get_question_history(p_limit integer DEFAULT 100,p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(q)-ARRAY['trusted_issuance','generation']), '[]'::jsonb) FROM (
    SELECT * FROM public.questions WHERE user_id=auth.uid() AND answered_at IS NOT NULL
    ORDER BY created_at DESC,id DESC LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET LEAST(GREATEST(p_offset,0),100000)
  ) q;
$$;

-- Explicit privileges for all application migration owners; extension functions
-- are not blanket-revoked. No browser role needs to create schema objects.
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid::regprocedure AS signature FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('kingdom_snapshot','kingdom_command_context','commit_kingdom_command','find_kingdom_command',
      'begin_question_generation','cancel_question_generation','finish_question_generation','record_question_answer',
      'reset_learning_progress','delete_learning_question','get_question_history') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.get_question_history(integer,integer) TO authenticated;
