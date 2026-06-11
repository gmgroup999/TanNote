-- Security: tighten RLS — replace open anon delete/read policies with ownership-verified RPCs
-- Note: full per-user row isolation requires LIFF JWT verification (Phase 3)

-- ─── user_memory: drop open anon delete (callers must use delete_user_memory RPC) ──
drop policy if exists "anon delete" on user_memory;

-- ─── reminders: drop open anon delete + update ────────────────────────────────────
drop policy if exists "anon delete" on reminders;
drop policy if exists "anon update" on reminders;

-- ─── RPC: fetch memories for a specific LINE user ─────────────────────────────────
create or replace function get_user_memories(p_line_user_id text)
returns table(id uuid, key text, value text, source text, created_at timestamptz)
language sql security definer stable as $$
  select m.id, m.key, m.value, m.source, m.created_at
  from user_memory m
  join users_profile u on u.id = m.user_id
  where u.line_user_id = p_line_user_id
  order by m.created_at desc
$$;

-- ─── RPC: delete memory — verifies ownership via line_user_id ─────────────────────
create or replace function delete_user_memory(p_id uuid, p_line_user_id text)
returns void language sql security definer as $$
  delete from user_memory m
  using users_profile u
  where m.id        = p_id
    and m.user_id   = u.id
    and u.line_user_id = p_line_user_id
$$;

-- ─── RPC: delete reminder — verifies ownership via line_user_id column ───────────
create or replace function delete_user_reminder(p_id uuid, p_line_user_id text)
returns void language sql security definer as $$
  delete from reminders
  where id           = p_id
    and line_user_id = p_line_user_id
$$;

-- ─── users_profile: allow anon to read + update non-sensitive columns ────────────
-- Required for onboarding (nickname/tone/use case) + reminder settings saves to work.
-- plan, is_suspended, plan_expires_at are protected by with check.
-- Full user isolation will be enforced when LIFF JWT is implemented (Phase 3).
drop policy if exists "anon read"               on users_profile;
drop policy if exists "anon update safe fields" on users_profile;

create policy "anon read" on users_profile
  for select to anon using (true);

create policy "anon update safe fields" on users_profile
  for update to anon
  using (true)
  with check (
    plan             = (select plan             from users_profile x where x.id = users_profile.id) and
    is_suspended     = (select is_suspended     from users_profile x where x.id = users_profile.id) and
    plan_expires_at  is not distinct from
                       (select plan_expires_at  from users_profile x where x.id = users_profile.id)
  );
