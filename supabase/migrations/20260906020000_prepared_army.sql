-- Preserve ownership and empty choices; v1 battles are frozen by parseKingdom.
UPDATE public.kingdom_state SET state = jsonb_set(state, '{armySlots}', jsonb_build_array(
  CASE WHEN (state->'buildings'->>'barracks')::int > 0 THEN 'swordsman' END,
  CASE WHEN (state->'buildings'->>'range')::int > 0 THEN 'archer' END,
  CASE WHEN (state->'buildings'->>'stable')::int > 0 THEN 'knight' END,
  CASE WHEN (state->'buildings'->>'workshop')::int > 0 THEN 'catapult' END
)), revision = revision + 1 WHERE state->>'version' = '1' AND NOT state ? 'armySlots';

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT
'{"version":2,"armySlots":[null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0},"rewarded":[],"cleared":0,"battle":null}';

CREATE OR REPLACE FUNCTION public.commit_kingdom_command(p_user_id uuid, p_generation bigint,
  p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; previous public.kingdom_commands%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation <> p_generation THEN RAISE EXCEPTION 'Progress was reset; refresh your Castle.'; END IF;
  SELECT * INTO previous FROM public.kingdom_commands WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF previous.command <> p_command OR previous.generation <> p_generation THEN RAISE EXCEPTION 'Command ID was already used.'; END IF;
    RETURN public.kingdom_snapshot(p_user_id);
  END IF;
  IF k.revision <> p_revision THEN RETURN NULL; END IF;
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat')
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  -- Time-only polling is inherently idempotent and needs no permanent command log.
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command) VALUES(p_user_id,p_request_id,p_generation,p_command);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id);
END $$;
