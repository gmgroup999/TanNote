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
| `app/src/pages/RecordPage.tsx` | หน้าบันทึกเสียง + AI trigger หลังบันทึก |
| `app/src/pages/RecordingsPage.tsx` | รายการ + AI panel + batch + Knowledge Graph cloud |
| `app/src/pages/AskPage.tsx` | RAG chat + onboarding + memory view + sender name labels |
| `app/src/pages/SettingsPage.tsx` | การแจ้งเตือน + quiet hours + LINE User ID |
| `app/src/pages/GraphViewPage.tsx` | Force-layout knowledge graph + `useDark` MutationObserver hook |
| `app/src/pages/PricingPage.tsx` | แสดงแผนราคา + upgrade CTA |
| `app/src/pages/LoginPage.tsx` | Magic link login form |
| `app/src/pages/AdminPage.tsx` | Admin dashboard: stats, user list, plan/suspend/delete |
| `app/src/components/UsageIndicator.tsx` | Progress bars สำหรับ quota ปัจจุบัน |
| `app/src/lib/db.ts` | IndexedDB helpers + `AudioRecord` interface |
| `app/src/lib/api.ts` | Frontend → Edge Function client |
| `app/src/lib/liff.ts` | LIFF init + `getLiffUserId()` with dev fallback |
| `app/src/lib/auth.ts` | Supabase Auth client + `sendMagicLink`, `isAdminEmail`, `isLiffAuthed` |
| `app/src/config/recordingTypes.ts` | 8 ประเภทการบันทึก + label + summaryFocus |
| `app/src/config/plans.ts` | Plan limits + PLAN_INFO + quota helpers |
| `app/.env.local` | VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_LIFF_ID, VITE_ADMIN_EMAILS (gitignored) |
| `supabase/functions/transcribe/index.ts` | Edge Function — Gemini transcribe + DB write + embed |
| `supabase/functions/ask/index.ts` | Edge Function — RAG Q&A + user memory + local_notes merge |
| `supabase/functions/send-reminders/index.ts` | Edge Function — pg_cron trigger → LINE push |
| `supabase/functions/line-webhook/index.ts` | Edge Function — รับ LINE postback (done/snooze) |
| `supabase/functions/admin-api/index.ts` | Edge Function — admin CRUD (JWT verify + ADMIN_EMAILS secret) |
| `supabase/functions/_shared/plans.ts` | Plan limits shared logic |
| `supabase/migrations/20260520000000_init.sql` | Full DB schema + RLS |
| `supabase/migrations/20260521000006_auth_admin.sql` | is_suspended column + admin_list_users RPC |
| `supabase/config.toml` | `verify_jwt = false` สำหรับ all functions |
| `Dockerfile` | Multi-stage build: node:22-alpine → nginx:alpine |
| `nginx.conf` | SPA routing + cache headers + gzip |

## Supabase Project
- **Project ref**: `czczwtjgmjnboeeibxcd`
- **URL**: `https://czczwtjgmjnboeeibxcd.supabase.co`
- **Secrets set**: `GEMINI_API_KEY`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- **Secrets pending**: `ADMIN_EMAILS=zuraponx999@gmail.com`, `NODE_ID=fa9724d8-6c55-428d-ba33-8a2da6db0e71`
- **Functions deployed**: `transcribe`, `ask`, `send-reminders`, `line-webhook`, `save-memory`
- **Functions pending deploy**: `admin-api`
- **Extensions enabled**: `pg_cron`, `pg_net`, `pgvector`
- **pg_cron job**: schedule id 1 — ทุก 1 นาที → `send-reminders`
- **Migrations applied**: `20260520000000_init.sql`
- **Migrations pending**: `20260521000006_auth_admin.sql`

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

### Deploy admin-api (ทำก่อน)
```bash
npx supabase functions deploy admin-api --no-verify-jwt
```
แล้วตั้ง Supabase secret:
```
ADMIN_EMAILS=zuraponx999@gmail.com
```
และ apply migration:
```bash
npx supabase db push
```
(หรือ paste `20260521000006_auth_admin.sql` ใน Supabase SQL Editor)

### Deploy ขึ้น Coolify — ขั้นตอน (รอ user action)
GitHub repo พร้อมแล้วที่: `https://github.com/gmgroup999/TanNote`

1. Coolify → New Resource → Git Repository → เลือก `gmgroup999/TanNote`
2. Build Pack: **Dockerfile** (Dockerfile อยู่ที่ root ✓)
3. ตั้ง **Build Arguments** (ไม่ใช่ Env Vars — Vite อ่านตอน build time):
   ```
   VITE_SUPABASE_URL=https://czczwtjgmjnboeeibxcd.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...01M
   VITE_LIFF_ID=2010157477-I2NTp3zI
   VITE_ADMIN_EMAILS=zuraponx999@gmail.com
   ```
4. ตั้ง domain (เช่น `app.tannote.co`) → Enable HTTPS
5. กด Deploy
6. หลัง deploy: ตั้ง LIFF endpoint URL ใน LINE Developer Console = `https://app.tannote.co`

### ตั้ง NODE_ID ใน Supabase (รอ user action)
```
Supabase → Settings → Edge Functions → Secrets → Add
NODE_ID = fa9724d8-6c55-428d-ba33-8a2da6db0e71
```
แล้ว redeploy functions ทั้งหมด: `npx supabase functions deploy --no-verify-jwt`

### ตั้ง LINE Webhook URL (รอ user action)
```
LINE Developer Console → Messaging API → Webhook URL:
https://czczwtjgmjnboeeibxcd.supabase.co/functions/v1/line-webhook
```

### ทดสอบ LINE Push end-to-end (หลัง deploy แล้ว)
1. Settings → กรอก LINE User ID จริง (`U` + 32 ตัว)
2. บันทึกโน้ตใหม่ที่มี action item
3. รอ pg_cron 1 นาที → ดู LINE message
4. กดปุ่ม postback → verify ใน Supabase DB

---

## ปัญหาที่ยังไม่ได้แก้

| ปัญหา | รายละเอียด | วิธีแก้แนะนำ |
|---|---|---|
| Migration `20260521000006` ยังไม่ apply | `is_suspended` column ยังไม่มีใน DB | paste ใน Supabase SQL Editor หรือ `supabase db push` |
| `admin-api` ยังไม่ได้ deploy | ระบบ admin ยังใช้งานไม่ได้ | `npx supabase functions deploy admin-api --no-verify-jwt` |
| `ADMIN_EMAILS` secret ยังไม่ได้ตั้ง | admin-api จะ return 403 ทุก request | Supabase Dashboard → Settings → Edge Functions → Secrets |
| `NODE_ID` เป็น default UUID | Multi-tenant ยังไม่ configure จริง | ตั้ง `NODE_ID=fa9724d8-6c55-428d-ba33-8a2da6db0e71` ใน Supabase secrets |
| ยังไม่ได้ deploy บน Coolify | app ยังรันบน localhost | ทำตามขั้นตอน Coolify ด้านบน (GitHub repo พร้อมแล้ว) |
| LINE webhook ยังไม่ได้ configure | postback "เสร็จ/เลื่อน" ยังไม่ทำงาน | LINE Developer Console → Webhook URL: `...supabase.co/functions/v1/line-webhook` |
| LIFF endpoint URL ยังไม่ได้ตั้ง | LINE auto-login ยังไม่ทำงาน | ตั้งหลัง Coolify deploy ได้ domain จริงแล้ว |
