-- Development reset: old graphs have no prepared dimension knowledge.
DO $$ DECLARE account record; BEGIN
  FOR account IN SELECT g.user_id,k.generation FROM public.learning_graphs g
    JOIN public.kingdom_state k ON k.user_id=g.user_id LOOP
    PERFORM public.reset_learning_progress(account.user_id,account.generation);
  END LOOP;
END $$;

CREATE TABLE public.curriculum_drafts (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL,
  generation bigint NOT NULL,
  draft jsonb NOT NULL,
  PRIMARY KEY(user_id,topic)
);
ALTER TABLE public.curriculum_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_drafts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.curriculum_drafts TO service_role;

CREATE OR REPLACE FUNCTION public.graph_node_available(p_node jsonb,p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_node->>'kind'='concept' OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_node->'requiredMasteryIds',
      (SELECT COALESCE(jsonb_agg(r->>'nodeId'),'[]') FROM jsonb_array_elements(p_node->'requires') r))) id
    WHERE COALESCE((p_progress->id->'advanced'->>'successes')::integer,0)<3
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence']) f
        WHERE COALESCE((p_progress->id->f->>'successes')::integer,0)<2));
$$;

CREATE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE core jsonb:='["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]';
BEGIN
  IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$'
    OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND (CASE WHEN n->>'kind'='boss' THEN 1600 ELSE 200 END)
    OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
    OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
    OR COALESCE(n->>'kind','') NOT IN ('concept','boss')
    OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
    OR jsonb_typeof(n->'prerequisiteConcepts') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND (n->'facets' IS DISTINCT FROM core
    OR jsonb_typeof(n->'curriculum'->'dimensions') IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(core) f
      WHERE jsonb_typeof(n->'curriculum'->'dimensions'->f) IS DISTINCT FROM 'string'
        OR length(trim(n->'curriculum'->'dimensions'->>f)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Concepts need prepared knowledge for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'facets' IS DISTINCT FROM '["mechanism"]'::jsonb
    OR n->'curriculum'->'assessment'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'wrongAnswers') IS DISTINCT FROM 'array')
    THEN RAISE EXCEPTION 'Boss needs its saved question and separate answers.'; END IF;
  IF n->>'kind'='boss' AND jsonb_array_length(n->'curriculum'->'assessment'->'wrongAnswers')<>3
    THEN RAISE EXCEPTION 'Boss needs exactly three wrong answers.'; END IF;
END $$;

CREATE FUNCTION public.validate_dimension_edges(n jsonb,all_nodes jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; parent jsonb; core jsonb:='["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]';
BEGIN
  IF jsonb_array_length(n->'requires')<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(n->'requires') item)
    THEN RAISE EXCEPTION 'Duplicate prerequisite.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
    SELECT node INTO parent FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=r->>'nodeId';
    IF parent IS NULL OR parent->>'kind'<>'concept' OR r->'facets' IS DISTINCT FROM core
      THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
    IF NOT (n->'prerequisiteConcepts' ? (parent->>'title')) THEN RAISE EXCEPTION 'Missing declared prerequisite.'; END IF;
  END LOOP;
  IF jsonb_array_length(n->'prerequisiteConcepts')<>jsonb_array_length(n->'requires')
    THEN RAISE EXCEPTION 'Every declared prerequisite needs an edge.'; END IF;
END $$;

CREATE FUNCTION public.graph_ancestors(p_node text,p_nodes jsonb) RETURNS text[]
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ancestors text[]; cyclic boolean;
BEGIN
  WITH RECURSIVE walk(id,path,cycle) AS (
    SELECT p_node,ARRAY[p_node],false
    UNION ALL
    SELECT edge->>'nodeId',walk.path||(edge->>'nodeId'),edge->>'nodeId'=ANY(walk.path)
    FROM walk JOIN LATERAL (SELECT node FROM jsonb_array_elements(p_nodes) node WHERE node->>'id'=walk.id) found ON true
    CROSS JOIN LATERAL jsonb_array_elements(found.node->'requires') edge WHERE NOT walk.cycle
  ) SELECT array_agg(DISTINCT id),bool_or(cycle) INTO ancestors,cyclic FROM walk;
  IF cyclic THEN RAISE EXCEPTION 'Graph contains a cycle.'; END IF;
  RETURN ancestors;
END $$;

CREATE FUNCTION public.validate_dimension_expansion(p_topic text,p_nodes jsonb,existing jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb; boss jsonb; all_nodes jsonb:=existing||p_nodes; ancestors text[];
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss')<>1
    THEN RAISE EXCEPTION 'An expansion needs exactly one boss.'; END IF;
  SELECT node INTO boss FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss';
  IF boss->>'topic'<>p_topic THEN RAISE EXCEPTION 'Invalid boss topic.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT node->>'id') FROM jsonb_array_elements(all_nodes) node)
    OR (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT lower(regexp_replace(node->>'title','[^[:alnum:]]','','g'))) FROM jsonb_array_elements(all_nodes) node)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    PERFORM public.validate_dimension_node(n);
    PERFORM public.validate_dimension_edges(n,all_nodes);
  END LOOP;
  ancestors:=public.graph_ancestors(boss->>'id',all_nodes);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node WHERE NOT (node->>'id'=ANY(ancestors)))
    THEN RAISE EXCEPTION 'Every new concept must contribute to the boss.'; END IF;
  RETURN (SELECT jsonb_agg(CASE WHEN node->>'id'=boss->>'id'
    THEN node||jsonb_build_object('requiredMasteryIds',to_jsonb(array_remove(ancestors,boss->>'id')))
    WHEN node->>'kind'='concept' AND node->>'id'=ANY(ancestors)
    THEN node||jsonb_build_object('topics',(SELECT jsonb_agg(DISTINCT tag) FROM jsonb_array_elements_text(
      COALESCE(node->'topics',jsonb_build_array(node->>'topic'))||jsonb_build_array(p_topic)) tag)) ELSE node END)
    FROM jsonb_array_elements(all_nodes) node);
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
    AND COALESCE((g.progress->(node->>'id')->'mechanism'->>'successes')::integer,0)<1)
    THEN RETURN public.load_learning_graph(p_user_id); END IF;
  all_nodes:=public.validate_dimension_expansion(p_topic,p_nodes,g.nodes);
  UPDATE public.learning_graphs SET nodes=all_nodes WHERE user_id=p_user_id;
  RETURN public.load_learning_graph(p_user_id);
END $$;

CREATE FUNCTION public.begin_curriculum_stage(p_user_id uuid,p_topic text,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; lease uuid:=gen_random_uuid(); draft jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please retry.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic) THEN RAISE EXCEPTION 'Invalid topic.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'Learning material is being generated. Please retry shortly.'; END IF;
  UPDATE public.kingdom_state SET issuance_topic=p_topic,issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  SELECT d.draft INTO draft FROM public.curriculum_drafts d WHERE user_id=p_user_id AND topic=p_topic AND generation=k.generation;
  RETURN jsonb_build_object('lease',lease,'draft',draft,'graph',public.load_learning_graph(p_user_id));
END $$;

CREATE FUNCTION public.save_curriculum_stage(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,p_draft jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  IF p_draft->>'topic' IS DISTINCT FROM p_topic OR jsonb_typeof(p_draft->'queue') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_draft->'nodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid curriculum checkpoint.'; END IF;
  IF jsonb_array_length(p_draft->'queue')=0 THEN
    PERFORM public.save_graph_expansion(p_user_id,p_topic,p_draft->'nodes',p_generation);
    DELETE FROM public.curriculum_drafts WHERE user_id=p_user_id AND topic=p_topic;
  ELSE
    INSERT INTO public.curriculum_drafts(user_id,topic,generation,draft) VALUES(p_user_id,p_topic,p_generation,p_draft)
      ON CONFLICT(user_id,topic) DO UPDATE SET generation=excluded.generation,draft=excluded.draft;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.reset_graph_on_generation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.generation<>OLD.generation THEN
    DELETE FROM public.learning_graphs WHERE user_id=NEW.user_id;
    DELETE FROM public.curriculum_drafts WHERE user_id=NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.validate_dimension_node(jsonb),public.validate_dimension_edges(jsonb,jsonb),
  public.graph_ancestors(text,jsonb),public.validate_dimension_expansion(text,jsonb,jsonb),
  public.begin_curriculum_stage(uuid,text,bigint),public.save_curriculum_stage(uuid,text,uuid,bigint,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_curriculum_stage(uuid,text,bigint),public.save_curriculum_stage(uuid,text,uuid,bigint,jsonb) TO service_role;

CREATE FUNCTION public.validate_prepared_question(p_user_id uuid,n jsonb,p_progress jsonb,p_question jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'knowledge_entry','')) NOT BETWEEN 1 AND 1600
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    THEN RAISE EXCEPTION 'Invalid graph question.'; END IF;
  IF n->>'kind'<>'boss' AND EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF n->>'kind'<>'boss' AND EXISTS (SELECT 1 FROM jsonb_each(p_progress) node, LATERAL jsonb_each(node.value) facet
    WHERE facet.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned knowledge. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='boss' AND p_question->>'question_text' IS DISTINCT FROM n->>'title'
    THEN RAISE EXCEPTION 'Use the exact saved boss question.'; END IF;
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
  VALUES(p_user_id,(n->>'topic'),COALESCE(n->'curriculum'->>'subtopic',n->>'title'),COALESCE(n->'curriculum'->>'angle',p_facet),p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',
    CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_facet='intuition' THEN 'directInference' WHEN p_facet='mechanism' THEN 'composition'
      WHEN p_facet IN ('application','advanced') THEN 'transfer' WHEN p_facet IN ('boundaries','alternatives') THEN 'counterfactual'
      WHEN p_facet='precision' THEN 'derivation' ELSE 'discrimination' END,
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,k.generation,jsonb_build_object((n->>'topic'),1),
    p_node,p_facet,COALESCE(n->'curriculum'->'dimensions'->>p_facet,p_question->>'knowledge_entry'),p_question->'option_feedback') RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

REVOKE ALL ON FUNCTION public.validate_prepared_question(uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
