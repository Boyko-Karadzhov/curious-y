-- Respect topic switches while preserving generation leases and retry reuse.
DROP FUNCTION public.begin_question_generation(uuid);
CREATE FUNCTION public.begin_question_generation(p_user_id uuid, p_topic text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; lease uuid;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
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

REVOKE ALL ON FUNCTION public.begin_question_generation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_question_generation(uuid,text) TO service_role;

