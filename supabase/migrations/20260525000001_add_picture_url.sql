-- Add picture_url to users_profile
alter table users_profile add column if not exists picture_url text;

-- admin_list_users v4: add picture_url, primary_use, tone, email (for sa_ auth users), last_sign_in_at
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
    left join usage_tracking ut on ut.user_id = u.id and ut.period = p_period
    order by u.created_at desc
  ) t
$$;
