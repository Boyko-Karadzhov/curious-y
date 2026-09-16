-- Dimension content is the concept source of truth. Bosses have no dimensions
-- and use an explicit assessment progress step instead of a fake mechanism.
CREATE OR REPLACE FUNCTION public.graph_target_available(p_node jsonb,p_progress jsonb,p_facet text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT public.graph_node_available(p_node,p_progress) AND CASE p_node->>'kind'
    WHEN 'boss' THEN p_facet='assessment'
      AND COALESCE((p_progress->(p_node->>'id')->'assessment'->>'successes')::integer,0)<1
    WHEN 'concept' THEN p_facet=ANY(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence'])
      OR p_facet='advanced' AND NOT EXISTS (
        SELECT 1 FROM unnest(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence']) f
        WHERE COALESCE((p_progress->(p_node->>'id')->f->>'successes')::integer,0)<2)
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.validate_node_preparation(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF n->'preparation' IS NULL OR jsonb_typeof(n->'preparation') IS DISTINCT FROM 'object'
    OR COALESCE(n->'preparation'->>'stage','') NOT IN ('dependencies','match')
    OR jsonb_typeof(n->'preparation'->'names') IS DISTINCT FROM 'array'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(n->'preparation'->'names') item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(trim(item#>>'{}')) NOT BETWEEN 1 AND 200)
    THEN RAISE EXCEPTION 'Invalid node preparation state.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE core text[]:=ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence'];
BEGIN
  IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$'
    OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND (CASE WHEN n->>'kind'='boss' THEN 1600 ELSE 200 END)
    OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
    OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
    OR COALESCE(n->>'kind','') NOT IN ('concept','boss') OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
    OR jsonb_typeof(n->'dimensions') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND ((n->'dimensions'<>'{}'::jsonb AND EXISTS (SELECT 1 FROM unnest(core) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    OR (n->'expanded' IS DISTINCT FROM 'false'::jsonb AND n->'dimensions'='{}'::jsonb))
    THEN RAISE EXCEPTION 'Concepts need content for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'dimensions'<>'{}'::jsonb OR n->'assessment'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'assessment'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'assessment'->'wrongAnswers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(n->'assessment'->'wrongAnswers')<>3)
    THEN RAISE EXCEPTION 'Boss needs its saved question and exactly three wrong answers.'; END IF;
  IF n->'expanded'='false'::jsonb AND n->'requires'<>'[]'::jsonb
    THEN RAISE EXCEPTION 'Unfinished nodes cannot expose prerequisites.'; END IF;
  IF n->'expanded'='false'::jsonb AND n->>'kind'='concept' AND n->'dimensions'<>'{}'::jsonb AND NOT (n ? 'preparation')
    THEN RAISE EXCEPTION 'Prepared unfinished concepts need continuation state.'; END IF;
  IF n->'expanded'='false'::jsonb AND (n->>'kind'='boss' OR n ? 'preparation') THEN PERFORM public.validate_node_preparation(n); END IF;
  IF n->'expanded' IS DISTINCT FROM 'false'::jsonb AND n ? 'preparation'
    THEN RAISE EXCEPTION 'Completed nodes cannot retain preparation state.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.merge_generated_nodes(existing jsonb,patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE merged jsonb;
BEGIN
  IF jsonb_typeof(patch) IS DISTINCT FROM 'array' OR jsonb_array_length(patch) NOT BETWEEN 1 AND 129
    OR jsonb_array_length(patch)<>(SELECT count(DISTINCT n->>'id') FROM jsonb_array_elements(patch) n)
    THEN RAISE EXCEPTION 'Invalid generated node patch.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(existing) old JOIN jsonb_array_elements(patch) n ON n->>'id'=old->>'id'
    WHERE old->'expanded' IS DISTINCT FROM 'false'::jsonb
      OR (old-'requires'-'dimensions'-'preparation'-'expanded'-'definition')
        IS DISTINCT FROM (n-'requires'-'dimensions'-'preparation'-'expanded'-'definition'))
    THEN RAISE EXCEPTION 'Only unfinished nodes can change; preserve their identity.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g')))
      FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;

CREATE OR REPLACE FUNCTION public.save_graph_expansion(p_user_id uuid,p_topic text,p_nodes jsonb,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; all_nodes jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your graph.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic)
    OR jsonb_typeof(p_nodes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 129
    THEN RAISE EXCEPTION 'Invalid graph expansion.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node JOIN jsonb_array_elements(p_nodes) proposal ON node->>'id'=proposal->>'id'
    WHERE proposal->>'kind'='boss' AND node->>'title'=proposal->>'title') THEN RETURN public.load_learning_graph(p_user_id); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'kind'='boss' AND node->>'topic'=p_topic
    AND COALESCE((g.progress->(node->>'id')->'assessment'->>'successes')::integer,0)<1)
    THEN RETURN public.load_learning_graph(p_user_id); END IF;
  all_nodes:=public.validate_dimension_expansion(p_topic,p_nodes,g.nodes);
  UPDATE public.learning_graphs SET nodes=all_nodes WHERE user_id=p_user_id;
  RETURN public.load_learning_graph(p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.finish_graph_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_node text,p_facet text,p_question jsonb) RETURNS jsonb
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
  PERFORM public.validate_prepared_question(p_user_id,n,j.progress,p_question);
  SELECT COALESCE(jsonb_agg(parent->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') r
    JOIN jsonb_array_elements(j.nodes) parent ON parent->>'id'=r->>'nodeId';
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,graph_node,graph_facet,knowledge_entry,option_feedback)
  VALUES(p_user_id,n->>'topic',COALESCE(n->'context'->>'subtopic',n->>'title'),COALESCE(n->'context'->>'angle',p_facet),
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,p_question->>'explanation',
    COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',
    CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_facet='intuition' THEN 'directInference' WHEN p_facet='mechanism' THEN 'composition'
      WHEN p_facet IN ('application','advanced') THEN 'transfer' WHEN p_facet IN ('boundaries','alternatives') THEN 'counterfactual'
      WHEN p_facet='precision' THEN 'derivation' ELSE 'discrimination' END,
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,k.generation,jsonb_build_object(n->>'topic',1),
    p_node,p_facet,n->'dimensions'->>p_facet,p_question->'option_feedback') RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

CREATE FUNCTION public.graph_node_mastery(n jsonb,p jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN n->>'kind'='boss' THEN CASE
      WHEN COALESCE((p->'assessment'->>'successes')::integer,0)>=1 THEN 'mastered' ELSE 'learning' END
    WHEN NOT EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence']) dimension
      WHERE COALESCE((p->dimension->>'successes')::integer,0)<2)
      THEN CASE WHEN COALESCE((p->'advanced'->>'successes')::integer,0)>=3 THEN 'mastered' ELSE 'proficient' END
    ELSE 'learning' END;
$$;

CREATE FUNCTION public.next_graph_progress(p jsonb,correct boolean,knowledge text,question text,stamp timestamptz) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH state AS (SELECT COALESCE(p,'{"attempts":0,"successes":0}') AS p), values AS (
    SELECT p,(p->>'successes')::integer successes,COALESCE((p->>'reviewStep')::integer,0) old_step,
      (p->>'successes')::integer>=2 AND COALESCE((p->>'nextReviewAt')::timestamptz,
        (p->>'lastSuccessAt')::timestamptz+interval '1 day')<=stamp AS due FROM state), review AS (
    SELECT *,CASE WHEN due THEN CASE WHEN correct THEN LEAST(old_step+1,4) ELSE 0 END ELSE old_step END step FROM values)
  SELECT p||jsonb_build_object('attempts',(p->>'attempts')::integer+1,'lastAttemptAt',stamp,'lastCorrect',correct)
    ||CASE WHEN correct THEN jsonb_build_object(
      'creditedQuestions',COALESCE(p->'creditedQuestions','[]')||jsonb_build_array(md5(lower(regexp_replace(question,'[^a-zA-Z0-9]','','g')))),
      'successes',successes+1,'entry',knowledge,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp)
      ||CASE WHEN successes+1>=2 THEN jsonb_build_object('reviewStep',step,'nextReviewAt',stamp+(ARRAY[1,3,7,14,30])[step+1]*interval '1 day') ELSE '{}'::jsonb END
      ||CASE WHEN due THEN jsonb_build_object('retainedAt',stamp) ELSE '{}'::jsonb END
    WHEN due THEN jsonb_build_object('reviewStep',0,'nextReviewAt',stamp+interval '10 minutes') ELSE '{}'::jsonb END
  FROM review;
$$;

CREATE FUNCTION public.apply_graph_answer(p_user_id uuid,q public.questions,correct boolean,stamp timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.learning_graphs; n jsonb; p jsonb; previous jsonb; next_mastery text;
BEGIN
  SELECT * INTO STRICT j FROM public.learning_graphs WHERE user_id=p_user_id FOR UPDATE;
  previous:=j.progress;
  p:=public.next_graph_progress(j.progress->q.graph_node->q.graph_facet,correct,q.knowledge_entry,q.question_text,stamp);
  j.progress:=jsonb_set(j.progress,ARRAY[q.graph_node],COALESCE(j.progress->q.graph_node,'{}')||jsonb_build_object(q.graph_facet,p));
  UPDATE public.learning_graphs SET progress=j.progress WHERE user_id=p_user_id;
  SELECT node INTO n FROM jsonb_array_elements(j.nodes) node WHERE node->>'id'=q.graph_node;
  next_mastery:=public.graph_node_mastery(n,j.progress->q.graph_node);
  UPDATE public.concepts SET mastery=next_mastery,
    next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.graph_node))
    WHERE user_id=p_user_id AND canonical_name=q.concept;
  RETURN jsonb_build_object('graph',to_jsonb(j),'previousProgress',previous);
END $$;

CREATE OR REPLACE FUNCTION public.record_question_answer(p_user_id uuid,p_question_id uuid,p_selected_index integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.questions; result jsonb; graph_result jsonb; stamp timestamptz:=now();
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  result:=public.record_learning_reward_answer(p_user_id,p_question_id,p_selected_index);
  IF q.graph_node IS NULL THEN RETURN result; END IF;
  IF q.answered_at IS NOT NULL THEN RETURN result||jsonb_build_object('graph',public.load_learning_graph(p_user_id)); END IF;
  graph_result:=public.apply_graph_answer(p_user_id,q,q.correct_index=p_selected_index,stamp);
  RETURN result||graph_result||jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id));
END $$;

-- Preserve development data while moving the private node fields to their new shape.
UPDATE public.learning_graphs g SET progress=(SELECT COALESCE(jsonb_object_agg(entry.key,
  CASE WHEN node->>'kind'='boss' AND entry.value ? 'mechanism'
    THEN (entry.value-'mechanism')||jsonb_build_object('assessment',entry.value->'mechanism') ELSE entry.value END),'{}')
  FROM jsonb_each(g.progress) entry LEFT JOIN LATERAL (
    SELECT value node FROM jsonb_array_elements(g.nodes) WHERE value->>'id'=entry.key) found ON true);

UPDATE public.learning_graphs SET nodes=(SELECT COALESCE(jsonb_agg(
  (node-'facets'-'curriculum')||jsonb_build_object('dimensions',COALESCE(node->'curriculum'->'dimensions','{}'))
  ||CASE WHEN node->'curriculum' ? 'assessment' THEN jsonb_build_object('assessment',node->'curriculum'->'assessment',
      'context',jsonb_build_object('angle',node->'curriculum'->>'angle','subtopic',node->'curriculum'->>'subtopic')) ELSE '{}'::jsonb END
  ||CASE WHEN node->'curriculum' ? 'preparation' THEN jsonb_build_object('preparation',node->'curriculum'->'preparation') ELSE '{}'::jsonb END
),'[]') FROM jsonb_array_elements(nodes) node);

UPDATE public.questions SET graph_facet='assessment'
WHERE graph_node IS NOT NULL AND is_boss_question AND graph_facet='mechanism';

REVOKE ALL ON FUNCTION public.graph_node_mastery(jsonb,jsonb),public.next_graph_progress(jsonb,boolean,text,text,timestamptz),
  public.apply_graph_answer(uuid,public.questions,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
