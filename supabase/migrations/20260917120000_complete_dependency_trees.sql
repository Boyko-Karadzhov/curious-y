-- Boss generation now stores the complete dependency tree. Concepts start with
-- intuition and precision, then receive the other five dimensions only when selected.
CREATE OR REPLACE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE core text[]:=ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence'];
BEGIN
  IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$'
    OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND (CASE WHEN n->>'kind'='boss' THEN 1600 ELSE 200 END)
    OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
    OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
    OR COALESCE(n->>'kind','') NOT IN ('concept','boss') OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
    OR jsonb_typeof(n->'dimensions') IS DISTINCT FROM 'object' OR n ? 'preparation'
    THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded'='false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>2
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision']) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Unexpanded concepts need intuition and a formal definition.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded' IS DISTINCT FROM 'false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>7
    OR EXISTS (SELECT 1 FROM unnest(core) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Expanded concepts need content for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'expanded'='false'::jsonb OR n->'dimensions'<>'{}'::jsonb
    OR n->'assessment'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'assessment'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'assessment'->'wrongAnswers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(n->'assessment'->'wrongAnswers')<>3)
    THEN RAISE EXCEPTION 'Boss needs its saved question and exactly three wrong answers.'; END IF;
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
      OR (old-'dimensions'-'expanded') IS DISTINCT FROM (n-'dimensions'-'expanded'))
    THEN RAISE EXCEPTION 'Only unfinished concept dimensions can be filled; preserve their identity and dependencies.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g')))
      FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;

-- Development data used the old recursively prepared shape and is intentionally disposable.
UPDATE public.questions SET expires_at=now() WHERE graph_node IS NOT NULL AND answered_at IS NULL;
DELETE FROM public.learning_graphs;

DROP FUNCTION IF EXISTS public.validate_node_preparation(jsonb);

REVOKE ALL ON FUNCTION public.validate_dimension_node(jsonb),public.merge_generated_nodes(jsonb,jsonb)
  FROM PUBLIC,anon,authenticated;
