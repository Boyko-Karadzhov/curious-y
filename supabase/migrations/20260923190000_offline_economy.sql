-- Development economy reset; learning history remains, Castle progress restarts.
DROP TRIGGER IF EXISTS correct_answer_tribute ON public.learning_reward_events;
DROP FUNCTION IF EXISTS public.credit_correct_answer_tribute();

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT '{"version":11,"forge":{"count":0,"pending":null,"equipped":{}},"discovered":[],"units":{},"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}},"armySlots":[null,null,null,null,null],"gold":0,"food":16,"metal":24,"production":{"foodDay":"","metalAt":"1970-01-01T00:00:00.000Z","metalStored":0},"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"forge":0,"farm":0,"smelter":0,"market":0},"rewarded":[],"cleared":0,"battle":null,"recruitCount":{"barracks":0},"lastResult":null,"lifetimeGold":0,"tribute":{"day":"","territories":0,"correct":false,"claimed":false,"paid":0},"doctrine":"balanced"}'::jsonb;
UPDATE public.kingdom_state SET state=DEFAULT, generation=generation+1, revision=revision+1, battle_clock=NULL, issuance_lease=NULL, issuance_until=NULL, progression_goal=DEFAULT, goal_revision=goal_revision+1;

CREATE OR REPLACE FUNCTION public.apply_territory_tribute(s jsonb, p_now timestamptz, p_cleared bigint DEFAULT NULL, p_correct boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE WHEN s->'tribute'->>'day'=to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD') THEN s
    ELSE jsonb_set(s,'{tribute}',jsonb_build_object('day',to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD'),'territories',(s->>'cleared')::bigint,'correct',false,'claimed',false,'paid',0)) END;
$$;

-- Existing concept trigger remains useful for Knowledge Towers, but no Library keys are written.
CREATE FUNCTION public.reconcile_towers(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE towers jsonb;
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  WITH eligible AS MATERIALIZED (SELECT * FROM public.library_eligible_concepts(p_user_id)),
  contributions AS (SELECT public.tower_contribution(topics) AS points FROM eligible),
  totals AS (SELECT r.key,COALESCE(sum((c.points->>r.key)::bigint),0) AS points
    FROM public.resource_topics() r LEFT JOIN contributions c ON true GROUP BY r.key)
  SELECT jsonb_build_object('rule','earned-proficiency-v1','points',jsonb_object_agg(key,points)) INTO towers FROM totals;
  UPDATE public.kingdom_state SET state=jsonb_set(state,'{towers}',towers), revision=revision+1
  WHERE user_id=p_user_id AND state->'towers' IS DISTINCT FROM towers;
END $$;
REVOKE ALL ON FUNCTION public.reconcile_towers(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_towers(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.reconcile_library_concept_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.reconcile_towers(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN PERFORM public.reconcile_towers(OLD.user_id); END IF;
  RETURN NULL;
END $$;
DROP FUNCTION public.reconcile_library(uuid);
DROP FUNCTION public.library_concept_count(uuid);

CREATE FUNCTION public.valid_economy_state(s jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE p jsonb:=s->'production'; n numeric;
BEGIN
  FOREACH n IN ARRAY ARRAY[(s->>'gold')::numeric,(s->>'food')::numeric,(s->>'metal')::numeric,(p->>'metalStored')::numeric] LOOP
    IF n IS NULL OR n<>trunc(n) OR n NOT BETWEEN 0 AND 9007199254740991 THEN RETURN false; END IF;
  END LOOP;
  RETURN jsonb_typeof(p)='object' AND p->>'metalAt' IS NOT NULL
    AND (p->>'metalAt')::timestamptz IS NOT NULL AND p->>'foodDay' IS NOT NULL
    AND s->'buildings' ?& ARRAY['farm','smelter','market']
    AND NOT (s->'buildings' ? 'library') AND NOT (s ? 'libraryConcepts');
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_economy_state(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.valid_economy_state(jsonb) TO service_role;

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
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle','collect-production','trade','recruit','forge','resolve-forge','merge','lock','doctrine')
    OR (p_command->>'type'='building' AND COALESCE(p_command->>'id','') NOT IN ('barracks','academy','treasury','forge','farm','smelter','market'))
    OR NOT public.valid_recruitment_state(p_state) OR NOT public.valid_economy_state(p_state)
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb
    OR p_state->'towers' IS DISTINCT FROM k.state->'towers'
    OR NOT public.valid_forge_state(p_state)
    OR (p_command->>'type'<>'collect-production' AND p_state->'tribute' IS DISTINCT FROM (public.apply_territory_tribute(k.state,now(),(p_state->>'cleared')::bigint,false)->'tribute'))
    OR COALESCE(p_state->>'doctrine','') NOT IN ('balanced','shield-wall','rapid-reserves')
    OR (p_state->>'lifetimeGold')::numeric < (p_state->>'gold')::numeric
    THEN RAISE EXCEPTION 'Invalid Castle command.'; END IF;
  UPDATE public.kingdom_state SET state=p_state, battle_clock=p_battle_clock, revision=revision+1 WHERE user_id=p_user_id;
  IF p_command->>'type' <> 'tick' THEN
    INSERT INTO public.kingdom_commands(user_id,request_id,generation,command,result) VALUES(p_user_id,p_request_id,p_generation,p_command,CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
  END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('result',CASE WHEN p_command->>'type' ='recruit' THEN p_state->'lastResult' ELSE NULL END);
END $$;

DO $$ DECLARE u record; BEGIN FOR u IN SELECT user_id FROM public.kingdom_state LOOP PERFORM public.reconcile_towers(u.user_id); END LOOP; END $$;
