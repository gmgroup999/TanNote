-- Add plan_expires_at to get_current_usage so the client can show the
-- plan's renewal/expiry date (starter = 1 year; pro/extra = lifetime; free = none).
create or replace function get_current_usage(p_line_user_id text, p_period text)
returns jsonb language sql security definer as $$
  with u as (
    select
      up.id,
      up.cloud_backup_enabled,
      up.plan_expires_at,
      case
        when up.plan_expires_at is not null and up.plan_expires_at < now() then 'free'
        else coalesce(up.plan, 'free')
      end as eff_plan
    from users_profile up
    where up.line_user_id = p_line_user_id
    limit 1
  )
  select jsonb_build_object(
    'plan',                 u.eff_plan,
    'cloud_backup_enabled', coalesce(u.cloud_backup_enabled, false),
    'recording_minutes',    coalesce(ut.recording_minutes, 0),
    'ask_notes_count',      coalesce(ut.ask_notes_count, 0),
    'ai_suggest_count',     coalesce(ut.ai_suggest_count, 0),
    'period',               period_for_plan(u.eff_plan),
    'plan_expires_at',      u.plan_expires_at
  )
  from u
  left join usage_tracking ut
    on ut.user_id = u.id and ut.period = period_for_plan(u.eff_plan);
$$;
