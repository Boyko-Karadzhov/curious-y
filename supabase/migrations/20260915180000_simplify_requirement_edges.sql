CREATE OR REPLACE FUNCTION public.validate_dimension_edges(n jsonb,all_nodes jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r jsonb; parent jsonb;
BEGIN
  IF jsonb_array_length(n->'requires')<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(n->'requires') item)
    THEN RAISE EXCEPTION 'Duplicate prerequisite.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
    SELECT node INTO parent FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=r->>'nodeId';
    IF r IS DISTINCT FROM jsonb_build_object('nodeId',r->>'nodeId') OR parent IS NULL OR parent->>'kind'<>'concept'
      THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
  END LOOP;
END $$;

UPDATE public.learning_graphs
SET nodes=(SELECT jsonb_agg(jsonb_set(node,'{requires}',(
    SELECT COALESCE(jsonb_agg(jsonb_build_object('nodeId',edge->>'nodeId')),'[]')
    FROM jsonb_array_elements(node->'requires') edge)))
  FROM jsonb_array_elements(nodes) node)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(nodes) node,
  LATERAL jsonb_array_elements(node->'requires') edge
  WHERE edge IS DISTINCT FROM jsonb_build_object('nodeId',edge->>'nodeId'));
