-- Preserve the exact canonical identity selected at issuance even when historical
-- case-variant rows exist. Database collation must not change the answer target.
CREATE OR REPLACE FUNCTION public.resolve_reward_concept(p_user_id uuid,p_name text) RETURNS public.concepts
LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT c FROM public.concepts c WHERE c.user_id=p_user_id AND (
    lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))
    OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.aliases) a(name)
      WHERE lower(regexp_replace(trim(a.name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))))
  ORDER BY (c.canonical_name=trim(p_name)) DESC,
    (lower(regexp_replace(trim(c.canonical_name),'\s+',' ','g'))=lower(regexp_replace(trim(p_name),'\s+',' ','g'))) DESC,
    c.canonical_name COLLATE "C"
  LIMIT 1;
$$;
