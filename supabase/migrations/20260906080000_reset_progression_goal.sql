-- Reset the goal in the same transaction as progress. Keep its revision
-- monotonic so a delayed goal save from before reset cannot restore it.
CREATE OR REPLACE FUNCTION public.reset_learning_progress(p_user_id uuid,p_generation bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
