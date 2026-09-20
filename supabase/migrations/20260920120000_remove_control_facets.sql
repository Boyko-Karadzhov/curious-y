-- Knowledge dimensions, reasoning complexity and boss execution are separate axes.
-- Development progress is disposable, so remove the overloaded graph_facet column.
DROP FUNCTION public.begin_graph_question(uuid,text,text);
DROP FUNCTION public.finish_graph_question(uuid,uuid,bigint,text,text,jsonb);
DROP FUNCTION public.graph_target_available(jsonb,jsonb,text);
DROP FUNCTION public.validate_prepared_question(uuid,jsonb,jsonb,jsonb);
DROP FUNCTION public.insert_graph_question(uuid,bigint,jsonb,text,jsonb);

DROP INDEX public.questions_graph;
ALTER TABLE public.questions ADD COLUMN graph_dimension text
  CHECK (graph_dimension IS NULL OR graph_dimension=ANY(ARRAY[
    'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
  ]));
ALTER TABLE public.questions DROP COLUMN graph_facet;
CREATE INDEX questions_graph ON public.questions(user_id,graph_node,graph_dimension,reasoning_complexity);

CREATE OR REPLACE FUNCTION public.graph_node_available(p_node jsonb,p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_node->'expanded' IS DISTINCT FROM 'false'::jsonb AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_node->'requires') requirement
    WHERE EXISTS (SELECT 1 FROM unnest(ARRAY[
      'intuition','precision','boundaries','application','mechanism','alternatives','evidence',
      'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
    ]) step WHERE COALESCE((p_progress->(requirement->>'nodeId')->step->>'successes')::integer,0)<1));
$$;

CREATE FUNCTION public.graph_target_available(p_node jsonb,p_progress jsonb,p_dimension text,p_reasoning text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT public.graph_node_available(p_node,p_progress) AND CASE p_node->>'kind'
    WHEN 'boss' THEN p_dimension IS NULL AND p_reasoning IS NULL
      AND COALESCE((p_progress->(p_node->>'id')->'boss'->>'successes')::integer,0)<1
    WHEN 'concept' THEN
      (p_reasoning IS NULL AND p_dimension=ANY(ARRAY[
        'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
      ])) OR
      (p_dimension IS NULL AND p_reasoning=ANY(ARRAY[
        'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
      ]) AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
        'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
      ]) dimension WHERE COALESCE((p_progress->(p_node->>'id')->dimension->>'successes')::integer,0)<1))
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE dimensions text[]:=ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence'];
BEGIN
  IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$'
    OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND (CASE WHEN n->>'kind'='boss' THEN 1600 ELSE 200 END)
    OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
    OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
    OR COALESCE(n->>'kind','') NOT IN ('concept','boss') OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
    OR jsonb_typeof(n->'dimensions') IS DISTINCT FROM 'object' OR n ? 'preparation'
    THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded'='false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>2
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision']) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Unexpanded concepts need intuition and a formal definition.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded' IS DISTINCT FROM 'false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>7
    OR EXISTS (SELECT 1 FROM unnest(dimensions) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Expanded concepts need content for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'expanded'='false'::jsonb OR n->'dimensions'<>'{}'::jsonb
    OR n->'bossQuestion'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'bossQuestion'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'bossQuestion'->'wrongAnswers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(n->'bossQuestion'->'wrongAnswers')<>3)
    THEN RAISE EXCEPTION 'Boss needs its saved question and exactly three wrong answers.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.graph_has_unanswered_boss(g public.learning_graphs,p_topic text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'kind'='boss' AND node->>'topic'=p_topic
    AND COALESCE((g.progress->(node->>'id')->'boss'->>'successes')::integer,0)<1);
$$;

CREATE FUNCTION public.validate_prepared_question(p_user_id uuid,n jsonb,p_progress jsonb,p_question jsonb,p_dimension text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    OR (p_dimension IS NOT NULL AND p_question->>'knowledge_entry' IS DISTINCT FROM n->'dimensions'->>p_dimension)
    OR (p_dimension IS NULL AND p_question ? 'knowledge_entry')
    THEN RAISE EXCEPTION 'Invalid graph question.'; END IF;
  IF n->>'kind'='concept' AND EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='concept' AND EXISTS (SELECT 1 FROM jsonb_each(p_progress) node, LATERAL jsonb_each(node.value) step
    WHERE step.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned progress. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='boss' AND p_question->>'question_text' IS DISTINCT FROM n->>'title'
    THEN RAISE EXCEPTION 'Use the exact saved boss question.'; END IF;
END $$;

CREATE FUNCTION public.begin_graph_question(p_user_id uuid,p_node text,p_dimension text,p_reasoning text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_graphs; graph jsonb; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_graphs WHERE user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Graph not found. Please reopen the map.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,j.progress,p_dimension,p_reasoning) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.graph_node=p_node AND q.graph_dimension IS NOT DISTINCT FROM p_dimension
    AND (p_dimension IS NOT NULL OR n->>'kind'='boss' OR q.reasoning_complexity IS NOT DISTINCT FROM p_reasoning)
    THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  reservation:=public.reserve_graph_question(p_user_id,n);
  RETURN reservation||jsonb_build_object('node',n);
END $$;

CREATE FUNCTION public.insert_graph_question(p_user_id uuid,p_generation bigint,n jsonb,p_dimension text,p_reasoning text,p_question jsonb)
RETURNS public.questions LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q public.questions; dependencies jsonb; complexity text;
BEGIN
  SELECT COALESCE(jsonb_agg(parent.body->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') requirement
    JOIN public.shared_concepts parent ON parent.id=requirement->>'nodeId';
  complexity:=CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_reasoning IS NOT NULL THEN p_reasoning
    WHEN p_dimension='intuition' THEN 'directInference' WHEN p_dimension='mechanism' THEN 'composition'
    WHEN p_dimension='application' THEN 'transfer' WHEN p_dimension IN ('boundaries','alternatives') THEN 'counterfactual'
    WHEN p_dimension='precision' THEN 'derivation' ELSE 'discrimination' END;
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,graph_node,graph_dimension,knowledge_entry,option_feedback)
  VALUES(p_user_id,n->>'topic',COALESCE(n->'context'->>'subtopic',n->>'title'),COALESCE(n->'context'->>'angle',p_dimension,p_reasoning,'boss'),
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,p_question->>'explanation',
    COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',complexity,n->>'kind'='boss',dependencies,true,
    now()+interval '30 minutes',true,p_generation,jsonb_build_object(n->>'topic',1),n->>'id',p_dimension,
    CASE WHEN p_dimension IS NOT NULL THEN n->'dimensions'->>p_dimension END,p_question->'option_feedback') RETURNING * INTO q;
  RETURN q;
END $$;

CREATE FUNCTION public.finish_graph_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_node text,
  p_dimension text,p_reasoning text,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; graph jsonb; n jsonb; q public.questions;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,graph->'progress',p_dimension,p_reasoning)
    OR k.issuance_topic IS DISTINCT FROM n->>'topic' THEN RAISE EXCEPTION 'Invalid graph target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  PERFORM public.validate_prepared_question(p_user_id,n,graph->'progress',p_question,p_dimension);
  q:=public.insert_graph_question(p_user_id,p_generation,n,p_dimension,p_reasoning,p_question);
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

CREATE OR REPLACE FUNCTION public.graph_node_mastery(n jsonb,p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN n->>'kind'='boss' THEN CASE
      WHEN COALESCE((p->'boss'->>'successes')::integer,0)>=1 THEN 'mastered' ELSE 'learning' END
    WHEN NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
      'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
    ]) dimension WHERE COALESCE((p->dimension->>'successes')::integer,0)<1)
      THEN CASE WHEN NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
        'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
      ]) complexity WHERE COALESCE((p->complexity->>'successes')::integer,0)<1) THEN 'mastered' ELSE 'proficient' END
    ELSE 'learning' END;
$$;

CREATE OR REPLACE FUNCTION public.next_graph_progress(p jsonb,correct boolean,knowledge text,question text,stamp timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH state AS (SELECT COALESCE(p,'{"attempts":0,"successes":0}') AS p), values AS (
    SELECT p,(p->>'successes')::integer successes,COALESCE((p->>'reviewStep')::integer,0) old_step,
      (p->>'successes')::integer>=1 AND COALESCE((p->>'nextReviewAt')::timestamptz,
        (p->>'lastSuccessAt')::timestamptz+interval '1 day')<=stamp AS due FROM state), review AS (
    SELECT *,CASE WHEN due THEN CASE WHEN correct THEN LEAST(old_step+1,4) ELSE 0 END ELSE old_step END step FROM values)
  SELECT p||jsonb_build_object('attempts',(p->>'attempts')::integer+1,'lastAttemptAt',stamp,'lastCorrect',correct)
    ||CASE WHEN correct THEN jsonb_build_object(
      'creditedQuestions',COALESCE(p->'creditedQuestions','[]')||jsonb_build_array(md5(lower(regexp_replace(question,'[^a-zA-Z0-9]','','g')))),
      'successes',successes+1,'entry',knowledge,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp,
      'reviewStep',step,'nextReviewAt',stamp+(ARRAY[1,3,7,14,30])[step+1]*interval '1 day')
      ||CASE WHEN due THEN jsonb_build_object('retainedAt',stamp) ELSE '{}'::jsonb END
    WHEN due THEN jsonb_build_object('reviewStep',0,'nextReviewAt',stamp+interval '10 minutes') ELSE '{}'::jsonb END
  FROM review;
$$;

CREATE OR REPLACE FUNCTION public.apply_graph_answer(p_user_id uuid,q public.questions,correct boolean,stamp timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.learning_graphs; n jsonb; p jsonb; previous jsonb; next_mastery text; progress_key text;
BEGIN
  SELECT * INTO STRICT j FROM public.learning_graphs WHERE user_id=p_user_id FOR UPDATE;
  previous:=j.progress;
  progress_key:=CASE WHEN q.is_boss_question THEN 'boss' ELSE COALESCE(q.graph_dimension,q.reasoning_complexity) END;
  p:=public.next_graph_progress(j.progress->q.graph_node->progress_key,correct,q.knowledge_entry,q.question_text,stamp);
  j.progress:=jsonb_set(j.progress,ARRAY[q.graph_node],COALESCE(j.progress->q.graph_node,'{}')||jsonb_build_object(progress_key,p));
  UPDATE public.learning_graphs SET progress=j.progress WHERE user_id=p_user_id;
  SELECT node INTO n FROM jsonb_array_elements(public.load_learning_graph(p_user_id)->'nodes') node WHERE node->>'id'=q.graph_node;
  next_mastery:=public.graph_node_mastery(n,j.progress->q.graph_node);
  UPDATE public.concepts SET mastery=next_mastery,
    next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.graph_node))
    WHERE user_id=p_user_id AND canonical_name=q.concept;
  RETURN jsonb_build_object('graph',public.load_learning_graph(p_user_id),'previousProgress',previous);
END $$;

CREATE OR REPLACE FUNCTION public.record_learning_reward_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts;
  graph_progress jsonb; step_progress jsonb; progress_key text; previous public.learning_reward_events%ROWTYPE; budget public.learning_reward_budget%ROWTYPE;
  result jsonb; score jsonb; breakdown jsonb; input jsonb; t jsonb:=public.learning_value_tuning();
  answer_time timestamptz; correct boolean; known boolean; atomic boolean; successes integer; step integer; due boolean;
BEGIN
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Invalid answer.'; END IF;
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF NOT q.trusted_issuance OR q.generation IS DISTINCT FROM k.generation OR q.expires_at IS NULL OR NOT q.prerequisites_met
    THEN RAISE EXCEPTION 'Question has expired'; END IF;
  SELECT * INTO previous FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF FOUND THEN
    IF previous.selected_index<>p_selected_index THEN RAISE EXCEPTION 'Question has already been answered with a different selection'; END IF;
    RETURN jsonb_build_object('question',to_jsonb(q)||jsonb_build_object('reward',previous.reward),
      'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id),
      'collected',previous.collected_at IS NOT NULL,'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  answer_time:=clock_timestamp();
  IF q.expires_at<=answer_time THEN RAISE EXCEPTION 'Question has expired'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before answering another question.'; END IF;
  c:=public.resolve_reward_concept(p_user_id,q.concept);
  IF c.id IS NOT NULL THEN SELECT * INTO c FROM public.concepts WHERE id=c.id FOR UPDATE; END IF;
  known:=(c.id IS NOT NULL OR (NULLIF(trim(q.concept),'') IS NOT NULL AND NULLIF(trim(q.concept_definition),'') IS NOT NULL))
    AND t->'reasoning' ? q.reasoning_complexity;
  known:=COALESCE(known,false);
  atomic:=COALESCE(c.is_atomic,false);
  successes:=GREATEST(COALESCE(c.reward_successes,0),CASE WHEN NOT atomic AND c.id IS NOT NULL AND
    (c.mastery<>'unseen' OR EXISTS (SELECT 1 FROM jsonb_each_text(c.reasoning_track) value WHERE value.value::integer>0)) THEN 1 ELSE 0 END);
  correct:=p_selected_index=q.correct_index;
  INSERT INTO public.learning_reward_budget(user_id,generation,day) VALUES(p_user_id,k.generation,(answer_time AT TIME ZONE 'UTC')::date)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT budget FROM public.learning_reward_budget WHERE user_id=p_user_id FOR UPDATE;
  IF budget.generation<>k.generation OR budget.day<>(answer_time AT TIME ZONE 'UTC')::date THEN
    budget.attempts:=0;
    UPDATE public.learning_reward_budget SET generation=k.generation,day=(answer_time AT TIME ZONE 'UTC')::date,attempts=0 WHERE user_id=p_user_id;
  END IF;
  input:=jsonb_build_object('canonicalConcept',COALESCE(c.canonical_name,q.concept),'metadataKnown',known,
    'preMastery',COALESCE(c.mastery,'unseen'),'atomic',atomic,'successes',successes,
    'axisSuccesses',COALESCE((c.reasoning_track->>q.reasoning_complexity)::integer,0),
    'nextDueAt',c.next_due_at,'reasoning',COALESCE(q.reasoning_complexity,''),'boss',COALESCE(q.is_boss_question,false),
    'lowValueAttempts',budget.attempts,'answeredAt',answer_time);
  IF q.graph_node IS NOT NULL THEN
    SELECT progress INTO graph_progress FROM public.learning_graphs WHERE user_id=p_user_id;
    progress_key:=CASE WHEN q.is_boss_question THEN 'boss' ELSE COALESCE(q.graph_dimension,q.reasoning_complexity) END;
    step_progress:=COALESCE(graph_progress->q.graph_node->progress_key,'{}');
    input:=input||jsonb_build_object('axisSuccesses',COALESCE((step_progress->>'successes')::integer,0),
      'nextDueAt',CASE WHEN COALESCE((step_progress->>'successes')::integer,0)>=1
        THEN COALESCE((step_progress->>'nextReviewAt')::timestamptz,(step_progress->>'lastSuccessAt')::timestamptz+interval '1 day') ELSE NULL END);
  END IF;
  score:=public.learning_value_score(correct,input);
  breakdown:=public.castle_learning_reward(q.id,correct,(score->>'total')::integer,q.topic_weights,q.topic)
    ||jsonb_build_object('calculation',score->'calculation');
  IF c.id IS NOT NULL AND q.concept IS DISTINCT FROM c.canonical_name THEN
    UPDATE public.questions SET concept=c.canonical_name WHERE id=q.id;
  END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  c:=public.resolve_reward_concept(p_user_id,COALESCE(c.canonical_name,q.concept));
  IF c.id IS NOT NULL THEN
    step:=c.review_step;
    due:=(score->'calculation'->>'due')::boolean;
    IF atomic OR NOT known THEN c.next_due_at:=NULL; step:=0;
    ELSIF NOT correct THEN
      step:=0;
      c.next_due_at:=CASE WHEN successes>0 THEN answer_time+make_interval(days=>(t->'reviewDays'->>0)::integer) ELSE NULL END;
    ELSIF successes=0 OR c.next_due_at IS NULL OR due THEN
      step:=CASE WHEN due THEN LEAST(step+1,jsonb_array_length(t->'reviewDays')-1) ELSE 0 END;
      c.next_due_at:=answer_time+make_interval(days=>(t->'reviewDays'->>step)::integer);
    END IF;
    UPDATE public.concepts SET reward_attempts=reward_attempts+1,
      reward_successes=successes+CASE WHEN correct AND NOT atomic THEN 1 ELSE 0 END,
      last_attempt_at=answer_time,last_success_at=CASE WHEN correct AND NOT atomic THEN answer_time ELSE last_success_at END,
      next_due_at=c.next_due_at,review_step=step,
      mastery=CASE WHEN atomic THEN 'mastered' ELSE mastery END WHERE id=c.id;
  END IF;
  IF (score->'calculation'->>'lowValue')::boolean THEN
    UPDATE public.learning_reward_budget SET attempts=LEAST(attempts+1,jsonb_array_length(t->'lowValueFactors')) WHERE user_id=p_user_id;
  END IF;
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,(score->>'total')::integer,breakdown);
  RETURN result||jsonb_build_object('question',result->'question'||jsonb_build_object('reward',breakdown),
    'reward',breakdown,'collected',false,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

UPDATE public.questions SET expires_at=now() WHERE graph_node IS NOT NULL AND answered_at IS NULL;
DELETE FROM public.learning_graphs;

REVOKE ALL ON FUNCTION public.graph_target_available(jsonb,jsonb,text,text),
  public.validate_prepared_question(uuid,jsonb,jsonb,jsonb,text),
  public.insert_graph_question(uuid,bigint,jsonb,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_graph_question(uuid,text,text,text),
  public.finish_graph_question(uuid,uuid,bigint,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_graph_question(uuid,text,text,text),
  public.finish_graph_question(uuid,uuid,bigint,text,text,text,jsonb) TO service_role;
