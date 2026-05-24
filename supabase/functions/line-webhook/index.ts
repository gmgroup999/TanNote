/**
 * TanNote — /api/line-webhook
 * รับ LINE webhook: postback (done/snooze reminders) + message (payment notify)
 * Deploy: supabase functions deploy line-webhook --no-verify-jwt
 *
 * Secrets: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN,
 *          SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          ADMIN_LINE_USER_ID (personal LINE ID ของ admin สำหรับรับแจ้งเตือน)
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const LINE_SECRET    = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LINE_TOKEN     = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_LINE_ID  = Deno.env.get("ADMIN_LINE_USER_ID") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── HMAC-SHA256 LINE signature verification ──────────────────────────────────
async function verifySignature(body: string, sig: string): Promise<boolean> {
  if (!LINE_SECRET) return true; // skip in dev (no secret configured)
  try {
    const key   = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(LINE_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac   = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    const b64   = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return b64 === sig;
  } catch {
    return false;
  }
}

// ─── LINE reply helper (ตอบกลับ user ผ่าน replyToken) ───────────────────────
async function replyText(replyToken: string, text: string) {
  if (!LINE_TOKEN || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}

// ─── LINE push helper (ส่งตรงถึง LINE User ID ที่ระบุ) ───────────────────────
async function pushText(to: string, text: string) {
  if (!LINE_TOKEN || !to) return;
  await fetch("https://api.line.me/v2/bot/message/push", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return respond({ error: "Method not allowed" }, 405);

  const bodyText = await req.text();
  const sig      = req.headers.get("x-line-signature") ?? "";

  let payload: { events?: any[] };
  try { payload = JSON.parse(bodyText); }
  catch { return respond({ error: "Invalid JSON" }, 400); }

  // LINE Developer Console verification ping sends empty events — return 200 immediately
  if ((payload.events ?? []).length === 0) {
    return respond({ ok: true });
  }

  // Verify signature for real events (postbacks, messages, etc.)
  if (LINE_SECRET && !(await verifySignature(bodyText, sig))) {
    console.error("[line-webhook] signature mismatch, sig:", sig);
    return respond({ error: "Invalid signature" }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

  for (const event of payload.events ?? []) {
    const replyToken = event.replyToken as string;
    const lineUserId = event.source?.userId as string | undefined;

    // ─── Postback: reminder done / snooze ─────────────────────────────────────
    if (event.type === "postback") {
      const params = new URLSearchParams(event.postback?.data ?? "");
      const action = params.get("action");
      const id     = params.get("id");

      if (!action || !id || !lineUserId) continue;

      if (action === "done") {
        const { error } = await supabase
          .from("reminders")
          .update({ status: "done" })
          .eq("id", id)
          .eq("line_user_id", lineUserId);

        if (!error) await replyText(replyToken, "✓ เสร็จเรียบร้อย! เยี่ยมมากเลย 🎉");

      } else if (action === "snooze") {
        const snoozeUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const { error } = await supabase
          .from("reminders")
          .update({ remind_at: snoozeUntil, status: "pending" })
          .eq("id", id)
          .eq("line_user_id", lineUserId);

        if (!error) await replyText(replyToken, "⏰ เลื่อนออกไป 1 ชั่วโมงแล้วนะ");
      }
      continue;
    }

    // ─── Message: ข้อความ / รูป จาก user ─────────────────────────────────────
    if (event.type === "message" && lineUserId) {
      const msgType  = event.message?.type as string;
      const msgText  = msgType === "text" ? (event.message?.text as string ?? "") : "";

      // /myid — ส่งคำสั่งนี้เพื่อดู LINE User ID
      if (msgText.trim() === "/myid") {
        console.log("[line-webhook] /myid from", lineUserId);
        await replyText(replyToken, `LINE User ID ของคุณ:\n${lineUserId}`);
        continue;
      }

      // ตอบกลับ user ทันที
      await replyText(
        replyToken,
        "ขอบคุณที่ติดต่อมาค่ะ 🙏\n\nทีมงานได้รับข้อความของคุณแล้ว จะตรวจสอบสลิปและอัปเกรดแพลนให้ภายใน 24 ชั่วโมงนะคะ\n\nหากมีข้อสงสัยเพิ่มเติม ทีมงานจะติดต่อกลับค่ะ"
      );

      // Push แจ้ง admin ทันที
      if (ADMIN_LINE_ID && lineUserId !== ADMIN_LINE_ID) {
        const preview = msgType === "image"
          ? "📷 ส่งรูปมา (น่าจะเป็นสลิป)"
          : `💬 "${msgText.slice(0, 80)}"`;
        await pushText(
          ADMIN_LINE_ID,
          `💰 มีแจ้งชำระเงิน!\n\nจาก LINE ID:\n${lineUserId}\n\n${preview}\n\n→ เปลี่ยน plan ได้ที่ Admin Panel`
        );
      }
      continue;
    }
  }

  return respond({ ok: true });
});
