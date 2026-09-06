-- Step 6. Additive projection only: wallets, battles, reward receipts and generations are untouched.
-- Eligible protected historical concepts are explicitly backfilled at the end.
CREATE FUNCTION public.library_eligible_concepts(p_user_id uuid) RETURNS SETOF public.concepts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH RECURSIVE concepts AS MATERIALIZED (
    SELECT *,
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
  ), representatives AS (
    SELECT DISTINCT ON (r.root) c.id FROM roots r JOIN concepts c ON c.id=r.origin
    JOIN groups g ON g.root=r.root WHERE g.earned AND NOT g.atomic AND c.earned
    ORDER BY r.root, lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g')) COLLATE "C", c.canonical_name COLLATE "C"
  ) SELECT c.* FROM public.concepts c JOIN representatives r USING(id);
$$;
CREATE OR REPLACE FUNCTION public.library_concept_count(p_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT count(*)::integer FROM public.library_eligible_concepts(p_user_id);
$$;

-- Exact Hamilton arithmetic on raw decimal weights, like resources.ts. No rounding
-- of normalized ratios before division; the canonical catalog order breaks ties.
CREATE FUNCTION public.tower_contribution(p_weights jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  WITH weights AS (
    SELECT r.*, CASE WHEN jsonb_typeof(p_weights->r.topic)='number'
      AND (p_weights->>r.topic)::numeric>0 AND (p_weights->>r.topic)::numeric<=1.7976931348623157e308
      THEN (p_weights->>r.topic)::numeric ELSE 0 END AS weight FROM public.resource_topics() r
  ), totals AS (SELECT *,sum(weight) OVER () AS total FROM weights),
  parts AS (SELECT *,COALESCE(div(1000000*weight,NULLIF(total,0)),0) AS base,
    COALESCE(mod(1000000*weight,NULLIF(total,0)),0) AS remainder FROM totals),
  ranked AS (SELECT *,row_number() OVER (ORDER BY remainder DESC,ord) AS rank,
    CASE WHEN total>0 THEN 1000000-sum(base) OVER () ELSE 0 END AS remaining FROM parts)
  SELECT jsonb_object_agg(key,base+CASE WHEN rank<=remaining THEN 1 ELSE 0 END) FROM ranked;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_library(p_user_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer; lvl integer; towers jsonb;
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  WITH eligible AS MATERIALIZED (SELECT * FROM public.library_eligible_concepts(p_user_id)),
  contributions AS (SELECT public.tower_contribution(topics) AS points FROM eligible),
  totals AS (SELECT r.key,COALESCE(sum((c.points->>r.key)::bigint),0) AS points
    FROM public.resource_topics() r LEFT JOIN contributions c ON true GROUP BY r.key)
  SELECT (SELECT count(*) FROM eligible), jsonb_build_object('rule','earned-proficiency-v1','points',jsonb_object_agg(key,points))
    INTO n,towers FROM totals;
  lvl:=CASE WHEN n>=150 THEN 4 WHEN n>=75 THEN 3 WHEN n>=30 THEN 2 WHEN n>=10 THEN 1 ELSE 0 END;
  UPDATE public.kingdom_state SET state=jsonb_set(jsonb_set(jsonb_set(state,'{libraryConcepts}',to_jsonb(n)),
    '{buildings,library}',to_jsonb(lvl)),'{towers}',towers), revision=revision+1
  WHERE user_id=p_user_id AND (state->>'libraryConcepts' IS DISTINCT FROM n::text
    OR state->'buildings'->>'library' IS DISTINCT FROM lvl::text OR state->'towers' IS DISTINCT FROM towers);
END $$;

-- Topic corrections, identity changes, deletions and downgrades recompute the
-- current projection. No high-water mark. Frozen battle configurations stay intact.
CREATE OR REPLACE FUNCTION public.reconcile_library_concept_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.reconcile_library(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN PERFORM public.reconcile_library(OLD.user_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER concepts_library_progress ON public.concepts;
CREATE TRIGGER concepts_library_progress AFTER INSERT OR DELETE OR UPDATE OF mastery, reasoning_track, canonical_name, aliases, is_atomic, topics, user_id
ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.reconcile_library_concept_change();

ALTER TABLE public.kingdom_state ALTER COLUMN state SET DEFAULT
'{"version":4,"libraryConcepts":0,"armySlots":[null,null,null,null],"gold":0,"tokens":{"Physics":0,"Mathematics & Logic":0,"Chemistry":0,"Life":0,"Computer Science":0,"Earth & Space":0,"Mind & Behavior":0,"Society & History":0},"castle":1,"buildings":{"barracks":0,"range":0,"stable":0,"workshop":0,"academy":0,"treasury":0,"library":0,"forge":0},"rewarded":[],"cleared":0,"battle":null,"towers":{"rule":"earned-proficiency-v1","points":{"force":0,"runes":0,"reagents":0,"essence":0,"cores":0,"astral":0,"insight":0,"influence":0}}}';

-- Preserve v1 so its legacy battle conversion still runs in Edge. v2/v3 have
-- already received step 5's additive building fields.
UPDATE public.kingdom_state SET state=jsonb_set(state,'{version}','4'),revision=revision+1 WHERE state->>'version'<>'1';
DO $$ DECLARE u uuid; BEGIN
  FOR u IN SELECT user_id FROM public.kingdom_state LOOP PERFORM public.reconcile_library(u); END LOOP;
END $$;

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

REVOKE ALL ON FUNCTION public.library_eligible_concepts(uuid),public.tower_contribution(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.library_eligible_concepts(uuid),public.tower_contribution(jsonb) TO service_role;
