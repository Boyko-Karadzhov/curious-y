-- Edges are the prerequisite source of truth. Names and transitive mastery IDs
-- were derived caches that could drift from requires.
CREATE OR REPLACE FUNCTION public.graph_node_available(p_node jsonb,p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_node->'expanded' IS DISTINCT FROM 'false'::jsonb AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_node->'requires') r
    WHERE COALESCE((p_progress->(r->>'nodeId')->'advanced'->>'successes')::integer,0)<3
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence']) f
        WHERE COALESCE((p_progress->(r->>'nodeId')->f->>'successes')::integer,0)<2));
$$;

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
  IF n->'expanded'='false'::jsonb AND n->'requires'<>'[]'::jsonb
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

CREATE OR REPLACE FUNCTION public.validate_dimension_edges(n jsonb,all_nodes jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; parent jsonb; core jsonb:='["intuition","precision","boundaries","application","mechanism","alternatives","evidence"]';
BEGIN
  IF jsonb_array_length(n->'requires')<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(n->'requires') item)
    THEN RAISE EXCEPTION 'Duplicate prerequisite.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
    SELECT node INTO parent FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=r->>'nodeId';
    IF parent IS NULL OR parent->>'kind'<>'concept' OR r->'facets' IS DISTINCT FROM core
      THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_graph_bosses(nodes jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE boss jsonb; ancestors text[];
BEGIN
  FOR boss IN SELECT node FROM jsonb_array_elements(nodes) node WHERE node->>'kind'='boss' LOOP
    ancestors:=array_remove(public.graph_ancestors(boss->>'id',nodes),boss->>'id');
    SELECT jsonb_agg(CASE WHEN n->>'id'=ANY(ancestors) THEN (n-'requiredMasteryIds'-'prerequisiteConcepts')
      ||jsonb_build_object('topics',(SELECT jsonb_agg(DISTINCT tag)
        FROM jsonb_array_elements_text(COALESCE(n->'topics',jsonb_build_array(n->>'topic'))||jsonb_build_array(boss->>'topic')) tag))
      ELSE n-'requiredMasteryIds'-'prerequisiteConcepts' END) INTO nodes FROM jsonb_array_elements(nodes) n;
  END LOOP;
  RETURN nodes;
END $$;

CREATE OR REPLACE FUNCTION public.validate_dimension_expansion(p_topic text,p_nodes jsonb,existing jsonb) RETURNS jsonb
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
  RETURN public.refresh_graph_bosses(all_nodes);
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
      OR (old-'requires'-'curriculum'-'expanded'-'definition')
        IS DISTINCT FROM (n-'requires'-'curriculum'-'expanded'-'definition'))
    THEN RAISE EXCEPTION 'Only unfinished nodes can change; preserve their identity.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g')))
      FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;

UPDATE public.learning_graphs
SET nodes=(SELECT COALESCE(jsonb_agg(node-'requiredMasteryIds'-'prerequisiteConcepts'),'[]')
  FROM jsonb_array_elements(nodes) node)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(nodes) node
  WHERE node ? 'requiredMasteryIds' OR node ? 'prerequisiteConcepts');
