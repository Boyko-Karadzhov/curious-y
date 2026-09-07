-- Forge equipment and durable equip-or-sell decisions. Economics are authoritative in Edge.
ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":10,"forge":{"count":0,"pending":null,"equipped":{}},"discovered":[],"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"libraryConcepts":0,"armySlots":[null,null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null,"recruitCount":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0},"lastResult":null}'::jsonb;
UPDATE public.kingdom_state SET state=state || '{"version":10,"forge":{"count":0,"pending":null,"equipped":{}}}'::jsonb,revision=revision+1;

CREATE OR REPLACE FUNCTION public.valid_recruitment_state(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r record; slot jsonb; seen text[]:='{}'; classes text[]:='{}'; family text;
BEGIN
  IF s->>'version' IS DISTINCT FROM '10' OR jsonb_typeof(s->'units') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'recruitCount') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'armySlots') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'armySlots')<>5 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(s->'recruitCount'))<>5 THEN RETURN false; END IF;
  FOR r IN SELECT key,value FROM jsonb_each(s->'recruitCount') LOOP
    IF r.key NOT IN ('barracks','range','stable','academy','workshop')
      OR jsonb_typeof(r.value) IS DISTINCT FROM 'number' OR (r.value::text)::numeric NOT BETWEEN 0 AND 9007199254740991
      OR trunc((r.value::text)::numeric)<>(r.value::text)::numeric THEN RETURN false; END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_each(s->'units') LOOP
    family := public.recruitment_class(r.value->>'unitId');
    IF family IS NULL OR family=ANY(classes) THEN RETURN false; END IF;
    classes := array_append(classes,family);
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

CREATE FUNCTION public.valid_forged_item(i jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b jsonb; t integer; n numeric; lo integer; hi integer;
BEGIN
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(i))<>5
    OR i-ARRAY['id','unitClass','slot','tier','bonus']<>'{}'::jsonb
    OR jsonb_typeof(i->'id') IS DISTINCT FROM 'string' OR i->>'id' !~ '^[a-zA-Z0-9-]{1,100}$'
    OR COALESCE(i->>'unitClass','') NOT IN ('melee','ranged','mounted','healer','siege')
    OR COALESCE(i->>'slot','') NOT IN ('weapon','armor','artifact')
    OR jsonb_typeof(i->'tier') IS DISTINCT FROM 'number' OR COALESCE(i->>'tier','') NOT IN ('1','2','3','4','5') THEN RETURN false; END IF;
  t:=(i->>'tier')::integer; b:=i->'bonus';
  IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>3
    OR b-ARRAY['stat','target','value']<>'{}'::jsonb
    OR COALESCE(b->>'stat','') NOT IN ('damage','hp','attackSpeed','spawnSpeed','range')
    OR jsonb_typeof(b->'value') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(b->>'value')::numeric;
  IF b->>'stat'='range' THEN
    IF b->>'target' IS DISTINCT FROM 'all-ranged' THEN RETURN false; END IF;
    lo:=(ARRAY[1,1,2,3,3])[t]; hi:=(ARRAY[2,3,4,4,5])[t];
  ELSE
    IF COALESCE(b->>'target','') NOT IN ('melee','ranged','mounted','healer','siege') THEN RETURN false; END IF;
    IF b->>'stat'='spawnSpeed' THEN lo:=(ARRAY[2,4,6,8,12])[t]; hi:=(ARRAY[6,10,14,17,20])[t];
    ELSE lo:=(ARRAY[5,10,15,20,30])[t]; hi:=(ARRAY[15,25,35,42,50])[t]; END IF;
  END IF;
  RETURN n=trunc(n) AND n BETWEEN lo AND hi;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION public.valid_forge_state(s jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE f jsonb:=s->'forge'; r record; n numeric; lvl numeric; ids text[]:='{}';
BEGIN
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(f))<>3
    OR f-ARRAY['count','pending','equipped']<>'{}'::jsonb
    OR jsonb_typeof(f->'count') IS DISTINCT FROM 'number' OR jsonb_typeof(f->'equipped') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'buildings'->'forge') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
  n:=(f->>'count')::numeric; lvl:=(s->'buildings'->>'forge')::numeric;
  IF n<>trunc(n) OR n NOT BETWEEN 0 AND 9007199254740991 OR lvl<>trunc(lvl) OR lvl NOT BETWEEN 0 AND 100
    OR (SELECT count(*) FROM jsonb_object_keys(f->'equipped'))>15 THEN RETURN false; END IF;
  FOR r IN SELECT * FROM jsonb_each(f->'equipped') LOOP
    IF NOT public.valid_forged_item(r.value) OR r.key IS DISTINCT FROM (r.value->>'unitClass')||':'||(r.value->>'slot')
      OR r.value->>'id'=ANY(ids) THEN RETURN false; END IF;
    ids:=array_append(ids,r.value->>'id');
  END LOOP;
  IF f->'pending'<>'null'::jsonb THEN
    IF NOT public.valid_forged_item(f->'pending') OR f->'pending'->>'id'=ANY(ids) THEN RETURN false; END IF;
    ids:=array_append(ids,f->'pending'->>'id');
  END IF;
  RETURN n>=cardinality(ids) AND CASE WHEN lvl=0 THEN n=0 AND cardinality(ids)=0
    ELSE lvl=least(100,1+floor(n/10)) AND (s->>'castle')::numeric>=4 END;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_forged_item(jsonb),public.valid_forge_state(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_forged_item(jsonb),public.valid_forge_state(jsonb) TO service_role;
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
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle','recruit','forge','resolve-forge')
    OR (p_command->>'type'='building' AND COALESCE(p_command->>'id','') NOT IN ('barracks','range','stable','workshop','academy','treasury','forge'))
    OR NOT public.valid_recruitment_state(p_state)
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb
    OR p_state->'towers' IS DISTINCT FROM k.state->'towers'
    OR p_state->'libraryConcepts' IS DISTINCT FROM k.state->'libraryConcepts'
    OR p_state->'buildings'->'library' IS DISTINCT FROM k.state->'buildings'->'library'
    OR NOT public.valid_forge_state(p_state)
    THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command,result) VALUES(p_user_id,p_request_id,p_generation,p_command,CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
END $$;

CREATE OR REPLACE FUNCTION public.reserve_kingdom_command(p_user_id uuid,p_request_id uuid,p_generation bigint,p_command jsonb)
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
  SELECT jsonb_agg(('x'||right(replace(gen_random_uuid()::text,'-',''),13))::bit(52)::bigint::numeric / 4503599627370496) INTO draws FROM generate_series(1,CASE WHEN p_command->>'type'='forge' THEN 6 ELSE 3 END);
  INSERT INTO public.kingdom_command_reservations VALUES(p_user_id,p_request_id,p_generation,p_command,draws);
  RETURN jsonb_build_object('draws',draws);
END $$;
REVOKE ALL ON FUNCTION public.reserve_kingdom_command(uuid,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_kingdom_command(uuid,uuid,bigint,jsonb) TO service_role;


CREATE OR REPLACE FUNCTION public.valid_progression_goal(p_goal jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
SELECT p_goal IS NULL OR COALESCE(jsonb_typeof(p_goal)='object' AND CASE p_goal->>'type'
  WHEN 'recruit' THEN p_goal->>'id' IN ('barracks','range','stable','workshop','academy')
    AND jsonb_typeof(p_goal->'count')='number' AND (p_goal->>'count')::numeric BETWEEN 1 AND 9007199254740991
    AND trunc((p_goal->>'count')::numeric)=(p_goal->>'count')::numeric AND p_goal-ARRAY['type','id','count']='{}'::jsonb
  WHEN 'castle' THEN jsonb_typeof(p_goal->'level')='number' AND p_goal->>'level' IN ('2','3','4','5') AND p_goal-ARRAY['type','level']='{}'::jsonb
  WHEN 'building' THEN jsonb_typeof(p_goal->'level')='number' AND p_goal->>'id' IN ('barracks','range','stable','workshop','academy','treasury','forge')
    AND p_goal->>'level' IN ('1','2','3','4','5') AND (p_goal->>'id'='treasury' OR p_goal->>'level'='1')
    AND p_goal-ARRAY['type','id','level']='{}'::jsonb
  ELSE false END,false);
$$;
