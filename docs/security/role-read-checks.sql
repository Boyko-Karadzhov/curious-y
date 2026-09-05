-- Exercise actual RLS and history RPC under restricted roles, returning counts only.
BEGIN READ ONLY;
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', (SELECT user_id FROM public.questions LIMIT 1), 'role', 'authenticated'
)::text, true) IS NOT NULL AS claims_configured;
SET LOCAL ROLE authenticated;
SELECT 'existing_question_owner' AS scenario,
  (SELECT count(*) FROM public.concepts) AS visible_concepts,
  (SELECT count(*) FROM public.concepts WHERE user_id <> auth.uid()) AS other_user_concepts,
  (SELECT count(*) FROM public.chat_messages WHERE user_id <> auth.uid()) AS other_user_chats,
  (SELECT count(*) FROM public.game_stats WHERE user_id <> auth.uid()) AS other_user_stats,
  (SELECT count(*) FROM public.get_question_history() WHERE user_id <> auth.uid() OR answered_at IS NULL) AS forbidden_history;
ROLLBACK;

BEGIN READ ONLY;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}', true) IS NOT NULL AS claims_configured;
SET LOCAL ROLE authenticated;
SELECT 'unrelated_identity' AS scenario,
  (SELECT count(*) FROM public.concepts) AS visible_concepts,
  (SELECT count(*) FROM public.chat_messages) AS visible_chats,
  (SELECT count(*) FROM public.game_stats) AS visible_stats,
  (SELECT count(*) FROM public.get_question_history()) AS visible_history;
ROLLBACK;
