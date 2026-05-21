-- TanNote — Initial Schema
-- Run: supabase db push  OR paste in Supabase SQL Editor

-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ─── users_profile ──────────────────────────────────────────────────────────
create table if not exists users_profile (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null,
  line_user_id     text unique not null,
  display_name     text,
  nickname         text,
  primary_use      text[],
  tone             text default 'casual',
  plan             text default 'free',
  plan_expires_at  timestamptz,
  created_at       timestamptz default now()
);

alter table users_profile enable row level security;

-- service role bypasses RLS → Edge Functions can write freely
-- Phase 3 จะเพิ่ม policy สำหรับ LIFF JWT
create policy "service role full access"
  on users_profile for all
  to service_role
  using (true)
  with check (true);

-- ─── notes ──────────────────────────────────────────────────────────────────
create table if not exists notes (
  id               uuid primary key default gen_random_uuid(),
  node_id          uuid not null,
  user_id          uuid references users_profile(id) on delete set null,
  title            text,
  recording_type   text not null default 'auto',
  detected_type    text,
  transcript       text,
  summary          jsonb,   -- { overview, points[], actions[], tags[], sentiment }
  duration_seconds int,
  language         text default 'th',
  audio_location   text default 'local',  -- local | cloud | deleted
  has_cloud_backup boolean default false,
  cloud_audio_url  text,
  local_audio_id   text,    -- IndexedDB key ใน browser
  status           text default 'processing',  -- processing | done | failed
  created_at       timestamptz default now(),
  expires_at       timestamptz  -- null = ตลอดชีพ, ไม่ null = free tier 30 วัน
);

alter table notes enable row level security;

create policy "service role full access"
  on notes for all
  to service_role
  using (true)
  with check (true);

-- anon สามารถอ่าน note ของตัวเองได้ (by local_audio_id for now — Phase 3 ใช้ user_id)
create policy "anon read own notes"
  on notes for select
  to anon
  using (true);  -- relaxed for Phase 2; tighten in Phase 3 with auth

-- ─── indexes ────────────────────────────────────────────────────────────────
create index if not exists idx_notes_user      on notes(user_id);
create index if not exists idx_notes_status    on notes(status);
create index if not exists idx_notes_created   on notes(created_at desc);
create index if not exists idx_notes_local_id  on notes(local_audio_id);
