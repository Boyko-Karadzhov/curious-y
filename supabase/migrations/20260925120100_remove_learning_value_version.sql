CREATE OR REPLACE FUNCTION public.learning_value_score(p_correct boolean,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
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
