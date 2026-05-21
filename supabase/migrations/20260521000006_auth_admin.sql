-- Auth + Admin: add is_suspended to users_profile

alter table users_profile
  add column if not exists is_suspended  boolean      default false,
  add column if not exists suspended_at  timestamptz;

create index if not exists idx_users_plan       on users_profile(plan);
create index if not exists idx_users_suspended  on users_profile(is_suspended) where is_suspended = true;

-- ── admin_list_users — service-role RPC for admin panel ──────────────────────
create or replace function admin_list_users(p_period text)
returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select
      u.id,
      u.line_user_id,
      u.nickname,
      u.display_name,
      u.plan,
      u.is_suspended,
      u.suspended_at,
      u.created_at,
      coalesce(ut.recording_minutes, 0) as recording_minutes,
      coalesce(ut.ask_notes_count,   0) as ask_notes_count,
      coalesce(ut.ai_suggest_count,  0) as ai_suggest_count,
      (select count(*) from notes n where n.user_id = u.id) as note_count
    from users_profile u
    left join usage_tracking ut on ut.user_id = u.id and ut.period = p_period
    order by u.created_at desc
  ) t
$$;
