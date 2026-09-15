-- Generated learning material belongs in the graph immediately. Unfinished nodes
-- remain private through expanded=false and carry only the state needed to resume.
CREATE FUNCTION public.validate_node_preparation(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF n->'curriculum'->'preparation' IS NULL OR jsonb_typeof(n->'curriculum'->'preparation') IS DISTINCT FROM 'object'
    OR COALESCE(n->'curriculum'->'preparation'->>'stage','') NOT IN ('dependencies','match')
    OR jsonb_typeof(n->'curriculum'->'preparation'->'names') IS DISTINCT FROM 'array'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(n->'curriculum'->'preparation'->'names') item
      WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(trim(item#>>'{}')) NOT BETWEEN 1 AND 200)
    THEN RAISE EXCEPTION 'Invalid node preparation state.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
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
    OR (n ? 'curriculum' AND (jsonb_typeof(n->'curriculum'->'dimensions') IS DISTINCT FROM 'object'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(core) f
        WHERE jsonb_typeof(n->'curriculum'->'dimensions'->f) IS DISTINCT FROM 'string'
          OR length(trim(n->'curriculum'->'dimensions'->>f)) NOT BETWEEN 1 AND 1600))))
    THEN RAISE EXCEPTION 'Concepts need prepared knowledge for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'facets' IS DISTINCT FROM '["mechanism"]'::jsonb
    OR n->'curriculum'->'assessment'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'wrongAnswers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(n->'curriculum'->'assessment'->'wrongAnswers')<>3)
    THEN RAISE EXCEPTION 'Boss needs its saved question and exactly three wrong answers.'; END IF;
  IF n->'expanded'='false'::jsonb AND (n->'requires'<>'[]'::jsonb OR n->'prerequisiteConcepts'<>'[]'::jsonb)
    THEN RAISE EXCEPTION 'Unfinished nodes cannot expose prerequisites.'; END IF;
  IF n->'expanded'='false'::jsonb AND n->>'kind'='concept' AND NOT (n->'curriculum' ? 'preparation') AND n ? 'curriculum'
    THEN RAISE EXCEPTION 'Concept placeholders cannot contain prepared knowledge.'; END IF;
  IF n->'expanded'='false'::jsonb AND (n->>'kind'='boss' OR n->'curriculum' ? 'preparation') THEN
    PERFORM public.validate_node_preparation(n);
  END IF;
  IF n->'expanded' IS DISTINCT FROM 'false'::jsonb AND (n->'curriculum' ? 'preparation'
    OR (n->>'kind'='concept' AND NOT (n ? 'curriculum')))
    THEN RAISE EXCEPTION 'Completed nodes need durable knowledge and no preparation state.'; END IF;
END $$;

CREATE FUNCTION public.merge_generated_nodes(existing jsonb,patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE merged jsonb;
BEGIN
  IF jsonb_typeof(patch) IS DISTINCT FROM 'array' OR jsonb_array_length(patch) NOT BETWEEN 1 AND 129
    OR jsonb_array_length(patch)<>(SELECT count(DISTINCT n->>'id') FROM jsonb_array_elements(patch) n)
    THEN RAISE EXCEPTION 'Invalid generated node patch.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(existing) old JOIN jsonb_array_elements(patch) n ON n->>'id'=old->>'id'
    WHERE old->'expanded' IS DISTINCT FROM 'false'::jsonb
      OR (old-'requires'-'prerequisiteConcepts'-'curriculum'-'expanded'-'definition')
        IS DISTINCT FROM (n-'requires'-'prerequisiteConcepts'-'curriculum'-'expanded'-'definition'))
    THEN RAISE EXCEPTION 'Only unfinished nodes can change; preserve their identity.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g')))
      FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;

CREATE FUNCTION public.refresh_graph_bosses(nodes jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE boss jsonb; ancestors text[];
BEGIN
  FOR boss IN SELECT node FROM jsonb_array_elements(nodes) node WHERE node->>'kind'='boss' LOOP
    ancestors:=array_remove(public.graph_ancestors(boss->>'id',nodes),boss->>'id');
    SELECT jsonb_agg(CASE WHEN n->>'id'=boss->>'id' THEN n||jsonb_build_object('requiredMasteryIds',to_jsonb(ancestors))
      WHEN n->>'id'=ANY(ancestors) THEN n||jsonb_build_object('topics',(SELECT jsonb_agg(DISTINCT tag)
        FROM jsonb_array_elements_text(COALESCE(n->'topics',jsonb_build_array(n->>'topic'))||jsonb_build_array(boss->>'topic')) tag))
      ELSE n END) INTO nodes FROM jsonb_array_elements(nodes) n;
  END LOOP;
  RETURN nodes;
END $$;

CREATE FUNCTION public.validate_generated_nodes(p_topic text,p_root text,patch jsonb,existing jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE merged jsonb:=public.merge_generated_nodes(existing,patch); root jsonb; n jsonb; ancestors text[];
BEGIN
  SELECT node INTO root FROM jsonb_array_elements(patch) node WHERE node->>'id'=p_root;
  IF root IS NULL OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic)
    THEN RAISE EXCEPTION 'Invalid generation root or topic.'; END IF;
  IF root->>'kind'='boss' AND root->>'topic'<>p_topic
    THEN RAISE EXCEPTION 'Invalid boss topic.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(patch) LOOP
    PERFORM public.validate_dimension_node(n);
    PERFORM public.validate_dimension_edges(n,merged);
  END LOOP;
  ancestors:=public.graph_ancestors(p_root,merged);
  IF root->'expanded' IS DISTINCT FROM 'false'::jsonb AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(patch) node
    WHERE NOT (node->>'id'=ANY(ancestors)) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(existing) old WHERE old->>'id'=node->>'id'))
    THEN RAISE EXCEPTION 'Every generated concept must contribute to its root.'; END IF;
  RETURN public.refresh_graph_bosses(merged);
END $$;

CREATE OR REPLACE FUNCTION public.load_learning_graph(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('generation',k.generation,'nodes',COALESCE(g.nodes,'[]'),'progress',COALESCE(g.progress,'{}'))
  FROM public.kingdom_state k LEFT JOIN public.learning_graphs g ON g.user_id=k.user_id AND g.generation=k.generation
  WHERE k.user_id=p_user_id;
$$;

CREATE FUNCTION public.begin_graph_expansion(p_user_id uuid,p_topic text,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; lease uuid:=gen_random_uuid(); graph jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please retry.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic) THEN RAISE EXCEPTION 'Invalid topic.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'Learning material is being generated. Please retry shortly.'; END IF;
  UPDATE public.kingdom_state SET issuance_topic=p_topic,issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  graph:=public.load_learning_graph(p_user_id);
  RETURN jsonb_build_object('lease',lease,'graph',graph);
END $$;

CREATE FUNCTION public.save_generated_nodes(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,
  p_root text,p_nodes jsonb,p_target text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; merged jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  merged:=public.validate_generated_nodes(p_topic,p_root,p_nodes,g.nodes);
  IF p_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(merged) n
    WHERE n->>'id'=p_target AND public.graph_node_available(n,g.progress))
    THEN RAISE EXCEPTION 'The selected question is not eligible.'; END IF;
  UPDATE public.learning_graphs SET nodes=merged WHERE user_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.reset_graph_on_generation_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.generation<>OLD.generation THEN
    DELETE FROM public.learning_graphs WHERE user_id=NEW.user_id;
  END IF;
  RETURN NULL;
END $$;

DROP FUNCTION public.save_curriculum_stage(uuid,text,uuid,bigint,jsonb);
DROP FUNCTION public.begin_curriculum_stage(uuid,text,bigint);
DROP FUNCTION public.save_lazy_curriculum(uuid,text,jsonb,bigint);
DROP FUNCTION public.validate_curriculum_patch(text,text,jsonb,jsonb);
DROP FUNCTION public.merge_curriculum_nodes(jsonb,jsonb);
DROP FUNCTION public.refresh_curriculum_bosses(jsonb);
DROP TABLE public.curriculum_drafts;

REVOKE ALL ON FUNCTION public.validate_node_preparation(jsonb),public.merge_generated_nodes(jsonb,jsonb),
  public.refresh_graph_bosses(jsonb),public.validate_generated_nodes(text,text,jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.begin_graph_expansion(uuid,text,bigint),
  public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_graph_expansion(uuid,text,bigint),
  public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,text) TO service_role;
