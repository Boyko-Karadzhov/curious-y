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
  RETURN reservation||jsonb_build_object('node',n);
END $$;
