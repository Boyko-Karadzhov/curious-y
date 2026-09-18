-- Concepts and their prerequisite edges are global. A learner's graph stores
-- references and progress; boss questions remain private to that learner.
CREATE TABLE public.shared_concepts (
  id text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{0,79}$'),
  identity text NOT NULL UNIQUE,
  body jsonb NOT NULL CHECK (body->>'kind'='concept' AND NOT (body ? 'requires')),
  embedding extensions.vector(768),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shared_concept_dependencies (
  concept_id text NOT NULL REFERENCES public.shared_concepts(id) ON DELETE RESTRICT,
  prerequisite_id text NOT NULL REFERENCES public.shared_concepts(id) ON DELETE RESTRICT,
  PRIMARY KEY(concept_id,prerequisite_id)
);

CREATE TABLE public.learning_graph_concepts (
  user_id uuid NOT NULL REFERENCES public.learning_graphs(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  concept_id text NOT NULL REFERENCES public.shared_concepts(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,generation,concept_id)
);

CREATE INDEX shared_concepts_similarity ON public.shared_concepts
  USING hnsw (embedding extensions.vector_cosine_ops);
CREATE INDEX shared_concept_dependencies_prerequisite
  ON public.shared_concept_dependencies(prerequisite_id);

ALTER TABLE public.shared_concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_concept_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_graph_concepts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_concepts,public.shared_concept_dependencies,public.learning_graph_concepts
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.shared_concepts,public.shared_concept_dependencies,public.learning_graph_concepts TO service_role;

CREATE FUNCTION public.concept_identity(title text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT lower(regexp_replace(normalize(title,NFKC),'[^[:alnum:]]','','g'));
$$;

CREATE FUNCTION public.shared_concept_node(p_id text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT c.body||jsonb_build_object('requires',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nodeId',d.prerequisite_id) ORDER BY d.prerequisite_id)
    FROM public.shared_concept_dependencies d WHERE d.concept_id=c.id
  ),'[]'::jsonb)) FROM public.shared_concepts c WHERE c.id=p_id;
$$;

CREATE FUNCTION public.shared_concept_closure(p_roots text[]) RETURNS TABLE(id text)
LANGUAGE sql STABLE SET search_path='' AS $$
  WITH RECURSIVE tree(id) AS (
    SELECT unnest(p_roots)
    UNION
    SELECT d.prerequisite_id FROM tree
    JOIN public.shared_concept_dependencies d ON d.concept_id=tree.id
  ) SELECT id FROM tree;
$$;

CREATE OR REPLACE FUNCTION public.load_learning_graph(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('generation',k.generation,'nodes',COALESCE((
      SELECT jsonb_agg(node ORDER BY node->>'kind',node->>'id') FROM (
        SELECT public.shared_concept_node(r.concept_id) node
        FROM public.learning_graph_concepts r
        WHERE r.user_id=p_user_id AND r.generation=k.generation
        UNION ALL SELECT value FROM jsonb_array_elements(COALESCE(g.nodes,'[]'))
      ) graph_nodes
    ),'[]'::jsonb),'progress',COALESCE(g.progress,'{}'::jsonb))
  FROM public.kingdom_state k
  LEFT JOIN public.learning_graphs g ON g.user_id=k.user_id AND g.generation=k.generation
  WHERE k.user_id=p_user_id;
$$;

CREATE FUNCTION public.validate_shared_patch(p_nodes jsonb,p_embeddings jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb; item jsonb;
BEGIN
  IF jsonb_typeof(p_nodes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 129
    OR jsonb_typeof(p_embeddings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_nodes)<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_nodes))
    THEN RAISE EXCEPTION 'Invalid generated node patch.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    PERFORM public.validate_dimension_node(n);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(n->'requires') r
      WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>1
        OR COALESCE(r->>'nodeId','')='') THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_embeddings) LOOP
    IF jsonb_typeof(item->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'embedding')<>768
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(item->'embedding') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'number')
      THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  END LOOP;
END $$;

CREATE FUNCTION public.insert_shared_concept(n jsonb,p_embeddings jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE vector jsonb;
BEGIN
  SELECT item->'embedding' INTO vector FROM jsonb_array_elements(p_embeddings) item WHERE item->>'nodeId'=n->>'id';
  IF vector IS NULL THEN RAISE EXCEPTION 'Every new concept requires an embedding.'; END IF;
  INSERT INTO public.shared_concepts(id,identity,body,embedding)
    VALUES(n->>'id',public.concept_identity(n->>'title'),n-'requires',((vector)::text)::extensions.vector);
END $$;

CREATE FUNCTION public.complete_shared_concept(current public.shared_concepts,n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (current.body-'dimensions'-'expanded') IS DISTINCT FROM ((n-'requires')-'dimensions'-'expanded')
    THEN RAISE EXCEPTION 'Preserve the shared concept identity while completing it.'; END IF;
  IF (SELECT COALESCE(array_agg(d.prerequisite_id ORDER BY d.prerequisite_id),ARRAY[]::text[])
      FROM public.shared_concept_dependencies d WHERE d.concept_id=current.id)
    IS DISTINCT FROM (SELECT COALESCE(array_agg(r->>'nodeId' ORDER BY r->>'nodeId'),ARRAY[]::text[])
      FROM jsonb_array_elements(n->'requires') r)
    THEN RAISE EXCEPTION 'Only unfinished concepts can change; preserve their identity and dependencies.'; END IF;
  UPDATE public.shared_concepts SET body=n-'requires',updated_at=now() WHERE id=current.id;
END $$;

CREATE FUNCTION public.save_shared_concept_body(n jsonb,p_embeddings jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE current public.shared_concepts;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(public.concept_identity(n->>'title'),0));
  SELECT * INTO current FROM public.shared_concepts WHERE identity=public.concept_identity(n->>'title') FOR UPDATE;
  IF current.id IS NULL THEN
    PERFORM public.insert_shared_concept(n,p_embeddings);
    RETURN jsonb_build_object('id',n->>'id','inserted',true);
  END IF;
  IF current.id<>n->>'id' THEN RETURN jsonb_build_object('id',current.id,'inserted',false); END IF;
  IF current.body->'expanded'='false'::jsonb AND n->'expanded' IS DISTINCT FROM 'false'::jsonb
    THEN PERFORM public.complete_shared_concept(current,n);
  ELSIF current.body->'expanded' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Only unfinished concepts can change.'; END IF;
  RETURN jsonb_build_object('id',current.id,'inserted',false);
END $$;

CREATE FUNCTION public.save_shared_concept_bodies(p_nodes jsonb,p_embeddings jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb; mapping jsonb:='{}';
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='concept'
    ORDER BY public.concept_identity(value->>'title') LOOP
    mapping:=mapping||jsonb_build_object(n->>'id',public.save_shared_concept_body(n,p_embeddings));
  END LOOP;
  RETURN mapping;
END $$;

CREATE FUNCTION public.mapped_concept_id(p_mapping jsonb,p_id text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT COALESCE(p_mapping->p_id->>'id',p_id);
$$;

CREATE FUNCTION public.canonicalize_node_requirements(n jsonb,p_mapping jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT jsonb_set(n,'{requires}',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'nodeId',public.mapped_concept_id(p_mapping,r->>'nodeId')) ORDER BY r->>'nodeId')
    FROM jsonb_array_elements(n->'requires') r),'[]'::jsonb));
$$;

CREATE FUNCTION public.save_shared_concept_edges(p_nodes jsonb,p_mapping jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n jsonb; r jsonb; owner text; parent text;
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='concept'
    AND COALESCE((p_mapping->(value->>'id')->>'inserted')::boolean,false) LOOP
    owner:=public.mapped_concept_id(p_mapping,n->>'id');
    FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
      parent:=public.mapped_concept_id(p_mapping,r->>'nodeId');
      IF NOT EXISTS (SELECT 1 FROM public.shared_concepts WHERE id=parent)
        THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
      INSERT INTO public.shared_concept_dependencies(concept_id,prerequisite_id) VALUES(owner,parent);
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION public.assert_shared_concepts_acyclic() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (WITH RECURSIVE walk(root,id,path,cycle) AS (
      SELECT c.id,c.id,ARRAY[c.id],false FROM public.shared_concepts c
      UNION ALL
      SELECT walk.root,d.prerequisite_id,walk.path||d.prerequisite_id,d.prerequisite_id=ANY(walk.path)
      FROM walk JOIN public.shared_concept_dependencies d ON d.concept_id=walk.id WHERE NOT walk.cycle
    ) SELECT 1 FROM walk WHERE cycle)
    THEN RAISE EXCEPTION 'Shared concept graph contains a cycle.'; END IF;
END $$;

CREATE FUNCTION public.persist_shared_concepts(p_nodes jsonb,p_embeddings jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mapping jsonb;
BEGIN
  PERFORM public.validate_shared_patch(p_nodes,p_embeddings);
  mapping:=public.save_shared_concept_bodies(p_nodes,p_embeddings);
  PERFORM public.save_shared_concept_edges(p_nodes,mapping);
  PERFORM public.assert_shared_concepts_acyclic();
  RETURN mapping;
END $$;

CREATE FUNCTION public.attach_shared_tree(p_user_id uuid,p_generation bigint,p_roots text[],p_topic text) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(p_roots) root WHERE NOT EXISTS (SELECT 1 FROM public.shared_concepts WHERE id=root))
    THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
  INSERT INTO public.learning_graph_concepts(user_id,generation,concept_id)
    SELECT p_user_id,p_generation,id FROM public.shared_concept_closure(p_roots) ON CONFLICT DO NOTHING;
  UPDATE public.shared_concepts c SET body=jsonb_set(c.body,'{topics}',COALESCE((SELECT jsonb_agg(DISTINCT tags.topic)
      FROM jsonb_array_elements_text(COALESCE(c.body->'topics','[]'::jsonb)||jsonb_build_array(p_topic)) AS tags(topic)),'[]'::jsonb)),updated_at=now()
    WHERE c.id IN (SELECT id FROM public.shared_concept_closure(p_roots));
END $$;

CREATE FUNCTION public.graph_has_unanswered_boss(g public.learning_graphs,p_topic text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'kind'='boss' AND node->>'topic'=p_topic
    AND COALESCE((g.progress->(node->>'id')->'assessment'->>'successes')::integer,0)<1);
$$;

CREATE FUNCTION public.store_canonical_patch(p_user_id uuid,p_topic text,p_generation bigint,p_root text,
  p_nodes jsonb,p_embeddings jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mapping jsonb; root jsonb; canonical jsonb; roots text[];
BEGIN
  mapping:=public.persist_shared_concepts(p_nodes,p_embeddings);
  SELECT value INTO root FROM jsonb_array_elements(p_nodes) WHERE value->>'id'=p_root;
  IF root IS NULL THEN RAISE EXCEPTION 'Invalid generation root or topic.'; END IF;
  canonical:=public.canonicalize_node_requirements(root,mapping);
  IF canonical->>'kind'='boss' THEN
    SELECT array_agg(r->>'nodeId') INTO roots FROM jsonb_array_elements(canonical->'requires') r;
    PERFORM public.attach_shared_tree(p_user_id,p_generation,COALESCE(roots,ARRAY[]::text[]),p_topic);
    UPDATE public.learning_graphs SET nodes=nodes||jsonb_build_array(canonical) WHERE user_id=p_user_id;
  ELSE
    PERFORM public.attach_shared_tree(p_user_id,p_generation,ARRAY[public.mapped_concept_id(mapping,p_root)],p_topic);
  END IF;
END $$;

DROP FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb);
CREATE FUNCTION public.save_generated_nodes(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,
  p_root text,p_nodes jsonb,p_embeddings jsonb DEFAULT '[]') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; root jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  SELECT value INTO root FROM jsonb_array_elements(p_nodes) WHERE value->>'id'=p_root;
  IF root->>'kind'='boss' AND public.graph_has_unanswered_boss(g,p_topic) THEN RETURN; END IF;
  PERFORM public.store_canonical_patch(p_user_id,p_topic,p_generation,p_root,p_nodes,p_embeddings);
END $$;

CREATE OR REPLACE FUNCTION public.save_graph_expansion(p_user_id uuid,p_topic text,p_nodes jsonb,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; boss jsonb; root text; embeddings jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your graph.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  SELECT value INTO boss FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='boss';
  IF boss IS NOT NULL AND public.graph_has_unanswered_boss(g,p_topic) THEN RETURN public.load_learning_graph(p_user_id); END IF;
  root:=COALESCE(boss->>'id',p_nodes->0->>'id');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nodeId',n->>'id','embedding',to_jsonb(array_fill(0.0::float8,ARRAY[768])))),'[]')
    INTO embeddings FROM jsonb_array_elements(p_nodes) n WHERE n->>'kind'='concept';
  PERFORM public.store_canonical_patch(p_user_id,p_topic,p_generation,root,p_nodes,embeddings);
  RETURN public.load_learning_graph(p_user_id);
END $$;

CREATE OR REPLACE FUNCTION public.match_concept_embeddings(p_user_id uuid,p_generation bigint,p_embeddings jsonb,p_limit integer DEFAULT 4)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET hnsw.iterative_scan='strict_order' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('queryIndex',query.ordinality-1,
    'candidates',COALESCE(nearest.candidates,'[]'::jsonb)) ORDER BY query.ordinality),'[]'::jsonb)
  FROM jsonb_array_elements(p_embeddings) WITH ORDINALITY query(embedding,ordinality)
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object('nodeId',candidate.id,'node',public.shared_concept_node(candidate.id),
      'similarity',candidate.similarity) ORDER BY candidate.similarity DESC) candidates
    FROM (SELECT c.id,1-(c.embedding OPERATOR(extensions.<=>) (query.embedding#>>'{}')::extensions.vector) similarity
      FROM public.shared_concepts c WHERE c.embedding IS NOT NULL
      ORDER BY c.embedding OPERATOR(extensions.<=>) (query.embedding#>>'{}')::extensions.vector
      LIMIT LEAST(GREATEST(p_limit,1),10)) candidate
  ) nearest ON true;
$$;

CREATE FUNCTION public.reserve_graph_question(p_user_id uuid,n jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  RETURN public.begin_question_generation(p_user_id,n->>'topic');
END $$;

CREATE OR REPLACE FUNCTION public.begin_graph_question(p_user_id uuid,p_node text,p_facet text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; j public.learning_graphs; graph jsonb; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_graphs WHERE user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Graph not found. Please reopen the map.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,j.progress,p_facet) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.graph_node=p_node AND q.graph_facet=p_facet THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  reservation:=public.reserve_graph_question(p_user_id,n);
  RETURN reservation||jsonb_build_object('graph',graph,'node',n);
END $$;

CREATE FUNCTION public.insert_graph_question(p_user_id uuid,p_generation bigint,n jsonb,p_facet text,p_question jsonb) RETURNS public.questions
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE q public.questions; dependencies jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(parent.body->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') r
    JOIN public.shared_concepts parent ON parent.id=r->>'nodeId';
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
    n->>'kind'='boss',dependencies,true,now()+interval '30 minutes',true,p_generation,jsonb_build_object(n->>'topic',1),
    n->>'id',p_facet,n->'dimensions'->>p_facet,p_question->'option_feedback') RETURNING * INTO q;
  RETURN q;
END $$;

CREATE OR REPLACE FUNCTION public.finish_graph_question(p_user_id uuid,p_lease uuid,p_generation bigint,p_node text,p_facet text,p_question jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; graph jsonb; n jsonb; q public.questions;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,graph->'progress',p_facet)
    OR k.issuance_topic IS DISTINCT FROM n->>'topic' THEN RAISE EXCEPTION 'Invalid graph target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  PERFORM public.validate_prepared_question(p_user_id,n,graph->'progress',p_question);
  q:=public.insert_graph_question(p_user_id,p_generation,n,p_facet,p_question);
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;

CREATE OR REPLACE FUNCTION public.apply_graph_answer(p_user_id uuid,q public.questions,correct boolean,stamp timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.learning_graphs; n jsonb; p jsonb; previous jsonb; next_mastery text;
BEGIN
  SELECT * INTO STRICT j FROM public.learning_graphs WHERE user_id=p_user_id FOR UPDATE;
  previous:=j.progress;
  p:=public.next_graph_progress(j.progress->q.graph_node->q.graph_facet,correct,q.knowledge_entry,q.question_text,stamp);
  j.progress:=jsonb_set(j.progress,ARRAY[q.graph_node],COALESCE(j.progress->q.graph_node,'{}')||jsonb_build_object(q.graph_facet,p));
  UPDATE public.learning_graphs SET progress=j.progress WHERE user_id=p_user_id;
  SELECT node INTO n FROM jsonb_array_elements(public.load_learning_graph(p_user_id)->'nodes') node WHERE node->>'id'=q.graph_node;
  next_mastery:=public.graph_node_mastery(n,j.progress->q.graph_node);
  UPDATE public.concepts SET mastery=next_mastery,
    next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.graph_node))
    WHERE user_id=p_user_id AND canonical_name=q.concept;
  RETURN jsonb_build_object('graph',public.load_learning_graph(p_user_id),'previousProgress',previous);
END $$;

-- Development graphs are disposable; the shared catalog survives future user resets.
UPDATE public.questions SET expires_at=now() WHERE graph_node IS NOT NULL AND answered_at IS NULL;
DELETE FROM public.learning_graphs;
DROP TABLE public.concept_embeddings;

REVOKE ALL ON FUNCTION public.concept_identity(text),public.shared_concept_node(text),public.shared_concept_closure(text[]),
  public.validate_shared_patch(jsonb,jsonb),public.insert_shared_concept(jsonb,jsonb),
  public.complete_shared_concept(public.shared_concepts,jsonb),public.save_shared_concept_body(jsonb,jsonb),
  public.save_shared_concept_bodies(jsonb,jsonb),public.mapped_concept_id(jsonb,text),
  public.canonicalize_node_requirements(jsonb,jsonb),public.save_shared_concept_edges(jsonb,jsonb),
  public.assert_shared_concepts_acyclic(),public.persist_shared_concepts(jsonb,jsonb),
  public.attach_shared_tree(uuid,bigint,text[],text),public.graph_has_unanswered_boss(public.learning_graphs,text),
  public.store_canonical_patch(uuid,text,bigint,text,jsonb,jsonb),public.reserve_graph_question(uuid,jsonb),
  public.insert_graph_question(uuid,bigint,jsonb,text,jsonb)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb),
  public.save_graph_expansion(uuid,text,jsonb,bigint),public.match_concept_embeddings(uuid,bigint,jsonb,integer),
  public.begin_graph_question(uuid,text,text),public.finish_graph_question(uuid,uuid,bigint,text,text,jsonb),
  public.apply_graph_answer(uuid,public.questions,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb),
  public.save_graph_expansion(uuid,text,jsonb,bigint),public.match_concept_embeddings(uuid,bigint,jsonb,integer),
  public.begin_graph_question(uuid,text,text),public.finish_graph_question(uuid,uuid,bigint,text,text,jsonb)
  TO service_role;
