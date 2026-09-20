DROP FUNCTION public.match_concept_embeddings(uuid,bigint,jsonb,integer);
DROP INDEX public.shared_concepts_similarity;
ALTER TABLE public.shared_concepts DROP COLUMN embedding;

CREATE OR REPLACE FUNCTION public.insert_shared_concept(n jsonb,p_embeddings jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  INSERT INTO public.shared_concepts(id,identity,body)
    VALUES(n->>'id',public.concept_identity(n->>'title'),n-'requires');
END $$;

DROP FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,jsonb);
CREATE FUNCTION public.save_generated_nodes(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,
  p_root text,p_nodes jsonb) RETURNS void
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
  PERFORM public.store_canonical_patch(p_user_id,p_topic,p_generation,p_root,p_nodes,'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb) TO service_role;
