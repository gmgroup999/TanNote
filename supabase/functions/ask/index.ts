/**
 * TanNote — /api/ask (RAG: ถามบันทึก)
 *
 * Deploy:
 *   supabase functions deploy ask --no-verify-jwt
 *
 * Receives JSON body:
 *   question   string  — คำถามจากผู้ใช้
 *
 * Headers:
 *   X-Line-User-Id  string — LINE userId
 */

import { GoogleGenAI } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PLAN_LIMITS, periodForPlan, quotaExceededResponse } from "../_shared/plans.ts";
import { resolveLineUserId } from "../_shared/liff-verify.ts";

// ─── Env ──────────────────────────────────────────────────────────────────────
const GEMINI_API_KEY  = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NODE_ID         = Deno.env.get("NODE_ID") ?? "00000000-0000-0000-0000-000000000001";
const LINE_CHANNEL_ID = Deno.env.get("LINE_CHANNEL_ID") ?? "";

// ─── CORS ─────────────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-user-id, x-liff-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GUARDRAILS = `[ขอบเขต]
คุณคือ "ทันโน้ต" — เพื่อนและเลขาส่วนตัว ไม่ใช่แพทย์หรือนักจิตวิทยา
ห้ามวินิจฉัยโรค แนะนำยา หรือให้คำปรึกษาสุขภาพจิตเชิงรักษา
ตอบโดยอิงจากบันทึกที่มีเท่านั้น ห้ามแต่งข้อมูลขึ้นเอง
หากถามเรื่องที่ไม่มีในบันทึก ให้บอกตรงๆ ว่าไม่มีข้อมูล`;

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function stripJsonFence(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  if (!GEMINI_API_KEY) return respond({ error: "GEMINI_API_KEY ไม่ได้ตั้งค่า" }, 500);

  try {
    // ── 1. Parse body ────────────────────────────────────────────────────────
    const body       = await req.json() as {
      question?:    string;
      history?:     { role: string; text: string }[];
      local_notes?: { note_id?: string; title: string; summary: string; created_at?: string }[];
    };
    const question   = (body.question ?? "").trim();
    const history    = body.history ?? [];
    const localNotes = body.local_notes ?? [];
    if (!question) return respond({ error: "ไม่มีคำถาม" }, 400);

    const ai       = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

    // Authenticate caller (LIFF token / email session JWT / sandbox)
    const auth = await resolveLineUserId(req, supabase, LINE_CHANNEL_ID);
    if (auth.error) return respond({ error: auth.error }, auth.status);
    const lineUserId = auth.userId;

    // ── 2. Get/create user ───────────────────────────────────────────────────
    const { data: userRow } = await supabase
      .from("users_profile")
      .upsert({ node_id: NODE_ID, line_user_id: lineUserId }, { onConflict: "line_user_id" })
      .select("id, plan, is_suspended, plan_expires_at, nickname, tone")
      .single();
    const userId = userRow?.id as string | null;

    // ── 2a. Check suspension ─────────────────────────────────────────────────
    if (userRow?.is_suspended) {
      return respond({ error: "บัญชีถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแล" }, 403);
    }

    // Effective plan — downgrade on-the-fly if plan_expires_at has passed
    const _planExpiresAt = userRow?.plan_expires_at ? new Date(userRow.plan_expires_at as string) : null;
    const userPlan = (_planExpiresAt && _planExpiresAt < new Date()) ? "free" : ((userRow?.plan as string) ?? "free");

    const nickname = userRow?.nickname as string | null;
    const tone     = (userRow?.tone as string) ?? "casual";

    // ── 2b. Check ask-notes quota ────────────────────────────────────────────
    const period   = periodForPlan(userPlan);
    const askLimit = PLAN_LIMITS[userPlan]?.ask_notes ?? PLAN_LIMITS.free.ask_notes;
    if (userId && askLimit !== null) {
      const { data: usageRow } = await supabase
        .from("usage_tracking")
        .select("ask_notes_count")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();
      const askCount = (usageRow?.ask_notes_count as number) ?? 0;
      if (askCount >= askLimit) {
        return quotaExceededResponse(userPlan, "ถามโน้ต", askLimit, askCount);
      }
    }

    // ── 3. Embed question ────────────────────────────────────────────────────
    let questionVector: number[] | null = null;
    try {
      const embResult = await (ai.models as any).embedContent({
        model:    "text-embedding-004",
        content:  { parts: [{ text: question }] },
        config:   { outputDimensionality: 768 },
      });
      questionVector = embResult?.embeddings?.[0]?.values
        ?? embResult?.embedding?.values
        ?? null;
    } catch (e) {
      console.error("[ask] embed failed:", e);
      // fallback to recent notes — no vector search
    }

    // ── 4. Vector search notes ───────────────────────────────────────────────
    let relevantNotes: { id: string; title: string; similarity: number }[] = [];
    if (questionVector?.length) {
      try {
        const { data: matches } = await supabase.rpc("match_notes", {
          query_embedding: `[${questionVector.join(",")}]`,
          match_threshold: 0.45,
          exclude_note_id: "00000000-0000-0000-0000-000000000000",
          p_node_id:       NODE_ID,
        }) as { data: { id: string; title: string; similarity: number }[] | null };
        relevantNotes = matches ?? [];
        // Restrict to notes the user actually has locally (source of truth)
        if (localNotes.length > 0) {
          const localIdSet = new Set(localNotes.filter(ln => ln.note_id).map(ln => ln.note_id!));
          relevantNotes = relevantNotes.filter(r => localIdSet.has(r.id));
        }
      } catch (e) {
        console.error("[ask] vector search failed:", e);
      }
    }

    // ── 5. Fetch note content — fallback to recent notes if vector empty ─────
    const sources: { title: string; note_id: string; similarity: number }[] = [];
    let notesContext = "";
    let totalNoteCount = 0;

    type NoteRow = { id: string; title: string; transcript?: string; summary?: { overview?: string }; created_at?: string };

    let noteRows: NoteRow[] = [];

    if (relevantNotes.length > 0) {
      const { data } = await supabase
        .from("notes")
        .select("id, title, transcript, summary, created_at")
        .in("id", relevantNotes.slice(0, 5).map((n) => n.id));
      noteRows = (data ?? []) as NoteRow[];
    } else {
      // Fallback: ดึง notes ล่าสุดใน node แทน
      const { count } = await supabase
        .from("notes")
        .select("*", { count: "exact", head: true })
        .eq("node_id", NODE_ID)
        .eq("status", "done");
      totalNoteCount = count ?? 0;

      const { data } = await supabase
        .from("notes")
        .select("id, title, transcript, summary, created_at")
        .eq("node_id", NODE_ID)
        .eq("status", "done")
        .order("created_at", { ascending: false })
        .limit(5);
      noteRows = (data ?? []) as NoteRow[];
    }

    // When frontend sends local notes, use them as source of truth —
    // drop DB-only notes the user deleted or never had locally
    if (localNotes.length > 0) {
      const localIdSet = new Set(localNotes.filter(ln => ln.note_id).map(ln => ln.note_id!));
      noteRows = noteRows.filter(n => localIdSet.has(n.id));
      totalNoteCount = localNotes.length;
    }

    if (noteRows.length > 0) {
      notesContext = noteRows.map((n) => {
        const rel = relevantNotes.find((r) => r.id === n.id);
        sources.push({ title: n.title ?? "บันทึกเสียง", note_id: n.id, similarity: rel?.similarity ?? 0 });
        const overview = n.summary?.overview ?? "";
        const date = n.created_at ? new Date(n.created_at).toLocaleDateString("th-TH") : "";
        return `[${n.title ?? "บันทึกเสียง"}]${date ? ` (${date})` : ""}\n${overview}\n${(n.transcript ?? "").slice(0, 2000)}`;
      }).join("\n\n---\n\n");
    }

    // ── 5b. Merge local-only notes (not already in DB results) ───────────────
    const dbNoteIds = new Set(noteRows.map(n => n.id));
    const extraLocal = localNotes.filter(ln => !ln.note_id || !dbNoteIds.has(ln.note_id));
    if (extraLocal.length > 0) {
      const localParts = extraLocal.map(ln => {
        const date = ln.created_at ? new Date(ln.created_at).toLocaleDateString("th-TH") : "";
        if (ln.note_id) sources.push({ title: ln.title ?? "บันทึกเสียง", note_id: ln.note_id, similarity: 0 });
        return `[${ln.title ?? "บันทึกเสียง"}]${date ? ` (${date})` : ""}\n${ln.summary}`;
      });
      notesContext = notesContext
        ? notesContext + "\n\n---\n\n" + localParts.join("\n\n---\n\n")
        : localParts.join("\n\n---\n\n");
    }

    const totalCount = localNotes.length > 0 ? localNotes.length : noteRows.length + extraLocal.length;
    const hasNotes = totalCount > 0;
    const shownCount = noteRows.length + extraLocal.length;
    const contextNote = relevantNotes.length > 0
      ? `บันทึกที่เกี่ยวข้องกับคำถาม (${sources.length} รายการ จากทั้งหมด ${totalCount} รายการ):`
      : hasNotes
        ? `ไม่พบบันทึกที่ตรงกับคำถามโดยตรง — แสดง ${shownCount} รายการล่าสุด (มีทั้งหมด ${totalCount} รายการ):`
        : "ยังไม่มีบันทึกเสียงในระบบ";

    // ── 6. Fetch user memory ─────────────────────────────────────────────────
    let memoryContext = "";
    if (userId) {
      const { data: memories } = await supabase
        .from("user_memory")
        .select("key, value")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if ((memories as { key: string; value: string }[] | null)?.length) {
        memoryContext = (memories as { key: string; value: string }[])
          .map((m) => `- ${m.key}: ${m.value}`)
          .join("\n");
      }
    }

    // ── 7. Build RAG prompt ──────────────────────────────────────────────────
    const nameClause = nickname ? `ชื่อผู้ใช้: ${nickname}` : "";
    const toneClause = tone === "formal"
      ? "ตอบด้วยภาษาสุภาพ เป็นมืออาชีพ"
      : "ตอบแบบเพื่อนสนิท เป็นกันเอง อบอุ่น";
    const memSection = memoryContext ? `\nสิ่งที่จำเกี่ยวกับผู้ใช้:\n${memoryContext}` : "";
    const historySection = history.length > 0
      ? "\nบทสนทนาก่อนหน้า:\n" + history.map(h => `${h.role === "user" ? "ผู้ใช้" : "ทันโน้ต"}: ${h.text}`).join("\n")
      : "";

    const prompt = `${GUARDRAILS}

${nameClause}
${toneClause}
${memSection}
${historySection}

${contextNote}
${notesContext || "(ไม่มีข้อมูล)"}

คำถาม: "${question}"

ตอบเป็น JSON เท่านั้น:
{
  "answer": "คำตอบภาษาไทย",
  "suggested_memory": {
    "key": "nickname|occupation|project|preference|other",
    "value": "สิ่งที่ควรจำ",
    "reason": "เหตุผลสั้นๆ"
  }
}

แนวทางตอบ (IQ + EQ):
- ตอบกระชับ ตรงประเด็น เว้นแต่ถามให้สรุปยาว
- ถ้ามีข้อมูลในบันทึก: ตอบจากบันทึกจริง
- ถ้าถามเรื่องจำนวน: ตอบตัวเลขก่อน เช่น "มีทั้งหมด 2 รายการ"
- ถ้าต้องแสดงหลายรายการ: ใช้ numbered list ขึ้นต้นด้วย "1. 2. 3." แยกบรรทัด
- ถ้าต้องการ bullet: ขึ้นต้นด้วย "- " แยกบรรทัด
- ใช้ **ตัวหนา** เฉพาะชื่อเรื่องหรือคำสำคัญ ไม่เกิน 3 จุด
- คั่นย่อหน้าด้วยบรรทัดว่าง 1 บรรทัด
- suggested_memory: ถ้าคำถามบอกข้อมูลส่วนตัวที่ควรจำ (ชื่อ งาน โปรเจกต์) ให้ใส่ ไม่งั้น null
- ตอบ JSON เท่านั้น ห้ามมี code fence ล้อมรอบ`;

    // ── 8. Call Gemini ───────────────────────────────────────────────────────
    const aiResp = await ai.models.generateContent({
      model:    "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config:   { temperature: 0.4 },
    });

    let answer       = "";
    let suggestedMem: { key: string; value: string; reason: string } | null = null;

    let rawText = "";
    try { rawText = aiResp.text ?? ""; } catch (e) {
      console.error("[ask] aiResp.text threw:", e);
    }

    if (!rawText) {
      console.error("[ask] empty Gemini response");
      return respond({ answer: "ขอโทษ ระบบ AI ยุ่งชั่วคราว กรุณาลองใหม่อีกครั้ง", sources, suggested_memory: null });
    }

    try {
      const parsed = JSON.parse(stripJsonFence(rawText));
      answer       = parsed.answer ?? "";
      suggestedMem = parsed.suggested_memory ?? null;
    } catch {
      console.error("[ask] JSON parse failed, rawText:", rawText.slice(0, 200));
      answer = stripJsonFence(rawText);
    }

    if (!answer) answer = "ขอโทษ ระบบ AI ยุ่งชั่วคราว กรุณาลองใหม่อีกครั้ง";

    // ── 9. Increment ask count (fire-and-forget) ─────────────────────────────
    if (userId) {
      void (async () => {
        try { await supabase.rpc("increment_ask_count", { p_user_id: userId, p_period: period }); }
        catch { /* ignore */ }
      })();
    }

    // ── 10. Return ────────────────────────────────────────────────────────────
    return respond({ answer, sources, suggested_memory: suggestedMem });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    console.error("[ask]", msg);
    return respond({ error: msg }, 500);
  }
});
