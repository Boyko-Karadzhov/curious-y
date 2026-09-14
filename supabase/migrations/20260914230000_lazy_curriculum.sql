-- Expand only the selected prerequisite path; persist untouched siblings as placeholders.
CREATE OR REPLACE FUNCTION public.graph_node_available(p_node jsonb,p_progress jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT p_node->'expanded' IS DISTINCT FROM 'false'::jsonb AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_node->'requiredMasteryIds',
      (SELECT COALESCE(jsonb_agg(r->>'nodeId'),'[]') FROM jsonb_array_elements(p_node->'requires') r))) id
    WHERE COALESCE((p_progress->id->'advanced'->>'successes')::integer,0)<3
      OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence']) f
        WHERE COALESCE((p_progress->id->f->>'successes')::integer,0)<2));
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
    OR jsonb_typeof(n->'prerequisiteConcepts') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND (n->'facets' IS DISTINCT FROM core
    OR (n->'expanded' IS DISTINCT FROM 'false'::jsonb AND (jsonb_typeof(n->'curriculum'->'dimensions') IS DISTINCT FROM 'object'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(core) f
      WHERE jsonb_typeof(n->'curriculum'->'dimensions'->f) IS DISTINCT FROM 'string'
        OR length(trim(n->'curriculum'->'dimensions'->>f)) NOT BETWEEN 1 AND 1600))))
    THEN RAISE EXCEPTION 'Concepts need prepared knowledge for all seven dimensions.'; END IF;
  IF n->'expanded'='false'::jsonb AND (n->>'kind'<>'concept' OR n->'requires'<>'[]'::jsonb OR n ? 'curriculum')
    THEN RAISE EXCEPTION 'Unexpanded concepts must be empty placeholders.'; END IF;
  IF n->>'kind'='boss' AND (n->'facets' IS DISTINCT FROM '["mechanism"]'::jsonb
    OR n->'curriculum'->'assessment'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'curriculum'->'assessment'->'wrongAnswers') IS DISTINCT FROM 'array')
    THEN RAISE EXCEPTION 'Boss needs its saved question and separate answers.'; END IF;
  IF n->>'kind'='boss' AND jsonb_array_length(n->'curriculum'->'assessment'->'wrongAnswers')<>3
    THEN RAISE EXCEPTION 'Boss needs exactly three wrong answers.'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.load_learning_graph(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('generation',k.generation,'nodes',COALESCE(g.nodes,'[]'),'progress',COALESCE(g.progress,'{}'),
    'curriculumTopics',(SELECT COALESCE(jsonb_agg(d.topic),'[]') FROM public.curriculum_drafts d
      WHERE d.user_id=p_user_id AND d.generation=k.generation))
  FROM public.kingdom_state k LEFT JOIN public.learning_graphs g ON g.user_id=k.user_id AND g.generation=k.generation
  WHERE k.user_id=p_user_id;
$$;

CREATE FUNCTION public.merge_curriculum_nodes(existing jsonb,patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE merged jsonb;
BEGIN
  IF jsonb_typeof(patch) IS DISTINCT FROM 'array' OR jsonb_array_length(patch) NOT BETWEEN 1 AND 129
    THEN RAISE EXCEPTION 'Invalid curriculum patch.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(existing) old JOIN jsonb_array_elements(patch) n ON n->>'id'=old->>'id'
    WHERE old->'expanded' IS DISTINCT FROM 'false'::jsonb OR old->>'kind'<>'concept'
      OR (old-'requires'-'prerequisiteConcepts'-'curriculum'-'expanded'-'definition')
        IS DISTINCT FROM (n-'requires'-'prerequisiteConcepts'-'curriculum'-'expanded'-'definition'))
    THEN RAISE EXCEPTION 'Only unexpanded concepts can be prepared; preserve their identity.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT n->>'id') FROM jsonb_array_elements(merged) n)
    OR jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g'))) FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;

CREATE FUNCTION public.validate_curriculum_patch(p_topic text,p_root text,patch jsonb,existing jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE merged jsonb:=public.merge_curriculum_nodes(existing,patch); root jsonb; n jsonb; ancestors text[];
BEGIN
  SELECT node INTO root FROM jsonb_array_elements(patch) node WHERE node->>'id'=p_root;
  IF root IS NULL OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic)
    THEN RAISE EXCEPTION 'Invalid curriculum root or topic.'; END IF;
  IF root->>'kind'='boss' AND (root->>'topic'<>p_topic OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(existing) node WHERE node->>'id'=p_root))
    THEN RAISE EXCEPTION 'Invalid new boss.'; END IF;
  IF root->>'kind'='concept' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(existing) node WHERE node->>'id'=p_root)
    THEN RAISE EXCEPTION 'Expand a saved concept.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(patch) LOOP
    PERFORM public.validate_dimension_node(n);
    PERFORM public.validate_dimension_edges(n,merged);
  END LOOP;
  ancestors:=public.graph_ancestors(p_root,merged);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(patch) node WHERE NOT (node->>'id'=ANY(ancestors))
    OR (node->>'kind'='boss' AND node->>'id'<>p_root))
    THEN RAISE EXCEPTION 'Every added concept must contribute to the selected root.'; END IF;
  RETURN merged;
END $$;

CREATE FUNCTION public.refresh_curriculum_bosses(nodes jsonb) RETURNS jsonb
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

CREATE FUNCTION public.save_lazy_curriculum(p_user_id uuid,p_topic text,p_draft jsonb,p_generation bigint) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; root text; merged jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  root:=COALESCE(p_draft->>'rootId',(SELECT n->>'id' FROM jsonb_array_elements(p_draft->'nodes') n WHERE n->>'kind'='boss'));
  merged:=public.validate_curriculum_patch(p_topic,root,p_draft->'nodes',g.nodes);
  merged:=public.refresh_curriculum_bosses(merged);
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(merged) n WHERE n->>'id'=p_draft->>'targetId'
    AND public.graph_node_available(n,g.progress)) THEN RAISE EXCEPTION 'The selected question is not eligible.'; END IF;
  UPDATE public.learning_graphs SET nodes=merged WHERE user_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.save_curriculum_stage(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,p_draft jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  IF p_draft->>'topic' IS DISTINCT FROM p_topic OR jsonb_typeof(p_draft->'queue') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_draft->'nodes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid curriculum checkpoint.'; END IF;
  IF jsonb_array_length(p_draft->'queue')=0 THEN
    IF p_draft ? 'targetId' THEN
      PERFORM public.save_lazy_curriculum(p_user_id,p_topic,p_draft,p_generation);
    ELSE
      PERFORM public.save_graph_expansion(p_user_id,p_topic,p_draft->'nodes',p_generation);
    END IF;
    DELETE FROM public.curriculum_drafts WHERE user_id=p_user_id AND topic=p_topic;
  ELSE
    INSERT INTO public.curriculum_drafts(user_id,topic,generation,draft) VALUES(p_user_id,p_topic,p_generation,p_draft)
      ON CONFLICT(user_id,topic) DO UPDATE SET generation=excluded.generation,draft=excluded.draft;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.merge_curriculum_nodes(jsonb,jsonb),public.validate_curriculum_patch(text,text,jsonb,jsonb),
  public.refresh_curriculum_bosses(jsonb),public.save_lazy_curriculum(uuid,text,jsonb,bigint) FROM PUBLIC,anon,authenticated;

-- Old breadth-first drafts cannot safely resume under the new path-only queue semantics.
DELETE FROM public.curriculum_drafts;

