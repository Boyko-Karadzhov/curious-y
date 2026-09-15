-- Persist generated graph state independently from whichever question the next
-- request selects. Availability is enforced when that question is reserved.
DROP FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb,text);

CREATE FUNCTION public.save_generated_nodes(p_user_id uuid,p_topic text,p_lease uuid,p_generation bigint,
  p_root text,p_nodes jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; merged jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  merged:=public.validate_generated_nodes(p_topic,p_root,p_nodes,g.nodes);
  UPDATE public.learning_graphs SET nodes=merged WHERE user_id=p_user_id;
END $$;

REVOKE ALL ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_generated_nodes(uuid,text,uuid,bigint,text,jsonb) TO service_role;
