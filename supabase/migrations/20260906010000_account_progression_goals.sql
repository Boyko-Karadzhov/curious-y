-- Goal selection is account data, separate from trusted economy balances.
ALTER TABLE public.kingdom_state
  ADD COLUMN progression_goal jsonb DEFAULT '{"type":"building","id":"barracks","level":1}'::jsonb,
  ADD COLUMN goal_revision bigint NOT NULL DEFAULT 0 CHECK (goal_revision >= 0);

-- Existing armies should not receive an already-completed onboarding goal.
UPDATE public.kingdom_state SET progression_goal = NULL
WHERE (state->'buildings'->>'barracks')::integer > 0;

CREATE FUNCTION public.valid_progression_goal(p_goal jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_goal IS NULL OR COALESCE(
    jsonb_typeof(p_goal) = 'object'
    AND jsonb_typeof(p_goal->'level') = 'number'
    AND p_goal->>'level' IN ('1','2','3','4','5')
    AND CASE p_goal->>'type'
      WHEN 'castle' THEN p_goal->>'level' <> '1'
        AND p_goal - ARRAY['type','level'] = '{}'::jsonb
      WHEN 'building' THEN p_goal->>'id' IN ('barracks','range','stable','workshop')
        AND p_goal - ARRAY['type','id','level'] = '{}'::jsonb
      ELSE false END, false);
$$;
ALTER TABLE public.kingdom_state ADD CONSTRAINT valid_account_goal
  CHECK (public.valid_progression_goal(progression_goal));

CREATE FUNCTION public.get_progression_goal(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('goal', progression_goal, 'revision', goal_revision)
  FROM public.kingdom_state WHERE user_id = p_user_id;
$$;

CREATE FUNCTION public.set_progression_goal(p_user_id uuid, p_goal jsonb, p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE k public.kingdom_state%ROWTYPE;
BEGIN
  IF p_revision IS NULL OR p_revision < 0 OR NOT public.valid_progression_goal(p_goal) THEN
    RAISE EXCEPTION 'Invalid progression goal.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id = p_user_id FOR UPDATE;
  -- A retry after a lost response must not increment the version or apply twice.
  IF k.progression_goal IS NOT DISTINCT FROM p_goal THEN
    RETURN public.get_progression_goal(p_user_id);
  END IF;
  IF k.goal_revision <> p_revision THEN
    RAISE EXCEPTION 'Your goal changed on another device. Review it and choose again.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.kingdom_state SET progression_goal = p_goal, goal_revision = goal_revision + 1
  WHERE user_id = p_user_id;
  RETURN public.get_progression_goal(p_user_id);
END;
$$;

-- The Edge Function supplies the authenticated user ID. Browser roles cannot
-- read or mutate this preference through privileged RPCs or Castle columns.
REVOKE ALL ON FUNCTION public.valid_progression_goal(jsonb), public.get_progression_goal(uuid),
  public.set_progression_goal(uuid,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valid_progression_goal(jsonb), public.get_progression_goal(uuid),
  public.set_progression_goal(uuid,jsonb,bigint) TO service_role;
