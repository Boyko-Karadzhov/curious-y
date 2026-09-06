-- Step 7. Ownership/progression are additive; combat configs and pending receipts are untouched.
-- Keep historical schema versions until Edge performs their strict compatibility conversion.
CREATE FUNCTION public.roster_unit_id(p_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT COALESCE(p_id IN ('swordsman','archer','knight','catapult','medic','spearman','shieldbearer','berserker','duelist','slinger','crossbowman','ranger','clockwork-gunner','scout-rider','lancer','ram','bombardier','frost-mage','battle-sage','astral-colossus'),false); $$;
REVOKE ALL ON FUNCTION public.roster_unit_id(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.roster_unit_id(text) TO service_role;

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":5,"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"libraryConcepts":0,"armySlots":[null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null}'::jsonb;
UPDATE public.kingdom_state k SET state=jsonb_set(state,'{units}',COALESCE((
  SELECT jsonb_object_agg(u.id,'{"level":1,"stars":1,"equipment":{"weapon":null,"armor":null,"charm":null}}'::jsonb)
  FROM (VALUES ('swordsman','barracks'),('archer','range'),('knight','stable'),('catapult','workshop'),('medic','academy')) u(id,building)
  WHERE COALESCE((k.state->'buildings'->>u.building)::integer,0)>0
),'{}'::jsonb)),revision=revision+1 WHERE NOT state ? 'units';

-- Service-role-only commit accepts intent from Edge's strict parser; Edge computes
-- costs and gates, SQL serializes all wallets/rewards/reset using this account lock.
-- Same request ID is exactly-once, stale revisions retry against fresh balances.
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
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle','unit-unlock','unit-level','unit-star')
    OR (p_command->>'type'='building' AND COALESCE(p_command->>'id','') NOT IN ('barracks','range','stable','workshop','academy','treasury'))
    OR (p_command->>'type' IN ('unit-unlock','unit-level','unit-star') AND NOT public.roster_unit_id(p_command->>'id'))
    OR (p_command->>'type' IN ('unit-level','unit-star') AND (jsonb_typeof(p_command->'expected') IS DISTINCT FROM 'number'
      OR (p_command->>'expected')::numeric NOT BETWEEN 1 AND 5 OR (p_command->>'expected')::numeric <> trunc((p_command->>'expected')::numeric)))
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb
    OR p_state->'towers' IS DISTINCT FROM k.state->'towers'
    OR p_state->'libraryConcepts' IS DISTINCT FROM k.state->'libraryConcepts'
    OR p_state->'buildings'->'library' IS DISTINCT FROM k.state->'buildings'->'library'
    OR p_state->'buildings'->'forge' IS DISTINCT FROM '0'::jsonb
    THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command) VALUES(p_user_id,p_request_id,p_generation,p_command);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id);
END $$;
