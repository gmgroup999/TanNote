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
extra(599): ∞ + cloud backup

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
| `app/src/pages/AdminPage.tsx` | Admin dashboard: stats, user list + profile pic/email/primary_use/tone/dates, plan/suspend/delete |
| `app/src/components/UsageIndicator.tsx` | Progress bars สำหรับ quota ปัจจุบัน |
| `app/src/lib/db.ts` | IndexedDB helpers + `AudioRecord` interface |
| `app/src/lib/api.ts` | Frontend → Edge Function client (ส่ง x-line-picture-url/display-name headers) |
| `app/src/lib/liff.ts` | LIFF init + userId/pictureUrl/displayName → localStorage |
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
- **Secrets set**: `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `ADMIN_EMAILS`, `NODE_ID` ✅
- **Functions deployed**: `transcribe`, `ask`, `send-reminders`, `line-webhook`, `save-memory`, `admin-api`, `patch-note`, `r2-backup` ✅ (transcribe redeployed 2026-05-25)
- **Extensions enabled**: `pg_cron`, `pg_net`, `pgvector`
- **pg_cron job**: schedule id 1 — ทุก 1 นาที → `send-reminders`
- **LINE Webhook URL**: `https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/line-webhook` ✅ (active)
- **LINE bot basicId**: `@077vkaxj`
- **SMTP**: Resend — smtp.resend.com:465, sender: `onboarding@resend.dev`
- **Migrations applied**: ทั้งหมดถึง `20260525000001_add_picture_url.sql` ✅

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

### 🔴 Publish LIFF Channel (รอ user action — ด่วนที่สุด)
User ใหม่ทุกคนยังเข้าแอปผ่าน LINE ไม่ได้ (400 Bad Request "developing status"):
1. [LINE Developer Console](https://developers.line.biz/console/) → เลือก Provider → เลือก **LIFF channel**
2. แถบ **"Channel settings"** → **Channel status** → กด **"Publish"**

### ตั้ง Supabase Dashboard URL Configuration (รอ user action — ด่วน)
Magic link จะ redirect ไป localhost ถ้าไม่ตั้ง:
1. Supabase Dashboard → Authentication → URL Configuration
2. Site URL: `https://tannote.z-node.cc`
3. Redirect URLs: เพิ่ม `https://tannote.z-node.cc/**`

### Redeploy บน Z-Node หลัง git push (รอ user action)
Code อัปเดตแล้วบน GitHub — ต้อง trigger redeploy บน Z-Node/Coolify เพื่อให้ mobile ได้ประเภท `appointment` และ admin panel ใหม่:
```
Z-Node → TanNote → Redeploy (หรือ auto-deploy ถ้าตั้ง webhook ไว้)
```

### ตั้ง LIFF Endpoint URL (รอ user action)
```
LINE Developer Console → LIFF → Endpoint URL = https://tannote.z-node.cc
```

### ทดสอบ LINE Reminder end-to-end
1. เปิดแอปผ่าน LINE (LIFF) — LIFF user ID จะถูก set อัตโนมัติ
2. บันทึกโน้ต ประเภท "📅 นัดหมาย" พูดระบุวันเวลาชัดเจน
3. รอ pg_cron 1 นาที → ดู LINE message
4. กดปุ่ม postback "เสร็จแล้ว" → verify ใน Supabase reminders table

### รูปโปรไฟล์ใน Admin Panel
รูปจะแสดงหลังจาก user บันทึกเสียงอย่างน้อย 1 ครั้งหลัง deploy ใหม่ (transcribe จะ upsert picture_url ลง DB) — ยังไม่มีทางดึง picture_url ของ user เก่าโดยไม่มี action ใหม่

### ระบบชำระเงิน (อนาคต)
- ปัจจุบัน: admin เปลี่ยน plan ให้ user ด้วยมือผ่าน Admin Panel
- อนาคต: PromptPay QR / Stripe → webhook → `update_plan` API

---

## ปัญหาที่ยังไม่ได้แก้

| ปัญหา | รายละเอียด | วิธีแก้ |
|---|---|---|
| **🔴 LIFF channel ยังไม่ Publish** | user ใหม่ทุกคนเจอ "400 Bad Request — developing status" เข้าแอปผ่าน LINE ไม่ได้ | LINE Developer Console → LIFF channel → Channel settings → **Publish** |
| Supabase Dashboard URL ยังไม่ได้ตั้ง | magic link redirect ไป localhost ถ้าเข้าจาก production | Dashboard → Auth → URL Configuration → site_url + redirect URL |
| Z-Node ยังไม่ได้ redeploy | mobile ยังเห็น version เก่า (ไม่มี appointment, admin ใหม่) | Trigger redeploy บน Coolify/Z-Node |
| LIFF Endpoint URL ยังไม่ได้ตั้ง | LINE auto-login ยังใช้ endpoint เก่า | LINE Developer Console → LIFF → Endpoint URL = https://tannote.z-node.cc |
| รูปโปรไฟล์ user เก่าไม่มี | picture_url ว่างใน DB สำหรับ user ที่ยังไม่ได้บันทึกใหม่หลัง deploy | รอ user บันทึกเสียงครั้งใหม่ (transcribe upsert อัตโนมัติ) |
| ไมโครโฟน ถามทุก session | Android WebView ไม่ persist mic permission ข้าม session — OS limitation | แก้ไม่ได้ใน code; user กด "อนุญาตเฉพาะครั้งนี้" ทุกครั้งที่เปิด LINE ใหม่ |
| ระบบชำระเงินยังไม่มี | plan change ทำได้เฉพาะผ่าน admin มือ | integrate payment webhook ในอนาคต |
| TypeSelector tooltip อาจออกนอกจอ | viewport แคบ 768-1023px tooltip อาจถูกตัด | ไม่กระทบ mobile; desktop ปกติ |
