# 🚀 TanNote — Cursor Build Prompt

> Paste ทีละ phase ลง Cursor · ใช้คู่กับ TANNOTE_TECH_SPEC.md + TANNOTE_MASTER.md

---

## 📋 วิธีใช้

1. สร้างโปรเจกต์ใหม่ใน Cursor
2. วาง `TANNOTE_MASTER.md` + `TANNOTE_TECH_SPEC.md` เป็น context (หรือใส่ใน CLAUDE.md)
3. Paste prompt แต่ละ phase ตามลำดับ
4. ทดสอบแต่ละ phase ก่อนไป phase ถัดไป

---

## CLAUDE.md (วางในโปรเจกต์)

```markdown
# TanNote Project Context

## คืออะไร
แอป AI voice note ภาษาไทย — กดปุ่มเดียว → AI ถอด/สรุป/แท็ก/เชื่อมโยง
Positioning: เพื่อน และ/หรือ เลขา ส่วนตัว (ไม่ใช่หมอ/นักจิตวิทยา)

## Stack
Vite + React + TS + Tailwind / LINE LIFF / Supabase / Gemini 2.5 Flash / Hetzner+Coolify

## Golden Rules
- ทุก table มี node_id + RLS (multi-tenant)
- ห้ามแก้ schema เดิม (no rename/delete/drop)
- Realtime-first / Wake Lock ตอนอัด
- เสียง = local (IndexedDB) / server เก็บแค่ text
- ขอบเขต: เพื่อน/เลขา เท่านั้น (ห้ามวินิจฉัย/แนะนำยา)

## Plan limits
free: 60น./30วัน/ask10/suggest5
starter(199): 800น./1ปี/ask150/suggest50
pro(399): 2500น./ตลอดชีพ/∞
extra(599): ∞ + cloud backup
```

---

## PHASE 1: Setup + Auth + Recording (MVP core)

```
สร้างโปรเจกต์ TanNote ด้วย Vite + React + TypeScript + Tailwind

งาน Phase 1:
1. ตั้งค่า Vite + React + TS + Tailwind + LINE LIFF SDK
2. เชื่อม Supabase (ใช้ env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
3. สร้าง LINE LIFF auth → ดึง line_user_id → upsert users_profile
4. สร้างตาราง Supabase ตาม TANNOTE_TECH_SPEC.md section 2 (users_profile, notes, usage_tracking ก่อน) + RLS by node_id
5. หน้า Record:
   - dropdown เลือก recording_type (8 ตัว ตาม spec) default 'auto'
   - ปุ่มอัดวงกลมแดง + Wake Lock API + MediaRecorder (Opus 32kbps)
   - แสดง "เสียงเก็บในเครื่องคุณเท่านั้น"
6. เก็บ audio blob ใน IndexedDB (ใช้ idb)

ห้าม: upload เสียงถาวรขึ้น server
ทำตาม Golden Rules ใน CLAUDE.md
```

---

## PHASE 2: Transcription + Summary (AI core)

```
งาน Phase 2 — เพิ่ม AI pipeline:

1. Edge Function POST /api/transcribe:
   - รับ audio (multipart, ชั่วคราว)
   - ถ้า recording_type='auto' → ให้ Gemini detect type ก่อน
   - Gemini 2.5 Flash ถอดเสียง (ใช้ summaryFocus ตาม type จาก spec section 4)
   - ลบไฟล์เสียงทันทีหลังถอด
   - Gemini Flash-Lite: สรุป (points + action items) + tags
   - เก็บ transcript+summary ใน notes (text เท่านั้น)
   - +recording_minutes ใน usage_tracking (atomic)
   - return ผลลัพธ์

2. หน้าแสดงผลโน้ต:
   - transcript + summary + action items + tags
   - แสดง detected_type (ถ้า auto) + ให้แก้ได้
   - ปุ่มฟังเสียง (จาก IndexedDB local)

3. หน้า list โน้ต (เรียงล่าสุด, search)

หมายเหตุ: ไฟล์ >50MB ใช้ Gemini File API (URI) ไม่ใช่ base64
ใส่ guardrails (spec section 7) ใน summary prompt
```

---

## PHASE 3: Tags + Knowledge Graph

```
งาน Phase 3 — Auto-tagging + เชื่อมโยง:

1. สร้างตาราง tags, note_tags, note_links + pgvector
2. ตอนถอดเสร็จ → สร้าง embedding (768) ของ transcript
3. Auto-tag: AI ติดแท็ก 5 ประเภท (people/project/topic/action/status)
   - แสดงแท็กให้ผู้ใช้ + แก้/ลบได้ 1 คลิก (ai_suggested=true)
4. Knowledge Graph:
   - หา note_links จาก vector similarity (threshold ~0.75)
   - แสดง "โน้ตนี้อาจเกี่ยวกับ X — ใช่มั้ย? [ใช่][ไม่ใช่]"
   - ผู้ใช้ยืนยัน → confirmed=true
5. หน้า Graph View (แสดงโน้ตเป็น node เชื่อมกัน)

หลักการ: AI เสนอ — ผู้ใช้ยืนยัน (ไม่ตัดสินเอง 100%)
```

---

## PHASE 4: Ask Notes + Memory

```
งาน Phase 4 — แชทกับโน้ต + จำผู้ใช้:

1. สร้างตาราง user_memory
2. Onboarding (ข้ามได้): ถาม nickname + primary_use + tone
3. Ask Notes (RAG):
   - POST /api/ask: embed คำถาม → vector search transcripts →
     ดึง top-k + user_memory → Gemini ตอบ
   - +ask_notes_count
4. AI memory: เก็บจากที่ผู้ใช้พูด + ขออนุญาต ("จำไว้มั้ย?")
5. หน้า "สิ่งที่ทันโน้ตจำเกี่ยวกับคุณ" — ดู/แก้/ลบ

ใส่ guardrails: ตอบในฐานะเพื่อน/เลขา ไม่วินิจฉัย/แนะนำยา
```

---

## PHASE 5: Reminders (LINE)

```
งาน Phase 5 — ระบบเตือนผ่าน LINE:

1. สร้างตาราง reminders + index
2. ตอนถอดเสร็จ → AI ดึง task/นัด → สร้าง reminder
3. Edge Function /api/send-reminders:
   - pg_cron ทุกนาที → query due reminders
   - LINE Push (Flex Message + ปุ่ม เสร็จ/เลื่อน)
   - routine → คำนวณรอบถัดไป
4. /api/line-webhook: รับ postback [done/snooze] → update
5. หน้าตั้งค่าเตือน: เปิด/ปิดแต่ละประเภท + ช่วงห้ามรบกวน

6 ประเภท: task/appointment/routine/followup/greeting/system
ใช้ LINE_CHANNEL_ACCESS_TOKEN จาก env
```

---

## PHASE 6: Plans + Usage Indicator + Polish

```
งาน Phase 6 — ระบบแพลน + UI:

1. ใส่ PLAN_LIMITS (spec section 3) — เช็คก่อนทุก action
2. Usage Indicator:
   - progress bar ทุกโควต้า (rec/ask/suggest/cloud)
   - สี: เขียว<60% / เหลือง 60-85% / แดง 85%+
   - smart recommendation แนะนำแพลนตามการใช้จริง
3. หน้า Pricing (4 tier — Feature-Complete, ทุกแพลนเข้าทุกฟีเจอร์)
4. Cloud backup (Extra): opt-in → upload R2
5. จัดการ storage: เตือนพื้นที่มือถือใกล้เต็ม
6. Polish UI: ตาม brand (สีแดง #E24B4A + ครีม #FAFAF7, ฟอนต์ไทย)

ทดสอบครบทุก flow ก่อน launch
```

---

## 🎯 ลำดับแนะนำ

```
MVP launch ได้หลัง Phase 2-3 (อัด+ถอด+สรุป+แท็ก)
Phase 4-6 = เพิ่มหลัง validate ว่าตลาดต้องการ
```

---

**END — Cursor Build Prompt**
