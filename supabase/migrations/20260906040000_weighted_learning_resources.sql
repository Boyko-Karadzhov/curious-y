-- Step 3: authoritative concept distributions and immutable Castle reward obligations.
-- Deploy this migration before the learning Edge Function and frontend.
CREATE FUNCTION public.resource_topics() RETURNS TABLE(topic text, key text, ord bigint)
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT * FROM unnest(
    ARRAY['Physics','Mathematics & Logic','Chemistry','Life','Computer Science','Earth & Space','Mind & Behavior','Society & History'],
    ARRAY['force','runes','reagents','essence','cores','astral','insight','influence']) WITH ORDINALITY;
$$;

CREATE FUNCTION public.normalize_topic_weights(p_weights jsonb,p_fallback text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_fallback) THEN
    RAISE EXCEPTION 'Unsupported reward topic.';
  END IF;
  WITH usable AS (
    SELECT r.topic, CASE WHEN jsonb_typeof(p_weights->r.topic)='number'
      THEN (p_weights->>r.topic)::numeric ELSE 0 END AS weight FROM public.resource_topics() r
  ), valid AS (SELECT * FROM usable WHERE weight>0 AND weight<=1.7976931348623157e308)
  SELECT jsonb_object_agg(topic,weight/(SELECT sum(weight) FROM valid)) INTO result FROM valid;
  RETURN COALESCE(result,jsonb_build_object(p_fallback,1));
END $$;

CREATE FUNCTION public.allocate_resources(p_total integer,p_weights jsonb,p_fallback text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE weights jsonb; result jsonb;
BEGIN
  IF p_total IS NULL OR p_total<0 THEN RAISE EXCEPTION 'Invalid resource total.'; END IF;
  weights:=public.normalize_topic_weights(p_weights,p_fallback);
  WITH exact AS (
    SELECT r.*,p_total*COALESCE((weights->>r.topic)::numeric,0) AS amount FROM public.resource_topics() r
  ), parts AS (
    SELECT *,floor(amount)::integer AS base,amount-floor(amount) AS remainder FROM exact
  ), ranked AS (
    SELECT *,row_number() OVER (ORDER BY remainder DESC,ord) AS rank,
      p_total-sum(base) OVER () AS remaining FROM parts
  ), lines AS (SELECT *,base+CASE WHEN rank<=remaining THEN 1 ELSE 0 END AS credited FROM ranked)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key',key,'amount',credited) ORDER BY ord)
    FILTER (WHERE credited>0),'[]'::jsonb) INTO result FROM lines;
  RETURN result;
END $$;

CREATE FUNCTION public.castle_learning_reward(p_id uuid,p_correct boolean,p_total integer,p_weights jsonb,p_topic text) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',p_id::text,'correct',p_correct,'totalKnowledge',p_total,
    'topicWeights',public.normalize_topic_weights(p_weights,p_topic),
    'lines',public.allocate_resources(p_total,p_weights,p_topic));
$$;

ALTER TABLE public.questions ADD COLUMN topic_weights jsonb;
-- Preserve the original single-topic obligation for every pre-rollout issuance.
UPDATE public.questions SET topic_weights=jsonb_build_object(topic,1);
ALTER TABLE public.questions ALTER COLUMN topic_weights SET NOT NULL;
ALTER TABLE public.kingdom_state ADD COLUMN issuance_topic text;

-- Canonical names take priority over aliases; identity normalization matches the Edge gate.
CREATE FUNCTION public.resolve_reward_concept(p_user_id uuid,p_name text) RETURNS public.concepts
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT c FROM public.concepts c WHERE c.user_id=p_user_id AND (
    lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.aliases) a(name)
      WHERE lower(regexp_replace(trim(a.name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))))
  ORDER BY (lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))) DESC,c.canonical_name
  LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.begin_question_generation(p_user_id uuid, p_topic text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; lease uuid;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before generating another question.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance
    AND generation=k.generation AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  -- Old trusted questions may have been mislabeled before topic validation existed.
  IF FOUND AND (p_topic IS NULL OR q.topic=p_topic) AND NOT EXISTS (
    SELECT 1 FROM public.resolve_reward_concept(p_user_id,q.concept) c
    WHERE c.id IS NOT NULL AND COALESCE((public.normalize_topic_weights(c.topics,q.topic)->>q.topic)::numeric,0)<=0
  ) THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.kingdom_state SET issuance_topic=p_topic,issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  RETURN jsonb_build_object('lease',lease,'generation',k.generation);
END $$;

CREATE OR REPLACE FUNCTION public.finish_question_generation(p_user_id uuid,p_lease uuid,p_generation bigint,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts; dependency public.concepts;
  weights jsonb; required jsonb; name text; target text;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before generating another question.'; END IF;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now() THEN
    RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.';
  END IF;
  IF k.issuance_topic IS NOT NULL AND p_question->>'topic' IS DISTINCT FROM k.issuance_topic THEN
    RAISE EXCEPTION 'Question must belong to the selected topic.';
  END IF;
  c:=public.resolve_reward_concept(p_user_id,p_question->>'concept');
  target:=COALESCE(c.canonical_name,trim(p_question->>'concept'));
  IF target IS NULL OR target='' THEN RAISE EXCEPTION 'A target concept is required.'; END IF;
  weights:=public.normalize_topic_weights(CASE WHEN c.id IS NOT NULL THEN c.topics ELSE p_question->'topic_weights' END,p_question->>'topic');
  IF COALESCE((weights->>(p_question->>'topic'))::numeric,0)<=0 THEN
    RAISE EXCEPTION 'Concept must belong to the selected topic.';
  END IF;
  required:=COALESCE(p_question->'required_concepts','[]'::jsonb)||COALESCE(c.prerequisites,'[]'::jsonb);
  IF jsonb_typeof(required)<>'array' THEN RAISE EXCEPTION 'Invalid prerequisites.'; END IF;
  FOR name IN SELECT DISTINCT value FROM jsonb_array_elements_text(required) LOOP
    dependency:=public.resolve_reward_concept(p_user_id,name);
    IF dependency.id IS NOT NULL AND dependency.id=c.id AND NOT COALESCE((p_question->>'is_boss_question')::boolean,false) THEN CONTINUE; END IF;
    IF dependency.id IS NULL OR NOT (dependency.mastery IN ('proficient','mastered') OR
      (dependency.is_atomic AND jsonb_array_length(dependency.prerequisites)=0)) THEN
      RAISE EXCEPTION 'Unmet prerequisites: %',name;
    END IF;
  END LOOP;
  IF COALESCE((p_question->>'is_boss_question')::boolean,false) AND jsonb_array_length(required)=0 THEN
    RAISE EXCEPTION 'A boss question requires verified prerequisites.';
  END IF;
  IF NOT COALESCE((p_question->>'is_boss_question')::boolean,false) AND (c.id IS NULL OR c.mastery='unseen')
    AND p_question->>'reasoning_complexity' IS DISTINCT FROM 'directInference' THEN RAISE EXCEPTION 'An unseen target requires directInference.'; END IF;
  -- Retire the previous question only after a replacement has passed validation.
  UPDATE public.questions SET expires_at=now()
    WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,angle_fit,question_text,options,correct_index,
    explanation,suggested_questions,concept,concept_definition,reasoning_complexity,is_boss_question,
    required_concepts,prerequisites_met,expires_at,trusted_issuance,generation,topic_weights)
  VALUES(p_user_id,p_question->>'topic',p_question->>'subtopic',p_question->>'angle',p_question->>'angle_fit',
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',p_question->'suggested_questions',target,p_question->>'concept_definition',
    p_question->>'reasoning_complexity',(p_question->>'is_boss_question')::boolean,p_question->'required_concepts',
    true,now()+interval '30 minutes',true,k.generation,weights) RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;
CREATE OR REPLACE FUNCTION public.score_question_internal(
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

  -- Compatibility activity counters only; legacy financial balances are frozen.
  UPDATE public.game_stats
  SET answers_today = answers_today + 1,
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
      q.topic_weights, q.required_concepts, 'unseen',
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
    'stats', to_jsonb(s)
  );
END;
$$;


-- Replace misleading legacy metadata using the original event topic/tokens, never concept weights.
-- collected_at and wallet balances are deliberately untouched, including deleted question events.
UPDATE public.learning_reward_events SET reward=public.castle_learning_reward(question_id,
  COALESCE((reward->>'correct')::boolean,tokens=10),tokens,jsonb_build_object(topic,1),topic);

CREATE FUNCTION public.protect_learning_reward() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-'collected_at') IS DISTINCT FROM (to_jsonb(OLD)-'collected_at')
    OR (OLD.collected_at IS NOT NULL AND NEW.collected_at IS DISTINCT FROM OLD.collected_at) THEN
    RAISE EXCEPTION 'Reward obligations are immutable.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_learning_reward BEFORE UPDATE ON public.learning_reward_events
  FOR EACH ROW EXECUTE FUNCTION public.protect_learning_reward();
CREATE FUNCTION public.protect_question_weights() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.topic_weights IS DISTINCT FROM OLD.topic_weights THEN RAISE EXCEPTION 'Issued reward weights are immutable.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_question_weights BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.protect_question_weights();

CREATE OR REPLACE FUNCTION public.pending_learning_reward(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(q)||jsonb_build_object('reward',e.reward) FROM public.learning_reward_events e
  JOIN public.kingdom_state k ON k.user_id=e.user_id AND k.generation=e.generation
  JOIN public.questions q ON q.id=e.question_id AND q.user_id=e.user_id
  WHERE e.user_id=p_user_id AND e.collected_at IS NULL ORDER BY q.created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.collect_learning_reward(p_user_id uuid,p_question_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; e public.learning_reward_events%ROWTYPE; line jsonb; topic text;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO e FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF NOT FOUND OR e.generation<>k.generation THEN RAISE EXCEPTION 'Reward not found or progress was reset.'; END IF;
  IF e.collected_at IS NULL THEN
    FOR line IN SELECT value FROM jsonb_array_elements(e.reward->'lines') LOOP
      SELECT r.topic INTO STRICT topic FROM public.resource_topics() r WHERE r.key=line->>'key';
      k.state:=jsonb_set(k.state,ARRAY['tokens',topic],
        to_jsonb((k.state->'tokens'->>topic)::bigint+(line->>'amount')::integer));
    END LOOP;
    UPDATE public.kingdom_state SET state=k.state,revision=revision+1 WHERE user_id=p_user_id;
    UPDATE public.learning_reward_events SET collected_at=now() WHERE user_id=p_user_id AND question_id=p_question_id;
  END IF;
  -- Keep the snapshot shape for current Castle callers, with the exact stored receipt attached.
  RETURN public.kingdom_snapshot(p_user_id)||jsonb_build_object('reward',e.reward);
END $$;
CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE;
  previous public.learning_reward_events%ROWTYPE; result jsonb; amount integer; breakdown jsonb;
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
      'collected',previous.collected_at IS NOT NULL,'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before answering another question.'; END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  amount:=CASE WHEN (result->'question'->>'is_correct')::boolean THEN 10 ELSE 3 END;
  breakdown:=public.castle_learning_reward(q.id,(result->'question'->>'is_correct')::boolean,amount,q.topic_weights,q.topic);
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,amount,breakdown);
  RETURN result || jsonb_build_object('reward',breakdown,'collected',false,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;


-- Helpers and the scorer are owner-only; existing service entry-point grants remain intact.
REVOKE ALL ON FUNCTION public.resource_topics(),public.normalize_topic_weights(jsonb,text),
  public.allocate_resources(integer,jsonb,text),public.castle_learning_reward(uuid,boolean,integer,jsonb,text),
  public.resolve_reward_concept(uuid,text),public.protect_learning_reward(),public.protect_question_weights(),
  public.score_question_internal(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
