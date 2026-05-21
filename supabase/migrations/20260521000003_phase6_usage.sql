-- Phase 6: Usage Gating + Cloud Backup Preference

-- ─── Extend users_profile ─────────────────────────────────────────────────────
alter table users_profile
  add column if not exists cloud_backup_enabled boolean default false;

-- ─── Anon read on users_profile (relaxed; tighten when LIFF auth ships) ───────
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'users_profile'
    and policyname = 'anon read users_profile'
  ) then
    create policy "anon read users_profile" on users_profile
      for select to anon using (true);
  end if;
end $$;

-- ─── increment_recording_minutes ─────────────────────────────────────────────
create or replace function increment_recording_minutes(
  p_user_id uuid, p_period text, p_minutes int
) returns void language sql security definer as $$
  insert into usage_tracking (node_id, user_id, period, recording_minutes)
  values (
    (select node_id from users_profile where id = p_user_id limit 1),
    p_user_id, p_period, p_minutes
  )
  on conflict (user_id, period)
  do update set
    recording_minutes = usage_tracking.recording_minutes + p_minutes,
    updated_at        = now();
$$;

-- ─── increment_ai_suggest_count ──────────────────────────────────────────────
create or replace function increment_ai_suggest_count(
  p_user_id uuid, p_period text
) returns void language sql security definer as $$
  insert into usage_tracking (node_id, user_id, period, ai_suggest_count)
  values (
    (select node_id from users_profile where id = p_user_id limit 1),
    p_user_id, p_period, 1
  )
  on conflict (user_id, period)
  do update set
    ai_suggest_count = usage_tracking.ai_suggest_count + 1,
    updated_at       = now();
$$;

-- ─── get_current_usage (single RPC call for frontend) ────────────────────────
create or replace function get_current_usage(p_line_user_id text, p_period text)
returns jsonb language sql security definer as $$
  select jsonb_build_object(
    'plan',              coalesce(up.plan, 'free'),
    'cloud_backup_enabled', coalesce(up.cloud_backup_enabled, false),
    'recording_minutes', coalesce(ut.recording_minutes, 0),
    'ask_notes_count',   coalesce(ut.ask_notes_count, 0),
    'ai_suggest_count',  coalesce(ut.ai_suggest_count, 0),
    'period',            p_period
  )
  from users_profile up
  left join usage_tracking ut
    on ut.user_id = up.id and ut.period = p_period
  where up.line_user_id = p_line_user_id
  limit 1;
$$;
