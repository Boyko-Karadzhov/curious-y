-- Step 5: additive IDs, unchanged legacy prices and battle obligations.
-- v1 battles still need the Edge parser's compatibility conversion; keep v1 there.
UPDATE public.kingdom_state SET state = state || jsonb_build_object(
  'version', CASE WHEN state->>'version'='1' THEN 1 ELSE 3 END,
  'libraryConcepts', 0,
  'buildings', state->'buildings' || '{"academy":0,"treasury":0,"library":0,"forge":0}'::jsonb
), revision=revision+1;

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT
'{"version":3,"libraryConcepts":0,"armySlots":[null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null}';

-- All records here are protected server concepts. Historical non-atomic
-- proficient/mastered records qualify when a positive reasoning track proves
-- earned work, including records predating reward_successes. No receipt/currency
-- requirement: deleting history or balancing rewards must not erase knowledge.
-- Collapse connected canonical/alias names, including transitive collisions.
-- Any atomic record in a component excludes that component conservatively.
CREATE FUNCTION public.library_concept_count(p_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE concepts AS MATERIALIZED (
    SELECT id, canonical_name, aliases, is_atomic,
      mastery IN ('proficient','mastered') AND EXISTS (
        SELECT 1 FROM jsonb_each_text(reasoning_track) t WHERE t.value::numeric > 0
      ) AS earned FROM public.concepts WHERE user_id=p_user_id
  ), names AS (
    SELECT DISTINCT c.id, lower(regexp_replace(trim(n.name),'\s+',' ','g')) AS name
    FROM concepts c CROSS JOIN LATERAL jsonb_array_elements_text(c.aliases || jsonb_build_array(c.canonical_name)) n(name)
    WHERE trim(n.name)<>''
  ), edges AS (
    SELECT DISTINCT a.id AS a, b.id AS b FROM names a JOIN names b USING(name)
  ), connected(origin, member) AS (
    SELECT id,id FROM concepts
    UNION
    SELECT c.origin,e.b FROM connected c JOIN edges e ON e.a=c.member
  ), roots AS (
    SELECT origin, min(member::text) AS root FROM connected GROUP BY origin
  ), groups AS (
    SELECT r.root, bool_or(c.is_atomic) AS atomic, bool_or(c.earned) AS earned
    FROM roots r JOIN concepts c ON c.id=r.origin GROUP BY r.root
  ) SELECT count(*)::integer FROM groups WHERE earned AND NOT atomic;
$$;

CREATE FUNCTION public.reconcile_library(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; lvl integer;
BEGIN
  -- Same per-account lock as answers, purchases, collection and reset.
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  n:=public.library_concept_count(p_user_id);
  lvl:=CASE WHEN n>=150 THEN 4 WHEN n>=75 THEN 3 WHEN n>=30 THEN 2 WHEN n>=10 THEN 1 ELSE 0 END;
  UPDATE public.kingdom_state SET state=jsonb_set(jsonb_set(state,'{libraryConcepts}',to_jsonb(n)),'{buildings,library}',to_jsonb(lvl)), revision=revision+1
  WHERE user_id=p_user_id AND (state->>'libraryConcepts' IS DISTINCT FROM n::text OR state->'buildings'->>'library' IS DISTINCT FROM lvl::text);
END $$;

CREATE FUNCTION public.reconcile_library_concept_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.reconcile_library(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  RETURN NULL;
END $$;
CREATE TRIGGER concepts_library_progress AFTER INSERT OR DELETE OR UPDATE OF mastery, reasoning_track, canonical_name, aliases, is_atomic
ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.reconcile_library_concept_change();
DO $$ DECLARE u uuid; BEGIN
  FOR u IN SELECT user_id FROM public.kingdom_state LOOP PERFORM public.reconcile_library(u); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.valid_progression_goal(p_goal jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_goal IS NULL OR COALESCE(
    jsonb_typeof(p_goal) = 'object' AND jsonb_typeof(p_goal->'level') = 'number'
    AND p_goal->>'level' IN ('1','2','3','4','5')
    AND CASE p_goal->>'type'
      WHEN 'castle' THEN p_goal->>'level' <> '1' AND p_goal - ARRAY['type','level'] = '{}'::jsonb
      WHEN 'building' THEN p_goal->>'id' IN ('barracks','range','stable','workshop','academy','treasury')
        AND p_goal - ARRAY['type','id','level'] = '{}'::jsonb
      ELSE false END, false);
$$;

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
  IF p_request_id IS NULL OR COALESCE(p_command->>'type','') NOT IN ('castle','building','army','start','tick','retreat','collect-battle')
    OR (p_command->>'type'='building' AND COALESCE(p_command->>'id','') NOT IN ('barracks','range','stable','workshop','academy','treasury'))
    OR p_state IS NULL OR p_state->'rewarded' IS DISTINCT FROM '[]'::jsonb
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

REVOKE ALL ON FUNCTION public.library_concept_count(uuid), public.reconcile_library(uuid),
  public.reconcile_library_concept_change() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.library_concept_count(uuid), public.reconcile_library(uuid) TO service_role;
