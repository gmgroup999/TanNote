# 🏗️ TanNote — Technical Spec (เต็มระบบ)

> พิมพ์เขียวสำหรับ build · พ.ค. 2026 · ใช้คู่กับ TANNOTE_MASTER.md

---

## 1. STACK

| Layer | Technology |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind |
| Auth | LINE LIFF (LINE userId เป็น key) |
| Backend | Supabase (Postgres + pgvector + Realtime + Edge Functions) |
| AI ถอดเสียง | Gemini 2.5 Flash |
| AI tags/summary | Gemini 2.5 Flash-Lite |
| Local audio | IndexedDB (idb library) |
| Cloud audio (Extra) | Cloudflare R2 |
| เตือน | LINE Messaging API + pg_cron |
| Deploy | Hetzner CX32 + Coolify |

**Multi-tenant:** ทุก table มี `node_id` + RLS (ตาม Golden Rules ของ JoyRide)

---

## 2. DATABASE SCHEMA

```sql
-- ผู้ใช้
create table users_profile (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  line_user_id text unique not null,
  display_name text,
  nickname text,                    -- ชื่อเรียก (onboarding)
  primary_use text[],               -- ['work','idea','study','personal']
  tone text default 'casual',       -- 'formal' | 'casual'
  plan text default 'free',         -- free/starter/pro/extra
  plan_expires_at timestamptz,
  created_at timestamptz default now()
);

-- โน้ต
create table notes (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  title text,
  recording_type text default 'auto',  -- meeting/sales/idea/lecture/interview/diary/general/auto
  detected_type text,                   -- type ที่ AI วิเคราะห์ได้ (ถ้า auto)
  transcript text,
  summary jsonb,                        -- {points:[], actions:[], ...}
  duration_seconds int,
  language text default 'th',
  audio_location text default 'local',  -- local/cloud/deleted
  has_cloud_backup boolean default false,
  cloud_audio_url text,
  local_audio_id text,
  status text default 'processing',     -- processing/done/failed
  created_at timestamptz default now(),
  expires_at timestamptz                -- ตาม tier (free 30 วัน)
);

-- แท็ก
create table tags (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  name text not null,
  type text not null,                   -- people/project/topic/action/status
  embedding vector(768),
  confirmed boolean default false,      -- ผู้ใช้ยืนยันแล้วมั้ย
  created_at timestamptz default now(),
  unique(node_id, user_id, name)
);

create table note_tags (
  note_id uuid references notes on delete cascade,
  tag_id uuid references tags on delete cascade,
  node_id uuid not null,
  ai_suggested boolean default true,    -- AI เสนอ vs ผู้ใช้เพิ่มเอง
  primary key (note_id, tag_id)
);

-- ความเชื่อมโยงระหว่างโน้ต (Knowledge Graph)
create table note_links (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  source_note_id uuid references notes on delete cascade,
  target_note_id uuid references notes on delete cascade,
  similarity float,                     -- vector similarity score
  confirmed boolean default false,      -- ผู้ใช้ยืนยันลิงก์
  created_at timestamptz default now()
);

-- สิ่งที่ AI จำเกี่ยวกับผู้ใช้ (memory)
create table user_memory (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  key text not null,                    -- 'occupation','project','preference'
  value text not null,
  source text default 'inferred',       -- inferred/confirmed/manual
  created_at timestamptz default now()
);

-- เตือน
create table reminders (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  note_id uuid references notes,
  type text not null,                   -- task/appointment/routine/followup/greeting/system
  title text not null,
  message text,
  remind_at timestamptz not null,
  repeat_rule text,                     -- null/daily/weekly/cron
  status text default 'pending',        -- pending/sent/done/snoozed/cancelled
  line_user_id text,
  created_at timestamptz default now()
);
create index idx_reminders_due on reminders(remind_at) where status = 'pending';

-- ติดตาม usage
create table usage_tracking (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null,
  user_id uuid references users_profile,
  period text not null,                 -- '2026-05'
  recording_minutes int default 0,
  ask_notes_count int default 0,
  ai_suggest_count int default 0,
  cloud_backup_count int default 0,
  updated_at timestamptz default now(),
  unique(user_id, period)
);
```

---

## 3. PLAN LIMITS (config)

```typescript
const PLAN_LIMITS = {
  free:    { rec: 60,   storage_days: 30,    ask: 10,  suggest: 5,   cloud: 3,  langs: ['th'] },
  starter: { rec: 800,  storage_days: 365,   ask: 150, suggest: 50,  cloud: 10, langs: ['th','en'] },
  pro:     { rec: 2500, storage_days: -1,    ask: -1,  suggest: -1,  cloud: 50, langs: ['th','en','zh','ja'] },
  extra:   { rec: -1,   storage_days: -1,    ask: -1,  suggest: -1,  cloud: -1, langs: 'all' }
};  // -1 = unlimited
```

---

## 4. RECORDING TYPES (config)

```typescript
const RECORDING_TYPES = {
  meeting:   { label:'👥 การประชุม',     summaryFocus:'มติ + action items + ผู้รับผิดชอบ' },
  sales:     { label:'📞 สายลูกค้า/ขาย',  summaryFocus:'order, ราคา, นัดหมาย, follow-up' },
  idea:      { label:'💡 บันทึกไอเดีย',   summaryFocus:'จัดกลุ่มความคิด, เชื่อมไอเดียเก่า' },
  lecture:   { label:'🎓 เลคเชอร์/เรียน',  summaryFocus:'หัวข้อ, key points, flashcard' },
  interview: { label:'🎤 สัมภาษณ์',       summaryFocus:'คำถาม-คำตอบ, ประเด็นสำคัญ' },
  diary:     { label:'📔 ไดอารี่/ส่วนตัว', summaryFocus:'เหตุการณ์/อารมณ์, โทนอบอุ่น' },
  general:   { label:'🎙️ ทั่วไป',         summaryFocus:'ถอด + สรุปกลางๆ' },
  auto:      { label:'✨ ให้ AI เลือกให้',  summaryFocus:'วิเคราะห์ context อัตโนมัติ' }
};
```

---

## 5. CORE FLOWS

### 5.1 Recording → Processing
```
[1] เลือก type (หรือ auto) → กดอัด
[2] Wake Lock + MediaRecorder (Opus 32kbps)
[3] หยุด → เก็บ blob ใน IndexedDB (local)
[4] POST /api/transcribe (multipart, ชั่วคราว)
[5] ถ้า auto → AI detect type ก่อน
[6] Gemini 2.5 Flash ถอด (ตาม type prompt) → ลบเสียง server
[7] Flash-Lite: summary + tags + embeddings
[8] หา note_links (vector similarity > threshold)
[9] เก็บใน Supabase (text)
[10] ถ้า Extra+opt-in → backup R2
[11] LINE notify "ถอดเสร็จ"
```

### 5.2 Ask Notes (RAG)
```
[1] ผู้ใช้ถาม → embed คำถาม
[2] vector search ใน transcripts (pgvector)
[3] ดึง top-k chunks + user_memory
[4] Gemini ตอบจาก context
[5] +1 ask_notes_count
```

### 5.3 Reminder (LINE)
```
pg_cron ทุกนาที → query reminders due →
LINE Push (Flex + ปุ่ม) → postback [done/snooze] → update
```

---

## 6. API ENDPOINTS (Edge Functions)

| Endpoint | หน้าที่ |
|---|---|
| POST /api/transcribe | รับเสียง → ถอด → สรุป → tags → เก็บ |
| POST /api/ask | Ask Notes (RAG) |
| GET /api/notes | list โน้ต (filter/search) |
| GET /api/note/:id | ดูโน้ต + links |
| PATCH /api/note/:id | แก้ type/title/tags |
| POST /api/link/confirm | ยืนยัน/ปฏิเสธ note_link |
| POST /api/reminder | สร้างเตือน |
| GET /api/usage | ดู usage เดือนนี้ |
| POST /api/line-webhook | รับ postback |
| POST /api/send-reminders | (cron) ส่งเตือน |

---

## 7. GUARDRAILS (ขอบเขตเพื่อน/เลขา)

```
System prompt ต้องมี:
- "คุณเป็นเพื่อนและเลขา ไม่ใช่หมอ/นักจิตวิทยา"
- ห้ามวินิจฉัยโรค/แนะนำยา/ขนาดยา
- ห้ามให้คำปรึกษาสุขภาพจิตเชิงรักษา
- ถ้าผู้ใช้พูดเรื่องหนักมาก → ตอบอบอุ่น + แนะนำคุยกับคนไว้ใจ/ผู้เชี่ยวชาญ
- บันทึกอาการ (diary) + เตือนยาตามที่ตั้งเอง = ทำได้
```

---

## 8. PRIVACY & DATA

- เสียง default = local (IndexedDB) ไม่ขึ้น server ถาวร
- Server เก็บแค่ text
- user_memory: ดู/แก้/ลบได้ทุก entry
- ไม่เก็บข้อมูลอ่อนไหว (บัตรประชาชน/สุขภาพละเอียด/การเงิน)
- ทุก query มี RLS by node_id + user_id

---

**END — Technical Spec**
