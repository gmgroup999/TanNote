-- Phase 4: User Memory + Usage Tracking

-- ─── user_memory ──────────────────────────────────────────────────────────────
create table if not exists user_memory (
  id         uuid primary key default gen_random_uuid(),
  node_id    uuid not null,
  user_id    uuid references users_profile(id) on delete cascade,
  key        text not null,    -- nickname|occupation|project|preference|other
  value      text not null,
  source     text default 'inferred',  -- inferred|confirmed|manual
  created_at timestamptz default now()
);

alter table user_memory enable row level security;

create policy "service role full access" on user_memory for all
  to service_role using (true) with check (true);

create policy "anon read" on user_memory for select
  to anon using (true);

create policy "anon insert" on user_memory for insert
  to anon with check (true);

create policy "anon delete" on user_memory for delete
  to anon using (true);

create index if not exists idx_user_memory_user on user_memory(user_id);

-- ─── helper RPC: increment ask count ─────────────────────────────────────────
create or replace function increment_ask_count(p_user_id uuid, p_period text)
returns void language sql as $$
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

-- ─── usage_tracking ───────────────────────────────────────────────────────────
create table if not exists usage_tracking (
  id                  uuid primary key default gen_random_uuid(),
  node_id             uuid not null,
  user_id             uuid references users_profile(id) on delete cascade,
  period              text not null,   -- '2026-05'
  recording_minutes   int default 0,
  ask_notes_count     int default 0,
  ai_suggest_count    int default 0,
  cloud_backup_count  int default 0,
  updated_at          timestamptz default now(),
  constraint uq_usage unique (user_id, period)
);

alter table usage_tracking enable row level security;

create policy "service role full access" on usage_tracking for all
  to service_role using (true) with check (true);

create policy "anon read" on usage_tracking for select
  to anon using (true);
