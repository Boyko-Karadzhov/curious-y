-- Recruitment v1. Reset only development military ownership/progression/campaign.
-- Keep wallets, learning, pending learning rewards, Keep, Treasury, Library and Towers.
ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":8,"discovered":[],"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"libraryConcepts":0,"armySlots":[null,null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null,"recruitCount":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0},"lastResult":null}'::jsonb;
UPDATE public.questions q SET generation=k.generation+1 FROM public.kingdom_state k WHERE q.user_id=k.user_id AND q.generation=k.generation;
-- Re-key only reset-generation metadata; reward amounts and outcomes stay unchanged.
ALTER TABLE public.learning_reward_events DISABLE TRIGGER immutable_learning_reward;
UPDATE public.learning_reward_events e SET generation=k.generation+1 FROM public.kingdom_state k WHERE e.user_id=k.user_id AND e.generation=k.generation;
ALTER TABLE public.learning_reward_events ENABLE TRIGGER immutable_learning_reward;
UPDATE public.learning_reward_budget e SET generation=k.generation+1 FROM public.kingdom_state k WHERE e.user_id=k.user_id AND e.generation=k.generation;
UPDATE public.kingdom_state SET state=state || '{"version":8,"discovered":[],"units":{},"recruitCount":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0},"lastResult":null,"armySlots":[null,null,null,null,null],"cleared":0,"battle":null}'::jsonb
  || jsonb_build_object('buildings',state->'buildings' || '{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0}'::jsonb),
  generation=generation+1,revision=revision+1,battle_clock=NULL,issuance_lease=NULL,issuance_until=NULL,
  progression_goal=DEFAULT,goal_revision=goal_revision+1;

ALTER TABLE public.kingdom_commands ADD COLUMN result jsonb;
CREATE TABLE public.kingdom_command_reservations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, request_id uuid NOT NULL,
  generation bigint NOT NULL, command jsonb NOT NULL, draws jsonb NOT NULL, PRIMARY KEY(user_id,request_id)
);
ALTER TABLE public.kingdom_command_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kingdom_command_reservations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.kingdom_command_reservations TO service_role;
-- Reservation precedes optimistic execution. Retries reuse all three random inputs;
-- the committed pre-action building level alone selects their categorical outcomes.
CREATE FUNCTION public.reserve_kingdom_command(p_user_id uuid,p_request_id uuid,p_generation bigint,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kingdom_state%ROWTYPE; r public.kingdom_command_reservations%ROWTYPE; draws jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation <> p_generation THEN RAISE EXCEPTION 'Progress was reset; refresh your Castle.'; END IF;
  IF p_command->>'type'='tick' THEN RETURN '{"draws":[]}'::jsonb; END IF;
  SELECT * INTO r FROM public.kingdom_command_reservations WHERE user_id=p_user_id AND request_id=p_request_id;
  IF FOUND THEN
    IF r.generation<>p_generation OR r.command<>p_command THEN RAISE EXCEPTION 'Command ID was already used.'; END IF;
    RETURN jsonb_build_object('draws',r.draws);
  END IF;
  SELECT jsonb_agg(('x'||right(replace(gen_random_uuid()::text,'-',''),13))::bit(52)::bigint::numeric / 4503599627370496) INTO draws FROM generate_series(1,3);
  INSERT INTO public.kingdom_command_reservations VALUES(p_user_id,p_request_id,p_generation,p_command,draws);
  RETURN jsonb_build_object('draws',draws);
END $$;
REVOKE ALL ON FUNCTION public.reserve_kingdom_command(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_kingdom_command(uuid,uuid,bigint,jsonb) TO service_role;

-- Edge owns economics; SQL enforces structural integrity and account serialization.
CREATE FUNCTION public.valid_recruitment_state(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r record; slot jsonb; seen text[]:='{}';
BEGIN
  IF s->>'version' IS DISTINCT FROM '8' OR jsonb_typeof(s->'units') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'recruitCount') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'armySlots') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'armySlots')<>5 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(s->'recruitCount'))<>5 THEN RETURN false; END IF;
  FOR r IN SELECT key,value FROM jsonb_each(s->'recruitCount') LOOP
    IF r.key NOT IN ('barracks','range','stable','academy','workshop')
      OR jsonb_typeof(r.value) IS DISTINCT FROM 'number' OR (r.value::text)::numeric NOT BETWEEN 0 AND 9007199254740991
      OR trunc((r.value::text)::numeric)<>(r.value::text)::numeric THEN RETURN false; END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_each(s->'units') LOOP
    IF r.key !~ '^[a-zA-Z0-9-]{1,110}$' OR NOT public.roster_unit_id(r.value->>'unitId')
      OR jsonb_typeof(r.value->'investedXP') IS DISTINCT FROM 'number'
      OR (r.value->>'investedXP')::numeric NOT BETWEEN 0 AND 9007199254740991
      OR trunc((r.value->>'investedXP')::numeric)<>(r.value->>'investedXP')::numeric
      OR jsonb_typeof(r.value->'locked') IS DISTINCT FROM 'boolean'
      OR (SELECT count(*) FROM jsonb_object_keys(r.value))<>3 THEN RETURN false; END IF;
  END LOOP;
  FOR slot IN SELECT * FROM jsonb_array_elements(s->'armySlots') LOOP
    IF slot<>'null'::jsonb THEN
      IF NOT (s->'units' ? (slot #>> '{}')) OR (s->'units'->(slot #>> '{}')->>'unitId')=ANY(seen) THEN RETURN false; END IF;
      seen:=array_append(seen,s->'units'->(slot #>> '{}')->>'unitId');
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_recruitment_state(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_recruitment_state(jsonb) TO service_role;

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
    RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',previous.result);
  END IF;
  IF k.revision <> p_revision THEN RETURN NULL; END IF;
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle','recruit','merge','lock')
    OR (p_command->>'type'='building' AND COALESCE(p_command->>'id','') NOT IN ('barracks','range','stable','workshop','academy','treasury'))
    OR NOT public.valid_recruitment_state(p_state)
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb
    OR p_state->'towers' IS DISTINCT FROM k.state->'towers'
    OR p_state->'libraryConcepts' IS DISTINCT FROM k.state->'libraryConcepts'
    OR p_state->'buildings'->'library' IS DISTINCT FROM k.state->'buildings'->'library'
    OR p_state->'buildings'->'forge' IS DISTINCT FROM '0'::jsonb
    THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command,result) VALUES(p_user_id,p_request_id,p_generation,p_command,CASE WHEN p_command->>'type' IN ('recruit','merge') THEN p_state->'lastResult' ELSE NULL END);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',CASE WHEN p_command->>'type' IN ('recruit','merge') THEN p_state->'lastResult' ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.find_kingdom_command(p_user_id uuid,p_request_id uuid,p_generation bigint,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.kingdom_commands%ROWTYPE;
BEGIN
  SELECT * INTO previous FROM public.kingdom_commands WHERE user_id=p_user_id AND request_id=p_request_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF previous.command <> p_command OR previous.generation <> p_generation OR
    (SELECT generation FROM public.kingdom_state WHERE user_id=p_user_id) <> p_generation THEN
    RAISE EXCEPTION 'Command ID was already used or progress was reset.';
  END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',previous.result);
END $$;


-- Recruitment goals point to a count milestone, not a paid building upgrade.
CREATE OR REPLACE FUNCTION public.valid_progression_goal(p_goal jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
SELECT p_goal IS NULL OR COALESCE(jsonb_typeof(p_goal)='object' AND CASE p_goal->>'type'
  WHEN 'recruit' THEN p_goal->>'id' IN ('barracks','range','stable','workshop','academy')
    AND jsonb_typeof(p_goal->'count')='number' AND (p_goal->>'count')::numeric BETWEEN 1 AND 9007199254740991
    AND trunc((p_goal->>'count')::numeric)=(p_goal->>'count')::numeric AND p_goal-ARRAY['type','id','count']='{}'::jsonb
  WHEN 'castle' THEN jsonb_typeof(p_goal->'level')='number' AND p_goal->>'level' IN ('2','3','4','5') AND p_goal-ARRAY['type','level']='{}'::jsonb
  WHEN 'building' THEN jsonb_typeof(p_goal->'level')='number' AND p_goal->>'id' IN ('barracks','range','stable','workshop','academy','treasury')
    AND p_goal->>'level' IN ('1','2','3','4','5') AND (p_goal->>'id'='treasury' OR p_goal->>'level'='1')
    AND p_goal-ARRAY['type','id','level']='{}'::jsonb
  ELSE false END,false);
$$;
