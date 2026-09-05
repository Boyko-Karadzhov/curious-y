-- Existing rewards were already credited; only new answers await collection.
ALTER TABLE public.learning_reward_events ADD COLUMN collected_at timestamptz DEFAULT now();
ALTER TABLE public.learning_reward_events ALTER COLUMN collected_at DROP DEFAULT;
CREATE INDEX learning_rewards_pending ON public.learning_reward_events(user_id,generation) WHERE collected_at IS NULL;

CREATE FUNCTION public.pending_learning_reward(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(q) FROM public.learning_reward_events e
  JOIN public.kingdom_state k ON k.user_id=e.user_id AND k.generation=e.generation
  JOIN public.questions q ON q.id=e.question_id AND q.user_id=e.user_id
  WHERE e.user_id=p_user_id AND e.collected_at IS NULL ORDER BY q.created_at LIMIT 1;
$$;

CREATE FUNCTION public.collect_learning_reward(p_user_id uuid,p_question_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; e public.learning_reward_events%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO e FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF NOT FOUND OR e.generation<>k.generation THEN RAISE EXCEPTION 'Reward not found or progress was reset.'; END IF;
  IF e.collected_at IS NULL THEN
    UPDATE public.kingdom_state SET state=jsonb_set(state,ARRAY['tokens',e.topic],
      to_jsonb(COALESCE((state->'tokens'->>e.topic)::bigint,0)+e.tokens)),revision=revision+1 WHERE user_id=p_user_id;
    UPDATE public.learning_reward_events SET collected_at=now() WHERE user_id=p_user_id AND question_id=p_question_id;
  END IF;
  RETURN public.kingdom_snapshot(p_user_id);
END $$;
CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
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
      'collected',previous.collected_at IS NOT NULL,'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before answering another question.'; END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  amount:=CASE WHEN (result->'question'->>'is_correct')::boolean THEN 10 ELSE 3 END;
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,amount,result->'reward');
  RETURN result || jsonb_build_object('collected',false,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

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
    SELECT 1 FROM public.concepts c WHERE c.user_id=p_user_id
      AND (lower(trim(c.canonical_name))=lower(trim(q.concept)) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(c.aliases) AS alias(name)
          WHERE lower(trim(alias.name))=lower(trim(q.concept))
      )) AND COALESCE((c.topics->>q.topic)::numeric,0)<=0
  ) THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.kingdom_state SET issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  RETURN jsonb_build_object('lease',lease,'generation',k.generation);
END $$;

CREATE OR REPLACE FUNCTION public.finish_question_generation(p_user_id uuid,p_lease uuid,p_generation bigint,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before generating another question.'; END IF;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now() THEN
    RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.';
  END IF;
  -- Retire the previous question only after a replacement has passed validation.
  UPDATE public.questions SET expires_at=now()
    WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
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
CREATE OR REPLACE FUNCTION public.delete_learning_question(p_user_id uuid,p_question_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.learning_reward_events e JOIN public.kingdom_state k
    ON k.user_id=e.user_id AND k.generation=e.generation
    WHERE e.user_id=p_user_id AND e.question_id=p_question_id AND e.collected_at IS NULL) THEN
    RAISE EXCEPTION 'Collect your Resources before deleting this question.';
  END IF;
  DELETE FROM public.questions WHERE id=p_question_id AND user_id=p_user_id AND answered_at IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.pending_learning_reward(uuid),public.collect_learning_reward(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pending_learning_reward(uuid),public.collect_learning_reward(uuid,uuid) TO service_role;