-- Keep boss generation independent of prior graph wording. New concepts are
-- embedded, retrieved by similarity, then adjudicated separately by the model.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE public.concept_embeddings (
  user_id uuid NOT NULL REFERENCES public.learning_graphs(user_id) ON DELETE CASCADE,
  generation bigint NOT NULL,
  node_id text NOT NULL,
  embedding extensions.vector(768) NOT NULL,
  PRIMARY KEY(user_id,generation,node_id)
);
CREATE INDEX concept_embeddings_scope ON public.concept_embeddings(user_id,generation);
CREATE INDEX concept_embeddings_similarity ON public.concept_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);
ALTER TABLE public.concept_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.concept_embeddings FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.concept_embeddings TO service_role;

CREATE FUNCTION public.store_concept_embeddings(p_user_id uuid,p_generation bigint,p_nodes jsonb,p_embeddings jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_embeddings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_embeddings)<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(p_embeddings) item)
    THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_embeddings) item
    WHERE jsonb_typeof(item->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'embedding')<>768
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(item->'embedding') value WHERE jsonb_typeof(value) IS DISTINCT FROM 'number')
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node
        WHERE node->>'id'=item->>'nodeId' AND node->>'kind'='concept'))
    THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='concept'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_embeddings) item WHERE item->>'nodeId'=node->>'id')
    AND NOT EXISTS (SELECT 1 FROM public.concept_embeddings saved
      WHERE saved.user_id=p_user_id AND saved.generation=p_generation AND saved.node_id=node->>'id'))
    THEN RAISE EXCEPTION 'Every new concept requires an embedding.'; END IF;
  INSERT INTO public.concept_embeddings(user_id,generation,node_id,embedding)
    SELECT p_user_id,p_generation,item->>'nodeId',((item->'embedding')::text)::extensions.vector
    FROM jsonb_array_elements(p_embeddings) item
    ON CONFLICT(user_id,generation,node_id) DO UPDATE SET embedding=EXCLUDED.embedding;
END $$;

CREATE FUNCTION public.match_concept_embeddings(p_user_id uuid,p_generation bigint,p_embeddings jsonb,p_limit integer DEFAULT 4)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' SET hnsw.iterative_scan='strict_order' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'queryIndex',query.ordinality-1,
    'candidates',COALESCE(nearest.candidates,'[]'::jsonb)
  ) ORDER BY query.ordinality),'[]'::jsonb)
  FROM jsonb_array_elements(p_embeddings) WITH ORDINALITY query(embedding,ordinality)
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(jsonb_build_object(
      'nodeId',candidate.node_id,
      'similarity',candidate.similarity
    ) ORDER BY candidate.similarity DESC) candidates
    FROM (
      SELECT stored.node_id,1-(stored.embedding OPERATOR(extensions.<=>) (query.embedding#>>'{}')::extensions.vector) similarity
      FROM public.concept_embeddings stored
      WHERE stored.user_id=p_user_id AND stored.generation=p_generation
      ORDER BY stored.embedding OPERATOR(extensions.<=>) (query.embedding#>>'{}')::extensions.vector
      LIMIT LEAST(GREATEST(p_limit,1),10)
    ) candidate
  ) nearest ON true;
$$;

DROP FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb);
CREATE FUNCTION public.save_generated_nodes(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,
  p_root text,p_nodes jsonb,p_embeddings jsonb DEFAULT '[]') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; merged jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  merged:=public.validate_generated_nodes(p_topic,p_root,p_nodes,g.nodes);
  PERFORM public.store_concept_embeddings(p_user_id,p_generation,p_nodes,p_embeddings);
  UPDATE public.learning_graphs SET nodes=merged WHERE user_id=p_user_id;
END $$;

-- Existing development graphs predate embeddings and are intentionally disposable.
UPDATE public.questions SET expires_at=now() WHERE graph_node IS NOT NULL AND answered_at IS NULL;
DELETE FROM public.learning_graphs;

REVOKE ALL ON FUNCTION public.store_concept_embeddings(uuid,bigint,jsonb,jsonb),
  public.match_concept_embeddings(uuid,bigint,jsonb,integer),
  public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_concept_embeddings(uuid,bigint,jsonb,integer),
  public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb) TO service_role;
