-- Canonical concepts are global: later learners and retries reuse completed
-- concepts without overwriting their established content or dependencies.
CREATE OR REPLACE FUNCTION public.save_shared_concept_body(n jsonb,p_embeddings jsonb) RETURNS jsonb
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
    THEN PERFORM public.complete_shared_concept(current,n); END IF;
  IF current.body->'expanded' IS DISTINCT FROM 'false'::jsonb
    AND (current.body-'topics') IS DISTINCT FROM ((n-'requires')-'topics')
    THEN RAISE EXCEPTION 'Only unfinished concepts can change.'; END IF;
  RETURN jsonb_build_object('id',current.id,'inserted',false);
END $$;
