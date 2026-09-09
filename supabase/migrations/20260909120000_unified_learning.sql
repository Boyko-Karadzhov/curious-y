-- Private catalog for the global graph. No raw plans are exposed to browser roles.
CREATE FUNCTION public.load_all_learning_journeys(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(j) ORDER BY j.created_at,j.id),'[]')
  FROM public.learning_journeys j JOIN public.kingdom_state k ON k.user_id=j.user_id AND k.generation=j.generation
  WHERE j.user_id=p_user_id;
$$;
CREATE FUNCTION public.load_journey_by_id(p_user_id uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(j) FROM public.learning_journeys j
  JOIN public.kingdom_state k ON k.user_id=j.user_id AND k.generation=j.generation
  WHERE j.user_id=p_user_id AND j.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.load_all_learning_journeys(uuid),public.load_journey_by_id(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_all_learning_journeys(uuid),public.load_journey_by_id(uuid,uuid) TO service_role;

-- Serialize topic expansion and require proficiency everywhere, including the boss.
ALTER FUNCTION public.save_learning_journey(uuid,text,jsonb,bigint,uuid) RENAME TO save_pre_unified_journey;
CREATE FUNCTION public.save_learning_journey(p_user_id uuid,p_topic text,p_plan jsonb,p_generation bigint,p_previous uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.learning_journeys; k public.kingdom_state; chapter_no integer:=1;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your journey.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic) OR p_plan->>'topic' IS DISTINCT FROM p_topic
    OR jsonb_typeof(p_plan->'nodes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'nodes') NOT BETWEEN 4 AND 10
    THEN RAISE EXCEPTION 'Invalid journey plan.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_plan->'nodes') n WHERE n->>'kind'='boss')<>1
    THEN RAISE EXCEPTION 'A topic expansion needs exactly one boss.'; END IF;
  SELECT * INTO j FROM public.learning_journeys WHERE user_id=p_user_id AND generation=p_generation AND topic=p_topic ORDER BY chapter DESC LIMIT 1;
  IF j.id IS NOT NULL THEN
    -- Retries/concurrent calls return the already saved chapter, never another boss.
    IF p_previous IS NULL OR j.id<>p_previous THEN RETURN to_jsonb(j); END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(j.plan->'nodes') n,
      jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->(n->>'id')->f->>'successes')::integer,0)<CASE WHEN n->>'kind'='boss' THEN 1 ELSE 2 END)
      THEN RAISE EXCEPTION 'Complete the boss and become proficient in every concept before expanding this topic.'; END IF;
    chapter_no:=j.chapter+1;
  ELSIF p_previous IS NOT NULL THEN RAISE EXCEPTION 'Journey not found.';
  END IF;
  INSERT INTO public.learning_journeys(user_id,generation,topic,chapter,plan) VALUES(p_user_id,p_generation,p_topic,chapter_no,p_plan) RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;
REVOKE ALL ON FUNCTION public.save_pre_unified_journey(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_learning_journey(uuid,text,jsonb,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_learning_journey(uuid,text,jsonb,bigint,uuid) TO service_role;

-- A correct boss answer completes its synthesis challenge.
CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.questions; j public.learning_journeys; n jsonb; p jsonb; previous_progress jsonb; result jsonb;
  attempts integer; successes integer; stamp timestamptz:=now(); next_mastery text; review_due boolean; review_step integer; review_days integer;
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  result:=public.record_pre_journey_answer(p_user_id,p_question_id,p_selected_index);
  IF q.journey_id IS NULL THEN RETURN result; END IF;
  SELECT * INTO STRICT j FROM public.learning_journeys WHERE id=q.journey_id AND user_id=p_user_id FOR UPDATE;
  previous_progress:=j.progress;
  IF q.answered_at IS NULL THEN
    p:=COALESCE(j.progress->q.journey_node->q.journey_facet,'{"attempts":0,"successes":0}');
    attempts:=(p->>'attempts')::integer+1;
    successes:=(p->>'successes')::integer;
    p:=p||jsonb_build_object('attempts',attempts,'lastAttemptAt',stamp,'lastCorrect',q.correct_index=p_selected_index);
    review_due:=successes>=2 AND COALESCE((p->>'nextReviewAt')::timestamptz,(p->>'lastSuccessAt')::timestamptz+interval '1 day')<=stamp;
    review_step:=COALESCE((p->>'reviewStep')::integer,0);
    IF review_due THEN review_step:=CASE WHEN q.correct_index=p_selected_index THEN LEAST(review_step+1,4) ELSE 0 END; END IF;
    review_days:=(ARRAY[1,3,7,14,30])[review_step+1];
    IF q.correct_index=p_selected_index THEN
      IF review_due THEN p:=p||jsonb_build_object('retainedAt',stamp); END IF;
      p:=p||jsonb_build_object('creditedQuestions',COALESCE(p->'creditedQuestions','[]')||jsonb_build_array(md5(lower(regexp_replace(q.question_text,'[^a-zA-Z0-9]','','g')))),'successes',successes+1,'entry',q.knowledge_entry,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp);
      IF successes+1>=2 THEN p:=p||jsonb_build_object('reviewStep',review_step,'nextReviewAt',stamp+review_days*interval '1 day'); END IF;
    ELSIF review_due THEN p:=p||jsonb_build_object('reviewStep',0,'nextReviewAt',stamp+interval '10 minutes');
    END IF;
    j.progress:=jsonb_set(j.progress,ARRAY[q.journey_node],COALESCE(j.progress->q.journey_node,'{}')||jsonb_build_object(q.journey_facet,p));
    UPDATE public.learning_journeys SET progress=j.progress WHERE id=j.id;
    SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=q.journey_node;
    next_mastery:=CASE
      WHEN n->>'kind'='boss' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.journey_node->f->>'successes')::integer,0)<1) THEN 'mastered'
      WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.journey_node->f->>'successes')::integer,0)<2) THEN CASE WHEN n->>'kind'='boss' OR COALESCE((j.progress->q.journey_node->'advanced'->>'successes')::integer,0)>=3 THEN 'mastered' ELSE 'proficient' END
      ELSE 'learning' END;
    UPDATE public.concepts SET mastery=next_mastery,
      next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.journey_node)) WHERE user_id=p_user_id AND canonical_name=q.concept;
  END IF;
  RETURN result||jsonb_build_object('journey',to_jsonb(j),'previousProgress',previous_progress,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;
