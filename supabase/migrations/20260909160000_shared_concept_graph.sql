-- Replace chapter-owned plans with one private graph and one evidence ledger per learner.
-- Development data may reset; there is deliberately no chapter-to-graph migration.
DO $$ DECLARE account record; BEGIN
  FOR account IN SELECT DISTINCT j.user_id,k.generation FROM public.learning_journeys j
    JOIN public.kingdom_state k ON k.user_id=j.user_id LOOP
    PERFORM public.reset_learning_progress(account.user_id,account.generation);
  END LOOP;
END $$;

CREATE TABLE public.learning_graphs (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  nodes jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(nodes)='array'),
  progress jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(progress)='object')
);
ALTER TABLE public.learning_graphs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_graphs FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.learning_graphs TO service_role;

ALTER TABLE public.questions DROP COLUMN journey_id;
ALTER TABLE public.questions RENAME COLUMN journey_node TO graph_node;
ALTER TABLE public.questions RENAME COLUMN journey_facet TO graph_facet;
CREATE INDEX questions_graph ON public.questions(user_id,graph_node,graph_facet);

CREATE FUNCTION public.load_learning_graph(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('generation',k.generation,'nodes',COALESCE(g.nodes,'[]'),'progress',COALESCE(g.progress,'{}'))
  FROM public.kingdom_state k LEFT JOIN public.learning_graphs g ON g.user_id=k.user_id AND g.generation=k.generation
  WHERE k.user_id=p_user_id;
$$;

CREATE FUNCTION public.graph_node_available(p_node jsonb,p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_node->'requires') r,
    jsonb_array_elements_text(r->'facets') f
    WHERE COALESCE((p_progress->(r->>'nodeId')->f->>'successes')::integer,0)<2);
$$;
CREATE FUNCTION public.graph_target_available(p_node jsonb,p_progress jsonb,p_facet text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT public.graph_node_available(p_node,p_progress)
    AND NOT (p_node->>'kind'='boss' AND COALESCE((p_progress->(p_node->>'id')->'mechanism'->>'successes')::integer,0)>=1)
    AND ((p_node->'facets' ? p_facet) OR (p_facet='advanced' AND p_node->>'kind'='concept' AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_node->'facets') f
      WHERE COALESCE((p_progress->(p_node->>'id')->f->>'successes')::integer,0)<2)));
$$;

CREATE FUNCTION public.save_graph_expansion(p_user_id uuid,p_topic text,p_nodes jsonb,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; n jsonb; r jsonb; parent jsonb; boss jsonb;
  all_nodes jsonb; ancestors text[]; core jsonb:='["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]';
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your graph.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic)
    OR jsonb_typeof(p_nodes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 17
    THEN RAISE EXCEPTION 'Invalid graph expansion.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  IF g.generation<>k.generation THEN RAISE EXCEPTION 'Progress was reset.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss')<>1
    THEN RAISE EXCEPTION 'An expansion needs exactly one boss.'; END IF;
  SELECT node INTO boss FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss';
  -- A retried save remains idempotent even after this boss has been answered.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'id'=boss->>'id' AND node=boss)
    THEN RETURN public.load_learning_graph(p_user_id); END IF;
  -- Concurrent generation can add at most one unanswered boss per topic.
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'kind'='boss' AND node->>'topic'=p_topic
    AND COALESCE((g.progress->(node->>'id')->'mechanism'->>'successes')::integer,0)<1)
    THEN RETURN public.load_learning_graph(p_user_id); END IF;
  all_nodes:=g.nodes||p_nodes;
  IF (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT node->>'id') FROM jsonb_array_elements(all_nodes) node)
    OR (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT lower(regexp_replace(node->>'title','[^[:alnum:]]','','g'))) FROM jsonb_array_elements(all_nodes) node)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$' OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND 200
      OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
      OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
      OR COALESCE(n->>'kind','') NOT IN ('concept','boss') OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
      OR jsonb_typeof(n->'prerequisiteConcepts') IS DISTINCT FROM 'array'
      OR (n->>'kind'='concept' AND n->'facets' IS DISTINCT FROM core)
      OR (n->>'kind'='boss' AND (n->'facets' IS DISTINCT FROM '["mechanism"]'::jsonb OR n->>'topic'<>p_topic OR jsonb_array_length(n->'requires')<2))
      THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
    IF jsonb_array_length(n->'requires')<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(n->'requires') item)
      THEN RAISE EXCEPTION 'Duplicate prerequisite.'; END IF;
    FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
      SELECT node INTO parent FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=r->>'nodeId';
      IF parent IS NULL OR parent->>'kind'<>'concept' OR r->'facets' IS DISTINCT FROM core
        THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
      IF NOT (n->'prerequisiteConcepts' ? (parent->>'title')) THEN RAISE EXCEPTION 'Missing declared prerequisite.'; END IF;
    END LOOP;
    IF jsonb_array_length(n->'prerequisiteConcepts')<>jsonb_array_length(n->'requires') THEN RAISE EXCEPTION 'Every declared prerequisite needs an edge.'; END IF;
  END LOOP;
  -- Walk dependencies with a path guard; reject cycles and disconnected additions.
  IF EXISTS (
    WITH RECURSIVE walk(id,path,cycle) AS (
      SELECT boss->>'id',ARRAY[boss->>'id'],false
      UNION ALL
      SELECT edge->>'nodeId',walk.path||(edge->>'nodeId'),edge->>'nodeId'=ANY(walk.path)
      FROM walk JOIN LATERAL (SELECT node FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=walk.id) found ON true
      CROSS JOIN LATERAL jsonb_array_elements(found.node->'requires') edge WHERE NOT walk.cycle
    ) SELECT 1 FROM walk WHERE cycle
  ) THEN RAISE EXCEPTION 'Graph contains a cycle.'; END IF;
  WITH RECURSIVE walk(id) AS (
    SELECT boss->>'id' UNION
    SELECT edge->>'nodeId' FROM walk
    JOIN LATERAL (SELECT node FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=walk.id) found ON true
    CROSS JOIN LATERAL jsonb_array_elements(found.node->'requires') edge
  ) SELECT array_agg(id) INTO ancestors FROM walk;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node WHERE NOT (node->>'id'=ANY(ancestors)))
    THEN RAISE EXCEPTION 'Every new concept must contribute to the boss.'; END IF;
  UPDATE public.learning_graphs SET nodes=all_nodes WHERE user_id=p_user_id;
  RETURN public.load_learning_graph(p_user_id);
END $$;

CREATE FUNCTION public.graph_question_history(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(jsonb_agg(question_text),'[]') FROM (
    SELECT question_text FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL ORDER BY created_at DESC LIMIT 100
  ) recent;
$$;

CREATE FUNCTION public.begin_graph_question(p_user_id uuid,p_node text,p_facet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_graphs; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_graphs WHERE user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Graph not found. Please reopen the map.'; END IF;
  SELECT node INTO n FROM jsonb_array_elements(j.nodes) node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,j.progress,p_facet) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.graph_node=p_node AND q.graph_facet=p_facet THEN
    RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation);
  END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  UPDATE public.questions SET expires_at=now() WHERE id=q.id;
  reservation:=public.begin_question_generation(p_user_id,(n->>'topic'));
  RETURN reservation||jsonb_build_object('graph',to_jsonb(j),'node',n);
END $$;

CREATE FUNCTION public.finish_graph_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_node text,p_facet text,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_graphs; n jsonb; q public.questions; dependencies jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  SELECT * INTO j FROM public.learning_graphs WHERE user_id=p_user_id AND generation=k.generation;
  SELECT node INTO n FROM jsonb_array_elements(j.nodes) node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,j.progress,p_facet)
    OR k.issuance_topic IS DISTINCT FROM (n->>'topic') THEN RAISE EXCEPTION 'Invalid graph target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'knowledge_entry','')) NOT BETWEEN 1 AND 1600
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    THEN RAISE EXCEPTION 'Invalid graph question.'; END IF;
  IF EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(j.progress) node, LATERAL jsonb_each(node.value) facet
    WHERE facet.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned knowledge. Please retry for a fresh example.'; END IF;
  SELECT COALESCE(jsonb_agg(parent->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') r
    JOIN jsonb_array_elements(j.nodes) parent ON parent->>'id'=r->>'nodeId';
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,graph_node,graph_facet,knowledge_entry,option_feedback)
  VALUES(p_user_id,(n->>'topic'),n->>'title',p_facet,p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',
    CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_facet='intuition' THEN 'directInference' WHEN p_facet='mechanism' THEN 'composition'
      WHEN p_facet IN ('application','advanced') THEN 'transfer' WHEN p_facet IN ('boundaries','alternatives') THEN 'counterfactual'
      WHEN p_facet='precision' THEN 'derivation' ELSE 'discrimination' END,
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,k.generation,jsonb_build_object((n->>'topic'),1),
    p_node,p_facet,p_question->>'knowledge_entry',p_question->'option_feedback') RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;


CREATE FUNCTION public.record_learning_reward_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts;
  graph_progress jsonb; facet_progress jsonb; previous public.learning_reward_events%ROWTYPE; budget public.learning_reward_budget%ROWTYPE;
  result jsonb; score jsonb; breakdown jsonb; input jsonb; t jsonb:=public.learning_value_tuning();
  answer_time timestamptz; correct boolean; known boolean; atomic boolean; successes integer; step integer; due boolean;
BEGIN
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Invalid answer.'; END IF;
  -- Lock order is shared with generation, collection, spending and reset.
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF NOT q.trusted_issuance OR q.generation IS DISTINCT FROM k.generation OR q.expires_at IS NULL OR NOT q.prerequisites_met THEN
    RAISE EXCEPTION 'Question has expired';
  END IF;
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
  -- Issued name + definition can establish a new target. Missing metadata earns only capped conservative practice.
  known:=(c.id IS NOT NULL OR (NULLIF(trim(q.concept),'') IS NOT NULL AND NULLIF(trim(q.concept_definition),'') IS NOT NULL))
    AND t->'reasoning' ? q.reasoning_complexity;
  known:=COALESCE(known,false);
  atomic:=COALESCE(c.is_atomic,false);
  successes:=GREATEST(COALESCE(c.reward_successes,0),CASE WHEN NOT atomic AND c.id IS NOT NULL AND
    (c.mastery<>'unseen' OR EXISTS (SELECT 1 FROM jsonb_each_text(c.reasoning_track) v WHERE v.value::integer>0)) THEN 1 ELSE 0 END);
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
    facet_progress:=COALESCE(graph_progress->q.graph_node->q.graph_facet,'{}');
    input:=input||jsonb_build_object('axisSuccesses',COALESCE((facet_progress->>'successes')::integer,0),
      'nextDueAt',CASE WHEN COALESCE((facet_progress->>'successes')::integer,0)>=2
        THEN COALESCE((facet_progress->>'nextReviewAt')::timestamptz,(facet_progress->>'lastSuccessAt')::timestamptz+interval '1 day') ELSE NULL END);
  END IF;
  score:=public.learning_value_score(correct,input);
  breakdown:=public.castle_learning_reward(q.id,correct,(score->>'total')::integer,q.topic_weights,q.topic)
    ||jsonb_build_object('calculation',score->'calculation');
  -- Canonicalize legacy alias issuances before the unchanged mastery scorer runs.
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


CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.questions; j public.learning_graphs; n jsonb; p jsonb; previous_progress jsonb; result jsonb;
  attempts integer; successes integer; stamp timestamptz:=now(); next_mastery text; review_due boolean; review_step integer; review_days integer;
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  result:=public.record_learning_reward_answer(p_user_id,p_question_id,p_selected_index);
  IF q.graph_node IS NULL THEN RETURN result; END IF;
  SELECT * INTO STRICT j FROM public.learning_graphs WHERE user_id=p_user_id FOR UPDATE;
  previous_progress:=j.progress;
  IF q.answered_at IS NULL THEN
    p:=COALESCE(j.progress->q.graph_node->q.graph_facet,'{"attempts":0,"successes":0}');
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
    j.progress:=jsonb_set(j.progress,ARRAY[q.graph_node],COALESCE(j.progress->q.graph_node,'{}')||jsonb_build_object(q.graph_facet,p));
    UPDATE public.learning_graphs SET progress=j.progress WHERE user_id=p_user_id;
    SELECT node INTO n FROM jsonb_array_elements(j.nodes) node WHERE node->>'id'=q.graph_node;
    next_mastery:=CASE
      WHEN n->>'kind'='boss' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.graph_node->f->>'successes')::integer,0)<1) THEN 'mastered'
      WHEN NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(n->'facets') f WHERE COALESCE((j.progress->q.graph_node->f->>'successes')::integer,0)<2) THEN CASE WHEN n->>'kind'='boss' OR COALESCE((j.progress->q.graph_node->'advanced'->>'successes')::integer,0)>=3 THEN 'mastered' ELSE 'proficient' END
      ELSE 'learning' END;
    UPDATE public.concepts SET mastery=next_mastery,
      next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.graph_node)) WHERE user_id=p_user_id AND canonical_name=q.concept;
  END IF;
  RETURN result||jsonb_build_object('graph',to_jsonb(j),'previousProgress',previous_progress,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;

DROP TRIGGER reset_journeys ON public.kingdom_state;
DROP FUNCTION public.reset_journeys_on_generation_change();
CREATE FUNCTION public.reset_graph_on_generation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.generation<>OLD.generation THEN DELETE FROM public.learning_graphs WHERE user_id=NEW.user_id; END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER reset_graph AFTER UPDATE OF generation ON public.kingdom_state FOR EACH ROW EXECUTE FUNCTION public.reset_graph_on_generation_change();

DROP FUNCTION public.load_learning_journey(uuid,text,uuid), public.list_learning_journeys(uuid,text),
  public.load_all_learning_journeys(uuid), public.load_journey_by_id(uuid,uuid),
  public.save_learning_journey(uuid,text,jsonb,bigint,uuid), public.save_pre_unified_journey(uuid,text,jsonb,bigint,uuid),
  public.begin_journey_question(uuid,uuid,text,text), public.finish_journey_question(uuid,uuid,bigint,uuid,text,text,jsonb),
  public.journey_question_history(uuid,uuid), public.record_pre_journey_answer(uuid,uuid,integer),
  public.journey_target_available(jsonb,jsonb,text), public.journey_node_available(jsonb,jsonb);
DROP TABLE public.learning_journeys;

REVOKE ALL ON FUNCTION public.load_learning_graph(uuid), public.graph_node_available(jsonb,jsonb),
  public.graph_target_available(jsonb,jsonb,text), public.save_graph_expansion(uuid,text,jsonb,bigint),
  public.graph_question_history(uuid), public.begin_graph_question(uuid,text,text),
  public.finish_graph_question(uuid,uuid,bigint,text,text,jsonb), public.record_learning_reward_answer(uuid,uuid,integer),
  public.reset_graph_on_generation_change() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_learning_reward_answer(uuid,uuid,integer) FROM service_role;
GRANT EXECUTE ON FUNCTION public.load_learning_graph(uuid), public.save_graph_expansion(uuid,text,jsonb,bigint),
  public.graph_question_history(uuid), public.begin_graph_question(uuid,text,text),
  public.finish_graph_question(uuid,uuid,bigint,text,text,jsonb) TO service_role;
