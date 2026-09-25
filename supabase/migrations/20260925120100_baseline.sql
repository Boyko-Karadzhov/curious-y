-- Baseline of the database schema after migrations through 20260925120100.
-- Public objects come from a schema-only dump; managed Supabase schemas already exist.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: allocate_resources(integer, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.allocate_resources(p_total integer, p_weights jsonb, p_fallback text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE weights jsonb; result jsonb;
BEGIN
  IF p_total IS NULL OR p_total<0 THEN RAISE EXCEPTION 'Invalid resource total.'; END IF;
  weights:=public.normalize_topic_weights(p_weights,p_fallback);
  WITH exact AS (
    SELECT r.*,p_total*COALESCE((weights->>r.topic)::numeric,0) AS amount FROM public.resource_topics() r
  ), parts AS (
    SELECT *,floor(amount)::integer AS base,amount-floor(amount) AS remainder FROM exact
  ), ranked AS (
    SELECT *,row_number() OVER (ORDER BY remainder DESC,ord) AS rank,
      p_total-sum(base) OVER () AS remaining FROM parts
  ), lines AS (SELECT *,base+CASE WHEN rank<=remaining THEN 1 ELSE 0 END AS credited FROM ranked)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('key',key,'amount',credited) ORDER BY ord)
    FILTER (WHERE credited>0),'[]'::jsonb) INTO result FROM lines;
  RETURN result;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic text NOT NULL,
    subtopic text,
    angle text,
    angle_fit text,
    question_text text NOT NULL,
    options jsonb NOT NULL,
    correct_index integer NOT NULL,
    selected_index integer,
    is_correct boolean,
    explanation text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    suggested_questions jsonb,
    concept text,
    reasoning_complexity text,
    is_boss_question boolean DEFAULT false,
    required_concepts jsonb DEFAULT '[]'::jsonb NOT NULL,
    concept_definition text,
    prerequisites_met boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    answered_at timestamp with time zone,
    trusted_issuance boolean DEFAULT false NOT NULL,
    generation bigint,
    topic_weights jsonb NOT NULL,
    graph_node text,
    knowledge_entry text,
    option_feedback jsonb,
    graph_dimension text,
    CONSTRAINT questions_graph_dimension_check CHECK (((graph_dimension IS NULL) OR (graph_dimension = ANY (ARRAY['intuition'::text, 'precision'::text, 'boundaries'::text, 'application'::text, 'mechanism'::text, 'alternatives'::text, 'evidence'::text]))))
);


--
-- Name: apply_graph_answer(uuid, public.questions, boolean, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_graph_answer(p_user_id uuid, q public.questions, correct boolean, stamp timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE j public.learning_graphs; n jsonb; p jsonb; previous jsonb; next_mastery text; progress_key text;
BEGIN
  SELECT * INTO STRICT j FROM public.learning_graphs WHERE user_id=p_user_id FOR UPDATE;
  previous:=j.progress;
  progress_key:=CASE WHEN q.is_boss_question THEN 'boss' ELSE COALESCE(q.graph_dimension,q.reasoning_complexity) END;
  p:=public.next_graph_progress(j.progress->q.graph_node->progress_key,correct,q.knowledge_entry,q.question_text,stamp);
  j.progress:=jsonb_set(j.progress,ARRAY[q.graph_node],COALESCE(j.progress->q.graph_node,'{}')||jsonb_build_object(progress_key,p));
  UPDATE public.learning_graphs SET progress=j.progress WHERE user_id=p_user_id;
  SELECT node INTO n FROM jsonb_array_elements(public.load_learning_graph(p_user_id)->'nodes') node WHERE node->>'id'=q.graph_node;
  next_mastery:=public.graph_node_mastery(n,j.progress->q.graph_node);
  UPDATE public.concepts SET mastery=next_mastery,
    next_due_at=(SELECT min((value->>'nextReviewAt')::timestamptz) FROM jsonb_each(j.progress->q.graph_node))
    WHERE user_id=p_user_id AND canonical_name=q.concept;
  RETURN jsonb_build_object('graph',public.load_learning_graph(p_user_id),'previousProgress',previous);
END $$;


--
-- Name: apply_territory_tribute(jsonb, timestamp with time zone, bigint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_territory_tribute(s jsonb, p_now timestamp with time zone, p_cleared bigint DEFAULT NULL::bigint, p_correct boolean DEFAULT false) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN s->'tribute'->>'day'=to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD') THEN s
    ELSE jsonb_set(s,'{tribute}',jsonb_build_object('day',to_char(p_now AT TIME ZONE 'UTC','YYYY-MM-DD'),'territories',(s->>'cleared')::bigint,'correct',false,'claimed',false,'paid',0)) END;
$$;


--
-- Name: assert_shared_concepts_acyclic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_shared_concepts_acyclic() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (WITH RECURSIVE walk(root,id,path,cycle) AS (
      SELECT c.id,c.id,ARRAY[c.id],false FROM public.shared_concepts c
      UNION ALL
      SELECT walk.root,d.prerequisite_id,walk.path||d.prerequisite_id,d.prerequisite_id=ANY(walk.path)
      FROM walk JOIN public.shared_concept_dependencies d ON d.concept_id=walk.id WHERE NOT walk.cycle
    ) SELECT 1 FROM walk WHERE cycle)
    THEN RAISE EXCEPTION 'Shared concept graph contains a cycle.'; END IF;
END $$;


--
-- Name: attach_shared_tree(uuid, bigint, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.attach_shared_tree(p_user_id uuid, p_generation bigint, p_roots text[], p_topic text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(p_roots) root WHERE NOT EXISTS (SELECT 1 FROM public.shared_concepts WHERE id=root))
    THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
  INSERT INTO public.learning_graph_concepts(user_id,generation,concept_id)
    SELECT p_user_id,p_generation,id FROM public.shared_concept_closure(p_roots) ON CONFLICT DO NOTHING;
  UPDATE public.shared_concepts c SET body=jsonb_set(c.body,'{topics}',COALESCE((SELECT jsonb_agg(DISTINCT tags.topic)
      FROM jsonb_array_elements_text(COALESCE(c.body->'topics','[]'::jsonb)||jsonb_build_array(p_topic)) AS tags(topic)),'[]'::jsonb)),updated_at=now()
    WHERE c.id IN (SELECT id FROM public.shared_concept_closure(p_roots));
END $$;


--
-- Name: begin_graph_expansion(uuid, text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_graph_expansion(p_user_id uuid, p_topic text, p_generation bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state; lease uuid:=gen_random_uuid(); graph jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please retry.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic) THEN RAISE EXCEPTION 'Invalid topic.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'Learning material is being generated. Please retry shortly.'; END IF;
  UPDATE public.kingdom_state SET issuance_topic=p_topic,issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  graph:=public.load_learning_graph(p_user_id);
  RETURN jsonb_build_object('lease',lease,'graph',graph);
END $$;


--
-- Name: begin_graph_question(uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_graph_question(p_user_id uuid, p_node text, p_dimension text, p_reasoning text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state; j public.learning_graphs; graph jsonb; n jsonb; q public.questions; reservation jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO j FROM public.learning_graphs WHERE user_id=p_user_id AND generation=k.generation;
  IF NOT FOUND THEN RAISE EXCEPTION 'Graph not found. Please reopen the map.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,j.progress,p_dimension,p_reasoning) THEN RAISE EXCEPTION 'This discovery is still hidden.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance AND generation=k.generation
    AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  IF q.graph_node=p_node AND q.graph_dimension IS NOT DISTINCT FROM p_dimension
    AND (p_dimension IS NOT NULL OR n->>'kind'='boss' OR q.reasoning_complexity IS NOT DISTINCT FROM p_reasoning)
    THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  reservation:=public.reserve_graph_question(p_user_id,n);
  RETURN reservation||jsonb_build_object('node',n);
END $$;


--
-- Name: begin_question_generation(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_question_generation(p_user_id uuid, p_topic text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; lease uuid;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before generating another question.'; END IF;
  SELECT * INTO q FROM public.questions WHERE user_id=p_user_id AND trusted_issuance
    AND generation=k.generation AND answered_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1;
  -- Old trusted questions may have been mislabeled before topic validation existed.
  IF FOUND AND (p_topic IS NULL OR q.topic=p_topic) AND NOT EXISTS (
    SELECT 1 FROM public.resolve_reward_concept(p_user_id,q.concept) c
    WHERE c.id IS NOT NULL AND COALESCE((public.normalize_topic_weights(c.topics,q.topic)->>q.topic)::numeric,0)<=0
  ) THEN RETURN jsonb_build_object('active',to_jsonb(q),'generation',k.generation); END IF;
  IF k.issuance_until>now() THEN RAISE EXCEPTION 'A question is being generated. Please retry shortly.'; END IF;
  lease:=gen_random_uuid();
  UPDATE public.kingdom_state SET issuance_topic=p_topic,issuance_lease=lease,issuance_until=now()+interval '2 minutes' WHERE user_id=p_user_id;
  RETURN jsonb_build_object('lease',lease,'generation',k.generation);
END $$;


--
-- Name: cancel_question_generation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_question_generation(p_user_id uuid, p_lease uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  UPDATE public.kingdom_state SET issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id AND issuance_lease=p_lease;
$$;


--
-- Name: canonicalize_node_requirements(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.canonicalize_node_requirements(n jsonb, p_mapping jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_set(n,'{requires}',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'nodeId',public.mapped_concept_id(p_mapping,r->>'nodeId')) ORDER BY r->>'nodeId')
    FROM jsonb_array_elements(n->'requires') r),'[]'::jsonb));
$$;


--
-- Name: castle_learning_reward(uuid, boolean, integer, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.castle_learning_reward(p_id uuid, p_correct boolean, p_total integer, p_weights jsonb, p_topic text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object('id',p_id::text,'correct',p_correct,'totalKnowledge',p_total,
    'topicWeights',public.normalize_topic_weights(p_weights,p_topic),
    'lines',public.allocate_resources(p_total,p_weights,p_topic));
$$;


--
-- Name: cleanup_user_gemini_secret(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_user_gemini_secret() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE id = old.gemini_secret_id;
  RETURN old;
END;
$$;


--
-- Name: collect_learning_reward(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.collect_learning_reward(p_user_id uuid, p_question_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE; e public.learning_reward_events%ROWTYPE; line jsonb; topic text;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO e FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF NOT FOUND OR e.generation<>k.generation THEN RAISE EXCEPTION 'Reward not found or progress was reset.'; END IF;
  IF e.collected_at IS NULL THEN
    FOR line IN SELECT value FROM jsonb_array_elements(e.reward->'lines') LOOP
      SELECT r.topic INTO STRICT topic FROM public.resource_topics() r WHERE r.key=line->>'key';
      k.state:=jsonb_set(k.state,ARRAY['tokens',topic],
        to_jsonb((k.state->'tokens'->>topic)::bigint+(line->>'amount')::integer));
    END LOOP;
    UPDATE public.kingdom_state SET state=k.state,revision=revision+1 WHERE user_id=p_user_id;
    UPDATE public.learning_reward_events SET collected_at=now() WHERE user_id=p_user_id AND question_id=p_question_id;
  END IF;
  -- Keep the snapshot shape for current Castle callers, with the exact stored receipt attached.
  RETURN public.kingdom_snapshot(p_user_id)||jsonb_build_object('reward',e.reward);
END $$;


--
-- Name: commit_kingdom_command(uuid, bigint, bigint, uuid, jsonb, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.commit_kingdom_command(p_user_id uuid, p_generation bigint, p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: shared_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_concepts (
    id text NOT NULL,
    identity text NOT NULL,
    body jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shared_concepts_body_check CHECK ((((body ->> 'kind'::text) = 'concept'::text) AND (NOT (body ? 'requires'::text)))),
    CONSTRAINT shared_concepts_id_check CHECK ((id ~ '^[a-z][a-z0-9-]{0,79}$'::text))
);


--
-- Name: complete_shared_concept(public.shared_concepts, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_shared_concept(current public.shared_concepts, n jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF (current.body-'dimensions'-'expanded') IS DISTINCT FROM ((n-'requires')-'dimensions'-'expanded')
    THEN RAISE EXCEPTION 'Preserve the shared concept identity while completing it.'; END IF;
  IF (SELECT COALESCE(array_agg(d.prerequisite_id ORDER BY d.prerequisite_id),ARRAY[]::text[])
      FROM public.shared_concept_dependencies d WHERE d.concept_id=current.id)
    IS DISTINCT FROM (SELECT COALESCE(array_agg(r->>'nodeId' ORDER BY r->>'nodeId'),ARRAY[]::text[])
      FROM jsonb_array_elements(n->'requires') r)
    THEN RAISE EXCEPTION 'Only unfinished concepts can change; preserve their identity and dependencies.'; END IF;
  UPDATE public.shared_concepts SET body=n-'requires',updated_at=now() WHERE id=current.id;
END $$;


--
-- Name: concept_identity(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.concept_identity(title text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT lower(regexp_replace(normalize(title,NFKC),'[^[:alnum:]]','','g'));
$$;


--
-- Name: consume_backend_rate_limit(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_backend_rate_limit(p_user_id uuid, p_action text, p_max_requests integer, p_window_seconds integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  current_limit public.backend_rate_limits%ROWTYPE;
BEGIN
  IF p_max_requests < 1 OR p_window_seconds < 1 THEN RETURN false; END IF;

  INSERT INTO public.backend_rate_limits (user_id, action, request_count)
  VALUES (p_user_id, p_action, 0)
  ON CONFLICT (user_id, action) DO NOTHING;

  SELECT * INTO current_limit FROM public.backend_rate_limits
  WHERE user_id = p_user_id AND action = p_action
  FOR UPDATE;

  IF current_limit.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN
    UPDATE public.backend_rate_limits SET window_started_at = now(), request_count = 1
    WHERE user_id = p_user_id AND action = p_action;
    RETURN true;
  END IF;

  IF current_limit.request_count >= p_max_requests THEN RETURN false; END IF;
  UPDATE public.backend_rate_limits SET request_count = request_count + 1
  WHERE user_id = p_user_id AND action = p_action;
  RETURN true;
END;
$$;


--
-- Name: delete_learning_question(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_learning_question(p_user_id uuid, p_question_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.learning_reward_events e JOIN public.kingdom_state k
    ON k.user_id=e.user_id AND k.generation=e.generation
    WHERE e.user_id=p_user_id AND e.question_id=p_question_id AND e.collected_at IS NULL) THEN
    RAISE EXCEPTION 'Collect your Resources before deleting this question.';
  END IF;
  DELETE FROM public.questions WHERE id=p_question_id AND user_id=p_user_id AND answered_at IS NOT NULL;
END $$;


--
-- Name: delete_user_gemini_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_gemini_key(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  DELETE FROM public.user_ai_settings
  WHERE user_id = p_user_id;
END;
$$;


--
-- Name: find_kingdom_command(uuid, uuid, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: finish_graph_question(uuid, uuid, bigint, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_graph_question(p_user_id uuid, p_lease uuid, p_generation bigint, p_node text, p_dimension text, p_reasoning text, p_question jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state; graph jsonb; n jsonb; q public.questions;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    THEN RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.'; END IF;
  graph:=public.load_learning_graph(p_user_id);
  SELECT node INTO n FROM jsonb_array_elements(graph->'nodes') node WHERE node->>'id'=p_node;
  IF n IS NULL OR NOT public.graph_target_available(n,graph->'progress',p_dimension,p_reasoning)
    OR k.issuance_topic IS DISTINCT FROM n->>'topic' THEN RAISE EXCEPTION 'Invalid graph target.'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before continuing.'; END IF;
  PERFORM public.validate_prepared_question(p_user_id,n,graph->'progress',p_question,p_dimension);
  q:=public.insert_graph_question(p_user_id,p_generation,n,p_dimension,p_reasoning,p_question);
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;


--
-- Name: finish_question_generation(uuid, uuid, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_question_generation(p_user_id uuid, p_lease uuid, p_generation bigint, p_question jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts; dependency public.concepts;
  weights jsonb; required jsonb; name text; target text;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before generating another question.'; END IF;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now() THEN
    RAISE EXCEPTION 'Question generation expired or progress was reset. Please retry.';
  END IF;
  IF k.issuance_topic IS NOT NULL AND p_question->>'topic' IS DISTINCT FROM k.issuance_topic THEN
    RAISE EXCEPTION 'Question must belong to the selected topic.';
  END IF;
  c:=public.resolve_reward_concept(p_user_id,p_question->>'concept');
  target:=COALESCE(c.canonical_name,trim(p_question->>'concept'));
  IF target IS NULL OR target='' THEN RAISE EXCEPTION 'A target concept is required.'; END IF;
  weights:=public.normalize_topic_weights(CASE WHEN c.id IS NOT NULL THEN c.topics ELSE p_question->'topic_weights' END,p_question->>'topic');
  IF COALESCE((weights->>(p_question->>'topic'))::numeric,0)<=0 THEN
    RAISE EXCEPTION 'Concept must belong to the selected topic.';
  END IF;
  required:=COALESCE(p_question->'required_concepts','[]'::jsonb)||COALESCE(c.prerequisites,'[]'::jsonb);
  IF jsonb_typeof(required)<>'array' THEN RAISE EXCEPTION 'Invalid prerequisites.'; END IF;
  FOR name IN SELECT DISTINCT value FROM jsonb_array_elements_text(required) LOOP
    dependency:=public.resolve_reward_concept(p_user_id,name);
    IF dependency.id IS NOT NULL AND dependency.id=c.id AND NOT COALESCE((p_question->>'is_boss_question')::boolean,false) THEN CONTINUE; END IF;
    IF dependency.id IS NULL OR NOT (dependency.mastery IN ('proficient','mastered') OR
      (dependency.is_atomic AND jsonb_array_length(dependency.prerequisites)=0)) THEN
      RAISE EXCEPTION 'Unmet prerequisites: %',name;
    END IF;
  END LOOP;
  IF COALESCE((p_question->>'is_boss_question')::boolean,false) AND jsonb_array_length(required)=0 THEN
    RAISE EXCEPTION 'A boss question requires verified prerequisites.';
  END IF;
  IF NOT COALESCE((p_question->>'is_boss_question')::boolean,false) AND (c.id IS NULL OR c.mastery='unseen')
    AND p_question->>'reasoning_complexity' IS DISTINCT FROM 'directInference' THEN RAISE EXCEPTION 'An unseen target requires directInference.'; END IF;
  -- Retire the previous question only after a replacement has passed validation.
  UPDATE public.questions SET expires_at=now()
    WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,angle_fit,question_text,options,correct_index,
    explanation,suggested_questions,concept,concept_definition,reasoning_complexity,is_boss_question,
    required_concepts,prerequisites_met,expires_at,trusted_issuance,generation,topic_weights)
  VALUES(p_user_id,p_question->>'topic',p_question->>'subtopic',p_question->>'angle',p_question->>'angle_fit',
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,
    p_question->>'explanation',p_question->'suggested_questions',target,p_question->>'concept_definition',
    p_question->>'reasoning_complexity',(p_question->>'is_boss_question')::boolean,p_question->'required_concepts',
    true,now()+interval '30 minutes',true,k.generation,weights) RETURNING * INTO q;
  UPDATE public.kingdom_state SET issuance_topic=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN to_jsonb(q);
END $$;


--
-- Name: get_progression_goal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_progression_goal(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object('goal', progression_goal, 'revision', goal_revision)
  FROM public.kingdom_state WHERE user_id = p_user_id;
$$;


--
-- Name: get_question_history(integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_question_history(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(q)-ARRAY['trusted_issuance','generation']), '[]'::jsonb) FROM (
    SELECT * FROM public.questions WHERE user_id=auth.uid() AND answered_at IS NOT NULL
    ORDER BY created_at DESC,id DESC LIMIT LEAST(GREATEST(p_limit,1),100) OFFSET LEAST(GREATEST(p_offset,0),100000)
  ) q;
$$;


--
-- Name: get_user_gemini_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_gemini_key(p_user_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets AS secret
  JOIN public.user_ai_settings AS settings ON settings.gemini_secret_id = secret.id
  WHERE settings.user_id = p_user_id;
$$;


--
-- Name: graph_ancestors(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_ancestors(p_node text, p_nodes jsonb) RETURNS text[]
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE ancestors text[]; cyclic boolean;
BEGIN
  WITH RECURSIVE walk(id,path,cycle) AS (
    SELECT p_node,ARRAY[p_node],false
    UNION ALL
    SELECT edge->>'nodeId',walk.path||(edge->>'nodeId'),edge->>'nodeId'=ANY(walk.path)
    FROM walk JOIN LATERAL (SELECT node FROM jsonb_array_elements(p_nodes) node WHERE node->>'id'=walk.id) found ON true
    CROSS JOIN LATERAL jsonb_array_elements(found.node->'requires') edge WHERE NOT walk.cycle
  ) SELECT array_agg(DISTINCT id),bool_or(cycle) INTO ancestors,cyclic FROM walk;
  IF cyclic THEN RAISE EXCEPTION 'Graph contains a cycle.'; END IF;
  RETURN ancestors;
END $$;


--
-- Name: learning_graphs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_graphs (
    user_id uuid NOT NULL,
    generation bigint NOT NULL,
    nodes jsonb DEFAULT '[]'::jsonb NOT NULL,
    progress jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT learning_graphs_nodes_check CHECK ((jsonb_typeof(nodes) = 'array'::text)),
    CONSTRAINT learning_graphs_progress_check CHECK ((jsonb_typeof(progress) = 'object'::text))
);


--
-- Name: graph_has_unanswered_boss(public.learning_graphs, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_has_unanswered_boss(g public.learning_graphs, p_topic text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(g.nodes) node WHERE node->>'kind'='boss' AND node->>'topic'=p_topic
    AND COALESCE((g.progress->(node->>'id')->'boss'->>'successes')::integer,0)<1);
$$;


--
-- Name: graph_node_available(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_node_available(p_node jsonb, p_progress jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT p_node->'expanded' IS DISTINCT FROM 'false'::jsonb AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_node->'requires') requirement
    WHERE EXISTS (SELECT 1 FROM unnest(ARRAY[
      'intuition','precision','boundaries','application','mechanism','alternatives','evidence',
      'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
    ]) step WHERE COALESCE((p_progress->(requirement->>'nodeId')->step->>'successes')::integer,0)<1));
$$;


--
-- Name: graph_node_mastery(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_node_mastery(n jsonb, p jsonb) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT CASE WHEN n->>'kind'='boss' THEN CASE
      WHEN COALESCE((p->'boss'->>'successes')::integer,0)>=1 THEN 'mastered' ELSE 'learning' END
    WHEN NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
      'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
    ]) dimension WHERE COALESCE((p->dimension->>'successes')::integer,0)<1)
      THEN CASE WHEN NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
        'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
      ]) complexity WHERE COALESCE((p->complexity->>'successes')::integer,0)<1) THEN 'mastered' ELSE 'proficient' END
    ELSE 'learning' END;
$$;


--
-- Name: graph_question_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_question_history(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT COALESCE(jsonb_agg(question_text),'[]') FROM (
    SELECT question_text FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL ORDER BY created_at DESC LIMIT 100
  ) recent;
$$;


--
-- Name: graph_target_available(jsonb, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.graph_target_available(p_node jsonb, p_progress jsonb, p_dimension text, p_reasoning text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT public.graph_node_available(p_node,p_progress) AND CASE p_node->>'kind'
    WHEN 'boss' THEN p_dimension IS NULL AND p_reasoning IS NULL
      AND COALESCE((p_progress->(p_node->>'id')->'boss'->>'successes')::integer,0)<1
    WHEN 'concept' THEN
      (p_reasoning IS NULL AND p_dimension=ANY(ARRAY[
        'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
      ])) OR
      (p_dimension IS NULL AND p_reasoning=ANY(ARRAY[
        'directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation'
      ]) AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[
        'intuition','precision','boundaries','application','mechanism','alternatives','evidence'
      ]) dimension WHERE COALESCE((p_progress->(p_node->>'id')->dimension->>'successes')::integer,0)<1))
    ELSE false END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.game_stats(user_id) VALUES(new.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.kingdom_state(user_id) VALUES(new.id) ON CONFLICT DO NOTHING;
  RETURN new;
END $$;


--
-- Name: insert_graph_question(uuid, bigint, jsonb, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_graph_question(p_user_id uuid, p_generation bigint, n jsonb, p_dimension text, p_reasoning text, p_question jsonb) RETURNS public.questions
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE q public.questions; dependencies jsonb; complexity text;
BEGIN
  SELECT COALESCE(jsonb_agg(parent.body->>'title'),'[]') INTO dependencies FROM jsonb_array_elements(n->'requires') requirement
    JOIN public.shared_concepts parent ON parent.id=requirement->>'nodeId';
  complexity:=CASE WHEN n->>'kind'='boss' THEN 'synthesis' WHEN p_reasoning IS NOT NULL THEN p_reasoning
    WHEN p_dimension='intuition' THEN 'directInference' WHEN p_dimension='mechanism' THEN 'composition'
    WHEN p_dimension='application' THEN 'transfer' WHEN p_dimension IN ('boundaries','alternatives') THEN 'counterfactual'
    WHEN p_dimension='precision' THEN 'derivation' ELSE 'discrimination' END;
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  INSERT INTO public.questions(user_id,topic,subtopic,angle,question_text,options,correct_index,explanation,suggested_questions,
    concept,concept_definition,reasoning_complexity,is_boss_question,required_concepts,prerequisites_met,
    expires_at,trusted_issuance,generation,topic_weights,graph_node,graph_dimension,knowledge_entry,option_feedback)
  VALUES(p_user_id,n->>'topic',COALESCE(n->'context'->>'subtopic',n->>'title'),COALESCE(n->'context'->>'angle',p_dimension,p_reasoning,'boss'),
    p_question->>'question_text',p_question->'options',(p_question->>'correct_index')::integer,p_question->>'explanation',
    COALESCE(p_question->'suggested_questions','[]'),n->>'title',n->>'definition',complexity,n->>'kind'='boss',dependencies,true,
    now()+interval '30 minutes',true,p_generation,jsonb_build_object(n->>'topic',1),n->>'id',p_dimension,
    CASE WHEN p_dimension IS NOT NULL THEN n->'dimensions'->>p_dimension END,p_question->'option_feedback') RETURNING * INTO q;
  RETURN q;
END $$;


--
-- Name: insert_shared_concept(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_shared_concept(n jsonb, p_embeddings jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  INSERT INTO public.shared_concepts(id,identity,body)
    VALUES(n->>'id',public.concept_identity(n->>'title'),n-'requires');
END $$;


--
-- Name: kingdom_command_context(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kingdom_command_context(p_user_id uuid, p_generation bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id;
  IF k.generation <> p_generation THEN RAISE EXCEPTION 'Progress was reset; refresh your Castle.'; END IF;
  RETURN public.kingdom_snapshot(p_user_id) || jsonb_build_object('battle_clock',k.battle_clock,'server_now',clock_timestamp());
END $$;


--
-- Name: kingdom_snapshot(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kingdom_snapshot(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object('state',state,'revision',revision,'generation',generation)
  FROM public.kingdom_state WHERE user_id=p_user_id;
$$;


--
-- Name: learning_value_score(boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_value_score(p_correct boolean, p_input jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE t jsonb:=public.learning_value_tuning(); known boolean; first_success boolean; due boolean;
  practice boolean; low_value boolean; factors jsonb; raw numeric; capped numeric; total integer;
BEGIN
  known:=(p_input->>'metadataKnown')::boolean AND t->'reasoning' ? (p_input->>'reasoning');
  first_success:=known AND NOT (p_input->>'atomic')::boolean AND p_correct AND (p_input->>'successes')::integer=0;
  due:=known AND NOT (p_input->>'atomic')::boolean AND (p_input->>'successes')::integer>0
    AND COALESCE((p_input->>'nextDueAt')::timestamptz<=(p_input->>'answeredAt')::timestamptz,false);
  practice:=NOT known OR (p_input->>'atomic')::boolean OR (NOT due AND
    (p_input->>'preMastery'='mastered' OR (p_input->>'axisSuccesses')::integer>=(t->>'axisSuccessLimit')::integer));
  low_value:=NOT p_correct OR practice;
  factors:=jsonb_build_object(
    'correctness',CASE WHEN p_correct THEN 1 ELSE (t->>'incorrect')::numeric END,
    'reasoning',CASE WHEN known THEN (t->'reasoning'->>(p_input->>'reasoning'))::numeric ELSE 1 END,
    'novelty',CASE WHEN first_success THEN (t->>'firstSuccess')::numeric ELSE 1 END,
    'practice',CASE WHEN practice THEN (t->>'masteredPractice')::numeric ELSE 1 END,
    'review',CASE WHEN due THEN (t->>'dueReview')::numeric ELSE 1 END,
    'boss',CASE WHEN known AND NOT (p_input->>'atomic')::boolean AND (p_input->>'boss')::boolean AND p_correct THEN (t->>'boss')::numeric ELSE 1 END,
    'repetition',CASE WHEN low_value THEN COALESCE((t->'lowValueFactors'->>(p_input->>'lowValueAttempts')::integer)::numeric,0) ELSE 1 END);
  raw:=(t->>'base')::numeric*(factors->>'correctness')::numeric*(factors->>'reasoning')::numeric
    *(factors->>'novelty')::numeric*(factors->>'practice')::numeric*(factors->>'review')::numeric*(factors->>'boss')::numeric;
  capped:=LEAST(raw,(t->>CASE WHEN low_value THEN 'lowValueMaximum' ELSE 'maximum' END)::numeric)*(factors->>'repetition')::numeric;
  total:=GREATEST((t->>'minimum')::integer,LEAST((t->>'maximum')::integer,round(capped)::integer));
  RETURN jsonb_build_object('total',total,'calculation',jsonb_build_object('inputs',p_input,
    'limits',jsonb_build_object('minimum',t->'minimum','maximum',t->'maximum','lowValueMaximum',t->'lowValueMaximum','lowValueFactors',t->'lowValueFactors'),
    'base',t->'base','firstSuccess',first_success,'due',due,'lowValue',low_value,'factors',factors,
    'raw',raw,'capped',capped,'rounding','nearest-half-up'));
END $$;


--
-- Name: learning_value_tuning(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_value_tuning() RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ SELECT '{"base":20,"incorrect":0.2,"reasoning":{"directInference":1,"composition":1.15,"discrimination":1.2,"transfer":1.3,"counterfactual":1.4,"synthesis":1.55,"derivation":1.75},"firstSuccess":1.25,"masteredPractice":0.3,"dueReview":1.2,"boss":4,"minimum":1,"maximum":175,"lowValueMaximum":10,"lowValueFactors":[1,0.5,0.25],"axisSuccessLimit":3,"reviewDays":[1,3,7,14,30],"demoFallbackCorrect":10,"demoFallbackIncorrect":3}'::jsonb $$;


--
-- Name: concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concepts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    canonical_name text NOT NULL,
    definition text NOT NULL,
    aliases jsonb DEFAULT '[]'::jsonb NOT NULL,
    topics jsonb DEFAULT '{}'::jsonb NOT NULL,
    prerequisites jsonb DEFAULT '[]'::jsonb NOT NULL,
    mastery text DEFAULT 'unseen'::text NOT NULL,
    reasoning_track jsonb DEFAULT '{"transfer": 0, "synthesis": 0, "derivation": 0, "composition": 0, "counterfactual": 0, "discrimination": 0, "directInference": 0}'::jsonb NOT NULL,
    last_asked timestamp with time zone,
    is_atomic boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    reward_attempts integer DEFAULT 0 NOT NULL,
    reward_successes integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    last_success_at timestamp with time zone,
    next_due_at timestamp with time zone,
    review_step integer DEFAULT 0 NOT NULL
);


--
-- Name: library_eligible_concepts(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.library_eligible_concepts(p_user_id uuid) RETURNS SETOF public.concepts
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: load_learning_graph(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.load_learning_graph(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object('generation',k.generation,'nodes',COALESCE((
      SELECT jsonb_agg(node ORDER BY node->>'kind',node->>'id') FROM (
        SELECT public.shared_concept_node(r.concept_id) node
        FROM public.learning_graph_concepts r
        WHERE r.user_id=p_user_id AND r.generation=k.generation
        UNION ALL SELECT value FROM jsonb_array_elements(COALESCE(g.nodes,'[]'))
      ) graph_nodes
    ),'[]'::jsonb),'progress',COALESCE(g.progress,'{}'::jsonb))
  FROM public.kingdom_state k
  LEFT JOIN public.learning_graphs g ON g.user_id=k.user_id AND g.generation=k.generation
  WHERE k.user_id=p_user_id;
$$;


--
-- Name: mapped_concept_id(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mapped_concept_id(p_mapping jsonb, p_id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT COALESCE(p_mapping->p_id->>'id',p_id);
$$;


--
-- Name: merge_generated_nodes(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_generated_nodes(existing jsonb, patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE merged jsonb;
BEGIN
  IF jsonb_typeof(patch) IS DISTINCT FROM 'array' OR jsonb_array_length(patch) NOT BETWEEN 1 AND 129
    OR jsonb_array_length(patch)<>(SELECT count(DISTINCT n->>'id') FROM jsonb_array_elements(patch) n)
    THEN RAISE EXCEPTION 'Invalid generated node patch.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(existing) old JOIN jsonb_array_elements(patch) n ON n->>'id'=old->>'id'
    WHERE old->'expanded' IS DISTINCT FROM 'false'::jsonb
      OR (old-'dimensions'-'expanded') IS DISTINCT FROM (n-'dimensions'-'expanded'))
    THEN RAISE EXCEPTION 'Only unfinished concept dimensions can be filled; preserve their identity and dependencies.'; END IF;
  SELECT COALESCE(jsonb_agg(old),'[]')||patch INTO merged FROM jsonb_array_elements(existing) old
    WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(patch) n WHERE n->>'id'=old->>'id');
  IF jsonb_array_length(merged)<>(SELECT count(DISTINCT lower(regexp_replace(n->>'title','[^[:alnum:]]','','g')))
      FROM jsonb_array_elements(merged) n)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  RETURN merged;
END $$;


--
-- Name: next_graph_progress(jsonb, boolean, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_graph_progress(p jsonb, correct boolean, knowledge text, question text, stamp timestamp with time zone) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  WITH state AS (SELECT COALESCE(p,'{"attempts":0,"successes":0}') AS p), values AS (
    SELECT p,(p->>'successes')::integer successes,COALESCE((p->>'reviewStep')::integer,0) old_step,
      (p->>'successes')::integer>=1 AND COALESCE((p->>'nextReviewAt')::timestamptz,
        (p->>'lastSuccessAt')::timestamptz+interval '1 day')<=stamp AS due FROM state), review AS (
    SELECT *,CASE WHEN due THEN CASE WHEN correct THEN LEAST(old_step+1,4) ELSE 0 END ELSE old_step END step FROM values)
  SELECT p||jsonb_build_object('attempts',(p->>'attempts')::integer+1,'lastAttemptAt',stamp,'lastCorrect',correct)
    ||CASE WHEN correct THEN jsonb_build_object(
      'creditedQuestions',COALESCE(p->'creditedQuestions','[]')||jsonb_build_array(md5(lower(regexp_replace(question,'[^a-zA-Z0-9]','','g')))),
      'successes',successes+1,'entry',knowledge,'firstSuccessAt',COALESCE(p->>'firstSuccessAt',stamp::text),'lastSuccessAt',stamp,
      'reviewStep',step,'nextReviewAt',stamp+(ARRAY[1,3,7,14,30])[step+1]*interval '1 day')
      ||CASE WHEN due THEN jsonb_build_object('retainedAt',stamp) ELSE '{}'::jsonb END
    WHEN due THEN jsonb_build_object('reviewStep',0,'nextReviewAt',stamp+interval '10 minutes') ELSE '{}'::jsonb END
  FROM review;
$$;


--
-- Name: normalize_topic_weights(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_topic_weights(p_weights jsonb, p_fallback text) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_fallback) THEN
    RAISE EXCEPTION 'Unsupported reward topic.';
  END IF;
  WITH usable AS (
    SELECT r.topic, CASE WHEN jsonb_typeof(p_weights->r.topic)='number'
      THEN (p_weights->>r.topic)::numeric ELSE 0 END AS weight FROM public.resource_topics() r
  ), valid AS (SELECT * FROM usable WHERE weight>0 AND weight<=1.7976931348623157e308)
  SELECT jsonb_object_agg(topic,weight/(SELECT sum(weight) FROM valid)) INTO result FROM valid;
  RETURN COALESCE(result,jsonb_build_object(p_fallback,1));
END $$;


--
-- Name: pending_learning_reward(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pending_learning_reward(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT to_jsonb(q)||jsonb_build_object('reward',e.reward) FROM public.learning_reward_events e
  JOIN public.kingdom_state k ON k.user_id=e.user_id AND k.generation=e.generation
  JOIN public.questions q ON q.id=e.question_id AND q.user_id=e.user_id
  WHERE e.user_id=p_user_id AND e.collected_at IS NULL ORDER BY q.created_at LIMIT 1;
$$;


--
-- Name: persist_shared_concepts(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.persist_shared_concepts(p_nodes jsonb, p_embeddings jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE mapping jsonb;
BEGIN
  PERFORM public.validate_shared_patch(p_nodes,p_embeddings);
  mapping:=public.save_shared_concept_bodies(p_nodes,p_embeddings);
  PERFORM public.save_shared_concept_edges(p_nodes,mapping);
  PERFORM public.assert_shared_concepts_acyclic();
  RETURN mapping;
END $$;


--
-- Name: protect_learning_reward(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_learning_reward() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF (to_jsonb(NEW)-'collected_at') IS DISTINCT FROM (to_jsonb(OLD)-'collected_at')
    OR (OLD.collected_at IS NOT NULL AND NEW.collected_at IS DISTINCT FROM OLD.collected_at) THEN
    RAISE EXCEPTION 'Reward obligations are immutable.';
  END IF;
  RETURN NEW;
END $$;


--
-- Name: protect_question_weights(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_question_weights() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.topic_weights IS DISTINCT FROM OLD.topic_weights THEN RAISE EXCEPTION 'Issued reward weights are immutable.'; END IF;
  RETURN NEW;
END $$;


--
-- Name: reconcile_library_concept_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_library_concept_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  PERFORM public.reconcile_towers(CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END);
  IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN PERFORM public.reconcile_towers(OLD.user_id); END IF;
  RETURN NULL;
END $$;


--
-- Name: reconcile_towers(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_towers(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: record_learning_reward_answer(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_learning_reward_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE; q public.questions%ROWTYPE; c public.concepts;
  graph_progress jsonb; step_progress jsonb; progress_key text; previous public.learning_reward_events%ROWTYPE; budget public.learning_reward_budget%ROWTYPE;
  result jsonb; score jsonb; breakdown jsonb; input jsonb; t jsonb:=public.learning_value_tuning();
  answer_time timestamptz; correct boolean; known boolean; atomic boolean; successes integer; step integer; due boolean;
BEGIN
  IF p_selected_index IS NULL OR p_selected_index NOT BETWEEN 0 AND 3 THEN RAISE EXCEPTION 'Invalid answer.'; END IF;
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF NOT q.trusted_issuance OR q.generation IS DISTINCT FROM k.generation OR q.expires_at IS NULL OR NOT q.prerequisites_met
    THEN RAISE EXCEPTION 'Question has expired'; END IF;
  SELECT * INTO previous FROM public.learning_reward_events WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
  IF FOUND THEN
    IF previous.selected_index<>p_selected_index THEN RAISE EXCEPTION 'Question has already been answered with a different selection'; END IF;
    RETURN jsonb_build_object('question',to_jsonb(q)||jsonb_build_object('reward',previous.reward),
      'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id),
      'collected',previous.collected_at IS NOT NULL,'reward',previous.reward,'kingdom',public.kingdom_snapshot(p_user_id));
  END IF;
  answer_time:=clock_timestamp();
  IF q.expires_at<=answer_time THEN RAISE EXCEPTION 'Question has expired'; END IF;
  IF public.pending_learning_reward(p_user_id) IS NOT NULL THEN RAISE EXCEPTION 'Collect your Resources before answering another question.'; END IF;
  c:=public.resolve_reward_concept(p_user_id,q.concept);
  IF c.id IS NOT NULL THEN SELECT * INTO c FROM public.concepts WHERE id=c.id FOR UPDATE; END IF;
  known:=(c.id IS NOT NULL OR (NULLIF(trim(q.concept),'') IS NOT NULL AND NULLIF(trim(q.concept_definition),'') IS NOT NULL))
    AND t->'reasoning' ? q.reasoning_complexity;
  known:=COALESCE(known,false);
  atomic:=COALESCE(c.is_atomic,false);
  successes:=GREATEST(COALESCE(c.reward_successes,0),CASE WHEN NOT atomic AND c.id IS NOT NULL AND
    (c.mastery<>'unseen' OR EXISTS (SELECT 1 FROM jsonb_each_text(c.reasoning_track) value WHERE value.value::integer>0)) THEN 1 ELSE 0 END);
  correct:=p_selected_index=q.correct_index;
  INSERT INTO public.learning_reward_budget(user_id,generation,day) VALUES(p_user_id,k.generation,(answer_time AT TIME ZONE 'UTC')::date)
    ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT budget FROM public.learning_reward_budget WHERE user_id=p_user_id FOR UPDATE;
  IF budget.generation<>k.generation OR budget.day<>(answer_time AT TIME ZONE 'UTC')::date THEN
    budget.attempts:=0;
    UPDATE public.learning_reward_budget SET generation=k.generation,day=(answer_time AT TIME ZONE 'UTC')::date,attempts=0 WHERE user_id=p_user_id;
  END IF;
  input:=jsonb_build_object('canonicalConcept',COALESCE(c.canonical_name,q.concept),'metadataKnown',known,
    'preMastery',COALESCE(c.mastery,'unseen'),'atomic',atomic,'successes',successes,
    'axisSuccesses',COALESCE((c.reasoning_track->>q.reasoning_complexity)::integer,0),
    'nextDueAt',c.next_due_at,'reasoning',COALESCE(q.reasoning_complexity,''),'boss',COALESCE(q.is_boss_question,false),
    'lowValueAttempts',budget.attempts,'answeredAt',answer_time);
  IF q.graph_node IS NOT NULL THEN
    SELECT progress INTO graph_progress FROM public.learning_graphs WHERE user_id=p_user_id;
    progress_key:=CASE WHEN q.is_boss_question THEN 'boss' ELSE COALESCE(q.graph_dimension,q.reasoning_complexity) END;
    step_progress:=COALESCE(graph_progress->q.graph_node->progress_key,'{}');
    input:=input||jsonb_build_object('axisSuccesses',COALESCE((step_progress->>'successes')::integer,0),
      'nextDueAt',CASE WHEN COALESCE((step_progress->>'successes')::integer,0)>=1
        THEN COALESCE((step_progress->>'nextReviewAt')::timestamptz,(step_progress->>'lastSuccessAt')::timestamptz+interval '1 day') ELSE NULL END);
  END IF;
  score:=public.learning_value_score(correct,input);
  breakdown:=public.castle_learning_reward(q.id,correct,(score->>'total')::integer,q.topic_weights,q.topic)
    ||jsonb_build_object('calculation',score->'calculation');
  IF c.id IS NOT NULL AND q.concept IS DISTINCT FROM c.canonical_name THEN
    UPDATE public.questions SET concept=c.canonical_name WHERE id=q.id;
  END IF;
  result:=public.score_question_internal(p_user_id,p_question_id,p_selected_index);
  c:=public.resolve_reward_concept(p_user_id,COALESCE(c.canonical_name,q.concept));
  IF c.id IS NOT NULL THEN
    step:=c.review_step;
    due:=(score->'calculation'->>'due')::boolean;
    IF atomic OR NOT known THEN c.next_due_at:=NULL; step:=0;
    ELSIF NOT correct THEN
      step:=0;
      c.next_due_at:=CASE WHEN successes>0 THEN answer_time+make_interval(days=>(t->'reviewDays'->>0)::integer) ELSE NULL END;
    ELSIF successes=0 OR c.next_due_at IS NULL OR due THEN
      step:=CASE WHEN due THEN LEAST(step+1,jsonb_array_length(t->'reviewDays')-1) ELSE 0 END;
      c.next_due_at:=answer_time+make_interval(days=>(t->'reviewDays'->>step)::integer);
    END IF;
    UPDATE public.concepts SET reward_attempts=reward_attempts+1,
      reward_successes=successes+CASE WHEN correct AND NOT atomic THEN 1 ELSE 0 END,
      last_attempt_at=answer_time,last_success_at=CASE WHEN correct AND NOT atomic THEN answer_time ELSE last_success_at END,
      next_due_at=c.next_due_at,review_step=step,
      mastery=CASE WHEN atomic THEN 'mastered' ELSE mastery END WHERE id=c.id;
  END IF;
  IF (score->'calculation'->>'lowValue')::boolean THEN
    UPDATE public.learning_reward_budget SET attempts=LEAST(attempts+1,jsonb_array_length(t->'lowValueFactors')) WHERE user_id=p_user_id;
  END IF;
  INSERT INTO public.learning_reward_events(user_id,question_id,generation,selected_index,topic,tokens,reward)
    VALUES(p_user_id,q.id,k.generation,p_selected_index,q.topic,(score->>'total')::integer,breakdown);
  RETURN result||jsonb_build_object('question',result->'question'||jsonb_build_object('reward',breakdown),
    'reward',breakdown,'collected',false,'kingdom',public.kingdom_snapshot(p_user_id));
END $$;


--
-- Name: record_question_answer(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_question_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE q public.questions; result jsonb; graph_result jsonb; stamp timestamptz:=now();
BEGIN
  PERFORM 1 FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO q FROM public.questions WHERE id=p_question_id AND user_id=p_user_id FOR UPDATE;
  result:=public.record_learning_reward_answer(p_user_id,p_question_id,p_selected_index);
  IF q.graph_node IS NULL THEN RETURN result; END IF;
  IF q.answered_at IS NOT NULL THEN RETURN result||jsonb_build_object('graph',public.load_learning_graph(p_user_id)); END IF;
  graph_result:=public.apply_graph_answer(p_user_id,q,q.correct_index=p_selected_index,stamp);
  RETURN result||graph_result||jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id));
END $$;


--
-- Name: recruitment_class(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recruitment_class(id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
SELECT CASE WHEN id IN ('militia','spearman','swordsman','royal-guard','champion') THEN 'melee'
 WHEN id IN ('slinger','archer','crossbowman','ranger','marksman') THEN 'ranged'
 WHEN id IN ('hatchling','forager','stinger','ravager','hive-guard') THEN 'swarm'
 WHEN id IN ('medic','herbalist','acolyte','priest','high-priest') THEN 'healer'
 WHEN id IN ('ballista','catapult','trebuchet','bombard','great-bombard') THEN 'siege' END;
$$;


--
-- Name: refresh_graph_bosses(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refresh_graph_bosses(nodes jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE boss jsonb; ancestors text[];
BEGIN
  FOR boss IN SELECT node FROM jsonb_array_elements(nodes) node WHERE node->>'kind'='boss' LOOP
    ancestors:=array_remove(public.graph_ancestors(boss->>'id',nodes),boss->>'id');
    SELECT jsonb_agg(CASE WHEN n->>'id'=ANY(ancestors) THEN (n-'requiredMasteryIds'-'prerequisiteConcepts')
      ||jsonb_build_object('topics',(SELECT jsonb_agg(DISTINCT tag)
        FROM jsonb_array_elements_text(COALESCE(n->'topics',jsonb_build_array(n->>'topic'))||jsonb_build_array(boss->>'topic')) tag))
      ELSE n-'requiredMasteryIds'-'prerequisiteConcepts' END) INTO nodes FROM jsonb_array_elements(nodes) n;
  END LOOP;
  RETURN nodes;
END $$;


--
-- Name: reserve_graph_question(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_graph_question(p_user_id uuid, n jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  UPDATE public.questions SET expires_at=now() WHERE user_id=p_user_id AND answered_at IS NULL AND expires_at>now();
  RETURN public.begin_question_generation(p_user_id,n->>'topic');
END $$;


--
-- Name: reserve_kingdom_command(uuid, uuid, bigint, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
  SELECT jsonb_agg(('x'||right(replace(gen_random_uuid()::text,'-',''),13))::bit(52)::bigint::numeric / 4503599627370496) INTO draws FROM generate_series(1,CASE WHEN p_command->>'type' IN ('forge','recruit') THEN 6 ELSE 3 END);
  INSERT INTO public.kingdom_command_reservations VALUES(p_user_id,p_request_id,p_generation,p_command,draws);
  RETURN jsonb_build_object('draws',draws);
END $$;


--
-- Name: reset_graph_on_generation_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_graph_on_generation_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF NEW.generation<>OLD.generation THEN
    DELETE FROM public.learning_graphs WHERE user_id=NEW.user_id;
  END IF;
  RETURN NULL;
END $$;


--
-- Name: reset_learning_progress(uuid, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_learning_progress(p_user_id uuid, p_generation bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation <> p_generation THEN RETURN jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id),
    'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id)); END IF;
  DELETE FROM public.questions WHERE user_id=p_user_id;
  DELETE FROM public.chat_messages WHERE user_id=p_user_id;
  DELETE FROM public.concepts WHERE user_id=p_user_id;
  DELETE FROM public.game_stats WHERE user_id=p_user_id;
  INSERT INTO public.game_stats(user_id) VALUES(p_user_id);
  UPDATE public.kingdom_state SET state=DEFAULT,generation=generation+1,revision=revision+1,
    progression_goal=DEFAULT,goal_revision=goal_revision+1,
    battle_clock=NULL,issuance_lease=NULL,issuance_until=NULL WHERE user_id=p_user_id;
  RETURN jsonb_build_object('kingdom',public.kingdom_snapshot(p_user_id),'stats',(SELECT to_jsonb(s) FROM public.game_stats s WHERE user_id=p_user_id));
END $$;


--
-- Name: resolve_reward_concept(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_reward_concept(p_user_id uuid, p_name text) RETURNS public.concepts
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c FROM public.concepts c WHERE c.user_id=p_user_id AND (
    lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.aliases) a(name)
      WHERE lower(regexp_replace(trim(a.name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))))
  ORDER BY (c.canonical_name=trim(p_name)) DESC,
    (lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))) DESC,
    c.canonical_name COLLATE "C"
  LIMIT 1;
$$;


--
-- Name: resource_topics(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resource_topics() RETURNS TABLE(topic text, key text, ord bigint)
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  SELECT * FROM unnest(
    ARRAY['Physics','Mathematics & Logic','Chemistry','Life','Computer Science','Earth & Space','Mind & Behavior','Society & History'],
    ARRAY['force','runes','reagents','essence','cores','astral','insight','influence']) WITH ORDINALITY;
$$;


--
-- Name: roster_unit_id(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.roster_unit_id(p_id text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
SELECT COALESCE(p_id IN ('militia','spearman','swordsman','royal-guard','champion','slinger','archer','crossbowman','ranger','marksman','hatchling','forager','stinger','ravager','hive-guard','medic','herbalist','acolyte','priest','high-priest','ballista','catapult','trebuchet','bombard','great-bombard'),false);
$$;


--
-- Name: save_generated_nodes(uuid, text, uuid, bigint, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_generated_nodes(p_user_id uuid, p_topic text, p_lease uuid, p_generation bigint, p_root text, p_nodes jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; root jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation OR k.issuance_lease IS DISTINCT FROM p_lease OR k.issuance_until<=now()
    OR k.issuance_topic IS DISTINCT FROM p_topic THEN RAISE EXCEPTION 'Generation expired or progress was reset. Please retry.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  SELECT value INTO root FROM jsonb_array_elements(p_nodes) WHERE value->>'id'=p_root;
  IF root->>'kind'='boss' AND public.graph_has_unanswered_boss(g,p_topic) THEN RETURN; END IF;
  PERFORM public.store_canonical_patch(p_user_id,p_topic,p_generation,p_root,p_nodes,'[]'::jsonb);
END $$;


--
-- Name: save_graph_expansion(uuid, text, jsonb, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_graph_expansion(p_user_id uuid, p_topic text, p_nodes jsonb, p_generation bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE k public.kingdom_state; g public.learning_graphs; boss jsonb; root text; embeddings jsonb;
BEGIN
  SELECT * INTO STRICT k FROM public.kingdom_state WHERE user_id=p_user_id FOR UPDATE;
  IF k.generation<>p_generation THEN RAISE EXCEPTION 'Progress was reset. Please reopen your graph.'; END IF;
  INSERT INTO public.learning_graphs(user_id,generation) VALUES(p_user_id,k.generation) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO STRICT g FROM public.learning_graphs WHERE user_id=p_user_id;
  SELECT value INTO boss FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='boss';
  IF boss IS NOT NULL AND public.graph_has_unanswered_boss(g,p_topic) THEN RETURN public.load_learning_graph(p_user_id); END IF;
  root:=COALESCE(boss->>'id',p_nodes->0->>'id');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nodeId',n->>'id','embedding',to_jsonb(array_fill(0.0::float8,ARRAY[768])))),'[]')
    INTO embeddings FROM jsonb_array_elements(p_nodes) n WHERE n->>'kind'='concept';
  PERFORM public.store_canonical_patch(p_user_id,p_topic,p_generation,root,p_nodes,embeddings);
  RETURN public.load_learning_graph(p_user_id);
END $$;


--
-- Name: save_shared_concept_bodies(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_shared_concept_bodies(p_nodes jsonb, p_embeddings jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE n jsonb; mapping jsonb:='{}';
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='concept'
    ORDER BY public.concept_identity(value->>'title') LOOP
    mapping:=mapping||jsonb_build_object(n->>'id',public.save_shared_concept_body(n,p_embeddings));
  END LOOP;
  RETURN mapping;
END $$;


--
-- Name: save_shared_concept_body(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_shared_concept_body(n jsonb, p_embeddings jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE current public.shared_concepts;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(public.concept_identity(n->>'title'),0));
  SELECT * INTO current FROM public.shared_concepts WHERE identity=public.concept_identity(n->>'title') FOR UPDATE;
  IF current.id IS NULL THEN
    PERFORM public.insert_shared_concept(n,p_embeddings);
    RETURN jsonb_build_object('id',n->>'id','inserted',true);
  END IF;
  IF current.id<>n->>'id' THEN RETURN jsonb_build_object('id',current.id,'inserted',false); END IF;
  IF current.body->'expanded'='false'::jsonb AND n->'expanded' IS DISTINCT FROM 'false'::jsonb
    THEN PERFORM public.complete_shared_concept(current,n); END IF;
  IF current.body->'expanded' IS DISTINCT FROM 'false'::jsonb
    AND (current.body-'topics') IS DISTINCT FROM ((n-'requires')-'topics')
    THEN RAISE EXCEPTION 'Only unfinished concepts can change.'; END IF;
  RETURN jsonb_build_object('id',current.id,'inserted',false);
END $$;


--
-- Name: save_shared_concept_edges(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_shared_concept_edges(p_nodes jsonb, p_mapping jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE n jsonb; r jsonb; owner text; parent text;
BEGIN
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) WHERE value->>'kind'='concept'
    AND COALESCE((p_mapping->(value->>'id')->>'inserted')::boolean,false) LOOP
    owner:=public.mapped_concept_id(p_mapping,n->>'id');
    FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
      parent:=public.mapped_concept_id(p_mapping,r->>'nodeId');
      IF NOT EXISTS (SELECT 1 FROM public.shared_concepts WHERE id=parent)
        THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
      INSERT INTO public.shared_concept_dependencies(concept_id,prerequisite_id) VALUES(owner,parent);
    END LOOP;
  END LOOP;
END $$;


--
-- Name: score_question_internal(uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.score_question_internal(p_user_id uuid, p_question_id uuid, p_selected_index integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  q public.questions%ROWTYPE;
  s public.game_stats%ROWTYPE;
  v_is_correct BOOLEAN;
  next_track JSONB;
  next_mastery TEXT;
  core_sum INTEGER;
  advanced_sum INTEGER;
BEGIN
  IF p_selected_index NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'selected_index must be between 0 and 3';
  END IF;

  SELECT * INTO q
  FROM public.questions
  WHERE id = p_question_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Question not found'; END IF;
  IF q.answered_at IS NOT NULL THEN RAISE EXCEPTION 'Question has already been answered'; END IF;
  IF q.expires_at IS NOT NULL AND q.expires_at < now() THEN RAISE EXCEPTION 'Question has expired'; END IF;

  v_is_correct := p_selected_index = q.correct_index;
  UPDATE public.questions
  SET selected_index = p_selected_index, is_correct = v_is_correct, answered_at = now()
  WHERE id = q.id;

  INSERT INTO public.game_stats (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.game_stats
  SET day_stamp = CURRENT_DATE, answers_today = 0, correct_today = 0, daily_claimed = false
  WHERE user_id = p_user_id AND day_stamp <> CURRENT_DATE;

  -- Compatibility activity counters only; legacy financial balances are frozen.
  UPDATE public.game_stats
  SET answers_today = answers_today + 1,
      correct_today = correct_today + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
      castle_xp = LEAST(100, castle_xp + CASE WHEN v_is_correct THEN 8 ELSE 2 END),
      war_pressure = LEAST(94, war_pressure + CASE WHEN v_is_correct THEN 2 ELSE 0.5 END),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING * INTO s;

  IF q.concept IS NOT NULL THEN
    INSERT INTO public.concepts (
      user_id, canonical_name, definition, aliases, topics, prerequisites,
      mastery, reasoning_track, is_atomic
    ) VALUES (
      p_user_id, q.concept, COALESCE(q.concept_definition, q.explanation), '[]'::jsonb,
      q.topic_weights, q.required_concepts, 'unseen',
      '{"directInference":0,"composition":0,"discrimination":0,"transfer":0,"counterfactual":0,"synthesis":0,"derivation":0}'::jsonb,
      false
    ) ON CONFLICT (user_id, canonical_name) DO NOTHING;
  END IF;

  IF v_is_correct AND q.concept IS NOT NULL AND q.reasoning_complexity IS NOT NULL THEN
    SELECT reasoning_track INTO next_track FROM public.concepts
    WHERE user_id = p_user_id AND canonical_name = q.concept
    FOR UPDATE;

    IF FOUND THEN
      next_track := jsonb_set(next_track, ARRAY[q.reasoning_complexity],
        to_jsonb(COALESCE((next_track ->> q.reasoning_complexity)::INTEGER, 0) + 1));
      core_sum := COALESCE((next_track ->> 'directInference')::INTEGER, 0)
        + COALESCE((next_track ->> 'composition')::INTEGER, 0)
        + COALESCE((next_track ->> 'discrimination')::INTEGER, 0);
      advanced_sum := COALESCE((next_track ->> 'transfer')::INTEGER, 0)
        + COALESCE((next_track ->> 'synthesis')::INTEGER, 0)
        + COALESCE((next_track ->> 'derivation')::INTEGER, 0);
      next_mastery := CASE
        WHEN (SELECT bool_and(COALESCE((next_track ->> item.key)::INTEGER, 0) >= 3)
              FROM unnest(ARRAY['directInference','composition','discrimination','transfer','counterfactual','synthesis','derivation']) AS item(key)) THEN 'mastered'
        WHEN COALESCE((next_track ->> 'directInference')::INTEGER, 0) >= 1
          AND COALESCE((next_track ->> 'composition')::INTEGER, 0) >= 1
          AND COALESCE((next_track ->> 'discrimination')::INTEGER, 0) >= 1
          AND core_sum >= 5 AND advanced_sum >= 3 THEN 'proficient'
        ELSE 'learning' END;
      UPDATE public.concepts SET reasoning_track = next_track, mastery = next_mastery,
        last_asked = now(), updated_at = now()
      WHERE user_id = p_user_id AND canonical_name = q.concept;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'question', to_jsonb(q) || jsonb_build_object('selected_index', p_selected_index, 'is_correct', v_is_correct, 'answered_at', now()),
    'stats', to_jsonb(s)
  );
END;
$$;


--
-- Name: set_progression_goal(uuid, jsonb, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_progression_goal(p_user_id uuid, p_goal jsonb, p_revision bigint) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: set_user_gemini_key(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_gemini_key(p_user_id uuid, p_api_key text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  existing_secret_id UUID;
  new_secret_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_api_key IS NULL OR length(trim(p_api_key)) < 10 OR length(p_api_key) > 512 THEN
    RAISE EXCEPTION 'Invalid Gemini API key';
  END IF;

  SELECT gemini_secret_id INTO existing_secret_id
  FROM public.user_ai_settings
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF existing_secret_id IS NULL THEN
    SELECT vault.create_secret(
      trim(p_api_key),
      'curious-y-gemini-' || p_user_id::TEXT,
      'User-owned Gemini API key for Curious-Y'
    ) INTO new_secret_id;

    INSERT INTO public.user_ai_settings (user_id, gemini_secret_id)
    VALUES (p_user_id, new_secret_id);
  ELSE
    PERFORM vault.update_secret(
      existing_secret_id,
      trim(p_api_key),
      'curious-y-gemini-' || p_user_id::TEXT,
      'User-owned Gemini API key for Curious-Y'
    );
    UPDATE public.user_ai_settings SET updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;


--
-- Name: shared_concept_closure(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shared_concept_closure(p_roots text[]) RETURNS TABLE(id text)
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  WITH RECURSIVE tree(id) AS (
    SELECT unnest(p_roots)
    UNION
    SELECT d.prerequisite_id FROM tree
    JOIN public.shared_concept_dependencies d ON d.concept_id=tree.id
  ) SELECT id FROM tree;
$$;


--
-- Name: shared_concept_node(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.shared_concept_node(p_id text) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
  SELECT c.body||jsonb_build_object('requires',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('nodeId',d.prerequisite_id) ORDER BY d.prerequisite_id)
    FROM public.shared_concept_dependencies d WHERE d.concept_id=c.id
  ),'[]'::jsonb)) FROM public.shared_concepts c WHERE c.id=p_id;
$$;


--
-- Name: store_canonical_patch(uuid, text, bigint, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_canonical_patch(p_user_id uuid, p_topic text, p_generation bigint, p_root text, p_nodes jsonb, p_embeddings jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE mapping jsonb; root jsonb; canonical jsonb; roots text[];
BEGIN
  mapping:=public.persist_shared_concepts(p_nodes,p_embeddings);
  SELECT value INTO root FROM jsonb_array_elements(p_nodes) WHERE value->>'id'=p_root;
  IF root IS NULL THEN RAISE EXCEPTION 'Invalid generation root or topic.'; END IF;
  canonical:=public.canonicalize_node_requirements(root,mapping);
  IF canonical->>'kind'='boss' THEN
    SELECT array_agg(r->>'nodeId') INTO roots FROM jsonb_array_elements(canonical->'requires') r;
    PERFORM public.attach_shared_tree(p_user_id,p_generation,COALESCE(roots,ARRAY[]::text[]),p_topic);
    UPDATE public.learning_graphs SET nodes=nodes||jsonb_build_array(canonical) WHERE user_id=p_user_id;
  ELSE
    PERFORM public.attach_shared_tree(p_user_id,p_generation,ARRAY[public.mapped_concept_id(mapping,p_root)],p_topic);
  END IF;
END $$;


--
-- Name: store_concept_embeddings(uuid, bigint, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.store_concept_embeddings(p_user_id uuid, p_generation bigint, p_nodes jsonb, p_embeddings jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
BEGIN
  IF jsonb_typeof(p_embeddings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_embeddings)<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(p_embeddings) item)
    THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_embeddings) item
    WHERE jsonb_typeof(item->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'embedding')<>768
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(item->'embedding') value WHERE jsonb_typeof(value) IS DISTINCT FROM 'number')
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node
        WHERE node->>'id'=item->>'nodeId' AND node->>'kind'='concept'))
    THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='concept'
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_embeddings) item WHERE item->>'nodeId'=node->>'id')
    AND NOT EXISTS (SELECT 1 FROM public.concept_embeddings saved
      WHERE saved.user_id=p_user_id AND saved.generation=p_generation AND saved.node_id=node->>'id'))
    THEN RAISE EXCEPTION 'Every new concept requires an embedding.'; END IF;
  INSERT INTO public.concept_embeddings(user_id,generation,node_id,embedding)
    SELECT p_user_id,p_generation,item->>'nodeId',((item->'embedding')::text)::extensions.vector
    FROM jsonb_array_elements(p_embeddings) item
    ON CONFLICT(user_id,generation,node_id) DO UPDATE SET embedding=EXCLUDED.embedding;
END $$;


--
-- Name: tower_contribution(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tower_contribution(p_weights jsonb) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: valid_economy_state(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_economy_state(s jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
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


--
-- Name: valid_forge_state(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_forge_state(s jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $$
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
    ELSE lvl=least(100,1+floor(n/10)) AND (s->>'castle')::numeric>=2 END;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;


--
-- Name: valid_forged_item(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_forged_item(i jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE b jsonb; t integer; n numeric; lo integer; hi integer;
BEGIN
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(i))<>5
    OR i-ARRAY['id','unitClass','slot','tier','bonus']<>'{}'::jsonb
    OR jsonb_typeof(i->'id') IS DISTINCT FROM 'string' OR i->>'id' !~ '^[a-zA-Z0-9-]{1,100}$'
    OR COALESCE(i->>'unitClass','') NOT IN ('melee','ranged','swarm','healer','siege')
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
    IF COALESCE(b->>'target','') NOT IN ('melee','ranged','swarm','healer','siege') THEN RETURN false; END IF;
    IF b->>'stat'='spawnSpeed' THEN lo:=(ARRAY[2,4,6,8,12])[t]; hi:=(ARRAY[6,10,14,17,20])[t];
    ELSE lo:=(ARRAY[5,10,15,20,30])[t]; hi:=(ARRAY[15,25,35,42,50])[t]; END IF;
  END IF;
  RETURN n=trunc(n) AND n BETWEEN lo AND hi;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $_$;


--
-- Name: valid_progression_goal(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_progression_goal(p_goal jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
SELECT p_goal IS NULL OR COALESCE(jsonb_typeof(p_goal)='object' AND CASE p_goal->>'type'
 WHEN 'recruit' THEN p_goal->>'id'='barracks' AND jsonb_typeof(p_goal->'count')='number'
  AND (p_goal->>'count')::numeric BETWEEN 1 AND 9007199254740991 AND trunc((p_goal->>'count')::numeric)=(p_goal->>'count')::numeric AND p_goal-ARRAY['type','id','count']='{}'::jsonb
 WHEN 'castle' THEN p_goal->>'level' IN ('2','3','4','5') AND jsonb_typeof(p_goal->'level')='number' AND p_goal-ARRAY['type','level']='{}'::jsonb
 WHEN 'building' THEN jsonb_typeof(p_goal->'level')='number' AND p_goal->>'id' IN ('barracks','academy','treasury','forge')
  AND p_goal->>'level' IN ('1','2','3','4','5') AND (p_goal->>'id'='treasury' OR p_goal->>'id'='academy' AND p_goal->>'level' IN ('1','2') OR p_goal->>'level'='1') AND p_goal-ARRAY['type','id','level']='{}'::jsonb
 ELSE false END,false);
$$;


--
-- Name: valid_recruitment_state(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.valid_recruitment_state(s jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO ''
    AS $_$
DECLARE r record; slot jsonb; seen text[]:='{}'; classes text[]:='{}'; family text;
BEGIN
  IF s->>'version' IS DISTINCT FROM '11' OR jsonb_typeof(s->'units') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'recruitCount') IS DISTINCT FROM 'object'
    OR jsonb_typeof(s->'armySlots') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'armySlots')<>5 THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(s->'recruitCount'))<>1 THEN RETURN false; END IF;
  FOR r IN SELECT key,value FROM jsonb_each(s->'recruitCount') LOOP
    IF r.key <> 'barracks'
      OR jsonb_typeof(r.value) IS DISTINCT FROM 'number' OR (r.value::text)::numeric NOT BETWEEN 0 AND 9007199254740991
      OR trunc((r.value::text)::numeric)<>(r.value::text)::numeric THEN RETURN false; END IF;
  END LOOP;
  FOR r IN SELECT * FROM jsonb_each(s->'units') LOOP
    family := public.recruitment_class(r.value->>'unitId');
    IF family IS NULL THEN RETURN false; END IF;

    IF r.key !~ '^[a-zA-Z0-9-]{1,110}$' OR NOT public.roster_unit_id(r.value->>'unitId')
      OR jsonb_typeof(r.value->'investedXP') IS DISTINCT FROM 'number'
      OR (r.value->>'investedXP')::numeric NOT BETWEEN 0 AND 9007199254740991
      OR trunc((r.value->>'investedXP')::numeric)<>(r.value->>'investedXP')::numeric
      OR jsonb_typeof(r.value->'locked') IS DISTINCT FROM 'boolean'
      OR (SELECT count(*) FROM jsonb_object_keys(r.value))<>3 THEN RETURN false; END IF;
  END LOOP;
  FOR slot IN SELECT * FROM jsonb_array_elements(s->'armySlots') LOOP
    IF slot<>'null'::jsonb THEN
      IF NOT (s->'units' ? (slot #>> '{}')) OR (slot #>> '{}')=ANY(seen) THEN RETURN false; END IF;
      seen:=array_append(seen,slot #>> '{}');
    END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $_$;


--
-- Name: validate_dimension_edges(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_dimension_edges(n jsonb, all_nodes jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE r jsonb; parent jsonb;
BEGIN
  IF jsonb_array_length(n->'requires')<>(SELECT count(DISTINCT item->>'nodeId') FROM jsonb_array_elements(n->'requires') item)
    THEN RAISE EXCEPTION 'Duplicate prerequisite.'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(n->'requires') LOOP
    SELECT node INTO parent FROM jsonb_array_elements(all_nodes) node WHERE node->>'id'=r->>'nodeId';
    IF r IS DISTINCT FROM jsonb_build_object('nodeId',r->>'nodeId') OR parent IS NULL OR parent->>'kind'<>'concept'
      THEN RAISE EXCEPTION 'Invalid prerequisite.'; END IF;
  END LOOP;
END $$;


--
-- Name: validate_dimension_expansion(text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_dimension_expansion(p_topic text, p_nodes jsonb, existing jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE n jsonb; boss jsonb; all_nodes jsonb:=existing||p_nodes; ancestors text[];
BEGIN
  IF (SELECT count(*) FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss')<>1
    THEN RAISE EXCEPTION 'An expansion needs exactly one boss.'; END IF;
  SELECT node INTO boss FROM jsonb_array_elements(p_nodes) node WHERE node->>'kind'='boss';
  IF boss->>'topic'<>p_topic THEN RAISE EXCEPTION 'Invalid boss topic.'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT node->>'id') FROM jsonb_array_elements(all_nodes) node)
    OR (SELECT count(*) FROM jsonb_array_elements(all_nodes))<>(SELECT count(DISTINCT lower(regexp_replace(node->>'title','[^[:alnum:]]','','g'))) FROM jsonb_array_elements(all_nodes) node)
    THEN RAISE EXCEPTION 'Reuse existing concept identities instead of duplicating them.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    PERFORM public.validate_dimension_node(n);
    PERFORM public.validate_dimension_edges(n,all_nodes);
  END LOOP;
  ancestors:=public.graph_ancestors(boss->>'id',all_nodes);
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_nodes) node WHERE NOT (node->>'id'=ANY(ancestors)))
    THEN RAISE EXCEPTION 'Every new concept must contribute to the boss.'; END IF;
  RETURN public.refresh_graph_bosses(all_nodes);
END $$;


--
-- Name: validate_dimension_node(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_dimension_node(n jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
DECLARE dimensions text[]:=ARRAY['intuition','precision','boundaries','application','mechanism','alternatives','evidence'];
BEGIN
  IF COALESCE(n->>'id','') !~ '^[a-z][a-z0-9-]{0,79}$'
    OR length(COALESCE(n->>'title','')) NOT BETWEEN 1 AND (CASE WHEN n->>'kind'='boss' THEN 1600 ELSE 200 END)
    OR length(COALESCE(n->>'definition','')) NOT BETWEEN 1 AND 1800
    OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=n->>'topic')
    OR COALESCE(n->>'kind','') NOT IN ('concept','boss') OR jsonb_typeof(n->'requires') IS DISTINCT FROM 'array'
    OR jsonb_typeof(n->'dimensions') IS DISTINCT FROM 'object' OR n ? 'preparation'
    THEN RAISE EXCEPTION 'Invalid graph node.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded'='false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>2
    OR EXISTS (SELECT 1 FROM unnest(ARRAY['intuition','precision']) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Unexpanded concepts need intuition and a formal definition.'; END IF;
  IF n->>'kind'='concept' AND n->'expanded' IS DISTINCT FROM 'false'::jsonb AND (
    (SELECT count(*) FROM jsonb_object_keys(n->'dimensions'))<>7
    OR EXISTS (SELECT 1 FROM unnest(dimensions) dimension
      WHERE jsonb_typeof(n->'dimensions'->dimension) IS DISTINCT FROM 'string'
        OR length(trim(n->'dimensions'->>dimension)) NOT BETWEEN 1 AND 1600))
    THEN RAISE EXCEPTION 'Expanded concepts need content for all seven dimensions.'; END IF;
  IF n->>'kind'='boss' AND (n->'expanded'='false'::jsonb OR n->'dimensions'<>'{}'::jsonb
    OR n->'bossQuestion'->>'question' IS DISTINCT FROM n->>'title'
    OR jsonb_typeof(n->'bossQuestion'->'correctAnswer') IS DISTINCT FROM 'object'
    OR jsonb_typeof(n->'bossQuestion'->'wrongAnswers') IS DISTINCT FROM 'array'
    OR jsonb_array_length(n->'bossQuestion'->'wrongAnswers')<>3)
    THEN RAISE EXCEPTION 'Boss needs its saved question and exactly three wrong answers.'; END IF;
END $_$;


--
-- Name: validate_generated_nodes(text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_generated_nodes(p_topic text, p_root text, patch jsonb, existing jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE merged jsonb:=public.merge_generated_nodes(existing,patch); root jsonb; n jsonb; ancestors text[];
BEGIN
  SELECT node INTO root FROM jsonb_array_elements(patch) node WHERE node->>'id'=p_root;
  IF root IS NULL OR NOT EXISTS (SELECT 1 FROM public.resource_topics() WHERE topic=p_topic)
    THEN RAISE EXCEPTION 'Invalid generation root or topic.'; END IF;
  IF root->>'kind'='boss' AND root->>'topic'<>p_topic
    THEN RAISE EXCEPTION 'Invalid boss topic.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(patch) LOOP
    PERFORM public.validate_dimension_node(n);
    PERFORM public.validate_dimension_edges(n,merged);
  END LOOP;
  ancestors:=public.graph_ancestors(p_root,merged);
  IF root->'expanded' IS DISTINCT FROM 'false'::jsonb AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(patch) node
    WHERE NOT (node->>'id'=ANY(ancestors)) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(existing) old WHERE old->>'id'=node->>'id'))
    THEN RAISE EXCEPTION 'Every generated concept must contribute to its root.'; END IF;
  RETURN public.refresh_graph_bosses(merged);
END $$;


--
-- Name: validate_prepared_question(uuid, jsonb, jsonb, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_prepared_question(p_user_id uuid, n jsonb, p_progress jsonb, p_question jsonb, p_dimension text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    OR (p_dimension IS NOT NULL AND p_question->>'knowledge_entry' IS DISTINCT FROM n->'dimensions'->>p_dimension)
    OR (p_dimension IS NULL AND p_question ? 'knowledge_entry')
    THEN RAISE EXCEPTION 'Invalid graph question.'; END IF;
  IF n->>'kind'='concept' AND EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='concept' AND EXISTS (SELECT 1 FROM jsonb_each(p_progress) node, LATERAL jsonb_each(node.value) step
    WHERE step.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned progress. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='boss' AND p_question->>'question_text' IS DISTINCT FROM n->>'title'
    THEN RAISE EXCEPTION 'Use the exact saved boss question.'; END IF;
END $$;


--
-- Name: validate_shared_patch(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_shared_patch(p_nodes jsonb, p_embeddings jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE n jsonb; item jsonb;
BEGIN
  IF jsonb_typeof(p_nodes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_nodes) NOT BETWEEN 1 AND 129
    OR jsonb_typeof(p_embeddings) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_nodes)<>(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_nodes))
    THEN RAISE EXCEPTION 'Invalid generated node patch.'; END IF;
  FOR n IN SELECT value FROM jsonb_array_elements(p_nodes) LOOP
    PERFORM public.validate_dimension_node(n);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(n->'requires') r
      WHERE jsonb_typeof(r) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(r))<>1
        OR COALESCE(r->>'nodeId','')='') THEN RAISE EXCEPTION 'Invalid shared concept prerequisite.'; END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_embeddings) LOOP
    IF jsonb_typeof(item->'embedding') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'embedding')<>768
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(item->'embedding') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'number')
      THEN RAISE EXCEPTION 'Invalid concept embeddings.'; END IF;
  END LOOP;
END $$;


--
-- Name: backend_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backend_rate_limits (
    user_id uuid NOT NULL,
    action text NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    request_count integer DEFAULT 0 NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: game_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_stats (
    user_id uuid NOT NULL,
    day_stamp date DEFAULT CURRENT_DATE NOT NULL,
    castle_level integer DEFAULT 1 NOT NULL,
    castle_xp integer DEFAULT 0 NOT NULL,
    gold integer DEFAULT 0 NOT NULL,
    gems integer DEFAULT 0 NOT NULL,
    keys integer DEFAULT 0 NOT NULL,
    knowledge jsonb DEFAULT '{"cores": 0, "force": 0, "runes": 0, "astral": 0, "essence": 0, "insight": 0, "reagents": 0, "influence": 0}'::jsonb NOT NULL,
    answers_today integer DEFAULT 0 NOT NULL,
    correct_today integer DEFAULT 0 NOT NULL,
    daily_claimed boolean DEFAULT false NOT NULL,
    streak integer DEFAULT 0 NOT NULL,
    trophies integer DEFAULT 1000 NOT NULL,
    war_pressure numeric DEFAULT 50 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_stats_answers_today_check CHECK ((answers_today >= 0)),
    CONSTRAINT game_stats_castle_level_check CHECK ((castle_level >= 1)),
    CONSTRAINT game_stats_castle_xp_check CHECK (((castle_xp >= 0) AND (castle_xp <= 100))),
    CONSTRAINT game_stats_correct_today_check CHECK ((correct_today >= 0)),
    CONSTRAINT game_stats_gems_check CHECK ((gems >= 0)),
    CONSTRAINT game_stats_gold_check CHECK ((gold >= 0)),
    CONSTRAINT game_stats_keys_check CHECK ((keys >= 0)),
    CONSTRAINT game_stats_streak_check CHECK ((streak >= 0)),
    CONSTRAINT game_stats_trophies_check CHECK ((trophies >= 0)),
    CONSTRAINT game_stats_war_pressure_check CHECK (((war_pressure >= (0)::numeric) AND (war_pressure <= (100)::numeric)))
);


--
-- Name: kingdom_command_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kingdom_command_reservations (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    generation bigint NOT NULL,
    command jsonb NOT NULL,
    draws jsonb NOT NULL
);


--
-- Name: kingdom_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kingdom_commands (
    user_id uuid NOT NULL,
    request_id uuid NOT NULL,
    generation bigint NOT NULL,
    command jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    result jsonb
);


--
-- Name: kingdom_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kingdom_state (
    user_id uuid NOT NULL,
    state jsonb DEFAULT '{"food": 16, "gold": 0, "forge": {"count": 0, "pending": null, "equipped": {}}, "metal": 24, "units": {}, "battle": null, "castle": 1, "tokens": {"Life": 0, "Physics": 0, "Chemistry": 0, "Earth & Space": 0, "Mind & Behavior": 0, "Computer Science": 0, "Society & History": 0, "Mathematics & Logic": 0}, "towers": {"rule": "earned-proficiency-v1", "points": {"cores": 0, "force": 0, "runes": 0, "astral": 0, "essence": 0, "insight": 0, "reagents": 0, "influence": 0}}, "cleared": 0, "tribute": {"day": "", "paid": 0, "claimed": false, "correct": false, "territories": 0}, "version": 11, "doctrine": "balanced", "rewarded": [], "armySlots": [null, null, null, null, null], "buildings": {"farm": 0, "forge": 0, "range": 0, "market": 0, "stable": 0, "academy": 0, "smelter": 0, "barracks": 0, "treasury": 0, "workshop": 0}, "discovered": [], "lastResult": null, "production": {"foodDay": "", "metalAt": "1970-01-01T00:00:00.000Z", "metalStored": 0}, "lifetimeGold": 0, "recruitCount": {"barracks": 0}}'::jsonb NOT NULL,
    revision bigint DEFAULT 0 NOT NULL,
    generation bigint DEFAULT 0 NOT NULL,
    battle_clock timestamp with time zone,
    issuance_lease uuid,
    issuance_until timestamp with time zone,
    progression_goal jsonb DEFAULT '{"id": "barracks", "type": "building", "level": 1}'::jsonb,
    goal_revision bigint DEFAULT 0 NOT NULL,
    issuance_topic text,
    CONSTRAINT kingdom_state_goal_revision_check CHECK ((goal_revision >= 0)),
    CONSTRAINT kingdom_state_state_check CHECK ((jsonb_typeof(state) = 'object'::text)),
    CONSTRAINT valid_account_goal CHECK (public.valid_progression_goal(progression_goal))
);


--
-- Name: learning_graph_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_graph_concepts (
    user_id uuid NOT NULL,
    generation bigint NOT NULL,
    concept_id text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: learning_reward_budget; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_reward_budget (
    user_id uuid NOT NULL,
    generation bigint NOT NULL,
    day date NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT learning_reward_budget_attempts_check CHECK ((attempts >= 0))
);


--
-- Name: learning_reward_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_reward_events (
    user_id uuid NOT NULL,
    question_id uuid NOT NULL,
    generation bigint NOT NULL,
    selected_index integer NOT NULL,
    topic text NOT NULL,
    tokens integer NOT NULL,
    reward jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    collected_at timestamp with time zone,
    CONSTRAINT learning_reward_events_tokens_check CHECK ((tokens >= 0))
);


--
-- Name: shared_concept_dependencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shared_concept_dependencies (
    concept_id text NOT NULL,
    prerequisite_id text NOT NULL
);


--
-- Name: user_ai_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ai_settings (
    user_id uuid NOT NULL,
    gemini_secret_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: backend_rate_limits backend_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backend_rate_limits
    ADD CONSTRAINT backend_rate_limits_pkey PRIMARY KEY (user_id, action);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: concepts concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_pkey PRIMARY KEY (id);


--
-- Name: concepts concepts_user_id_canonical_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_user_id_canonical_name_key UNIQUE (user_id, canonical_name);


--
-- Name: game_stats game_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_stats
    ADD CONSTRAINT game_stats_pkey PRIMARY KEY (user_id);


--
-- Name: kingdom_command_reservations kingdom_command_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_command_reservations
    ADD CONSTRAINT kingdom_command_reservations_pkey PRIMARY KEY (user_id, request_id);


--
-- Name: kingdom_commands kingdom_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_commands
    ADD CONSTRAINT kingdom_commands_pkey PRIMARY KEY (user_id, request_id);


--
-- Name: kingdom_state kingdom_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_state
    ADD CONSTRAINT kingdom_state_pkey PRIMARY KEY (user_id);


--
-- Name: learning_graph_concepts learning_graph_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_graph_concepts
    ADD CONSTRAINT learning_graph_concepts_pkey PRIMARY KEY (user_id, generation, concept_id);


--
-- Name: learning_graphs learning_graphs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_graphs
    ADD CONSTRAINT learning_graphs_pkey PRIMARY KEY (user_id);


--
-- Name: learning_reward_budget learning_reward_budget_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reward_budget
    ADD CONSTRAINT learning_reward_budget_pkey PRIMARY KEY (user_id);


--
-- Name: learning_reward_events learning_reward_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reward_events
    ADD CONSTRAINT learning_reward_events_pkey PRIMARY KEY (user_id, question_id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: shared_concept_dependencies shared_concept_dependencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_concept_dependencies
    ADD CONSTRAINT shared_concept_dependencies_pkey PRIMARY KEY (concept_id, prerequisite_id);


--
-- Name: shared_concepts shared_concepts_identity_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_concepts
    ADD CONSTRAINT shared_concepts_identity_key UNIQUE (identity);


--
-- Name: shared_concepts shared_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_concepts
    ADD CONSTRAINT shared_concepts_pkey PRIMARY KEY (id);


--
-- Name: user_ai_settings user_ai_settings_gemini_secret_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_settings
    ADD CONSTRAINT user_ai_settings_gemini_secret_id_key UNIQUE (gemini_secret_id);


--
-- Name: user_ai_settings user_ai_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_settings
    ADD CONSTRAINT user_ai_settings_pkey PRIMARY KEY (user_id);


--
-- Name: idx_chat_messages_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_question_id ON public.chat_messages USING btree (question_id, created_at);


--
-- Name: idx_concepts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concepts_user_id ON public.concepts USING btree (user_id);


--
-- Name: idx_questions_user_id_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questions_user_id_created ON public.questions USING btree (user_id, created_at DESC);


--
-- Name: learning_rewards_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX learning_rewards_pending ON public.learning_reward_events USING btree (user_id, generation) WHERE (collected_at IS NULL);


--
-- Name: questions_graph; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_graph ON public.questions USING btree (user_id, graph_node, graph_dimension, reasoning_complexity);


--
-- Name: shared_concept_dependencies_prerequisite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX shared_concept_dependencies_prerequisite ON public.shared_concept_dependencies USING btree (prerequisite_id);


--
-- Name: user_ai_settings cleanup_user_gemini_secret; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cleanup_user_gemini_secret AFTER DELETE ON public.user_ai_settings FOR EACH ROW EXECUTE FUNCTION public.cleanup_user_gemini_secret();


--
-- Name: concepts concepts_library_progress; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER concepts_library_progress AFTER INSERT OR DELETE OR UPDATE OF mastery, reasoning_track, canonical_name, aliases, is_atomic, topics, user_id ON public.concepts FOR EACH ROW EXECUTE FUNCTION public.reconcile_library_concept_change();


--
-- Name: learning_reward_events immutable_learning_reward; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_learning_reward BEFORE UPDATE ON public.learning_reward_events FOR EACH ROW EXECUTE FUNCTION public.protect_learning_reward();


--
-- Name: questions immutable_question_weights; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER immutable_question_weights BEFORE UPDATE ON public.questions FOR EACH ROW EXECUTE FUNCTION public.protect_question_weights();


--
-- Name: kingdom_state reset_graph; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER reset_graph AFTER UPDATE OF generation ON public.kingdom_state FOR EACH ROW EXECUTE FUNCTION public.reset_graph_on_generation_change();


--
-- Name: backend_rate_limits backend_rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backend_rate_limits
    ADD CONSTRAINT backend_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: concepts concepts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: game_stats game_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_stats
    ADD CONSTRAINT game_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kingdom_command_reservations kingdom_command_reservations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_command_reservations
    ADD CONSTRAINT kingdom_command_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kingdom_commands kingdom_commands_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_commands
    ADD CONSTRAINT kingdom_commands_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kingdom_state kingdom_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kingdom_state
    ADD CONSTRAINT kingdom_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_graph_concepts learning_graph_concepts_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_graph_concepts
    ADD CONSTRAINT learning_graph_concepts_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.shared_concepts(id) ON DELETE RESTRICT;


--
-- Name: learning_graph_concepts learning_graph_concepts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_graph_concepts
    ADD CONSTRAINT learning_graph_concepts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.learning_graphs(user_id) ON DELETE CASCADE;


--
-- Name: learning_graphs learning_graphs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_graphs
    ADD CONSTRAINT learning_graphs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_reward_budget learning_reward_budget_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reward_budget
    ADD CONSTRAINT learning_reward_budget_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: learning_reward_events learning_reward_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_reward_events
    ADD CONSTRAINT learning_reward_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: questions questions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: shared_concept_dependencies shared_concept_dependencies_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_concept_dependencies
    ADD CONSTRAINT shared_concept_dependencies_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.shared_concepts(id) ON DELETE RESTRICT;


--
-- Name: shared_concept_dependencies shared_concept_dependencies_prerequisite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shared_concept_dependencies
    ADD CONSTRAINT shared_concept_dependencies_prerequisite_id_fkey FOREIGN KEY (prerequisite_id) REFERENCES public.shared_concepts(id) ON DELETE RESTRICT;


--
-- Name: user_ai_settings user_ai_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ai_settings
    ADD CONSTRAINT user_ai_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kingdom_state Read own kingdom; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Read own kingdom" ON public.kingdom_state FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: chat_messages Users can view their own chat messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own chat messages" ON public.chat_messages FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: concepts Users can view their own concepts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own concepts" ON public.concepts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: game_stats Users can view their own game stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own game stats" ON public.game_stats FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: backend_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backend_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: game_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.game_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: kingdom_command_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kingdom_command_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: kingdom_commands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kingdom_commands ENABLE ROW LEVEL SECURITY;

--
-- Name: kingdom_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kingdom_state ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_graph_concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_graph_concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_graphs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_graphs ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_reward_budget; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_reward_budget ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_reward_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.learning_reward_events ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_concept_dependencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_concept_dependencies ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shared_concepts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ai_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ai_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION allocate_resources(p_total integer, p_weights jsonb, p_fallback text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.allocate_resources(p_total integer, p_weights jsonb, p_fallback text) FROM PUBLIC;


--
-- Name: TABLE questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.questions TO service_role;


--
-- Name: FUNCTION apply_graph_answer(p_user_id uuid, q public.questions, correct boolean, stamp timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_graph_answer(p_user_id uuid, q public.questions, correct boolean, stamp timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION apply_territory_tribute(s jsonb, p_now timestamp with time zone, p_cleared bigint, p_correct boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.apply_territory_tribute(s jsonb, p_now timestamp with time zone, p_cleared bigint, p_correct boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_territory_tribute(s jsonb, p_now timestamp with time zone, p_cleared bigint, p_correct boolean) TO service_role;


--
-- Name: FUNCTION assert_shared_concepts_acyclic(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.assert_shared_concepts_acyclic() FROM PUBLIC;


--
-- Name: FUNCTION attach_shared_tree(p_user_id uuid, p_generation bigint, p_roots text[], p_topic text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.attach_shared_tree(p_user_id uuid, p_generation bigint, p_roots text[], p_topic text) FROM PUBLIC;


--
-- Name: FUNCTION begin_graph_expansion(p_user_id uuid, p_topic text, p_generation bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.begin_graph_expansion(p_user_id uuid, p_topic text, p_generation bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.begin_graph_expansion(p_user_id uuid, p_topic text, p_generation bigint) TO service_role;


--
-- Name: FUNCTION begin_graph_question(p_user_id uuid, p_node text, p_dimension text, p_reasoning text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.begin_graph_question(p_user_id uuid, p_node text, p_dimension text, p_reasoning text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.begin_graph_question(p_user_id uuid, p_node text, p_dimension text, p_reasoning text) TO service_role;


--
-- Name: FUNCTION begin_question_generation(p_user_id uuid, p_topic text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.begin_question_generation(p_user_id uuid, p_topic text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.begin_question_generation(p_user_id uuid, p_topic text) TO service_role;


--
-- Name: FUNCTION cancel_question_generation(p_user_id uuid, p_lease uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_question_generation(p_user_id uuid, p_lease uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_question_generation(p_user_id uuid, p_lease uuid) TO service_role;


--
-- Name: FUNCTION canonicalize_node_requirements(n jsonb, p_mapping jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.canonicalize_node_requirements(n jsonb, p_mapping jsonb) FROM PUBLIC;


--
-- Name: FUNCTION castle_learning_reward(p_id uuid, p_correct boolean, p_total integer, p_weights jsonb, p_topic text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.castle_learning_reward(p_id uuid, p_correct boolean, p_total integer, p_weights jsonb, p_topic text) FROM PUBLIC;


--
-- Name: FUNCTION cleanup_user_gemini_secret(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_user_gemini_secret() FROM PUBLIC;


--
-- Name: FUNCTION collect_learning_reward(p_user_id uuid, p_question_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.collect_learning_reward(p_user_id uuid, p_question_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.collect_learning_reward(p_user_id uuid, p_question_id uuid) TO service_role;


--
-- Name: FUNCTION commit_kingdom_command(p_user_id uuid, p_generation bigint, p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.commit_kingdom_command(p_user_id uuid, p_generation bigint, p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.commit_kingdom_command(p_user_id uuid, p_generation bigint, p_revision bigint, p_request_id uuid, p_command jsonb, p_state jsonb, p_battle_clock timestamp with time zone) TO service_role;


--
-- Name: TABLE shared_concepts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_concepts TO service_role;


--
-- Name: FUNCTION complete_shared_concept(current public.shared_concepts, n jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_shared_concept(current public.shared_concepts, n jsonb) FROM PUBLIC;


--
-- Name: FUNCTION concept_identity(title text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.concept_identity(title text) FROM PUBLIC;


--
-- Name: FUNCTION consume_backend_rate_limit(p_user_id uuid, p_action text, p_max_requests integer, p_window_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.consume_backend_rate_limit(p_user_id uuid, p_action text, p_max_requests integer, p_window_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.consume_backend_rate_limit(p_user_id uuid, p_action text, p_max_requests integer, p_window_seconds integer) TO service_role;


--
-- Name: FUNCTION delete_learning_question(p_user_id uuid, p_question_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_learning_question(p_user_id uuid, p_question_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_learning_question(p_user_id uuid, p_question_id uuid) TO service_role;


--
-- Name: FUNCTION delete_user_gemini_key(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_user_gemini_key(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_user_gemini_key(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION find_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.find_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.find_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) TO service_role;


--
-- Name: FUNCTION finish_graph_question(p_user_id uuid, p_lease uuid, p_generation bigint, p_node text, p_dimension text, p_reasoning text, p_question jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_graph_question(p_user_id uuid, p_lease uuid, p_generation bigint, p_node text, p_dimension text, p_reasoning text, p_question jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_graph_question(p_user_id uuid, p_lease uuid, p_generation bigint, p_node text, p_dimension text, p_reasoning text, p_question jsonb) TO service_role;


--
-- Name: FUNCTION finish_question_generation(p_user_id uuid, p_lease uuid, p_generation bigint, p_question jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.finish_question_generation(p_user_id uuid, p_lease uuid, p_generation bigint, p_question jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_question_generation(p_user_id uuid, p_lease uuid, p_generation bigint, p_question jsonb) TO service_role;


--
-- Name: FUNCTION get_progression_goal(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_progression_goal(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_progression_goal(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION get_question_history(p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_question_history(p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_question_history(p_limit integer, p_offset integer) TO service_role;
GRANT ALL ON FUNCTION public.get_question_history(p_limit integer, p_offset integer) TO authenticated;


--
-- Name: FUNCTION get_user_gemini_key(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_user_gemini_key(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_user_gemini_key(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION graph_ancestors(p_node text, p_nodes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_ancestors(p_node text, p_nodes jsonb) FROM PUBLIC;


--
-- Name: TABLE learning_graphs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_graphs TO service_role;


--
-- Name: FUNCTION graph_has_unanswered_boss(g public.learning_graphs, p_topic text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_has_unanswered_boss(g public.learning_graphs, p_topic text) FROM PUBLIC;


--
-- Name: FUNCTION graph_node_available(p_node jsonb, p_progress jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_node_available(p_node jsonb, p_progress jsonb) FROM PUBLIC;


--
-- Name: FUNCTION graph_node_mastery(n jsonb, p jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_node_mastery(n jsonb, p jsonb) FROM PUBLIC;


--
-- Name: FUNCTION graph_question_history(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_question_history(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.graph_question_history(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION graph_target_available(p_node jsonb, p_progress jsonb, p_dimension text, p_reasoning text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.graph_target_available(p_node jsonb, p_progress jsonb, p_dimension text, p_reasoning text) FROM PUBLIC;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION insert_graph_question(p_user_id uuid, p_generation bigint, n jsonb, p_dimension text, p_reasoning text, p_question jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.insert_graph_question(p_user_id uuid, p_generation bigint, n jsonb, p_dimension text, p_reasoning text, p_question jsonb) FROM PUBLIC;


--
-- Name: FUNCTION insert_shared_concept(n jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.insert_shared_concept(n jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION kingdom_command_context(p_user_id uuid, p_generation bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kingdom_command_context(p_user_id uuid, p_generation bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.kingdom_command_context(p_user_id uuid, p_generation bigint) TO service_role;


--
-- Name: FUNCTION kingdom_snapshot(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.kingdom_snapshot(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.kingdom_snapshot(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION learning_value_score(p_correct boolean, p_input jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.learning_value_score(p_correct boolean, p_input jsonb) FROM PUBLIC;


--
-- Name: FUNCTION learning_value_tuning(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.learning_value_tuning() FROM PUBLIC;


--
-- Name: TABLE concepts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.concepts TO service_role;
GRANT SELECT ON TABLE public.concepts TO authenticated;


--
-- Name: FUNCTION library_eligible_concepts(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.library_eligible_concepts(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.library_eligible_concepts(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION load_learning_graph(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.load_learning_graph(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.load_learning_graph(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION mapped_concept_id(p_mapping jsonb, p_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mapped_concept_id(p_mapping jsonb, p_id text) FROM PUBLIC;


--
-- Name: FUNCTION merge_generated_nodes(existing jsonb, patch jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.merge_generated_nodes(existing jsonb, patch jsonb) FROM PUBLIC;


--
-- Name: FUNCTION next_graph_progress(p jsonb, correct boolean, knowledge text, question text, stamp timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_graph_progress(p jsonb, correct boolean, knowledge text, question text, stamp timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION normalize_topic_weights(p_weights jsonb, p_fallback text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.normalize_topic_weights(p_weights jsonb, p_fallback text) FROM PUBLIC;


--
-- Name: FUNCTION pending_learning_reward(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pending_learning_reward(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pending_learning_reward(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION persist_shared_concepts(p_nodes jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.persist_shared_concepts(p_nodes jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION protect_learning_reward(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_learning_reward() FROM PUBLIC;


--
-- Name: FUNCTION protect_question_weights(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_question_weights() FROM PUBLIC;


--
-- Name: FUNCTION reconcile_library_concept_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reconcile_library_concept_change() FROM PUBLIC;


--
-- Name: FUNCTION reconcile_towers(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reconcile_towers(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reconcile_towers(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION record_learning_reward_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_learning_reward_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer) FROM PUBLIC;


--
-- Name: FUNCTION record_question_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_question_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_question_answer(p_user_id uuid, p_question_id uuid, p_selected_index integer) TO service_role;


--
-- Name: FUNCTION recruitment_class(id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.recruitment_class(id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.recruitment_class(id text) TO service_role;


--
-- Name: FUNCTION refresh_graph_bosses(nodes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.refresh_graph_bosses(nodes jsonb) FROM PUBLIC;


--
-- Name: FUNCTION reserve_graph_question(p_user_id uuid, n jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_graph_question(p_user_id uuid, n jsonb) FROM PUBLIC;


--
-- Name: FUNCTION reserve_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reserve_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_kingdom_command(p_user_id uuid, p_request_id uuid, p_generation bigint, p_command jsonb) TO service_role;


--
-- Name: FUNCTION reset_graph_on_generation_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_graph_on_generation_change() FROM PUBLIC;


--
-- Name: FUNCTION reset_learning_progress(p_user_id uuid, p_generation bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_learning_progress(p_user_id uuid, p_generation bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_learning_progress(p_user_id uuid, p_generation bigint) TO service_role;


--
-- Name: FUNCTION resolve_reward_concept(p_user_id uuid, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resolve_reward_concept(p_user_id uuid, p_name text) FROM PUBLIC;


--
-- Name: FUNCTION resource_topics(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resource_topics() FROM PUBLIC;


--
-- Name: FUNCTION roster_unit_id(p_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.roster_unit_id(p_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.roster_unit_id(p_id text) TO service_role;


--
-- Name: FUNCTION save_generated_nodes(p_user_id uuid, p_topic text, p_lease uuid, p_generation bigint, p_root text, p_nodes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_generated_nodes(p_user_id uuid, p_topic text, p_lease uuid, p_generation bigint, p_root text, p_nodes jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_generated_nodes(p_user_id uuid, p_topic text, p_lease uuid, p_generation bigint, p_root text, p_nodes jsonb) TO service_role;


--
-- Name: FUNCTION save_graph_expansion(p_user_id uuid, p_topic text, p_nodes jsonb, p_generation bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_graph_expansion(p_user_id uuid, p_topic text, p_nodes jsonb, p_generation bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_graph_expansion(p_user_id uuid, p_topic text, p_nodes jsonb, p_generation bigint) TO service_role;


--
-- Name: FUNCTION save_shared_concept_bodies(p_nodes jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_shared_concept_bodies(p_nodes jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION save_shared_concept_body(n jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_shared_concept_body(n jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION save_shared_concept_edges(p_nodes jsonb, p_mapping jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_shared_concept_edges(p_nodes jsonb, p_mapping jsonb) FROM PUBLIC;


--
-- Name: FUNCTION score_question_internal(p_user_id uuid, p_question_id uuid, p_selected_index integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.score_question_internal(p_user_id uuid, p_question_id uuid, p_selected_index integer) FROM PUBLIC;


--
-- Name: FUNCTION set_progression_goal(p_user_id uuid, p_goal jsonb, p_revision bigint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_progression_goal(p_user_id uuid, p_goal jsonb, p_revision bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_progression_goal(p_user_id uuid, p_goal jsonb, p_revision bigint) TO service_role;


--
-- Name: FUNCTION set_user_gemini_key(p_user_id uuid, p_api_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.set_user_gemini_key(p_user_id uuid, p_api_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_user_gemini_key(p_user_id uuid, p_api_key text) TO service_role;


--
-- Name: FUNCTION shared_concept_closure(p_roots text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.shared_concept_closure(p_roots text[]) FROM PUBLIC;


--
-- Name: FUNCTION shared_concept_node(p_id text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.shared_concept_node(p_id text) FROM PUBLIC;


--
-- Name: FUNCTION store_canonical_patch(p_user_id uuid, p_topic text, p_generation bigint, p_root text, p_nodes jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.store_canonical_patch(p_user_id uuid, p_topic text, p_generation bigint, p_root text, p_nodes jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION store_concept_embeddings(p_user_id uuid, p_generation bigint, p_nodes jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.store_concept_embeddings(p_user_id uuid, p_generation bigint, p_nodes jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: FUNCTION tower_contribution(p_weights jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tower_contribution(p_weights jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tower_contribution(p_weights jsonb) TO service_role;


--
-- Name: FUNCTION valid_economy_state(s jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.valid_economy_state(s jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_economy_state(s jsonb) TO service_role;


--
-- Name: FUNCTION valid_forge_state(s jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.valid_forge_state(s jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_forge_state(s jsonb) TO service_role;


--
-- Name: FUNCTION valid_forged_item(i jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.valid_forged_item(i jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_forged_item(i jsonb) TO service_role;


--
-- Name: FUNCTION valid_progression_goal(p_goal jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.valid_progression_goal(p_goal jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_progression_goal(p_goal jsonb) TO service_role;


--
-- Name: FUNCTION valid_recruitment_state(s jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.valid_recruitment_state(s jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.valid_recruitment_state(s jsonb) TO service_role;


--
-- Name: FUNCTION validate_dimension_edges(n jsonb, all_nodes jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_dimension_edges(n jsonb, all_nodes jsonb) FROM PUBLIC;


--
-- Name: FUNCTION validate_dimension_expansion(p_topic text, p_nodes jsonb, existing jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_dimension_expansion(p_topic text, p_nodes jsonb, existing jsonb) FROM PUBLIC;


--
-- Name: FUNCTION validate_dimension_node(n jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_dimension_node(n jsonb) FROM PUBLIC;


--
-- Name: FUNCTION validate_generated_nodes(p_topic text, p_root text, patch jsonb, existing jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_generated_nodes(p_topic text, p_root text, patch jsonb, existing jsonb) FROM PUBLIC;


--
-- Name: FUNCTION validate_prepared_question(p_user_id uuid, n jsonb, p_progress jsonb, p_question jsonb, p_dimension text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_prepared_question(p_user_id uuid, n jsonb, p_progress jsonb, p_question jsonb, p_dimension text) FROM PUBLIC;


--
-- Name: FUNCTION validate_shared_patch(p_nodes jsonb, p_embeddings jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_shared_patch(p_nodes jsonb, p_embeddings jsonb) FROM PUBLIC;


--
-- Name: TABLE backend_rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.backend_rate_limits TO service_role;


--
-- Name: TABLE chat_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.chat_messages TO service_role;
GRANT SELECT ON TABLE public.chat_messages TO authenticated;


--
-- Name: TABLE game_stats; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.game_stats TO service_role;
GRANT SELECT ON TABLE public.game_stats TO authenticated;


--
-- Name: TABLE kingdom_command_reservations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kingdom_command_reservations TO service_role;


--
-- Name: TABLE kingdom_commands; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kingdom_commands TO service_role;


--
-- Name: TABLE kingdom_state; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.kingdom_state TO service_role;


--
-- Name: COLUMN kingdom_state.user_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(user_id) ON TABLE public.kingdom_state TO authenticated;


--
-- Name: COLUMN kingdom_state.state; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(state) ON TABLE public.kingdom_state TO authenticated;


--
-- Name: COLUMN kingdom_state.revision; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(revision) ON TABLE public.kingdom_state TO authenticated;


--
-- Name: COLUMN kingdom_state.generation; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(generation) ON TABLE public.kingdom_state TO authenticated;


--
-- Name: TABLE learning_graph_concepts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_graph_concepts TO service_role;


--
-- Name: TABLE learning_reward_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.learning_reward_events TO service_role;


--
-- Name: TABLE shared_concept_dependencies; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.shared_concept_dependencies TO service_role;


--
-- Name: TABLE user_ai_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_ai_settings TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- pg_dump omits the explicit function default ACL when it matches PostgreSQL's
-- built-in default; keep the revocation that secures future functions.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated;

-- The auth schema is managed by Supabase, so its custom trigger is included separately.
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
