-- Persist the private curriculum before any question is issued. Browser roles get
-- only the Edge projection, never the hidden nodes or boss question.
CREATE TABLE public.learning_journeys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  topic text NOT NULL,
  chapter integer NOT NULL CHECK (chapter > 0),
  plan jsonb NOT NULL,
  progress jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, generation, topic, chapter)
);
ALTER TABLE public.learning_journeys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_journeys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_journeys TO service_role;
ALTER TABLE public.questions ADD COLUMN journey_id uuid REFERENCES public.learning_journeys(id) ON DELETE SET NULL;
ALTER TABLE public.questions ADD COLUMN journey_node text;
ALTER TABLE public.questions ADD COLUMN journey_facet text;
ALTER TABLE public.questions ADD COLUMN knowledge_entry text;
ALTER TABLE public.questions ADD COLUMN option_feedback jsonb;
CREATE INDEX questions_journey ON public.questions(user_id, journey_id, journey_node, journey_facet);

CREATE FUNCTION public.journey_question_history(p_user_id uuid,p_journey_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(question_text),'[]') FROM (
    SELECT question_text FROM public.questions WHERE user_id=p_user_id AND journey_id=p_journey_id ORDER BY created_at DESC LIMIT 100
  ) recent;
$$;
REVOKE ALL ON FUNCTION public.journey_question_history(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journey_question_history(uuid,uuid) TO service_role;

CREATE FUNCTION public.journey_node_available(p_node jsonb, p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_node->'requires') r,
      jsonb_array_elements_text(r->'facets') f
    WHERE COALESCE((p_progress->(r->>'nodeId')->f->>'successes')::integer,0)<2
  );
$$;

CREATE FUNCTION public.load_learning_journey(p_user_id uuid,p_topic text,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT to_jsonb(j) FROM public.learning_journeys j JOIN public.kingdom_state k ON k.user_id=j.user_id AND k.generation=j.generation
    WHERE j.user_id=p_user_id AND j.topic=p_topic AND (p_id IS NULL OR j.id=p_id)
    ORDER BY chapter DESC LIMIT 1;
$$;

CREATE FUNCTION public.list_learning_journeys(p_user_id uuid,p_topic text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',j.id,'chapter',j.chapter) ORDER BY j.chapter),'[]')
  FROM public.learning_journeys j JOIN public.kingdom_state k ON k.user_id=j.user_id AND k.generation=j.generation
  WHERE j.user_id=p_user_id AND j.topic=p_topic;
$$;
REVOKE ALL ON FUNCTION public.list_learning_journeys(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.list_learning_journeys(uuid,text) TO service_role;

CREATE FUNCTION public.save_learning_journey(p_user_id uuid,p_topic text,p_plan jsonb,p_generation bigint,p_previous uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_journeys; boss jsonb; chapter_no integer:=1;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your journey.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic) OR p_plan->>'topic' IS DISTINCT FROM p_topic
    OR jsonb_typeof(p_plan->'nodes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'nodes') NOT BETWEEN 4 AND 10
    THEN RAISE EXCEPTION 'Invalid journey plan.'; END IF;
  IF p_previous IS NOT NULL THEN
    SELECT * INTO j FROM public.learning_journeys WHERE id=p_previous AND user_id=p_user_id AND generation=k.generation AND topic=p_topic;
    IF NOT FOUND THEN RAISE EXCEPTION 'Journey not found.'; END IF;
    SELECT n INTO boss FROM jsonb_array_elements(j.plan->'nodes') n WHERE n->>'kind'='boss';
    IF boss IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(boss->'facets') f
      WHERE COALESCE((j.progress->(boss->>'id')->f->>'successes')::integer,0)<2) THEN RAISE EXCEPTION 'Complete the boss before opening another chapter.'; END IF;
    chapter_no:=j.chapter+1;
  END IF;
  INSERT INTO public.learning_journeys(user_id,generation,topic,chapter,plan) VALUES(p_user_id,k.generation,p_topic,chapter_no,p_plan)
    ON CONFLICT(user_id,generation,topic,chapter) DO NOTHING;
  SELECT * INTO STRICT j FROM public.learning_journeys WHERE user_id=p_user_id AND generation=k.generation AND topic=p_topic AND chapter=chapter_no;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.begin_journey_question(p_user_id uuid,p_journey_id uuid,p_node text,p_facet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_journeys; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_journeys WHERE id=p_journey_id AND user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Journey not found. Please reopen the map.'; END IF;
  SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT (n->'facets' ? p_facet) OR NOT public.journey_node_available(n,j.progress) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.journey_id=p_journey_id AND q.journey_node=p_node AND q.journey_facet=p_facet THEN
    RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation);
  END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  UPDATE public.questions SET expires_at=now() WHERE id=q.id;
  reservation:=public.begin_question_generation(p_user_id,j.topic);
  RETURN reservation||jsonb_build_object('journey',to_jsonb(j),'node',n);
END $$;

CREATE FUNCTION public.finish_journey_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_journey_id uuid,p_node text,p_facet text,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_journeys; n jsonb; q public.questions; dependencies jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  SELECT * INTO j FROM public.learning_journeys WHERE id=p_journey_id AND user_id=p_user_id AND generation=k.generation;
  SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT (n->'facets' ? p_facet) OR NOT public.journey_node_available(n,j.progress)
    OR k.issuance_topic IS DISTINCT FROM j.topic THEN RAISE EXCEPTION 'Invalid journey target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'knowledge_entry','')) NOT BETWEEN 1 AND 1600
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    THEN RAISE EXCEPTION 'Invalid journey question.'; END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND journey_id=p_journey_id
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  SELECT COALESCE(jsonb_agg(parent->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') r
    JOIN jsonb_array_elements(j.plan->'nodes') parent ON parent->>'id'=r->>'nodeId';
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,journey_id,journey_node,journey_facet,knowledge_entry,option_feedback)
  VALUES(p_user_id,j.topic,n->>'title',p_facet,p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',
    CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_facet='intuition' THEN 'directInference' WHEN p_facet='mechanism' THEN 'composition'
      WHEN p_facet='application' THEN 'transfer' WHEN p_facet IN ('boundaries','alternatives') THEN 'counterfactual'
      WHEN p_facet='precision' THEN 'derivation' ELSE 'discrimination' END,
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,k.generation,jsonb_build_object(j.topic,1),
    j.id,p_node,p_facet,p_question->>'knowledge_entry',p_question->'option_feedback') RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

-- Wrap the established reward transaction. Evidence, milestones, rewards and
-- mastery commit together; retrying a receipt never increments evidence twice.
ALTER FUNCTION public.record_question_answer(uuid,uuid,integer) RENAME TO record_pre_journey_answer;
CREATE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.questions; j public.learning_journeys; n jsonb; p jsonb; previous_progress jsonb; result jsonb;
  attempts integer; successes integer; stamp timestamptz:=now(); next_mastery text;
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
    IF q.correct_index=p_selected_index THEN
      IF successes>=2 AND (p->>'lastSuccessAt')::timestamptz<=stamp-interval '1 day' THEN p:=p||jsonb_build_object('retainedAt',stamp); END IF;
      p:=p||jsonb_build_object('successes',successes+1,'entry',q.knowledge_entry,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp);
    END IF;
    j.progress:=jsonb_set(j.progress,ARRAY[q.journey_node],COALESCE(j.progress->q.journey_node,'{}')||jsonb_build_object(q.journey_facet,p));
    UPDATE public.learning_journeys SET progress=j.progress WHERE id=j.id;
    SELECT node INTO n FROM jsonb_array_elements(j.plan->'nodes') node WHERE node->>'id'=q.journey_node;
    next_mastery:=CASE
      WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.journey_node->f->>'successes')::integer,0)<2) THEN 'mastered'
      WHEN COALESCE((j.progress->q.journey_node->'intuition'->>'successes')::integer,0)>=2 AND COALESCE((j.progress->q.journey_node->'mechanism'->>'successes')::integer,0)>=2 THEN 'proficient'
      ELSE 'learning' END;
    UPDATE public.concepts SET mastery=next_mastery WHERE user_id=p_user_id AND canonical_name=q.concept;
  END IF;
  RETURN result||jsonb_build_object('journey',to_jsonb(j),'previousProgress',previous_progress,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

CREATE FUNCTION public.reset_journeys_on_generation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.generation<>OLD.generation THEN DELETE FROM public.learning_journeys WHERE user_id=NEW.user_id; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER reset_journeys AFTER UPDATE OF generation ON public.kingdom_state FOR EACH ROW EXECUTE FUNCTION public.reset_journeys_on_generation_change();

REVOKE ALL ON FUNCTION public.journey_node_available(jsonb,jsonb),public.load_learning_journey(uuid,text,uuid),
  public.save_learning_journey(uuid,text,jsonb,bigint,uuid),public.begin_journey_question(uuid,uuid,text,text),
  public.finish_journey_question(uuid,uuid,bigint,uuid,text,text,jsonb),public.record_pre_journey_answer(uuid,uuid,integer),
  public.record_question_answer(uuid,uuid,integer),public.reset_journeys_on_generation_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_pre_journey_answer(uuid,uuid,integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.load_learning_journey(uuid,text,uuid),public.save_learning_journey(uuid,text,jsonb,bigint,uuid),
  public.begin_journey_question(uuid,uuid,text,text),public.finish_journey_question(uuid,uuid,bigint,uuid,text,text,jsonb),
  public.record_question_answer(uuid,uuid,integer) TO service_role;
