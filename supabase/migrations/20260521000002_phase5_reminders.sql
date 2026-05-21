-- Phase 5: Reminders + LINE Messaging

-- ─── reminder_settings ใน users_profile ──────────────────────────────────────
alter table users_profile add column if not exists reminder_settings jsonb
  default '{"types":["task","appointment","routine","followup","greeting","system"],"quiet_start":"22:00","quiet_end":"08:00"}';

-- ─── reminders ────────────────────────────────────────────────────────────────
create table if not exists reminders (
  id           uuid primary key default gen_random_uuid(),
  node_id      uuid not null,
  user_id      uuid references users_profile(id) on delete cascade,
  note_id      uuid references notes(id) on delete set null,
  type         text not null,          -- task|appointment|routine|followup|greeting|system
  title        text not null,
  message      text,
  remind_at    timestamptz not null,
  repeat_rule  text,                   -- null|daily|weekly
  status       text default 'pending', -- pending|sent|done|snoozed|cancelled
  line_user_id text,
  created_at   timestamptz default now()
);

alter table reminders enable row level security;

create policy "service role full access" on reminders for all
  to service_role using (true) with check (true);

create policy "anon read" on reminders for select
  to anon using (true);

create policy "anon update" on reminders for update
  to anon using (true);

create policy "anon delete" on reminders for delete
  to anon using (true);

create index if not exists idx_reminders_due
  on reminders(remind_at) where status = 'pending';
create index if not exists idx_reminders_user
  on reminders(user_id);

-- ─── pg_cron + pg_net setup (run manually in SQL Editor after deploy) ─────────
-- ต้อง enable extensions ก่อน:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--
-- แล้ว schedule cron:
--   select cron.schedule(
--     'tannote-send-reminders',
--     '* * * * *',
--     $cron$
--     select net.http_post(
--       url    := 'https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/send-reminders',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--       ),
--       body   := '{}'::jsonb
--     );
--     $cron$
--   );
