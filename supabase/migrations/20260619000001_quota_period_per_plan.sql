-- Quota period per plan tier (matches spec):
--   free    → monthly  (YYYY-MM)
--   starter → yearly   (Y{YYYY})
--   pro     → lifetime (single bucket, recording capped at 2500 total)
--   extra   → lifetime (unlimited anyway)
--
-- Boundaries use Asia/Bangkok timezone. This function MUST stay in sync with
-- periodForPlan() in supabase/functions/_shared/plans.ts — same output strings.

create or replace function period_for_plan(p_plan text)
returns text language sql stable as $$
  select case p_plan
    when 'starter' then 'Y' || to_char((now() at time zone 'Asia/Bangkok'), 'YYYY')
    when 'pro'     then 'lifetime'
    when 'extra'   then 'lifetime'
    else to_char((now() at time zone 'Asia/Bangkok'), 'YYYY-MM')
  end;
$$;

-- ─── get_current_usage: derive period from the user's *effective* plan ────────
-- p_period kept for signature compatibility but ignored; the correct bucket is
-- computed server-side so the frontend never has to know the plan in advance.
create or replace function get_current_usage(p_line_user_id text, p_period text)
returns jsonb language sql security definer as $$
  with u as (
    select
      up.id,
      up.cloud_backup_enabled,
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
    'period',               period_for_plan(u.eff_plan)
  )
  from u
  left join usage_tracking ut
    on ut.user_id = u.id and ut.period = period_for_plan(u.eff_plan);
$$;

-- ─── admin_list_users: per-user usage from each user's own plan bucket ────────
-- p_period kept for signature compatibility but ignored.
create or replace function admin_list_users(p_period text)
returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select
      u.id,
      u.line_user_id,
      u.nickname,
      u.display_name,
      u.picture_url,
      u.primary_use,
      u.tone,
      u.plan,
      u.plan_expires_at,
      u.is_suspended,
      u.suspended_at,
      u.created_at,
      case
        when u.line_user_id ~ '^sa_[0-9a-f\-]{36}$' then (
          select au.email
          from auth.users au
          where au.id = substring(u.line_user_id from 4)::uuid
        )
        else null
      end as email,
      case
        when u.line_user_id ~ '^sa_[0-9a-f\-]{36}$' then (
          select au.last_sign_in_at
          from auth.users au
          where au.id = substring(u.line_user_id from 4)::uuid
        )
        else null
      end as last_sign_in_at,
      coalesce(ut.recording_minutes, 0) as recording_minutes,
      coalesce(ut.ask_notes_count,   0) as ask_notes_count,
      coalesce(ut.ai_suggest_count,  0) as ai_suggest_count,
      (select count(*) from notes n where n.user_id = u.id) as note_count
    from users_profile u
    left join lateral (
      select uu.recording_minutes, uu.ask_notes_count, uu.ai_suggest_count
      from usage_tracking uu
      where uu.user_id = u.id
        and uu.period = period_for_plan(
          case
            when u.plan_expires_at is not null and u.plan_expires_at < now() then 'free'
            else coalesce(u.plan, 'free')
          end
        )
      limit 1
    ) ut on true
    order by u.created_at desc
  ) t
$$;
