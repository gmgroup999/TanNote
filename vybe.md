# VYBE — Project Starter Spec

> **VYBE** = *Virtual Yielding Business Engine*
> AI voice-notes app เวอร์ชันสากล (ตลาดตะวันตก) — fork จาก TanNote โดยยกเอา "core" มาใช้ แล้วเปลี่ยน "platform layer" (auth / payment / notifications) ทั้งหมด
> เอกสารนี้ใช้ตั้งต้นโปรเจกต์ใหม่ (ก๊อปไปวางใน repo ใหม่แล้วเริ่มได้เลย)

---

## 1. คืออะไร / Positioning
- แอป AI voice note ภาษา**อังกฤษ** — กดอัด → AI ถอด/สรุป/แท็ก/เชื่อมโยง/ค้นหา
- ชื่อสื่อ business/productivity (yielding business value) → จับกลุ่ม professional/SME ตะวันตก ที่ยอมจ่าย
- **PWA** ติดตั้งได้ทั้งมือถือ + PC — **ไม่พึ่ง LINE, ไม่ผ่าน App Store** (ช่วงแรก)

## 2. การตัดสินใจที่ล็อกแล้ว (locked)
| เรื่อง | ค่า |
|---|---|
| ตลาด | สากล (US/EU) — **ไม่มี LINE** |
| โครงสร้าง | **Fork แยกขาด** จาก TanNote (repo ใหม่, Supabase ใหม่) |
| Auth | **Google + Email (magic link)** ผ่าน Supabase Auth (ไม่ต้อง Apple จนกว่าจะลง App Store) |
| Payment | **Stripe** (subscription + Customer Portal + webhook auto-upgrade) |
| Reminders | **Web Push (VAPID)** + **Email (Resend)** — email เป็น fallback สำคัญสำหรับ iOS |
| Hosting | **Hetzner เดิม (Z-Node platform)** + **โดเมนใหม่** |
| Database | **Supabase Cloud (project ใหม่)** — ไม่ self-host (เก็บเงินจริง = ต้องการ reliability) |
| Pricing | เริ่ม **Free + Pro $9/เดือน** (รายละเอียดข้อ 7) |
| รูปแบบแอป | PWA (มือถือ + PC) |

## 3. Stack
Vite + React + TS + Tailwind v4 / Supabase (Auth + Postgres + pgvector + Edge Functions + Storage) / Gemini 2.5 Flash / Stripe / web-push (VAPID) / Resend / Hetzner + Z-Node (auto-deploy)

---

## 4. สถาปัตยกรรม: ใช้ซ้ำ vs สร้างใหม่

### ✅ Reuse จาก TanNote (~60% — core ที่มีค่า)
| ส่วน | ไฟล์อ้างอิงใน TanNote |
|---|---|
| เครื่องอัดเสียง (MediaRecorder Opus + Wake Lock) | `app/src/pages/RecordPage.tsx` |
| IndexedDB storage (เสียง local) | `app/src/lib/db.ts` |
| หน้ารายการ + ค้นหา/กรอง/จัดกลุ่มตามวัน | `app/src/pages/RecordingsPage.tsx` |
| RAG chat (ถาม AI จากโน้ต + memory) | `app/src/pages/AskPage.tsx` |
| Knowledge Graph | `app/src/pages/GraphViewPage.tsx` |
| ประเภทการบันทึก (config) | `app/src/config/recordingTypes.ts` |
| Plan limits + quota helpers | `app/src/config/plans.ts` |
| Frontend API client | `app/src/lib/api.ts` |
| Export (txt/md + BOM, download.html) | `app/src/lib/export.ts`, `app/public/download.html` |
| Gemini pipeline (ถอด→สรุป→key points→action→tags→links→embed) | `supabase/functions/transcribe/index.ts` |
| RAG Q&A + user memory | `supabase/functions/ask/index.ts` |
| Memory CRUD / patch note | `supabase/functions/save-memory`, `patch-note` |
| Reminder cron logic | `supabase/functions/send-reminders/index.ts` (เปลี่ยน "ปลายทาง" เป็น web push/email) |
| DB schema + RLS + quota + vector | `supabase/migrations/*.sql` |
| Plan limits shared | `supabase/functions/_shared/plans.ts` |
| Dark mode, scaffold | `app/src/App.tsx`, `app/src/index.css` |

> **AI prompts ต้องเขียนใหม่เป็นภาษาอังกฤษ** ใน transcribe/ask (เดิมสั่ง Gemini เป็นไทย) — Gemini ถอดได้ทุกภาษาอยู่แล้ว แค่เปลี่ยนภาษา instruction + ภาษา output

### 🔧 สร้างใหม่ (platform layer — ตัด LINE ออกหมด)
| ส่วน | TanNote (ตัดทิ้ง) | VYBE (สร้างใหม่) |
|---|---|---|
| **Auth** | LIFF/LINE (`lib/liff.ts`, ส่วน LINE ใน `auth.ts`) | Supabase Auth: Google OAuth + Email magic link. ทุก table ใช้ `user_id` = `auth.uid()` ตรงๆ (ไม่ต้องมี `line_user_id`/`sa_` แล้ว) |
| **Notifications** | LINE push (`line-webhook`, `set-webhook`, rich-menu) | `send-reminders` ยิง **web-push (VAPID)** + **email (Resend)**. เก็บ push subscription ใน table ใหม่ `push_subscriptions` |
| **Payment** | PromptPay QR + สลิป + approval queue (`PaymentModal`, `payment_requests`, admin slip) | **Stripe**: Checkout Session → `stripe-webhook` edge function (`checkout.session.completed` / `customer.subscription.*`) → set plan + `plan_expires_at` อัตโนมัติ + Customer Portal สำหรับยกเลิก/เปลี่ยนบัตร |
| **ภาษา/locale** | ไทย hardcode, `th-TH`, ฟอนต์ IBM Plex Sans Thai | อังกฤษล้วน, `en-US`, ฟอนต์ Inter |
| **Admin** | จัดการ LINE user + อนุมัติสลิป | เหลือ stats + user management; ไม่ต้องมี approval queue (Stripe auto) |

---

## 5. Auth (Supabase Auth)
- เปิด Google provider + Email (magic link) ใน Supabase Dashboard → Authentication → Providers
- Google OAuth: สร้าง OAuth client ใน Google Cloud Console → ใส่ client id/secret ใน Supabase
- ทุก table: `user_id uuid references auth.users` + RLS `auth.uid() = user_id` (ง่ายกว่า TanNote มากเพราะไม่มี LINE/anon hack)
- ตัด `resolveLineUserId`, `REQUIRE_LINE_TOKEN`, `sa_`/`dev_` fallback ทั้งหมด — ใช้ JWT ของ Supabase ตรงๆ (`verify_jwt = true` ได้เลย)

## 6. Reminders (Web Push + Email)
- เพิ่ม table `push_subscriptions (user_id, endpoint, keys jsonb, created_at)`
- Frontend: ขอ permission + `pushManager.subscribe()` (VAPID public key) → ส่ง subscription เก็บใน DB
- Edge Function `send-reminders` (pg_cron ทุก 1 นาที เหมือนเดิม): query reminders ที่ถึงเวลา → ยิง web-push (lib `web-push` / VAPID) ทุก subscription ของ user + ส่ง email (Resend) เป็น fallback
- **iOS**: web push ใช้ได้เฉพาะ PWA ที่ Add to Home Screen (iOS 16.4+) → email สำคัญสำหรับ iPhone
- Secret: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `RESEND_API_KEY`

## 7. Pricing (เริ่ม lean — ปรับได้)
| Tier | ราคา | quota (ต่อเดือน) |
|---|---|---|
| **Free** | $0 | ~60 นาที/เดือน, AI พื้นฐาน — funnel |
| **Pro** | **$9/เดือน** หรือ **$90/ปี** (ฟรี 2 เดือน) | ~1,500 นาที/เดือน + ถาม/แท็ก ∞ + export ทุกแบบ |
| *(Team — ทีหลัง)* | $20+/user | shared workspace |
- quota รีเซ็ตรายเดือน (`YYYY-MM`) ทั้ง Free + Pro (เหมือนที่ TanNote แก้ให้ starter/pro เป็นรายเดือนแล้ว)
- ต้นทุน: Gemini 2.5 Flash ถอดเสียงถูกมาก → margin ดี
- **TODO**: ตัวเลข quota จริง + ราคา ยังต้องเคาะ final

## 8. Build Phases
| เฟส | งาน |
|---|---|
| **0** | repo ใหม่ + Supabase project ใหม่ + Z-Node project + โดเมน + copy core จาก TanNote + ตัด LINE ทั้งหมด |
| **1** | Auth (Google + Email magic link) + auth gate + RLS `auth.uid()` |
| **2** | Core: recording + Gemini pipeline (prompt อังกฤษ) + notes UI (list/search/filter/graph/RAG) |
| **3** | Reminders (web push VAPID + email Resend) |
| **4** | Payment (Stripe Checkout + webhook + Customer Portal + plan gating) |
| **5** | Landing (อังกฤษ) + pricing USD + analytics + launch |

---

## 9. แหล่งโค้ดอ้างอิง
- **TanNote repo**: `github.com/gmgroup999/TanNote` (ดู `CLAUDE.md` สำหรับสถาปัตยกรรม + ประวัติทั้งหมด)
- Supabase project (TanNote, อ้างอิง schema): ref `czczwtjgmjnboeeibxcd`

## 10. ⚠️ บทเรียนจาก TanNote (อย่าพลาดซ้ำ!)
1. **SPA cache → จอขาว**: ต้องตั้ง nginx ให้ `index.html` + `sw.js` = `Cache-Control: no-cache`, `/assets/*` = immutable + **คืน 404 ถ้าไฟล์หาย** (อย่า fallback เป็น HTML ไม่งั้น browser รัน HTML เป็น JS → จอขาวหลัง deploy) — ดู `app/Dockerfile` ของ TanNote
2. **Quota null-collapse**: เขียน `(PLAN_LIMITS[plan] ?? PLAN_LIMITS.free).field` **ไม่ใช่** `PLAN_LIMITS[plan]?.field ?? PLAN_LIMITS.free.field` (`??` กิน `null` ที่ตั้งใจให้ unlimited → กลายเป็น limit ของ free)
3. **Quota period ต้องตรงกัน SQL + TS** (`period_for_plan` SQL ↔ `periodForPlan` TS) ไม่งั้น check/display เพี้ยน
4. **Plan expiry ต้องตรงกัน** backend (`autoPlanExpiry`) ↔ frontend (`computePlanExpiry`)
5. **Security — PostgREST เปิดทุก RPC ให้ anon by default**: RPC ที่เป็น admin/sensitive ต้อง `revoke execute from public, anon, authenticated; grant to service_role` (TanNote เคย leak รายชื่อ user + email ทั้งหมด!)
6. **Stripe แทน slip/approval-queue**: ไม่ต้องทำ manual verify เลย — webhook `checkout.session.completed` → set plan อัตโนมัติ (ประหยัดงานที่ TanNote ต้องทำ approval queue)
7. **Gemini embedContent format**: ใช้ `content: { parts: [{ text }] }` (ไม่ใช่ `contents`)
8. **Web Push iOS**: ใช้ได้เฉพาะ PWA installed → email fallback จำเป็น
9. **ลบเสียงออกจาก Gemini Files API ทันทีหลังประมวลผล** (เก็บแค่ text บน server)
10. **Z-Node deploy**: project ต้องตั้ง `deployBranch=main` + GitHub webhook → `auto.z-node.cc/api/webhooks/github` + ใช้ nginx Dockerfile ของเราเอง (มี cache headers). repo public → `githubToken=NULL` ใน Z-Node DB (อย่าใส่ encrypted placeholder)

## 11. Golden Rules (เหมือน TanNote)
- ทุก table มี `user_id` + RLS
- เสียง = local (IndexedDB) / server เก็บแค่ text
- `GEMINI_API_KEY` / `STRIPE_SECRET_KEY` อยู่ใน Supabase secrets เท่านั้น — ห้ามใส่ `VITE_` env
- ขอบเขต: เพื่อน/เลขา/business assistant (ไม่วินิจฉัย/แนะนำยา)

## 12. เหลือเคาะก่อนเริ่ม Phase 0
- [ ] **โดเมน** — `vybe.app` / `getvybe.com` / `vybe.ai` / `vybenotes.com` (เช็ค availability + จด) — ระหว่าง dev ใช้ `vybe.z-node.cc` ไปก่อนได้
- [ ] **ตัวเลข quota จริง** ของ Free / Pro (นาที/เดือน, ask, suggest)
- [ ] **ราคา final** ($9? annual?)
- [ ] Stripe account + products/prices
- [ ] Supabase Cloud project ใหม่ + Google OAuth credentials
- [ ] VAPID keys + Resend account

---

*สร้างจากบทสนทนา + งาน TanNote (session 2026-06-20). พร้อมเริ่ม Phase 0 เมื่อเคาะข้อ 12 ครบ.*
