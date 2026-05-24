-- Fix: add security definer to increment_ask_count
-- (consistent with increment_recording_minutes and increment_ai_suggest_count)
create or replace function increment_ask_count(p_user_id uuid, p_period text)
returns void language sql security definer as $$
  insert into usage_tracking (node_id, user_id, period, ask_notes_count)
  values (
    (select node_id from users_profile where id = p_user_id limit 1),
    p_user_id, p_period, 1
  )
  on conflict (user_id, period)
  do update set
    ask_notes_count = usage_tracking.ask_notes_count + 1,
    updated_at      = now();
$$;
