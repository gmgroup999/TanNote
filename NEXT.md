# NEXT.md — Handoff

อัปเดตล่าสุด: **2026-07-22** · สถานะ: **เขียวหมด — ระบบถอดเสียงกลับมาใช้งานได้หลังพบว่า Gemini key ถูก revoke (พังเงียบมานาน)**

- **Live**: https://tannote.z-node.cc — HTTP 200 · bundle `index-BklCSyBK.js`
- **Commit ล่าสุด**: `a85520b` (push origin/main แล้ว, working tree สะอาด)
- **Deploy ล่าสุด**: Z-Node `2026-07-22 04:25:05 | SUCCESS | a85520b5` → frontend ตรงกับ git
- **Gate ที่เขียว**: `npx tsc --noEmit` exit 0 · Edge Functions 9/9 ACTIVE · pg_cron 4 job succeeded · migrations local↔remote sync ถึง `20260722000004`

---

## สรุปสิ่งที่เราทำวันนี้ทั้งหมด (2026-07-22)

### 🚨 1. OUTAGE ที่ไม่มีใครรู้ — `GEMINI_API_KEY` ถูก revoke
- user แผน pro อัดเสียง **4 ครั้งวันนี้ ล้มทุกครั้ง** (09:43, 09:43, 09:44, 10:34) — Google ตอบ `API key not valid`
- สาเหตุน่าจะเป็น key รั่ว (เคยอยู่ plaintext ใน `.claude/settings.json` และ `.claude/` เคยถูก commit ขึ้น GitHub 2026-05-21) → Google auto-revoke
- แก้: ผู้ใช้สร้าง key ใหม่ (รูปแบบใหม่ `AQ.` 53 ตัว) → set secret → redeploy `transcribe`
- **Verified**: POST เสียงจริงเข้า transcribe → ได้ `note_id` + transcript + `status=done` ✅

### 🔴 2. แก้บั๊กที่ทำให้ outage เงียบ 2 เดือน (3 ชั้น)
- `supabase/functions/transcribe/index.ts` — `catch` mark note เป็น `error` + เก็บ `error_message` (เดิมไม่แตะ row เลย → ค้าง `processing` ถาวร)
- `supabase/migrations/20260722000003_note_failure_visibility.sql` — เพิ่มคอลัมน์ `error_message`; `cleanup_expired_notes()` ลบโน้ตหมดอายุ **ทุกสถานะ** (เดิมเฉพาะ `done` → ผีรอด retention); retire 5 แถวผี
- `supabase/migrations/20260722000004_sweep_stuck_notes.sql` — `sweep_stuck_notes()` + cron ทุกชั่วโมง (นาทีที่ 15) กันกรณี isolate ตาย/timeout ที่ `catch` ทำงานไม่ได้
- **Verified**: บังคับล้มด้วย mime type ที่ Gemini ไม่รับ → note = `error` + สาเหตุจริง ✅ · sweeper คืน 0 ตอนไม่มีของค้างเกิน 1 ชม. ✅

### 🔴 3. แก้ plan expiry ไม่ครอบ pro
- `20260722000001_enforce_plan_expiry_pro.sql` — `where plan in ('starter','pro')` (เดิมแค่ starter ทั้งที่ pro เป็นรายเดือนตั้งแต่ 06-20)
- quota ไม่เคยรั่ว (effective plan คำนวณ real-time) แต่ DB row ค้างเป็น 'pro' ตลอดไป
- **Verified**: ทดสอบใน transaction → pro หมดอายุกลายเป็น free, rollback สะอาด ✅

### 🟡 4. EasySlip scaffold — เสร็จแต่ **หลับสนิท** (ผู้ใช้สั่งพักไว้)
- `20260722000002_slip_verification.sql` (trans_ref + unique index กันสลิปซ้ำ + verify fields), `supabase/functions/_shared/slip-verify.ts`, wire ใน `line-webhook`, badge ใน `AdminPage`
- ไม่มี `EASYSLIP_API_KEY` = พฤติกรรมเดิมทุกประการ (admin กดอนุมัติเอง)

### 🔒 5. ความปลอดภัย
- ลบ **22 permission entries** ที่ฝัง secret plaintext ออกจาก `.claude/settings.json` (Supabase token, LINE token, Gemini key, anon key)
- เพิ่ม `.env` เข้า `.gitignore` — **เดิมไม่เคยถูก ignore** (key ใหม่เกือบหลุดซ้ำรอย)

### 🕵️ 6. ไขปริศนา auto-deploy ไม่ทำงาน 1 เดือน
- Z-Node handler เช็ค **head_commit message** เทียบ regex skip-deploy marker
- commit ที่ผมเขียนอธิบายบั๊ก **พิมพ์ marker นั้นในหัวข้อ** → ถูก skip ซ้ำ (ยิงเท้าตัวเอง)
- **ระบบไม่ได้พัง** — GitHub delivery 200 OK ทั้ง 2 ครั้ง, config ถูกต้อง; พอเอา marker ออกก็ deploy สำเร็จทันที

---

## เหลืองานอะไร

1. **🔴 rotate secrets ที่เหลือ** — LINE Channel Access Token + Supabase access token (`sbp_`) ยังเป็นตัวเดิมที่เคยอยู่ plaintext (Gemini key ถูก Google บังคับ rotate ให้แล้ว)
2. **🟡 ทดสอบ quota/แพลนรายเดือนบน device จริง** — assign starter/pro ใน Admin → เช็ค label "/ด." + วันครบกำหนด + free quota เต็ม → 402 → PaymentModal
3. **🟡 เปิด EasySlip เมื่อพร้อม** — สมัคร (มี free tier) → `npx supabase secrets set EASYSLIP_API_KEY=... PAYMENT_RECEIVER_NAME="<ชื่อบัญชี>"` → ดู badge ใน Admin Panel → ค่อยเปิด `SLIP_AUTO_APPROVE=true`
4. **🟢 ลบ dev_ test user 3 ตัว** (`dev_smoketest`, `dev_t`, `dev_healthcheck` จาก 06-20) — ทำให้ยอด user เกินจริง 3 คน
5. **🔵 VYBE** — ยังไม่เริ่ม รอเคาะโดเมน/ราคา/accounts (ดู `vybe.md`)

---

## พรุ่งนี้ควรเริ่มตรงไหน

**ตรวจว่า outage ไม่กลับมา (5 นาที)** — สำคัญที่สุด เพราะเพิ่งเปลี่ยน key:

```bash
# 1. โน้ตวันนี้สำเร็จจริงไหม (ต้องไม่มีแถว status='error' ใหม่)
npx supabase db query --linked "select status, count(*) from notes where created_at > now() - interval '24 hours' group by status"

# 2. sweeper เก็บแถวค้างที่เหลือหรือยัง (ควรเหลือ 0 processing)
npx supabase db query --linked "select count(*) from notes where status='processing'"
```

ถ้าเจอ `error` ใหม่ → อ่าน `error_message` ในแถวนั้นได้เลย (นี่คือสิ่งที่เพิ่มเข้าไปวันนี้ — เมื่อก่อนจะเงียบสนิท)

**ถ้าเขียวหมด** → ไปข้อ 1 ในรายการค้าง (rotate LINE + Supabase token) แล้วต่อด้วยทดสอบแพลนบน device

⚠️ **กฎที่ต้องจำเวลา commit**: ห้ามพิมพ์คำว่า skip-deploy แบบมีวงเล็บเหลี่ยมในหัวข้อ commit แม้แต่ตอนอธิบาย — Z-Node จะข้าม deploy ทั้ง push
