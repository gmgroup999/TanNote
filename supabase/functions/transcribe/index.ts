/**
 * TanNote — /api/transcribe (Supabase Edge Function)
 *
 * Deploy:
 *   supabase functions deploy transcribe --no-verify-jwt
 *
 * Secrets (supabase secrets set KEY=value):
 *   GEMINI_API_KEY   — Google AI Studio API key
 *   NODE_ID          — UUID ของ tenant (optional, default ด้านล่าง)
 *
 * Receives multipart/form-data:
 *   audio            File   — audio blob จาก MediaRecorder
 *   recording_type   string — meeting|sales|idea|lecture|interview|diary|general|auto
 *   duration_seconds number
 *   local_audio_id   string — IndexedDB key
 *
 * Headers:
 *   X-Line-User-Id   string — LINE userId (Phase 2 placeholder; Phase 3 = LIFF JWT)
 */

import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PLAN_LIMITS, SUPPORTED_LANGUAGES, currentPeriod, quotaExceededResponse } from "../_shared/plans.ts";

// ─── Env ─────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY  = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NODE_ID         = Deno.env.get("NODE_ID") ?? "00000000-0000-0000-0000-000000000001";

const MAX_INLINE_BYTES = 20 * 1024 * 1024; // 20 MB → above this use Files API

// ─── CORS ────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-user-id, x-line-picture-url, x-line-display-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Recording type config ────────────────────────────────────────────────────
const TYPE_FOCUS: Record<string, string> = {
  meeting:     "มติ + action items + ผู้รับผิดชอบ",
  appointment: "วัน เวลา สถานที่ ผู้เข้าร่วม สิ่งที่ต้องเตรียม — สร้าง reminder อัตโนมัติ",
  sales:       "order, ราคา, นัดหมาย, follow-up",
  idea:        "จัดกลุ่มความคิด, เชื่อมไอเดียเก่า",
  lecture:     "หัวข้อหลัก, key points, สิ่งที่ควรจำ",
  interview:   "คำถาม-คำตอบ, ประเด็นสำคัญ",
  diary:       "เหตุการณ์, อารมณ์ความรู้สึก, โทนอบอุ่น",
  general:     "ถอดและสรุปแบบกลางๆ",
  auto:        "วิเคราะห์ context แล้วเลือกประเภทเอง",
};

// ─── Guardrails (ขอบเขตเพื่อน/เลขา) ─────────────────────────────────────────
const GUARDRAILS = `[ขอบเขต]
คุณเป็นเพื่อนและเลขาส่วนตัว ไม่ใช่แพทย์หรือนักจิตวิทยา
ห้ามวินิจฉัยโรค แนะนำยา หรือให้คำปรึกษาสุขภาพจิตเชิงรักษา
หากเนื้อหาพูดถึงเรื่องหนักมาก ให้สรุปอย่างอบอุ่นและแนะนำให้พูดคุยกับคนที่ไว้ใจหรือผู้เชี่ยวชาญ`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8_192;
  let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(bin);
}

function stripJsonFence(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface StructuredTag {
  name:     string;
  type:     "people" | "project" | "topic" | "action" | "status";
  tag_id?:  string;
  note_tag_confirmed?: boolean;
}

interface SuggestedLink {
  id:               string;  // note_links UUID
  linked_note_id:   string;
  linked_title:     string;
  similarity:       number;
  confirmed:        boolean | null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return respond({ error: "Method not allowed" }, 405);
  }

  if (!GEMINI_API_KEY) {
    return respond({ error: "GEMINI_API_KEY ไม่ได้ตั้งค่าใน Supabase secrets" }, 500);
  }

  try {
    // ── 1. Parse request ────────────────────────────────────────────────────
    const formData    = await req.formData();
    const audioFile   = formData.get("audio") as File | null;
    const recType     = (formData.get("recording_type") as string | null) ?? "auto";
    const durationSec = Number(formData.get("duration_seconds") ?? 0);
    const localId     = (formData.get("local_audio_id") as string | null) ?? "";
    const language    = (formData.get("language") as string | null) ?? "th";
    const lineUserId   = req.headers.get("x-line-user-id")   ?? "anonymous";
    const pictureUrl   = req.headers.get("x-line-picture-url")  ?? null;
    const displayName  = req.headers.get("x-line-display-name") ?? null;

    if (!audioFile || audioFile.size === 0) {
      return respond({ error: "ไม่พบไฟล์เสียง หรือไฟล์ว่างเปล่า" }, 400);
    }

    const ai        = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const supabase  = createClient(SUPABASE_URL, SUPABASE_SVC);

    // ── 2. Upsert user ──────────────────────────────────────────────────────
    const profilePatch: Record<string, unknown> = { node_id: NODE_ID, line_user_id: lineUserId };
    if (pictureUrl)  profilePatch.picture_url  = pictureUrl;
    if (displayName) profilePatch.display_name = displayName;

    const { data: userRow } = await supabase
      .from("users_profile")
      .upsert(profilePatch, { onConflict: "line_user_id" })
      .select("id, plan, is_suspended, plan_expires_at")
      .single();
    const userId: string | null = userRow?.id ?? null;

    // ── 2a. Check suspension ─────────────────────────────────────────────────
    if (userRow?.is_suspended) {
      return respond({ error: "บัญชีถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล" }, 403);
    }

    // Effective plan — downgrade on-the-fly if plan_expires_at has passed
    const _planExpiresAt = userRow?.plan_expires_at ? new Date(userRow.plan_expires_at as string) : null;
    const userPlan = (_planExpiresAt && _planExpiresAt < new Date()) ? "free" : ((userRow?.plan as string) ?? "free");

    // ── 2b. Check recording + ai_suggest quotas (single DB query) ───────────
    const period       = currentPeriod();
    const recLimit     = PLAN_LIMITS[userPlan]?.recording_minutes ?? PLAN_LIMITS.free.recording_minutes;
    const suggestLimit = PLAN_LIMITS[userPlan]?.ai_suggest        ?? PLAN_LIMITS.free.ai_suggest;
    if (userId) {
      const { data: usageRow } = await supabase
        .from("usage_tracking")
        .select("recording_minutes, ai_suggest_count")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();
      const minutesUsed = (usageRow?.recording_minutes as number) ?? 0;
      const suggestUsed = (usageRow?.ai_suggest_count  as number) ?? 0;
      if (recLimit !== null && minutesUsed >= recLimit) {
        return quotaExceededResponse(userPlan, "บันทึกเสียง", recLimit, minutesUsed);
      }
      if (suggestLimit !== null && suggestUsed >= suggestLimit) {
        return quotaExceededResponse(userPlan, "AI แนะนำแท็ก", suggestLimit, suggestUsed);
      }
    }

    // ── 2c. Check language support ───────────────────────────────────────────
    const allowedLangs = SUPPORTED_LANGUAGES[userPlan] ?? SUPPORTED_LANGUAGES.free;
    if (language !== "th" && !allowedLangs.includes(language) && !allowedLangs.includes("auto")) {
      return quotaExceededResponse(userPlan, `ภาษา "${language}"`, 0, 1);
    }

    // ── 3. Create note (status = processing) ────────────────────────────────
    const retentionDays = PLAN_LIMITS[userPlan]?.text_retention_days ?? PLAN_LIMITS.free.text_retention_days;
    const expiresAt = retentionDays !== null
      ? new Date(Date.now() + retentionDays * 86400_000).toISOString()
      : null;

    const { data: noteRow, error: noteErr } = await supabase
      .from("notes")
      .insert({
        node_id:          NODE_ID,
        user_id:          userId,
        recording_type:   recType,
        duration_seconds: durationSec,
        local_audio_id:   localId,
        status:           "processing",
        expires_at:       expiresAt,
      })
      .select("id")
      .single();

    if (noteErr) throw new Error(`DB insert failed: ${noteErr.message}`);
    const noteId = noteRow!.id as string;

    // ── 4. Prepare audio part (inline OR Files API) ─────────────────────────
    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const mimeType   = audioFile.type.split(";")[0] || "audio/webm";
    let audioPart: Record<string, unknown>;
    let uploadedFileName: string | null = null;

    if (audioBytes.byteLength > MAX_INLINE_BYTES) {
      const uploaded = await ai.files.upload({
        file:   new Blob([audioBytes], { type: mimeType }),
        config: { mimeType, displayName: `tannote-${noteId}.webm` },
      });
      uploadedFileName = uploaded.name ?? null;
      audioPart = { fileData: { mimeType, fileUri: uploaded.uri } };
    } else {
      audioPart = { inlineData: { mimeType, data: uint8ToBase64(audioBytes) } };
    }

    // ── 5. Build prompt (Phase 3+5: structured_tags + reminders) ───────────
    const focus      = TYPE_FOCUS[recType] ?? TYPE_FOCUS.general;
    const autoClause = recType === "auto"
      ? `วิเคราะห์ว่าเนื้อหาเป็นประเภทใด แล้วใส่ใน detected_type โดยใช้นิยามต่อไปนี้:
- meeting: ประชุมภายในทีม/องค์กร มีมติ action items ผู้รับผิดชอบ
- appointment: นัดหมายส่วนตัวหรือกับบุคคลภายนอก มีวัน/เวลา/สถานที่ เช่น หมอ ลูกค้า นัดเจอ สัมมนา กิจกรรม
- sales: คุยกับลูกค้า ขายสินค้า/บริการ order ราคา
- idea: brainstorm ความคิดสร้างสรรค์ แผนการ
- lecture: เรียน อบรม ฟังบรรยาย จดโน้ต
- interview: สัมภาษณ์งาน เก็บข้อมูล Q&A
- diary: บันทึกส่วนตัว ความรู้สึก เหตุการณ์ประจำวัน
- general: ไม่เข้าพวกใดข้างต้น`
      : `ประเภท: ${recType} — เน้น: ${focus}`;
    const appointmentClause = recType === "appointment"
      ? `\n[นัดหมาย]: สกัดวันเวลา สถานที่ ผู้เข้าร่วม และสิ่งที่ต้องเตรียมให้ครบ แล้วสร้าง reminder ใน "reminders" อย่างน้อย 1 รายการ (type="appointment") โดยใช้เวลาจริงในเนื้อหา ถ้าไม่ระบุเวลาชัดให้ตั้งเป็น 15 นาทีก่อนกิจกรรม`
      : ``;

    const nowBKK = new Date();
    const currentDatetimeTH = new Intl.DateTimeFormat("th-TH", {
      year: "numeric", month: "long", day: "numeric",
      weekday: "long", hour: "2-digit", minute: "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(nowBKK);
    const currentISOBKK = nowBKK.toLocaleString("sv-SE", { timeZone: "Asia/Bangkok" })
      .replace(" ", "T") + "+07:00";

    const langNames: Record<string, string> = {
      th: "ไทย", en: "English", zh: "Chinese (Simplified)", ja: "Japanese",
      ko: "Korean", auto: "auto-detect",
    };
    const langInstruction = language === "th" || language === "auto"
      ? "ถอดเสียงตามภาษาที่พูดจริง"
      : `Transcribe in ${langNames[language] ?? language}. Summary/analysis in Thai.`;

    const prompt = `${GUARDRAILS}

ถอดเสียงและวิเคราะห์เนื้อหาต่อไปนี้ ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น:
${langInstruction}

${autoClause}${appointmentClause}

{
  "detected_type": "meeting|sales|idea|lecture|interview|diary|general",
  "transcript":    "ข้อความที่ถอดได้ครบถ้วน — ถ้ามีหลายคนให้ขึ้นบรรทัดใหม่ ระบุ ผู้พูด 1: / ผู้พูด 2: — คำที่ไม่ชัดใส่ [ไม่ชัด]",
  "title":         "หัวเรื่องสั้น ไม่เกิน 8 คำ",
  "summary":       "สรุปภาพรวม 2-3 ประโยค",
  "key_points":    ["ประเด็นที่ 1", "ประเด็นที่ 2"],
  "action_items":  [{"task": "สิ่งที่ต้องทำ", "owner": "ชื่อ (ถ้ามี)", "due": "กำหนด (ถ้ามี)"}],
  "tags":          ["#แท็ก1", "#แท็ก2", "#แท็ก3"],
  "structured_tags": {
    "people":  ["ชื่อคน/บริษัทที่กล่าวถึง — ถ้าไม่มีให้เป็น []"],
    "project": ["ชื่อโปรเจกต์/งาน — ถ้าไม่มีให้เป็น []"],
    "topic":   ["หัวข้อหลัก 1-3 หัวข้อ"],
    "action":  ["action item หลัก — ถ้าไม่มีให้เป็น []"],
    "status":  ["สถานะ/phase เช่น เสร็จแล้ว, กำลังทำ — ถ้าไม่ชัดให้เป็น []"]
  },
  "reminders": [
    {"type": "task|appointment|routine|followup|greeting", "title": "หัวเรื่องสั้น ≤8 คำ", "message": "รายละเอียด (optional)", "remind_at": "ISO 8601 เช่น 2026-05-22T10:00:00+07:00", "repeat_rule": "daily|weekly หรือ null"}
  ],
  "sentiment": "positive|neutral|negative",
  "language":  "th"
}

กฎ:
- tags: 3-7 แท็กภาษาไทย ดึงจากเนื้อหาจริง
- structured_tags: แต่ละประเภทไม่เกิน 3 รายการ ดึงจากเนื้อหาจริงเท่านั้น
- action_items: ถ้าไม่มีในเนื้อหาให้เป็น []
- reminders: ดึงนัดหมาย/deadline ที่ระบุเวลาชัดหรือโดยนัย — ถ้าไม่มีให้เป็น []
- วันเวลาปัจจุบัน: ${currentDatetimeTH} (${currentISOBKK})
- remind_at ต้องอยู่ในอนาคต timezone +07:00
- ตอบ JSON เท่านั้น`;

    // ── 6. Call Gemini 2.5 Flash ────────────────────────────────────────────
    const aiResponse = await ai.models.generateContent({
      model:    "gemini-2.5-flash",
      contents: [{ parts: [audioPart, { text: prompt }] }],
      config:   { responseMimeType: "application/json", temperature: 0.1 },
    });

    // ── 7. Delete Files API upload immediately (Golden Rule: ไม่เก็บเสียงบน server)
    if (uploadedFileName) {
      try { await ai.files.delete(uploadedFileName); } catch { /* non-critical */ }
    }

    // ── 8. Parse result ─────────────────────────────────────────────────────
    const rawText = aiResponse.text ?? "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(stripJsonFence(rawText));
    } catch {
      result = { detected_type: recType, transcript: rawText, title: "บันทึกเสียง" };
    }

    const detectedType  = (result.detected_type as string)  ?? recType;
    const transcript    = (result.transcript    as string)  ?? "";
    const title         = (result.title         as string)  ?? "บันทึกเสียง";
    const summary       = (result.summary       as string)  ?? "";
    const keyPoints     = (result.key_points    as string[]) ?? [];
    const actionItems   = (result.action_items  as Record<string, string>[]) ?? [];
    const tags          = (result.tags          as string[]) ?? [];
    const sentiment        = (result.sentiment     as string)  ?? "neutral";
    const detectedLanguage = (result.language      as string)  ?? language; // prefer AI-detected lang
    const rawStructured    = result.structured_tags as Record<string, string[]> | undefined;

    // ── 9. Save text to Supabase notes (เก็บแค่ text — ไม่เก็บเสียง) ────────
    await supabase.from("notes").update({
      title,
      detected_type: detectedType,
      transcript,
      summary: { overview: summary, points: keyPoints, actions: actionItems, tags, sentiment },
      language: detectedLanguage,
      status: "done",
    }).eq("id", noteId);

    // ── 9b. Increment recording minutes + ai_suggest_count (fire-and-forget) ──
    if (userId && !lineUserId.startsWith("dev_")) {
      const minutesToAdd = Math.max(1, Math.round(durationSec / 60));
      void (async () => {
        try { await supabase.rpc("increment_recording_minutes", { p_user_id: userId, p_period: period, p_minutes: minutesToAdd }); }
        catch { /* ignore */ }
      })();
      void (async () => {
        try { await supabase.rpc("increment_ai_suggest_count", { p_user_id: userId, p_period: period }); }
        catch { /* ignore */ }
      })();
    }

    // ── 10. Generate text embedding (Phase 3) ───────────────────────────────
    let embeddingVector: number[] | null = null;
    try {
      const textToEmbed = `${title}\n${summary}\n${transcript}`.slice(0, 8000);
      const embResult = await (ai.models as any).embedContent({
        model:   "text-embedding-004",
        content: { parts: [{ text: textToEmbed }] },
        config:  { outputDimensionality: 768 },
      });
      embeddingVector = embResult?.embeddings?.[0]?.values
        ?? embResult?.embedding?.values
        ?? null;

      if (embeddingVector?.length) {
        await supabase.from("notes")
          .update({ embedding: `[${embeddingVector.join(",")}]` })
          .eq("id", noteId);
      }
    } catch (embErr) {
      console.error("[transcribe] embedding failed:", embErr);
    }

    // ── 11. Upsert structured tags into DB ──────────────────────────────────
    const structuredTagsList: StructuredTag[] = [];
    if (rawStructured) {
      const tagCategories: Array<StructuredTag["type"]> = ["people", "project", "topic", "action", "status"];
      const tagRows: { node_id: string; user_id: string | null; name: string; type: string }[] = [];

      for (const cat of tagCategories) {
        const names = rawStructured[cat] ?? [];
        for (const name of names.slice(0, 3)) {
          if (name.trim()) {
            tagRows.push({ node_id: NODE_ID, user_id: userId, name: name.trim(), type: cat });
          }
        }
      }

      if (tagRows.length > 0) {
        try {
          const { data: insertedTags } = await supabase
            .from("tags")
            .upsert(tagRows, { onConflict: "node_id,name,type" })
            .select("id, name, type");

          if (insertedTags?.length) {
            const noteTagRows = insertedTags.map((t: { id: string }) => ({
              note_id:      noteId,
              tag_id:       t.id,
              node_id:      NODE_ID,
              ai_suggested: true,
            }));
            await supabase.from("note_tags")
              .upsert(noteTagRows, { onConflict: "note_id,tag_id" });

            for (const t of insertedTags as { id: string; name: string; type: string }[]) {
              structuredTagsList.push({ name: t.name, type: t.type as StructuredTag["type"], tag_id: t.id });
            }
          }
        } catch (tagErr) {
          console.error("[transcribe] tag upsert failed:", tagErr);
        }
      }
    }

    // ── 12. Find similar notes via vector similarity (Phase 3) ───────────────
    const suggestedLinks: SuggestedLink[] = [];
    if (embeddingVector?.length) {
      try {
        const vectorStr = `[${embeddingVector.join(",")}]`;
        const { data: similar } = await supabase.rpc("match_notes", {
          query_embedding: vectorStr,
          match_threshold: 0.75,
          exclude_note_id: noteId,
          p_node_id:       NODE_ID,
        }) as { data: { id: string; title: string; similarity: number }[] | null };

        if (similar?.length) {
          const linkRows = similar.map((n) => ({
            node_id:        NODE_ID,
            user_id:        userId,
            source_note_id: noteId,
            target_note_id: n.id,
            similarity:     n.similarity,
            confirmed:      null,
          }));

          const { data: insertedLinks } = await supabase
            .from("note_links")
            .upsert(linkRows, { onConflict: "source_note_id,target_note_id" })
            .select("id, target_note_id, similarity, confirmed");

          for (const link of (insertedLinks ?? []) as {
            id: string; target_note_id: string; similarity: number; confirmed: boolean | null;
          }[]) {
            const matchedNote = similar.find((n) => n.id === link.target_note_id);
            suggestedLinks.push({
              id:             link.id,
              linked_note_id: link.target_note_id,
              linked_title:   matchedNote?.title ?? "บันทึกเสียง",
              similarity:     link.similarity,
              confirmed:      link.confirmed,
            });
          }
        }
      } catch (linkErr) {
        console.error("[transcribe] note_links failed:", linkErr);
      }
    }

    // ── 13. Extract and save reminders (Phase 5) ────────────────────────────
    interface RawReminder {
      type?: string; title?: string; message?: string;
      remind_at?: string; repeat_rule?: string | null;
    }
    const rawReminders = (result.reminders as RawReminder[]) ?? [];
    const savedReminders: Array<{
      id: string; type: string; title: string; message?: string;
      remind_at: string; repeat_rule: string | null; status: string;
    }> = [];

    for (const r of rawReminders.slice(0, 5)) {
      if (!r.title?.trim() || !r.remind_at) continue;
      try {
        const remindAt = new Date(r.remind_at);
        if (isNaN(remindAt.getTime()) || remindAt <= nowBKK) continue;
        const { data: inserted } = await supabase
          .from("reminders")
          .insert({
            node_id:      NODE_ID,
            user_id:      userId,
            note_id:      noteId,
            type:         r.type ?? "task",
            title:        r.title.trim().slice(0, 100),
            message:      r.message?.trim().slice(0, 500) ?? null,
            remind_at:    remindAt.toISOString(),
            repeat_rule:  r.repeat_rule ?? null,
            status:       "pending",
            line_user_id: lineUserId,
          })
          .select("id, type, title, message, remind_at, repeat_rule, status")
          .single();
        if (inserted) savedReminders.push(inserted as typeof savedReminders[0]);
      } catch (remErr) {
        console.error("[transcribe] reminder insert failed:", remErr);
      }
    }

    // ── 14. Return result to frontend ───────────────────────────────────────
    return respond({
      note_id:         noteId,
      detected_type:   detectedType,
      transcript,
      title,
      summary,
      key_points:      keyPoints,
      action_items:    actionItems,
      tags,
      sentiment,
      structured_tags: structuredTagsList,
      note_links:      suggestedLinks,
      reminders:       savedReminders,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    console.error("[transcribe]", message);
    return respond({ error: message }, 500);
  }
});
