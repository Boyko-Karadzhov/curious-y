-- Assessment content does not author graph knowledge. Concept questions reveal the
-- already-prepared dimension; boss questions do not add a knowledge entry.
CREATE OR REPLACE FUNCTION public.validate_prepared_question(p_user_id uuid,n jsonb,p_progress jsonb,p_question jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF jsonb_typeof(p_question->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'options')<>4
    OR jsonb_typeof(p_question->'option_feedback') IS DISTINCT FROM 'array' OR jsonb_array_length(p_question->'option_feedback')<>4
    OR (p_question->>'correct_index')::integer NOT BETWEEN 0 AND 3 OR p_question->>'correct_index' IS NULL
    OR length(COALESCE(p_question->>'question_text','')) NOT BETWEEN 1 AND 4000
    OR length(COALESCE(p_question->>'explanation','')) NOT BETWEEN 1 AND 8000
    OR (n->>'kind'='boss' AND p_question ? 'knowledge_entry')
    OR (n->>'kind'<>'boss' AND length(COALESCE(p_question->>'knowledge_entry','')) NOT BETWEEN 1 AND 1600)
    THEN RAISE EXCEPTION 'Invalid graph question.'; END IF;
  IF n->>'kind'<>'boss' AND EXISTS (SELECT 1 FROM public.questions WHERE user_id=p_user_id AND graph_node IS NOT NULL
    AND lower(regexp_replace(question_text,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g')))
    THEN RAISE EXCEPTION 'That question has already been explored. Please retry for a fresh example.'; END IF;
  IF n->>'kind'<>'boss' AND EXISTS (SELECT 1 FROM jsonb_each(p_progress) node, LATERAL jsonb_each(node.value) facet
    WHERE facet.value->'creditedQuestions' ? md5(lower(regexp_replace(p_question->>'question_text','[^a-zA-Z0-9]','','g'))))
    THEN RAISE EXCEPTION 'That question has already earned knowledge. Please retry for a fresh example.'; END IF;
  IF n->>'kind'='boss' AND p_question->>'question_text' IS DISTINCT FROM n->>'title'
    THEN RAISE EXCEPTION 'Use the exact saved boss question.'; END IF;
END $$;

UPDATE public.learning_graphs
SET nodes=(SELECT jsonb_agg(node #- '{curriculum,assessment,knowledgeEntry}') FROM jsonb_array_elements(nodes) node)
WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(nodes) node WHERE node->'curriculum'->'assessment' ? 'knowledgeEntry');

UPDATE public.questions SET knowledge_entry=NULL
WHERE graph_node IS NOT NULL AND is_boss_question AND knowledge_entry IS NOT NULL;
