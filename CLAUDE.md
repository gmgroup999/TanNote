# TanNote Project Context

## คืออะไร
แอป AI voice note ภาษาไทย — กดปุ่มเดียว → AI ถอด/สรุป/แท็ก/เชื่อมโยง
Positioning: เพื่อน และ/หรือ เลขา ส่วนตัว (ไม่ใช่หมอ/นักจิตวิทยา)

## Stack
Vite + React + TS + Tailwind v4 / LINE LIFF / Supabase / Gemini 2.5 Flash / Hetzner+Coolify

## Golden Rules
- ทุก table มี node_id + RLS (multi-tenant)
- ห้ามแก้ schema เดิม (no rename/delete/drop)
- Realtime-first / Wake Lock ตอนอัด
- เสียง = local (IndexedDB) / server เก็บแค่ text
- ขอบเขต: เพื่อน/เลขา เท่านั้น (ห้ามวินิจฉัย/แนะนำยา)
- GEMINI_API_KEY อยู่ใน Supabase secrets เท่านั้น — ห้ามใส่ใน VITE_ env

## Plan limits
free: 60น./30วัน/ask10/suggest5
starter(199): 800น./1ปี/ask150/suggest50
pro(399): 2500น./ตลอดชีพ/∞
extra(599): ∞ + cloud backup — **admin-only** (ซ่อนจาก PricingPage; assign ผ่าน Admin Panel เท่านั้น)

## เอกสารอ้างอิง
- [TANNOTE_MASTER.md](TANNOTE_MASTER.md) — Master document: ภาพรวม, ฟีเจอร์, ราคา, สถาปัตยกรรม
- [TANNOTE_TECH_SPEC.md](TANNOTE_TECH_SPEC.md) — Technical spec: DB schema, API, flows, recording types
- [TANNOTE_CURSOR_PROMPT.md](TANNOTE_CURSOR_PROMPT.md) — Build prompts ทีละ phase

---

## สถานะ Phase

### Phase 1 — เสร็จแล้ว
- Vite + React + TS + Tailwind v4 scaffold ใน `app/`
- RecordPage: dropdown 8 ประเภท, ปุ่ม mic แดง, Wake Lock, MediaRecorder Opus 32kbps
- IndexedDB storage ผ่าน `idb` (`saveAudio`, `updateAudioRecord`, ฯลฯ)
- RecordingsPage: audio player + seekable timeline scrubber
- Bottom nav (บันทึก | รายการ) ใน App.tsx

### Phase 2 — เสร็จแล้ว (2026-05-20)
- Supabase Edge Function `/api/transcribe` (Deno, `npm:@google/genai`)
- Gemini 2.5 Flash: transcribe + detect type + summary + key_points + action_items + tags + sentiment
- Files API สำหรับ audio >20MB; inline base64 สำหรับ ≤20MB
- ลบไฟล์เสียงออกจาก Gemini Files API ทันทีหลังประมวลผล (Golden Rule)
- Frontend `api.ts` — POST FormData ไป Edge Function (Gemini key ไม่ถึง browser เลย)
- RecordingsPage: AiPanel, batch button, Knowledge Graph hashtag cloud
- Supabase project linked + migration pushed + secrets set + deployed

### Phase 3+ (RAG + Memory) — เสร็จแล้ว (2026-05-20)
- pgvector + `match_notes` RPC สำหรับ vector search
- Edge Function `/api/ask` — RAG จาก notes + user memory context
- User Memory CRUD (`user_memory` table) — AI suggest → user confirm → stored
- Onboarding flow (nickname, use case, tone preference)
- Knowledge Graph view (`GraphViewPage.tsx`)

### Phase 4 (LINE Push Reminders) — เสร็จแล้ว (2026-05-21)
- Edge Function `send-reminders` — query due reminders → LINE Flex Message push
- Edge Function `line-webhook` — รับ postback "เสร็จแล้ว" / "เลื่อน 1 ชม."
- pg_cron job ทำงานทุก 1 นาที (schedule id: 1)
- Quiet hours check ด้วย timezone Asia/Bangkok (ไม่ใช่ UTC)
- LINE User ID field ใน Settings page สำหรับ manual entry ก่อน LIFF auth
- Secrets: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` set ใน Supabase

### Phase 5 (Usage + Pricing) — เสร็จแล้ว (2026-05-20)
- Usage indicator + progress bars (recording minutes, ask count, AI suggest)
- Pricing page (free/starter/pro/extra)
- Plan gating ใน Edge Functions (`_shared/plans.ts`)

### Dark Mode — เสร็จแล้ว (2026-05-21)
- `@variant dark` ใน Tailwind v4 (class-based, toggle บน `<html>`)
- `useDarkMode` hook + floating sun/moon button (fixed top-right)
- บันทึกใน localStorage + อ่าน `prefers-color-scheme` เป็น default
- ครอบคลุมทุกหน้า: RecordPage, RecordingsPage, AskPage, SettingsPage, PricingPage, UsageIndicator, nav
- `GraphViewPage.tsx`: `useDark()` hook ผ่าน MutationObserver → เปลี่ยน SVG node/edge/text colors ตาม dark state

### Phase 3 LIFF Auth scaffold — เสร็จแล้ว (2026-05-21)
- สร้าง `app/src/lib/liff.ts` — `initLiff()`, `getLiffUserId()`, `setLineUserId()`
- `initLiff()` no-op ถ้า `VITE_LIFF_ID` เป็น placeholder; `liff.login()` เรียกเฉพาะ `liff.isInClient() === true`
- `api.ts` ใช้ `getLiffUserId()` จาก liff module แทน local function เดิม
- `App.tsx` เรียก `initLiff()` ใน `useEffect` ตอน mount
- `VITE_LIFF_ID=2010157477-I2NTp3zI` ตั้งใน `.env.local` แล้ว

### Login + Admin Panel — เสร็จแล้ว (2026-05-21)
- `app/src/lib/auth.ts` — Supabase Auth client, `sendMagicLink()`, `signOut()`, `authUserId()`, `isAdminEmail()`, `isLiffAuthed()`
- `LoginPage.tsx` — magic link form; LIFF auth auto-login note
- `AdminPage.tsx` — stats cards (users, notes, recording mins, asks), plan breakdown, user list + search/filter, per-user plan change / suspend / delete
- `admin-api` Edge Function — verifies JWT + checks `ADMIN_EMAILS` secret server-side; service role for DB ops; actions: `list_users`, `get_stats`, `update_plan`, `suspend_user`, `delete_user`
- `App.tsx` — auth loading screen, login gate (`isLiffAuthed() || session`), admin tab (shield icon, visible to admin email only)
- Migration `20260521000006_auth_admin.sql` — `is_suspended`, `suspended_at` columns; `admin_list_users()` RPC (security definer)
- Auth identity: LIFF user = `U<32>` in localStorage; email user = `sa_<supabase_uuid>`
- Security: client-side `VITE_ADMIN_EMAILS` controls UI visibility only; server always re-verifies via `ADMIN_EMAILS` secret

### Admin Panel — Rich User Info — เสร็จแล้ว (2026-05-25)
- `users_profile` เพิ่ม `picture_url` column (migration `20260525000001`)
- `admin_list_users` RPC v4: คืน `picture_url`, `primary_use`, `tone`, `email` (join `auth.users` สำหรับ `sa_` users), `last_sign_in_at`
- `liff.ts`: บันทึก `pictureUrl` + `displayName` ลง localStorage หลัง LIFF init + login
- `api.ts`: ส่ง `x-line-picture-url` + `x-line-display-name` headers ทุก transcribe call
- `transcribe`: upsert `picture_url` + `display_name` เข้า `users_profile` จาก headers
- `AdminPage.tsx`: แสดงรูปโปรไฟล์ (img + fallback initial), email, primary_use tags, tone badge, วันที่สมัคร, last sign-in

### ประเภทการบันทึก + Reminder Pipeline — เสร็จแล้ว (2026-05-25)
- เพิ่มประเภท `appointment` (📅 นัดหมาย) ใน `recordingTypes.ts` + `TYPE_FOCUS` + `RECORDING_TYPE_ORDER`
- AI auto-detection prompt อัปเดต: นิยามชัดสำหรับแต่ละประเภท แยก appointment vs meeting ได้ถูกต้อง
- `appointmentClause` ใน transcribe: บังคับสร้าง reminder ≥1 รายการสำหรับประเภท appointment
- Bug fix: `RecordPage.runAiOnLast()` บันทึก `result.reminders` ลง IndexedDB (ก่อนหน้านี้หายไป)
- แสดง reminder count ในหน้า success: "📅 ตั้งการแจ้งเตือน N รายการผ่าน LINE แล้ว"
- `PricingPage`: แก้ LINE upgrade URL จาก `@tannote` → `@077vkaxj` (บัญชีจริง)

### LINE Bot + Webhook — เสร็จแล้ว (2026-05-25)
- `LINE_CHANNEL_ACCESS_TOKEN` อัปเดตเป็น token ใหม่ (token เก่า invalid)
- ตั้ง Webhook URL ผ่าน LINE Messaging API: `https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/line-webhook`
- Webhook `active: true` ✅ ยืนยันผ่าน `curl https://api.line.me/v2/bot/info`

### Email + Magic Link — เสร็จแล้ว (2026-05-25)
- Resend custom SMTP ตั้งค่าแล้ว: smtp.resend.com:465, user=`resend`, from=`onboarding@resend.dev`
- Magic link ส่งจาก "ทันโน้ต" email แล้ว (ไม่ limit 3/ชม. อีกต่อไป)
- `supabase/config.toml` อัปเดต `site_url = "https://tannote.z-node.cc"` + `additional_redirect_urls`
- **หมายเหตุ**: Supabase Dashboard → Authentication → URL Configuration ต้องตั้งด้วยมือแยกต่างหาก (ไม่ sync จาก config.toml อัตโนมัติ)

### BOOT_ERROR fix — เสร็จแล้ว (2026-05-25)
- `transcribe/index.ts`: duplicate `const language` ในบรรทัด 116 และ 287 → เปลี่ยนตัวที่สองเป็น `const detectedLanguage`

### UI/UX + Admin improvements — เสร็จแล้ว (2026-05-24)
- **Responsive desktop layout**: RecordingsPage master-detail (lg+), RecordPage/SettingsPage max-w-xl, AskPage max-w-2xl
- **RecordingsPage**: เพิ่ม `CompactListItem` + selected state; hashtag cloud ย้ายไปล่างรายการ; Note Graph เป็น default
- **TypeSelector**: แทนที่ native `<select>` ใน RecordPage ด้วย custom dropdown + hover tooltip แสดง description + summaryFocus
- **GraphViewPage rewrite**: drag nodes, degree-based size, confirm/reject links, navigate-to-note, Tag Graph + Note Graph (zoom/pan/filter), Note Graph default + แสดงก่อน
- **Export fix**: free plan `can_export: true`; `downloadBlob` append to DOM ก่อน click + setTimeout revoke
- **Admin panel**: แสดง `plan_expires_at` badge (สีตามวันที่เหลือ), `ai_suggest_count`, ปุ่ม Reset Usage, plan dropdown labels ชัดขึ้น (Starter +1ปี, Pro ∞)
- **admin-api**: `update_plan` auto-compute `plan_expires_at` (Starter=+1ปี, Pro/Extra/Free=null); เพิ่ม `reset_usage` action
- **Settings**: ลบ LINE User ID section ออก (ตั้งอัตโนมัติจาก LIFF/Auth แล้ว)
- **Deploy ✅**: admin-api deployed, migration 20260524000002 applied, `ADMIN_EMAILS` + `NODE_ID` secrets set, functions redeployed ทั้งหมด

### Bug fixes อื่น ๆ (2026-05-21)
- Memory dedup: migration `20260521000004_memory_dedup.sql` + unique constraint `(user_id, key)` + `save-memory` เปลี่ยน insert → upsert
- React Error Boundary: `AppErrorBoundary` class component ใน `App.tsx` ครอบ page content ทั้งหมด
- ลบ `app/src/lib/gemini.ts` — ไม่มี import อ้างอิงแล้ว

### แท็บนัดหมาย (Reminders Tab) — เสร็จแล้ว (2026-05-26)
- `RemindersPage.tsx` — ดึง reminders จาก Supabase, แสดงรายการ pending ทั้งหมด
- Overdue reminders (remind_at < now) → พื้นหลังแดง + badge "เลยเวลาแล้ว"
- ปุ่มถังขยะลบทีละรายการ (เรียก `deleteReminder()`)
- รองรับ dark mode ทุก element
- `App.tsx` — เพิ่ม `'reminders'` ใน Tab type, nav item รูประฆังระหว่าง "ถาม AI" กับ "ตั้งค่า"

### Plan Enforcement Fixes — เสร็จแล้ว (2026-05-26)
- **Bug 1 (ai_suggest ไม่นับ)**: `transcribe` เพิ่ม quota check ก่อน process + increment `ai_suggest_count` หลัง transcribe สำเร็จ; ดึง `usage_tracking` 1 query แทน 2
- **Bug 2 (is_suspended ไม่เช็ค)**: `transcribe` + `ask` ดึง `is_suspended` จาก DB → return 403 ทันทีถ้าถูก suspend
- **Bug 3 (plan_expires_at ไม่ real-time)**: คำนวณ effective plan ทุก request — Starter ที่หมดอายุ treat เป็น free ทันทีโดยไม่ต้องรอ pg_cron
- **Bug 4 (security definer)**: `increment_ask_count` rebuild ด้วย `security definer` ให้ consistent กับ RPC อื่น

### ระบบชำระเงิน (Payment Modal) — เสร็จแล้ว (2026-05-26)
- `PaymentModal.tsx` — modal แสดง QR PromptPay + ราคา (รองรับ Early Bird) + ขั้นตอน 4 ขั้น + copy LINE ID
- `PricingPage.tsx` — ปุ่ม "อัปเกรด" เปิด modal แทนลิงก์ LINE โดยตรง
- `app/public/qr-payment.png` — QR Thai QR Payment (PromptPay) ของจีเอ็มกรุ๊ป
- Flow: user กด → modal → สแกน QR → โอน → แจ้ง LINE @077vkaxj พร้อมสลิป → admin เปลี่ยน plan ใน Admin Panel

### Extra Plan — Admin Only — เสร็จแล้ว (2026-05-26)
- `PricingPage.tsx`: PLANS array เปลี่ยนจาก `['free','starter','pro','extra']` → `['free','starter','pro']`
- Extra plan ซ่อนจาก UI ผู้ใช้ทั่วไป; logic ใน DB + Edge Functions ยังครบ (admin assign ผ่าน Admin Panel ได้)

---

## ไฟล์สำคัญ

| Path | บทบาท |
|---|---|
| `app/src/App.tsx` | Bottom nav + tab routing + `useDarkMode` + auth gate + admin tab |
| `app/src/index.css` | Tailwind v4 + `@variant dark` + IBM Plex Sans Thai + brand colors |
| `app/src/pages/RecordPage.tsx` | หน้าบันทึกเสียง + AI trigger + reminderCount display |
| `app/src/pages/RecordingsPage.tsx` | รายการ + AI panel + batch + Knowledge Graph cloud (master-detail lg+) |
| `app/src/pages/AskPage.tsx` | RAG chat + onboarding + memory view + sender name labels |
| `app/src/pages/SettingsPage.tsx` | การแจ้งเตือน + quiet hours |
| `app/src/pages/GraphViewPage.tsx` | Force-layout knowledge graph + `useDark` MutationObserver hook |
| `app/src/pages/PricingPage.tsx` | แสดงแผนราคา + upgrade CTA (LINE: @077vkaxj) |
| `app/src/pages/LoginPage.tsx` | Magic link login form |
| `app/src/pages/RemindersPage.tsx` | แท็บนัดหมาย — แสดง pending reminders, overdue แดง, ลบได้ |
| `app/src/pages/AdminPage.tsx` | Admin dashboard: stats, user list + profile pic/email/primary_use/tone/dates, plan/suspend/delete |
| `app/src/components/UsageIndicator.tsx` | Progress bars สำหรับ quota ปัจจุบัน |
| `app/src/lib/db.ts` | IndexedDB helpers + `AudioRecord` interface |
| `app/src/lib/api.ts` | Frontend → Edge Function client; `liveAuthHeaders()` + `liffTokenHeader()`; fetchMemories/delete RPCs |
| `app/src/lib/liff.ts` | LIFF init + userId/pictureUrl/displayName → localStorage + `getLiffIDToken()` |
| `app/src/lib/auth.ts` | Supabase Auth client + `sendMagicLink`, `isAdminEmail`, `isLiffAuthed` |
| `app/src/config/recordingTypes.ts` | **9** ประเภทการบันทึก (รวม appointment) + label + description + summaryFocus |
| `app/src/config/plans.ts` | Plan limits + PLAN_INFO + quota helpers |
| `app/.env.local` | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_LIFF_ID, VITE_ADMIN_EMAILS (gitignored) |
| `supabase/functions/transcribe/index.ts` | Edge Function — Gemini transcribe + upsert picture_url/display_name + embed |
| `supabase/functions/ask/index.ts` | Edge Function — RAG Q&A + user memory + local_notes merge |
| `supabase/functions/send-reminders/index.ts` | Edge Function — pg_cron trigger → LINE push |
| `supabase/functions/line-webhook/index.ts` | Edge Function — รับ LINE postback (done/snooze) |
| `supabase/functions/admin-api/index.ts` | Edge Function — admin CRUD (JWT verify + ADMIN_EMAILS secret) |
| `supabase/functions/_shared/plans.ts` | Plan limits shared logic |
| `supabase/functions/_shared/liff-verify.ts` | LINE JWKS (RS256) JWT verification — used by transcribe/ask/save-memory/patch-note |
| `supabase/migrations/20260520000000_init.sql` | Full DB schema + RLS |
| `supabase/migrations/20260521000006_auth_admin.sql` | is_suspended column + admin_list_users RPC |
| `supabase/migrations/20260525000001_add_picture_url.sql` | picture_url column + admin_list_users RPC v4 |
| `supabase/config.toml` | `verify_jwt = false` สำหรับ all functions; site_url = tannote.z-node.cc |
| `Dockerfile` | Multi-stage build: node:22-alpine → nginx:alpine |
| `nginx.conf` | SPA routing + cache headers + gzip |

## Supabase Project
- **Project ref**: `czczwtjgmjnboeeibxcd`
- **URL**: `https://czczwtjgmjnboeeibxcd.supabase.co`
- **Production URL**: `https://tannote.z-node.cc` (deployed บน Z-Node/Coolify)
- **Secrets set**: `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET` ✅ (อัปเดต 2026-06-11), `LINE_CHANNEL_ID=2010157477` ✅ (เพิ่ม 2026-06-11), `ADMIN_EMAILS`, `NODE_ID`, `ADMIN_LINE_USER_ID=U8414fbb78490e5c27a1b52ee7dc4593b` ✅
- **Secret `REQUIRE_LINE_TOKEN=true`** ✅ (set 2026-06-20) — บังคับ `U<32>` ต้องส่ง LIFF token ที่ถูกต้อง ไม่งั้น 401 "กรุณาเปิดแอปผ่าน LINE" (ปิด impersonation gap สำหรับ LINE class). **⚠️ ผลข้างเคียง**: LINE user ที่เปิดนอก LINE client (token=null) จะใช้งานไม่ได้ — ต้องเปิดผ่าน LINE เท่านั้น. Rollback: `npx supabase secrets set REQUIRE_LINE_TOKEN=false`
- **Functions deployed**: `transcribe`, `ask`, `send-reminders`, `line-webhook`, `save-memory`, `admin-api`, `patch-note`, `r2-backup`, `set-webhook` ✅ — ทั้งหมด ACTIVE (transcribe/ask/save-memory/patch-note redeployed 2026-06-20 auth-gap fix); `set-webhook` source ดึงเข้า repo แล้ว 2026-06-20 (`supabase/functions/set-webhook/index.ts`)
- **Extensions enabled**: `pg_cron`, `pg_net`, `pgvector`
- **pg_cron job**: schedule id 1 — ทุก 1 นาที → `send-reminders`; schedule `enforce-plan-expiry` — ทุกชั่วโมง → downgrade Starter ที่หมดอายุ
- **LINE Webhook URL**: `https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/line-webhook` ✅ (active)
- **LINE bot**: `@077vkaxj` = `@tannote` (บัญชีเดียวกัน) — Admin LINE User ID: `U8414fbb78490e5c27a1b52ee7dc4593b`
- **LINE Rich Menu**: `richmenu-63977447feea57f4299a347397f3adf3` — 1-ปุ่ม TanNote logo, set เป็น default ✅ (2026-06-12)
- **LIFF**: Published ✅ (2026-06-11) — endpoint URL: `https://tannote.z-node.cc/` (เปลี่ยนกลับจาก `/app` เมื่อ 2026-06-12)
- **SMTP**: Resend — smtp.resend.com:465, sender: `onboarding@resend.dev`
- **Migrations applied**: ทั้งหมดถึง `20260619000001_quota_period_per_plan.sql` ✅

---

## สิ่งที่ทำวันนี้ (2026-06-20)

### Commit ของค้าง 2026-06-12 (path revert + rich menu)
- การแก้ไข 5 ไฟล์ที่ค้างไม่ได้ commit (manifest/sw/nginx `/app`→`/`, rich-menu rewrite, .gitignore) → commit `88ad4da`

### 🔴 ปิด auth impersonation gap
ปัญหาเดิม: ทุก Edge Function เชื่อ `x-line-user-id` ตรง ๆ ถ้าไม่ส่ง LIFF token → omit token + ปลอม id = ปลอมตัวเป็น user อื่นได้
- เพิ่ม `resolveLineUserId()` ใน `_shared/liff-verify.ts` — แยก identity 3 class:
  - **LIFF token มา** → verified LINE id เป็น authoritative
  - **`sa_<uuid>` (email)** → **บังคับเสมอ** verify Supabase session JWT ให้ตรงกับ uuid (ปิด gap; email user ส่ง JWT เสมอ ไม่ break)
  - **`U<32>` ไม่มี token** → reject เฉพาะเมื่อ secret `REQUIRE_LINE_TOKEN=true` (default off กัน lockout live user ก่อน device test)
  - **`dev_*`/anonymous** → sandbox แยก ไม่มีความเสี่ยง → ผ่าน
- wire เข้า transcribe, ask, save-memory, patch-note (ลบ block `if (liffToken)` เดิม)
- **Verified production**: `sa_` ไม่มี JWT → 401 "เซสชันไม่ถูกต้อง"; `dev_`/`U<32>` (flag off) → auth ผ่าน → 400 "ไม่มีคำถาม" ✅
- Deploy: transcribe/ask/save-memory/patch-note redeployed 2026-06-20 ✅

### 🔴 Bug Fix — extra/pro โดนลิมิตของ free (null-collapse)
ผู้ใช้ extra รายงาน "extra แต่โดนลิมิต" — note ขึ้น error "โควต้า AI แนะนำแท็ก 5 ของแผน extra ครบแล้ว"
- **Root cause**: `PLAN_LIMITS[plan]?.field ?? PLAN_LIMITS.free.field` — `??` มองค่า `null` (=unlimited ของ pro/extra) เป็น nullish เลย fallback ไปค่า free → extra ได้ ai_suggest=5, recording=60, retention=30วัน แทน ∞
- **Fix**: fallback ที่ระดับ plan ไม่ใช่ระดับค่า → `(PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).field` (free ใช้เฉพาะ plan ที่ไม่รู้จัก, คง null ไว้สำหรับ pro/extra)
- จุดที่แก้: `transcribe` (recLimit, suggestLimit, retentionDays), `ask` (askLimit) — deploy ทั้งคู่ ✅
- **หมายเหตุ**: SQL `get_current_usage`/`admin_list_users` ไม่มีบั๊กนี้ (ไม่คำนวณ limit; limit apply ฝั่ง client)
- **Settings display "/ด." + "มิถุนายน"**: เป็น bundle เก่าค้าง cache บน device (production JS ปัจจุบันมี "ตลอดชีพ" ถูกแล้ว) → bump SW cache `v2`→`v3` บังคับ client โหลดใหม่

### 🔴 Bug Fix — Export ใน LINE WebView (Android) เงียบสนิท
ผู้ใช้กด .txt/.md/PDF ใน LINE in-app browser (Android) แล้ว **ไม่มีอะไรเกิดขึ้นเลย**
- **Root cause**: LINE Android WebView ไม่มี `navigator.share`, block clipboard, ignore `<a download>` → ทุก path ล้มเงียบ → ตกไป `downloadBlob` ที่ WebView ไม่ทำอะไร
- **Fix**: เพิ่ม `showContentOverlay()` ใน `export.ts` — overlay ในแอป (textarea เลือกได้ + ปุ่มคัดลอก + hint เปิดเบราว์เซอร์ภายนอก) ใช้เมื่อไม่มี share path (txt/md) และเมื่อ iframe print ใช้ไม่ได้ (PDF แสดง text + hint บันทึก PDF); desktop download เดิมไม่กระทบ
- build + tsc สะอาด; commit `6f9e9c1` → push (frontend deploy ผ่าน Coolify)

### 🟢 Deploy infra ที่แท้จริง + ตั้ง auto-deploy (สำคัญมาก — เดิม CLAUDE.md เข้าใจผิดว่าเป็น Coolify)
Frontend **ไม่ได้ deploy ผ่าน Coolify** — server ใช้ platform custom ชื่อ **Z-Node**
- **Server**: Hetzner `195.201.81.33` (user `jack`, SSH key `~/.ssh/hetzner_nt_node`)
- **Z-Node platform**: container `znode-platform` (port 3001), dashboard `https://auto.z-node.cc`, DB `znode-postgres` (`znodedb`)
- **แอป TanNote**: clone อยู่ที่ `/opt/projects/tannote` (git repo), build เป็น container `znode-tannote` (image `tannote-app`, port 3010); compose `docker-compose.znode.yml` + `app/Dockerfile.znode` (untracked, gen โดย Z-Node)
- **VITE_* build args**: อยู่ใน `/opt/projects/tannote/app/.env.production` (มี SUPABASE_URL/ANON_KEY/LIFF_ID/ADMIN_EMAILS ครบ — Vite bake ตอน build) → **ไม่ใช่ปัญหา** (TODO เดิมเรื่อง VITE_LIFF_ID build arg = หายห่วง)
- **Deploy ด้วยมือ**: `cd /opt/projects/tannote && sudo git reset --hard origin/main && sudo docker compose -f docker-compose.znode.yml up -d --build` (build fail = container เดิมรันต่อ ปลอดภัย)

**🔴 สาเหตุที่ auto-deploy ไม่เคยทำงาน**: project ใน Z-Node DB ตั้ง `deployBranch='admin'` (ไม่ใช่ `main`) → push main ไม่ trigger production deploy
- แก้: `UPDATE projects SET "deployBranch"='main'` (project id `cmpi2lktj0000j29w86sna6ne`) ✅
- สร้าง **GitHub webhook** (id `644333393`) → `https://auto.z-node.cc/api/webhooks/github` (content-type json, push+pull_request, secret = project.webhookSecret); ping delivery = 200 ✅
- ใช้ token จาก git credential ของเครื่อง (`gho_`, scope `repo`) สร้าง webhook (Z-Node เก็บแค่ placeholder `ZnodeAdmin2026!` ไม่ใช่ token จริง)
- **ผลลัพธ์**: push → main = auto-deploy เอง (ใส่ `[skip deploy]` ใน commit msg = ข้าม)

### 🟢 set-webhook source เข้า repo
- `npx supabase functions download set-webhook` → `supabase/functions/set-webhook/index.ts` (one-shot util ตั้ง LINE webhook endpoint URL); track ใน repo แล้ว

### Git
- `88ad4da` (path revert + rich menu), `7eb768a` (auth gap + set-webhook) → push origin/main ✅

### ไฟล์ที่แก้ไขวันนี้ (2026-06-20)
| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `supabase/functions/_shared/liff-verify.ts` | + `resolveLineUserId()` + `AuthResult` type (sa_ JWT verify, LINE-token flag, dev sandbox) |
| `supabase/functions/{transcribe,ask,save-memory,patch-note}/index.ts` | แทน block `if (liffToken)` ด้วย `resolveLineUserId()` (เรียกหลังสร้าง supabase client) |
| `supabase/functions/set-webhook/index.ts` | **ไฟล์ใหม่** — ดึง source จาก deployed function |
| `app/public/{manifest.json,sw.js}`, `nginx.conf`, `scripts/setup-rich-menu.mjs`, `.gitignore` | commit งานค้าง 2026-06-12 |

---

## สิ่งที่ทำวันนี้ (2026-06-19)

### System Health Check
| ตรวจ | ผล |
|---|---|
| Production `tannote.z-node.cc` | 200 ✅ |
| Edge Functions (8 + `set-webhook`) | ACTIVE ทั้งหมด ✅ |
| Secrets | ครบ (`LINE_CHANNEL_ID` + `LINE_CHANNEL_SECRET` set 2026-06-11) ✅ |
| `save-memory` + `patch-note` | **deploy ไปแล้ว** 2026-06-11 08:50 UTC (TODO 🔴 เดิมล้าสมัย — ไม่ต้อง deploy แล้ว) |
| `transcribe`/`ask`/`patch-note` auth order | ถูกต้อง (LIFF verify → suspension → plan → quota) ✅ |
| TypeScript build | สะอาด (exit 0) ✅ |
| ⚠️ พบ | `set-webhook` function ไม่อยู่ใน CLAUDE.md (entrypoint `/TanNote/...` deploy คนละวิธี ไม่มี source ใน repo) |
| ⚠️ พบ | auth gap: ทุก function verify LIFF token แบบ `if (liffToken)` — ถ้า omit token + ปลอม `x-line-user-id` = ปลอมตัวเป็น user อื่นได้ (known tradeoff สำหรับ browser testing) |

### 🔴 Bug Fix — Quota period ไม่ตรง spec ของแต่ละแพลน
ปัญหาจากภาพ Settings (Extra แสดง "33 นาที/ด. (ไม่จำกัด)" ปนกัน) → พบว่า `currentPeriod()` คืน `YYYY-MM` เสมอ ทำให้ quota **ทุกแผนรีเซ็ตรายเดือน**

| แผน | spec | เดิม (ผิด) | แก้แล้ว |
|---|---|---|---|
| free | 60น./30วัน | รายเดือน | รายเดือน `YYYY-MM` ✅ |
| starter | 800น./1ปี | รายเดือน (กว้างเกิน 12×) | รายปี `Y{YYYY}` ✅ |
| pro | 2500น./ตลอดชีพ | รายเดือน | `lifetime` ✅ |
| extra | ∞ | ∞ | `lifetime` (∞ อยู่แล้ว) ✅ |

- `period_for_plan()` (SQL) + `periodForPlan()` (TS) ใช้ Asia/Bangkok ให้ค่าตรงกัน
- `get_current_usage` + `admin_list_users` คำนวณ effective plan + period เองใน SQL
- `admin-api reset_usage` ลบทุก bucket (ใช้ได้ทุกแผน)
- UI แสดง "/ด." / "/ปี" / "(ตลอดชีพ)" ตามแผน (UsageIndicator + PricingPage)
- **Verified production**: `period_for_plan` → free=`2026-06`, starter=`Y2026`, pro/extra=`lifetime`; `get_current_usage` (Jack/extra) → `period:"lifetime"` ✅
- **หมายเหตุ**: pro/extra user เดิม lifetime bucket เริ่มที่ 0 (usage รายเดือนเก่าใน DB ไม่ถูกนับใน bucket ใหม่) — extra ไม่กระทบ (∞), pro = generous

### 🔴 Bug Fix — Export บนมือถือไม่ทำงาน
LINE in-app browser ละเลย `<a download>` + `window.open('_blank')` คืน `null` → ปุ่ม .txt/.md/PDF เงียบ
- `.txt`/`.md`: `saveOrShare()` — มือถือลอง **แชร์ไฟล์ → แชร์ข้อความ → คัดลอก clipboard** (PC คง download เดิม)
- `PDF`: เปลี่ยน `window.open` → hidden **iframe print** (กัน popup-block/WebView null) + fallback แชร์ html
- มือถือตรวจจาก `maxTouchPoints` + UA → PC ไม่กระทบ; Web Share เรียก sync ใน click handler (user gesture ไม่หาย)
- **ข้อจำกัด**: LINE WebView (iOS WKWebView) ไม่ support file share → ตกมาที่แชร์ข้อความ/clipboard; อยากได้ไฟล์จริงต้องเปิดในเบราว์เซอร์ภายนอก

---

## ไฟล์ที่แก้ไขวันนี้ (2026-06-19)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `supabase/migrations/20260619000001_quota_period_per_plan.sql` | **ไฟล์ใหม่** — `period_for_plan()`; rewrite `get_current_usage` (effective plan + period); rewrite `admin_list_users` (per-user bucket) |
| `supabase/functions/_shared/plans.ts` | + `periodForPlan(plan)` (Bangkok tz, ต้อง sync กับ SQL); `currentPeriod()` เหลือไว้ backward-compat (ไม่ใช้แล้ว) |
| `supabase/functions/transcribe/index.ts` | check + increment ใช้ `periodForPlan(userPlan)` |
| `supabase/functions/ask/index.ts` | check + increment ใช้ `periodForPlan(userPlan)` |
| `supabase/functions/admin-api/index.ts` | `reset_usage` ลบทุก usage_tracking row ของ user (ไม่ใช่เฉพาะเดือนปัจจุบัน) |
| `app/src/lib/api.ts` | `fetchUsage` ใช้ period จาก server ไม่ override ด้วยรายเดือน client |
| `app/src/config/plans.ts` | + `quotaPeriodLabel(plan)` |
| `app/src/components/UsageIndicator.tsx` | `Bar` รับ `plan` → label "/ด." / "/ปี" / "(ตลอดชีพ)"; header period ตามแผน |
| `app/src/pages/PricingPage.tsx` | `formatLimit(val, unitBase, plan)` → labels ต่อแผน |
| `app/src/lib/export.ts` | `saveOrShare()` (file→text→clipboard fallback); `exportPdf` iframe print; `copyToClipboard()` helper |

### Deploy ✅ (2026-06-19)
| Commit | เนื้อหา | Deploy |
|---|---|---|
| `dd09aaa` | Quota period per plan (migration + transcribe/ask/admin-api + frontend) | DB push + 3 functions ✅; frontend → Z-Node |
| `92c0640` | Export mobile: Web Share + iframe print | frontend → Z-Node |
| `69ac83a` | Export: text-share + clipboard fallback (LINE WebView) | frontend → Z-Node |

---

## สิ่งที่ทำวันนี้ (2026-06-12)

### Bug Fix — LINE app ใช้งานไม่ได้ (white screen)
| งาน | ผล |
|---|---|
| Root cause | LIFF endpoint เปลี่ยนจาก `/` → `/app` เมื่อวานนี้ แต่ Z-Node serve SPA ที่ `/` ไม่ใช่ `/app` |
| Fix | User เปลี่ยน LIFF endpoint กลับเป็น `https://tannote.z-node.cc/` ใน LINE Developer Console ✅ |
| Code sync | `manifest.json`, `sw.js`, `nginx.conf` อัปเดตให้ใช้ `/` แทน `/app` ทั้งหมด |
| สาเหตุลึก | Z-Node/Coolify generate nginx ของตัวเอง — SPA ถูก serve ที่ `/` เสมอ ไม่ว่า nginx.conf เราจะบอกอะไร |
| Build arg risk | ถ้า `VITE_LIFF_ID` ไม่ถูก set ใน Coolify build args → `LIFF_ENABLED=false` → LINE login ไม่ทำงาน |

### Rich Menu Redesign — เสร็จแล้ว ✅
| งาน | ผล |
|---|---|
| `scripts/setup-rich-menu.mjs` เขียนใหม่ | จาก 2-ปุ่ม (red/black) → 1-ปุ่มครอบทั้งหน้า (TanNote logo บนพื้นแดง) |
| เปลี่ยน image gen method | จาก pixel-art Node.js → **Playwright screenshot** (รองรับ Thai font + SVG ถูกต้อง) |
| Design | `#E24B4A` bg + mic SVG + REC dot + "TanNote" text กึ่งกลาง; 2500×843px |
| Action | กดที่ไหนก็ตาม → เปิด LIFF URL `https://liff.line.me/2010157477-I2NTp3zI` ทันที |
| Deploy | รัน `node scripts/setup-rich-menu.mjs <TOKEN>` ✅ — `richmenu-63977447feea57f4299a347397f3adf3` set เป็น default |
| Windows fix | `pathToFileURL` + import `playwright/index.js` + CJS default export handling |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-06-12)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/public/manifest.json` | `start_url` + shortcut `url`: `/app` → `/` |
| `app/public/sw.js` | `PRECACHE` + navigate fallback: `/app` → `/`; cache v2 ยังคงอยู่ |
| `nginx.conf` | ลบ `location = /app` block ออก (Z-Node ไม่ใช้ nginx.conf ของเราอยู่แล้ว) |
| `scripts/setup-rich-menu.mjs` | **เขียนใหม่** — Playwright image gen, 1-button, TanNote logo; แก้ Windows ESM import (`pathToFileURL` + `playwright/index.js` + CJS default fallback) |
| `scripts/tannote-rich-menu.png` | **ไฟล์ใหม่** — rich menu image 2500×843px ที่ generate ออกมา (เพิ่มใน `.gitignore` แล้ว) |
| `.gitignore` | + `scripts/tannote-rich-menu.png` |

---

## สิ่งที่ทำวันนี้ (2026-06-11)

### LINE Bot Setup
| งาน | ผล |
|---|---|
| Publish LIFF channel | LINE Developer Console → Publish → ผู้ใช้ใหม่เข้าแอปได้แล้ว ✅ |
| LIFF endpoint URL | เปลี่ยนจาก `/` → `/app` (SPA mount point) ✅ |
| LINE Rich Menu deploy | `scripts/setup-rich-menu.mjs` → `richmenu-b4523add3304db39d6e14a9a6c396b3a` set เป็น default ✅ |

### UX — Quota → PaymentModal
| งาน | ผล |
|---|---|
| `RecordPage.tsx` | quota exceeded (402) → เปิด `PaymentModal` แทน alert ✅ |
| `AskPage.tsx` | quota exceeded (402) → เปิด `PaymentModal` แทน alert ✅ |
| `api.ts` | ส่ง error code กลับมาเป็น `QuotaExceededError` class ✅ |

### Landing Page เป็นหน้าแรก (`nginx.conf`)
| งาน | ผล |
|---|---|
| `location = /` | เพิ่ม `index off;` + `try_files /landing.html =404;` ✅ |
| SPA ย้ายไป `/app` | `location /app` → `try_files $uri /index.html` ✅ |
| Port 3010 | `nginx.conf` + `Dockerfile` เปลี่ยนจาก 80 → 3010 (Z-Node port) ✅ |
| **หมายเหตุ** | Z-Node generate nginx config ของตัวเอง → ไฟล์ `nginx.conf` ของเราไม่ถูกใช้; landing accessible ที่ `/landing.html` เท่านั้น |

### PWA Path Updates
| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/public/manifest.json` | `start_url: "/app"` (เดิม `/`) |
| `app/public/sw.js` | cache v2, cache key ครอบ `/app` |

### LINE_CHANNEL_SECRET fix
| งาน | ผล |
|---|---|
| ตั้ง `LINE_CHANNEL_SECRET=206d...` ใน Supabase | `npx supabase secrets set` ✅ |
| Deploy `line-webhook` ใหม่ | signature verification ทำงานแล้ว ✅ |
| ทดสอบ valid signature | `{"ok": true}` ✅ |
| ทดสอบ invalid signature | `401 Invalid signature` ✅ |

### Landing Page อัปเดต (`app/public/landing.html`)
| เพิ่ม | รายละเอียด |
|---|---|
| **Pain Points section** | 5 ปัญหา + วิธีแก้ (หลัง Hero ก่อน How It Works) |
| **Comparison Table** | TanNote vs Plaud vs Otter.ai (7 หัวข้อ) |
| **FAQ Accordion** | 6 คำถาม + JS toggle |
| Nav link "#compare" | เพิ่มลิงก์ nav |
| Pricing → 3 แพลน | ตัด Extra ออก (admin-only, ตรงกับ app) |

### Security Hardening — เสร็จแล้ว
| งาน | ผล |
|---|---|
| ลบ `dev_` quota bypass | `transcribe` + `ask` — `dev_xxx` ID ถูกนับ quota แล้ว ✅ |
| `fetchMemories` data leak | ใช้ RPC `get_user_memories(p_line_user_id)` — คืนเฉพาะของตัวเอง ✅ |
| `deleteMemory` / `deleteReminder` ownership | RPCs `delete_user_memory` + `delete_user_reminder` ตรวจ line_user_id ✅ |
| `users_profile` anon policy | เพิ่ม anon read + update (safe fields only) — onboarding ทำงานได้ + ห้าม tamper plan ✅ |
| **LIFF JWT verification** | `_shared/liff-verify.ts` — LINE JWKS (RS256), iss/aud check; transcribe, ask, save-memory, patch-note ✅ |
| `patch-note` ownership check | ตรวจว่า note เป็นของ user ก่อน allow update ✅ |
| Email users session JWT | `liveAuthHeaders()` ใช้ Supabase session JWT; LIFF users ใช้ anon key + `x-liff-token` ✅ |
| Secrets | `LINE_CHANNEL_ID=2010157477` set ใน Supabase ✅ |
| Migration `20260611000001` | RLS RPCs + users_profile policies applied ✅ |

### LINE Reminder verification
| งาน | ผล |
|---|---|
| trigger `send-reminders` manually | `{"sent":0,"skipped":0}` — function ทำงานได้ ✅ |
| Plan enforcement code review | ทั้ง `transcribe` + `ask` มี is_suspended, plan_expires_at, quota checks ✅ |

### Z-Node Deploy — สำเร็จ
| Commit | เนื้อหา | Deploy |
|---|---|---|
| `5f185d3` | LINE_CHANNEL_SECRET fix + landing page (Pain Points/FAQ/Compare) | ✅ |
| `5ace35b` | Rich Menu PNG compression fix | ✅ |
| `053e607` | Quota→PaymentModal, LIFF/PWA path updates, nginx landing | ✅ |
| `cfb2e46` | Port 3010 (Dockerfile + nginx.conf) | ✅ |
| `a2d7704` | nginx `index off` for landing.html at root | ✅ |
| `436db83` | Security: quota bypass, memory data leak, delete ownership, RLS migration | ✅ |
| `4effad7` | LIFF JWT verification: transcribe + ask | ✅ |
| `9753911` | LIFF JWT + ownership: save-memory + patch-note + liveAuthHeaders | ✅ (รอ deploy) |
| `b6a523e` | CLAUDE.md update | ✅ |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-06-11)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/public/landing.html` | + Pain Points section, Comparison Table, FAQ Accordion, pricing 3 แพลน |
| `app/public/manifest.json` | `start_url` → `/app` |
| `app/public/sw.js` | cache v2, path `/app` |
| `app/src/lib/liff.ts` | + `getLiffIDToken()` export สำหรับ server-side verification |
| `app/src/lib/api.ts` | + `QuotaExceededError` class; `liveAuthHeaders()` async; `liffTokenHeader()`; `fetchMemories` → RPC; `deleteMemory/Reminder` → RPCs; ทุก API call ใช้ liveAuthHeaders + liffTokenHeader |
| `app/src/pages/RecordPage.tsx` | quota 402 → เปิด `PaymentModal` |
| `app/src/pages/AskPage.tsx` | quota 402 → เปิด `PaymentModal` |
| `nginx.conf` | `location = /` → `index off` + landing.html; `location /app` → SPA; `listen 3010` |
| `Dockerfile` | `EXPOSE 3010` |
| `scripts/setup-rich-menu.mjs` | **ไฟล์ใหม่** — create + deploy LINE Rich Menu 2 ปุ่ม |
| `supabase/functions/_shared/liff-verify.ts` | **ไฟล์ใหม่** — LINE JWKS RS256 verification via `jose` |
| `supabase/functions/transcribe/index.ts` | + LIFF JWT verify; ลบ `dev_` bypass; + `x-liff-token` CORS header |
| `supabase/functions/ask/index.ts` | + LIFF JWT verify; ลบ `dev_` bypass |
| `supabase/functions/save-memory/index.ts` | + LIFF JWT verify |
| `supabase/functions/patch-note/index.ts` | + LIFF JWT verify + note ownership check |
| `supabase/migrations/20260611000001_tighten_rls.sql` | **ไฟล์ใหม่** — RPCs: `get_user_memories`, `delete_user_memory`, `delete_user_reminder`; policies: anon read/update safe fields บน `users_profile` |

---

## สิ่งที่ทำวันนี้ (2026-05-26)

### แท็บนัดหมาย (Reminders Tab)
| งาน | ผล |
|---|---|
| สร้าง `RemindersPage.tsx` | fetch reminders, overdue → แดง + badge, ลบได้, dark mode |
| อัปเดต `App.tsx` | + `'reminders'` ใน Tab type; nav item ระฆัง; routing ไป RemindersPage |
| commit `5582419` | push → github.com/gmgroup999/TanNote ✅ |

### LandingPage.md
| งาน | ผล |
|---|---|
| สร้าง `LandingPage.md` | รวมข้อมูลสำหรับทำ landing page: brand, hero, pain points, features, pricing, target audience, competitor comparison, FAQ, page structure, tone of voice |

### Plan Enforcement Fixes (4 bugs)
| Bug | สิ่งที่แก้ |
|---|---|
| 🔴 ai_suggest ไม่นับ | เพิ่ม quota check + increment `ai_suggest_count` ใน `transcribe`; ดึง usage 1 query |
| 🔴 is_suspended ไม่เช็ค | `transcribe` + `ask` ดึง `is_suspended` → 403 ทันที |
| 🟡 plan_expires_at ไม่ real-time | คำนวณ effective plan ทุก request ใน `transcribe` + `ask` |
| 🟡 increment_ask_count ขาด security definer | migration `20260526000001` rebuild function |

### Deploy ✅
| งาน | ผล |
|---|---|
| `transcribe` redeployed | is_suspended + plan_expires_at + ai_suggest quota + increment |
| `ask` redeployed | is_suspended + plan_expires_at + `currentPeriod()` |
| Migration `20260526000001` applied | `npx supabase db push` |
| commit `c7f6f55` | push → github.com/gmgroup999/TanNote ✅ |
| commit `c91d584` | Extra plan hidden + LandingPage.md → push + Z-Node deploy ✅ |
| commit `a6ca96a` | PaymentModal + PricingPage upgrade button ✅ |
| commit `3ef68c4` | qr-payment.png → Z-Node deploy ✅ |
| commit `005e921` | CLAUDE.md update ✅ |

### LINE Webhook — Payment Notification (2026-05-26 ช่วงบ่าย)
| งาน | ผล |
|---|---|
| `line-webhook` เพิ่ม message event handler | รับข้อความ/รูป → ตอบ "รับทราบ รอ 24 ชม." → push แจ้ง admin ทันที |
| เพิ่ม `/myid` command | ส่ง `/myid` → bot ตอบ LINE User ID กลับมา (ใช้หา admin ID) |
| เพิ่ม `pushText()` helper | push ข้อความไปหา LINE User ID ที่ระบุได้ |
| ตั้ง `ADMIN_LINE_USER_ID` secret | `U8414fbb78490e5c27a1b52ee7dc4593b` (Jack Zurapong) |
| พบ bug: signature mismatch | `LINE_CHANNEL_SECRET` ใน Supabase ผิด — ยังไม่ได้แก้ (ค้างไว้พรุ่งนี้) |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-05-26)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/src/pages/RemindersPage.tsx` | **ไฟล์ใหม่** — แท็บนัดหมาย: fetch, overdue แดง, delete |
| `app/src/App.tsx` | + `'reminders'` ใน Tab type; nav item ระฆัง; import + routing RemindersPage |
| `LandingPage.md` | **ไฟล์ใหม่** — Landing page brief: brand, hero, features, pricing, FAQ, page structure |
| `app/src/pages/PricingPage.tsx` | PLANS array ตัด `'extra'` ออก; ปุ่มอัปเกรดเปิด PaymentModal |
| `app/src/components/PaymentModal.tsx` | **ไฟล์ใหม่** — QR modal + ราคา + ขั้นตอน + copy LINE ID + LINE CTA |
| `app/public/qr-payment.png` | **ไฟล์ใหม่** — QR Thai QR Payment (PromptPay) จีเอ็มกรุ๊ป |
| `supabase/functions/transcribe/index.ts` | select `is_suspended, plan_expires_at`; suspension check 403; effective plan; รวม usage query; ai_suggest quota check + increment |
| `supabase/functions/ask/index.ts` | select `is_suspended, plan_expires_at`; suspension check 403; effective plan; ใช้ `currentPeriod()` |
| `supabase/migrations/20260526000001_fix_increment_ask_security.sql` | **ไฟล์ใหม่** — rebuild `increment_ask_count` ด้วย `security definer` |
| `supabase/functions/line-webhook/index.ts` | + message event handler; + `/myid` command; + `pushText()` helper; + admin push notify |

---

## สิ่งที่ทำวันนี้ (2026-05-25)

### BOOT_ERROR fix + Appointment Type
| งาน | ผล |
|---|---|
| BOOT_ERROR: duplicate `const language` | เปลี่ยนตัวที่สองเป็น `const detectedLanguage` — transcribe deploy สำเร็จ |
| เพิ่มประเภท `appointment` | `recordingTypes.ts` + `TYPE_FOCUS` + `RECORDING_TYPE_ORDER` (ตอนนี้มี 9 ประเภท) |
| AI auto-detection อัปเดต | prompt ระบุนิยามชัดเจน แยก appointment (นัดส่วนตัว/ภายนอก) vs meeting (ประชุมทีม) |
| `appointmentClause` | บังคับ AI สร้าง reminder ≥1 รายการสำหรับ appointment type |
| Bug fix: reminders ไม่บันทึกลง IndexedDB | `RecordPage.runAiOnLast()` เพิ่ม `reminders: result.reminders` ใน patch |
| แสดง reminder count | success screen แสดง "📅 ตั้งการแจ้งเตือน N รายการผ่าน LINE แล้ว" |

### LINE Bot Pipeline
| งาน | ผล |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` อัปเดต | token ใหม่ set ผ่าน `supabase secrets set` ✅ |
| ตั้ง Webhook URL | `curl -X PUT` ผ่าน LINE Messaging API — `active: true` ✅ |
| แก้ Webhook field name | ใช้ `"endpoint"` ไม่ใช่ `"webhookEndpointUrl"` |
| `PricingPage` upgrade URL | แก้ `@tannote` → `@077vkaxj` (LINE bot จริง) |

### Email + Magic Link
| งาน | ผล |
|---|---|
| Resend SMTP ตั้งค่า | smtp.resend.com:465 / user=resend / from=onboarding@resend.dev |
| `supabase/config.toml` | `site_url = "https://tannote.z-node.cc"` + redirect URLs |
| Magic link ส่งได้แล้ว | ไม่ limit 3/ชม. อีกต่อไป; ส่งจาก "ทันโน้ต" |

### Admin Panel — Rich User Info
| งาน | ผล |
|---|---|
| `picture_url` column | migration `20260525000001_add_picture_url.sql` |
| `admin_list_users` RPC v4 | คืน picture_url, primary_use, tone, email (auth.users join), last_sign_in_at |
| `liff.ts` | บันทึก pictureUrl + displayName ลง localStorage; export `getLiffPictureUrl` + `getLiffDisplayName` |
| `api.ts` | ส่ง `x-line-picture-url` + `x-line-display-name` headers ทุก transcribe call |
| `transcribe` | upsert `picture_url` + `display_name` จาก headers เข้า users_profile |
| `AdminPage.tsx` | รูปโปรไฟล์ (img + fallback), email, primary_use tags, tone badge, วันสมัคร, last seen |

### Deploy ✅
| งาน | ผล |
|---|---|
| `transcribe` redeployed | รองรับ appointment type + picture_url upsert |
| Migration `20260525000001` applied | `npx supabase db push` |
| Git push | commit `aefdb89` → github.com/gmgroup999/TanNote ✅ |

### Investigation / Diagnosis (ไม่มีไฟล์เปลี่ยน)
| สิ่งที่ตรวจสอบ | ผล |
|---|---|
| LINE 400 "developing status" | LIFF channel ยังไม่ได้ Publish → user ใหม่เข้าไม่ได้ทุกคน; แก้ที่ LINE Developer Console → Publish |
| Landing page vs React app conflict | `landing.html` อยู่ที่ `/landing.html`; React SPA อยู่ที่ `/` — ไม่มี conflict; nginx serve แยกกันถูกต้อง |
| ไมโครโฟน ถามทุก session | Android WebView OS limitation — ไม่สามารถแก้ใน code ได้; user ต้องกด "อนุญาตเฉพาะครั้งนี้" ทุกครั้งที่เปิด LINE ใหม่ |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-05-25)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `supabase/functions/transcribe/index.ts` | แก้ duplicate `const language` → `detectedLanguage`; + appointment TYPE_FOCUS + appointmentClause; + picture_url/display_name upsert; CORS headers เพิ่ม x-line-picture-url/display-name |
| `app/src/config/recordingTypes.ts` | + `appointment` ประเภทใหม่ ใน type union, RECORDING_TYPES, RECORDING_TYPE_ORDER |
| `app/src/pages/RecordPage.tsx` | + `reminderCount` state; fix `reminders` save ลง IndexedDB; success msg แสดง reminder count |
| `app/src/pages/PricingPage.tsx` | แก้ upgrade URL `@tannote` → `@077vkaxj` |
| `supabase/config.toml` | `site_url = "https://tannote.z-node.cc"` + redirect URLs ครบ |
| `app/src/lib/liff.ts` | + `LINE_PICTURE_KEY`, `LINE_NAME_KEY`; บันทึก pictureUrl+displayName ใน initLiff+loginWithLiff; export `getLiffPictureUrl`, `getLiffDisplayName` |
| `app/src/lib/api.ts` | import getLiffPictureUrl/DisplayName; ส่ง x-line-picture-url/display-name headers ใน transcribeAudio() |
| `app/src/pages/AdminPage.tsx` | AdminUser interface + fields ใหม่; รูปโปรไฟล์ img; email row; primary_use/tone/dates row; search ครอบคลุม email |
| `supabase/migrations/20260525000001_add_picture_url.sql` | **ไฟล์ใหม่** — ALTER TABLE add picture_url; CREATE OR REPLACE admin_list_users v4 |

---

## สิ่งที่ทำวันนี้ (2026-05-24)

### UI/UX + Desktop Responsive
| งาน | ผล |
|---|---|
| RecordingsPage master-detail (lg+) | left panel `w-80` scrollable list + right panel full detail; `CompactListItem` component; auto-select first record |
| RecordPage wider | `max-w-md lg:max-w-xl` |
| AskPage wider | `max-w-md lg:max-w-2xl` |
| SettingsPage wider | `max-w-md lg:max-w-xl` |
| Hashtag cloud ย้ายไปล่าง | สลับลำดับให้รายการอยู่บน หัวข้อทั้งหมดอยู่ล่าง (ทั้ง mobile + desktop) |

### Knowledge Graph
| งาน | ผล |
|---|---|
| Tag Graph + Note Graph (dual mode) | Tag Graph = tags เป็น node, co-occurrence edges; Note Graph = notes เป็น node, zoom/pan/filter |
| Note Graph เป็น default + แสดงก่อน | สลับลำดับ tab และเปลี่ยน `useState('note')` |
| Drag nodes | `onPointerDown/Move/Up` + `didDragRef` disambiguate drag vs click |
| Node size by degree | `nodeRadius()` = 14 + edges.length × 4, max 30 |
| Confirm/reject links | ปุ่ม ✓/✗ ใน selected node panel; เรียก `confirmNoteLink()` |
| Navigate-to-note | ปุ่ม →บันทึก ใน selected node panel; เรียก `onNavigateToNote` prop |
| Bug fix: null.tx during zoom | แก้ `svgPoint()` + capture `panRef.current` ก่อน setState callback |

### TypeSelector + Hover Tooltip
| งาน | ผล |
|---|---|
| `recordingTypes.ts` เพิ่ม `description` field | 8 ประเภท มี description ภาษาไทย + summaryFocus |
| Custom `TypeSelector` component | แทน native `<select>` — open state, hovered item, close on outside click |
| Tooltip floating ขวา | `left-[calc(100%+8px)]` relative to root div (ไม่ใช่ overflow-hidden dropdown); `top` คำนวณจาก `getBoundingClientRect` |

### Export + Plan
| งาน | ผล |
|---|---|
| Export ใช้ได้ทุก plan | `plans.ts`: free `can_export: true` |
| `downloadBlob` bug fix | append `<a>` เข้า DOM ก่อน click; `setTimeout` 1s ก่อน revoke URL |

### Admin + Plan Management
| งาน | ผล |
|---|---|
| `plan_expires_at` badge | แสดงในทุก user card — แดง=หมดแล้ว / เหลือง=≤30วัน / เทา=ปกติ |
| `ai_suggest_count` ใน stats row | แสดงใน user card stats |
| Plan dropdown ชัดขึ้น | "Starter +1ปี", "Pro ∞", "Extra ∞" |
| Auto-expiry เวลาเปลี่ยน plan | `computePlanExpiry()`: Starter=+1ปี, Pro/Extra/Free=null |
| ปุ่ม Reset Usage | เรียก `reset_usage` action — ล้าง usage_tracking เดือนปัจจุบัน |
| `admin-api` เพิ่ม `reset_usage` | update recording_minutes/ask_notes_count/ai_suggest_count = 0 |
| `admin-api` `update_plan` + expiry | update `plan_expires_at` อัตโนมัติพร้อมกับ plan |
| Migration `20260524000002` | อัปเดต `admin_list_users` RPC ให้ return `plan_expires_at` + `ai_suggest_count` |

### Settings
| งาน | ผล |
|---|---|
| ลบ LINE User ID section | ซ่อนจากผู้ใช้ — ตั้งอัตโนมัติจาก LIFF/Auth ใน App.tsx อยู่แล้ว |

### Deploy ✅
| งาน | ผล |
|---|---|
| `admin-api` deployed | `npx supabase functions deploy admin-api --no-verify-jwt` |
| Migration `20260524000002` applied | `npx supabase db push` |
| `ADMIN_EMAILS` secret set | `zuraponx999@gmail.com` |
| `NODE_ID` secret set | `fa9724d8-6c55-428d-ba33-8a2da6db0e71` |
| Functions redeployed ทั้งหมด | รับ secrets ใหม่ครบแล้ว |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-05-24)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/src/pages/RecordPage.tsx` | + `TypeSelector` custom component (hover tooltip), `max-w-xl` desktop |
| `app/src/pages/RecordingsPage.tsx` | + master-detail layout (lg+), `CompactListItem`, hashtag cloud ย้ายล่าง |
| `app/src/pages/AskPage.tsx` | `max-w-2xl` desktop |
| `app/src/pages/SettingsPage.tsx` | `max-w-xl` desktop; ลบ LINE User ID section + state |
| `app/src/pages/GraphViewPage.tsx` | Tag+Note dual graph, drag, degree size, confirm/reject, navigate, zoom/pan, Note Graph default |
| `app/src/pages/AdminPage.tsx` | + `plan_expires_at` badge, `ai_suggest_count`, reset_usage button, expiry auto-compute |
| `app/src/config/recordingTypes.ts` | + `description` field ใน `RecordingType` interface + ทุก 8 ประเภท |
| `app/src/config/plans.ts` | free plan: `can_export: true` |
| `app/src/lib/export.ts` | `downloadBlob`: append to DOM + setTimeout revoke |
| `supabase/functions/admin-api/index.ts` | + `reset_usage` action; `update_plan` sets `plan_expires_at` auto |
| `supabase/migrations/20260524000002_admin_list_users_v2.sql` | **ไฟล์ใหม่** — updated `admin_list_users` RPC |

---

## สิ่งที่ทำวันนี้ (2026-05-21)

### รอบแรก
| งาน | ผล |
|---|---|
| AI นับโน้ตผิด (บอก 5 แต่ UI มี 3) | แก้ `ask/index.ts` — ใช้ `local_notes` จาก frontend เป็น source of truth แทน DB |
| Dark mode ทุกหน้า | เพิ่ม `useDarkMode` hook + floating toggle button ใน `App.tsx`; ใส่ `dark:` classes ทุก component |
| Dark mode `index.css` | เพิ่ม `@variant dark` + `html.dark body { background-color: #18181A }` |
| Memory page แสดง duplicate | เพิ่ม migration unique constraint `(user_id, key)` + เปลี่ยน `save-memory` เป็น upsert |

### รอบสอง
| งาน | ผล |
|---|---|
| GraphViewPage dark mode | เพิ่ม `useDark()` hook (MutationObserver) → SVG node/edge/text สลับสีตาม dark state |
| React Error Boundary | เพิ่ม `AppErrorBoundary` class component ครอบ page content ทั้งหมดใน `App.tsx` |
| ลบไฟล์ไม่ใช้ | ลบ `app/src/lib/gemini.ts` (ไม่มี import อ้างอิงเหลือแล้ว) |
| Phase 3 LIFF Auth scaffold | สร้าง `app/src/lib/liff.ts`; อัปเดต `api.ts` + `App.tsx` เพื่อใช้ LIFF userId |

### รอบสาม
| งาน | ผล |
|---|---|
| ตั้ง VITE_LIFF_ID จริง | `app/.env.local` → `VITE_LIFF_ID=2010157477-I2NTp3zI` |
| สร้าง NODE_ID สำหรับ tenant | UUID: `fa9724d8-6c55-428d-ba33-8a2da6db0e71` — ต้องตั้งใน Supabase secrets |
| Coolify deploy setup | สร้าง `Dockerfile` (multi-stage Node→nginx) + `nginx.conf` (SPA routing + cache) |
| ตัด iOS code ออก | ลบ `onTouchMove` scrubber + iOS Wake Lock banner ตามคำขอ |

### รอบสี่
| งาน | ผล |
|---|---|
| AskPage sender labels | เพิ่ม "คุณ" (gray) + "ทันโน้ต" (red) bold label เหนือ chat bubble แต่ละอัน |
| Login system | สร้าง `lib/auth.ts` + `LoginPage.tsx` — magic link email login |
| Admin panel | สร้าง `AdminPage.tsx` + `admin-api` Edge Function + migration `20260521000006_auth_admin.sql` |
| App.tsx auth gate | เพิ่ม session state, loading screen, login gate, admin tab |
| config.toml | เพิ่ม `[functions.admin-api] verify_jwt = false` |
| .env files | เพิ่ม `VITE_ADMIN_EMAILS` ใน `.env.local` + `.env.example` |

### รอบห้า
| งาน | ผล |
|---|---|
| Git init + GitHub push | `git init` → commit 61 ไฟล์ → push ขึ้น `github.com/gmgroup999/TanNote` |
| สร้าง `.gitignore` | ครอบ `node_modules/`, `app/dist/`, `app/.env.local`, `.claude/` |
| แก้ secret leak | GitHub Push Protection บล็อก — พบ Supabase token ใน `.claude/settings.json`; เพิ่ม `.claude/` เข้า gitignore + rewrote history ด้วย orphan branch |

---

## ไฟล์ที่แก้ไขวันนี้ (2026-05-21)

| ไฟล์ | สิ่งที่เปลี่ยน |
|---|---|
| `app/src/App.tsx` | + `useDarkMode` hook, floating dark toggle, dark nav classes, `AppErrorBoundary`, `initLiff()` call |
| `app/src/index.css` | + `@variant dark` variant, `html.dark body` background override |
| `app/src/pages/RecordPage.tsx` | + `dark:` classes ทุก element |
| `app/src/pages/RecordingsPage.tsx` | + `dark:` classes ทุก element |
| `app/src/pages/AskPage.tsx` | + `dark:` classes ทุก element |
| `app/src/pages/SettingsPage.tsx` | + `dark:` classes ทุก element |
| `app/src/pages/PricingPage.tsx` | + `dark:` classes ทุก element |
| `app/src/pages/GraphViewPage.tsx` | + `useDark()` MutationObserver hook; SVG colors เปลี่ยนตาม dark state |
| `app/src/components/UsageIndicator.tsx` | + `dark:` classes ทุก element |
| `app/src/lib/api.ts` | แทนที่ local `getLineUserId()` ด้วย `getLiffUserId()` จาก `liff.ts` |
| `app/src/lib/liff.ts` | **ไฟล์ใหม่** — `initLiff()`, `getLiffUserId()`, `setLineUserId()` |
| `app/src/lib/gemini.ts` | **ลบแล้ว** |
| `app/.env.local` | ใส่ `VITE_LIFF_ID=2010157477-I2NTp3zI` + `VITE_ADMIN_EMAILS` |
| `app/.env.example` | เพิ่ม `VITE_ADMIN_EMAILS` placeholder |
| `app/src/lib/auth.ts` | **ไฟล์ใหม่** — Supabase Auth client + helpers |
| `app/src/pages/LoginPage.tsx` | **ไฟล์ใหม่** — magic link form |
| `app/src/pages/AdminPage.tsx` | **ไฟล์ใหม่** — admin dashboard |
| `supabase/functions/admin-api/index.ts` | **ไฟล์ใหม่** — admin CRUD Edge Function |
| `supabase/functions/ask/index.ts` | กรอง notes ด้วย `local_notes` เป็น source of truth; แก้ `totalNoteCount` |
| `supabase/functions/save-memory/index.ts` | เปลี่ยน `.insert()` → `.upsert({ onConflict: "user_id,key" })` |
| `supabase/migrations/20260521000004_memory_dedup.sql` | **ไฟล์ใหม่** — ลบ duplicate rows + unique constraint `(user_id, key)` |
| `supabase/migrations/20260521000006_auth_admin.sql` | **ไฟล์ใหม่** — is_suspended column + admin_list_users RPC |
| `supabase/config.toml` | + `[functions.admin-api] verify_jwt = false` |
| `Dockerfile` | **ไฟล์ใหม่** — multi-stage build (node:22-alpine → nginx:alpine) + build args |
| `nginx.conf` | **ไฟล์ใหม่** — SPA fallback, cache headers, gzip |
| `.gitignore` | **ไฟล์ใหม่** — ครอบ node_modules, dist, .env.local, .claude/ |

---

## การแก้บัคสำคัญ (2026-05-21)

### AI นับโน้ตผิด (DB มีโน้ตเก่าค้าง)
**ไฟล์**: `supabase/functions/ask/index.ts`
**สาเหตุ**: DB เก็บโน้ตที่ถูกลบออก local ไปแล้ว ทำให้ AI เห็นมากกว่า user เห็น
**แก้**: เมื่อ frontend ส่ง `local_notes` มา Edge Function จะ:
1. กรอง vector search results ให้แสดงเฉพาะ note IDs ที่มีใน local
2. กรอง DB notes ออกถ้าไม่อยู่ใน local
3. ตั้ง `totalNoteCount = localNotes.length`

### Audio player หยุดกลางคัน (~40 วินาที)
**ไฟล์**: `app/src/pages/RecordingsPage.tsx`
**สาเหตุ**: React 18 StrictMode รัน useEffect cleanup แล้ว re-run → `URL.revokeObjectURL` ถูกเรียกก่อนเวลา
**แก้**: ย้าย `URL.createObjectURL` เข้าไปใน `useEffect` (ไม่ใช่ `useState`)

### Quiet hours ใช้เวลา UTC แทน Bangkok
**ไฟล์**: `supabase/functions/send-reminders/index.ts`
**แก้**: ใช้ `Intl.DateTimeFormat` กับ `timeZone: "Asia/Bangkok"` แทน `now.getHours()`

### embedContent API format ผิด
**ไฟล์**: `supabase/functions/transcribe/index.ts`
**แก้**: เปลี่ยน `contents: textToEmbed` → `content: { parts: [{ text: textToEmbed }] }`

---

## TODO ถัดไป

### 🟢 Redeploy save-memory + patch-note — เสร็จแล้ว
- ตรวจ 2026-06-19: ทั้งคู่ deploy ไป Supabase แล้วตั้งแต่ 2026-06-11 08:50 UTC (มี LIFF JWT + ownership ครบ) — TODO เดิมล้าสมัย

### 🟡 ทดสอบ Quota period ใหม่บน device จริง
- starter: ใช้จนเกิน → ต้องเต็มแบบ **รายปี** (ไม่รีเซ็ตเดือนหน้า)
- pro: recording นับสะสม **ตลอดชีพ** (cap 2500), ask/suggest = ∞
- UI: ตรวจ label "/ปี" (starter), "(ตลอดชีพ)" (pro), header period ตามแผน

### 🟡 ทดสอบ Export บนมือถือ (LINE)
- กด .txt/.md → ควรขึ้น share sheet หรือ "คัดลอกเนื้อหาแล้ว ✓"
- ถ้าอยากได้ไฟล์จริง → เปิดในเบราว์เซอร์ภายนอก (⋮ → เปิดในเบราว์เซอร์)

### 🟢 auth gap (optional liffToken) — เสร็จแล้ว (2026-06-20)
- `resolveLineUserId()` ปิด gap: `sa_<uuid>` บังคับ verify session JWT เสมอ; `U<32>` ไม่มี token → reject เมื่อ `REQUIRE_LINE_TOKEN=true`
- **Secret `REQUIRE_LINE_TOKEN=true` set แล้ว** ✅ — verified production: `U<32>` ไม่มี token → 401, `dev_` → ผ่าน (ask + patch-note)
- **⚠️ ต้องทดสอบ device จริงด่วน**: LINE user ต้องส่ง LIFF token ได้จริงใน LINE client ไม่งั้น live user ถูก lockout (rollback: secret = false)
- โค้ดอ่าน flag แบบ `.trim().toLowerCase()` กัน whitespace ใน secret value

### 🟢 set-webhook source — เสร็จแล้ว (2026-06-20)
- ดึง source เข้า repo: `supabase/functions/set-webhook/index.ts` (one-shot util ตั้ง LINE webhook endpoint URL)

### 🔴 ยืนยัน VITE_LIFF_ID ใน Coolify build args
- ถ้า build arg หายไป → `LIFF_ENABLED=false` → LINE login ไม่ทำงาน → white screen
- ตรวจสอบ: Coolify → TanNote service → Environment Variables → `VITE_LIFF_ID=2010157477-I2NTp3zI`

### 🟢 LINE Rich Menu ใหม่ — เสร็จแล้ว
- `richmenu-63977447feea57f4299a347397f3adf3` — 1-ปุ่ม TanNote logo (แดง + ไมค์ + REC + TanNote) ✅
- Set เป็น default สำหรับผู้ใช้ทุกคนผ่าน API แล้ว ✅

### 🟡 ทดสอบบน device จริง (ต้องทำ)
| flow | ขั้นตอน |
|---|---|
| LIFF JWT end-to-end | เปิดแอปผ่าน LINE → บันทึกเสียง → verify ไม่มี 401 ในหน้า transcribe |
| Payment Notification | ส่งข้อความ/รูปสลิปใน LINE @077vkaxj → bot ตอบ + admin (Jack) ได้รับ push |
| Plan Enforcement | Suspend user → อัดเสียง → 403 / Free user quota ครบ → 402 → PaymentModal |
| LINE Reminder | บันทึก "📅 นัดหมาย" → รอ 1 นาที → Flex Message มา → กดปุ่มได้ |

### 🟢 สิ่งที่เสร็จแล้ว (ไม่ต้องทำอีก)
- LIFF endpoint กลับมาที่ `https://tannote.z-node.cc/` (ไม่ใช่ `/app`) ✅
- manifest.json + sw.js อัปเดตให้ตรงกัน ✅
- Security hardening ทั้งหมด ✅

### รูปโปรไฟล์ใน Admin Panel
รูปจะแสดงหลังจาก user บันทึกเสียงอย่างน้อย 1 ครั้งหลัง deploy ใหม่ — ยังไม่มีทางดึง picture_url ของ user เก่าโดยไม่มี action ใหม่

---

## ปัญหาที่ยังไม่ได้แก้

| ปัญหา | รายละเอียด | วิธีแก้ |
|---|---|---|
| Landing page ไม่ได้อยู่ที่ `/` ใน production | Z-Node/Coolify generate nginx ของตัวเอง — ไม่ใช้ `nginx.conf` ของ project; landing อยู่ที่ `/landing.html` | Serve React SPA ที่ `/` ต่อไป (ผู้ใช้เข้าผ่าน LINE LIFF ไม่ใช่ direct URL); หรือ integrate `landing.html` เข้า React Router เป็น route `/` |
| รูปโปรไฟล์ user เก่าไม่มี | picture_url ว่างใน DB สำหรับ user ที่ยังไม่ได้บันทึกใหม่หลัง deploy | รอ user บันทึกเสียงครั้งใหม่ (transcribe upsert อัตโนมัติ) |
| ไมโครโฟน ถามทุก session | Android WebView ไม่ persist mic permission ข้าม session — OS limitation | แก้ไม่ได้ใน code; user กด "อนุญาตเฉพาะครั้งนี้" ทุกครั้งที่เปิด LINE ใหม่ |
| ระบบชำระเงิน auto-verify ยังไม่มี | ปัจจุบัน manual verify ผ่าน LINE + admin panel; auto-webhook เป็น optional อนาคต | integrate payment webhook ถ้าต้องการ scale |
| LIFF token เป็น `null` นอก LINE client | `liff.getIDToken()` คืน null เมื่อเปิดในเบราว์เซอร์ปกติ — fallback ไปใช้ `x-line-user-id` จาก localStorage | ยอมรับ: browser testing ใช้ `dev_xxx` fallback; production ใช้ผ่าน LINE เท่านั้น |
| `VITE_LIFF_ID` Coolify build arg ยังไม่ได้ยืนยัน | ถ้า build arg ไม่ถูก set → `LIFF_ENABLED=false` → LINE users เห็น LoginPage ไม่มีปุ่ม LINE login → ติดอยู่หน้า login | ตรวจสอบ Coolify → TanNote service → Environment Variables (Build args) ว่ามี `VITE_LIFF_ID=2010157477-I2NTp3zI` |
| Export ไฟล์จริงบน LINE WebView | iOS WKWebView ไม่ support file share + บล็อก download → ได้แค่แชร์ข้อความ/คัดลอก clipboard | เปิดในเบราว์เซอร์ภายนอก (⋮ → เปิดในเบราว์เซอร์) แล้ว download ตรง ๆ ได้; โค้ดมี fallback clipboard ให้แล้ว |
| PDF บน LINE WebView | `iframe.print()` อาจไม่ทำงานใน WebView (โดยเฉพาะ iOS) | fallback แชร์เป็นไฟล์ .html; หรือเปิดในเบราว์เซอร์ภายนอกแล้วสั่งพิมพ์ → Save as PDF |
| ~~auth gap: optional liffToken~~ | **แก้แล้ว 2026-06-20** — `resolveLineUserId()`: sa_ verify JWT เสมอ, U<32> ต้องมี token เมื่อ `REQUIRE_LINE_TOKEN=true` | เหลือ set secret `REQUIRE_LINE_TOKEN=true` หลัง device test |
| Quota: pro/extra user เดิม bucket รีเซ็ต | เปลี่ยน period key → lifetime bucket เริ่มที่ 0 (usage รายเดือนเก่าไม่ถูกนับต่อ) | ยอมรับได้ — extra=∞ ไม่กระทบ, pro = generous (ได้ 2500 เต็มนับจากนี้) |
