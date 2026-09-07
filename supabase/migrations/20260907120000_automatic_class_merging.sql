-- Mandatory recruitment merge: one owned unit per class, with existing XP preserved.
CREATE FUNCTION public.recruitment_class(id text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE
    WHEN id IN ('militia','spearman','swordsman','royal-guard','champion') THEN 'barracks'
    WHEN id IN ('slinger','archer','crossbowman','ranger','marksman') THEN 'range'
    WHEN id IN ('scout-rider','horseman','lancer','knight','royal-knight') THEN 'stable'
    WHEN id IN ('medic','herbalist','acolyte','priest','high-priest') THEN 'academy'
    WHEN id IN ('ballista','catapult','trebuchet','bombard','great-bombard') THEN 'workshop'
  END;
$$;
REVOKE ALL ON FUNCTION public.recruitment_class(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recruitment_class(text) TO service_role;

-- One-time conversion of the development roster. Tuning constants below describe
-- the old stored XP values only; future recruitment economics remain in Edge.
DO $$
DECLARE k record; family text; r record; keeper text; best integer; total numeric;
  roster jsonb; slots jsonb; old_ids text[]; slot jsonb; replaced boolean;
  ladder text[] := ARRAY['militia','spearman','swordsman','royal-guard','champion',
    'slinger','archer','crossbowman','ranger','marksman',
    'scout-rider','horseman','lancer','knight','royal-knight',
    'medic','herbalist','acolyte','priest','high-priest',
    'ballista','catapult','trebuchet','bombard','great-bombard'];
BEGIN
  FOR k IN SELECT user_id,state FROM public.kingdom_state FOR UPDATE LOOP
    roster := k.state->'units'; slots := k.state->'armySlots';
    FOREACH family IN ARRAY ARRAY['barracks','range','stable','academy','workshop'] LOOP
      keeper := NULL; best := -1; total := 0; old_ids := '{}';
      FOR r IN SELECT key,value,(array_position(ladder,value->>'unitId')-1)%5 AS tier
        FROM jsonb_each(roster) WHERE public.recruitment_class(value->>'unitId')=family
        ORDER BY key COLLATE "C" LOOP
        old_ids := array_append(old_ids,r.key);
        total := total + 10*power(3::numeric,r.tier) + (r.value->>'investedXP')::numeric;
        IF r.tier > best THEN keeper := r.key; best := r.tier; END IF;
      END LOOP;
      IF keeper IS NOT NULL THEN
        IF total > 9007199254740991 THEN RAISE EXCEPTION 'Merged XP exceeds safe integer limits'; END IF;
        roster := jsonb_set(roster,ARRAY[keeper,'investedXP'],to_jsonb(total-10*power(3::numeric,best)));
        roster := jsonb_set(roster,ARRAY[keeper,'locked'],'false'::jsonb);
        roster := roster - array_remove(old_ids,keeper);
        replaced := false;
        FOR i IN 0..4 LOOP
          slot := slots->i;
          IF (slot #>> '{}')=ANY(old_ids) THEN
            slots := jsonb_set(slots,ARRAY[i::text],CASE WHEN replaced THEN 'null'::jsonb ELSE to_jsonb(keeper) END);
            replaced := true;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
    UPDATE public.kingdom_state SET state=state || jsonb_build_object('version',9,'units',roster,'armySlots',slots,'lastResult',NULL),
      revision=revision+1 WHERE user_id=k.user_id;
  END LOOP;
END $$;
-- Old receipts still deduplicate commands, but cannot replay a manual-merge reveal.
UPDATE public.kingdom_commands SET result=NULL;
ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":9,"discovered":[],"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"libraryConcepts":0,"armySlots":[null,null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null,"recruitCount":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0},"lastResult":null}'::jsonb;

CREATE OR REPLACE FUNCTION public.valid_recruitment_state(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r record; slot jsonb; seen text[]:='{}'; classes text[]:='{}'; family text;
BEGIN
  IF s->>'version' IS DISTINCT FROM '9' OR jsonb_typeof(s->'units') IS DISTINCT FROM 'object'
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
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle','recruit')
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
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command,result) VALUES(p_user_id,p_request_id,p_generation,p_command,CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
END $$;
