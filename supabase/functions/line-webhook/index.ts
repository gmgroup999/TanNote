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

// ─── LINE push image (optionally with a caption) ────────────────────────────
async function pushImage(to: string, imageUrl: string, caption?: string) {
  if (!LINE_TOKEN || !to) return;
  const messages: unknown[] = [];
  if (caption) messages.push({ type: "text", text: caption });
  messages.push({ type: "image", originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  await fetch("https://api.line.me/v2/bot/message/push", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to, messages }),
  }).catch(() => {});
}

// ─── Download a LINE image message → upload to Supabase Storage → public URL ──
// deno-lint-ignore no-explicit-any
async function uploadSlip(supabase: any, messageId: string, lineUserId: string): Promise<string | null> {
  if (!messageId) return null;
  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { "Authorization": `Bearer ${LINE_TOKEN}` },
    });
    if (!res.ok) return null;
    const buf  = new Uint8Array(await res.arrayBuffer());
    const path = `${lineUserId}/${messageId}.jpg`;
    const { error } = await supabase.storage.from("payment-slips").upload(path, buf, {
      contentType: "image/jpeg", upsert: true,
    });
    if (error) { console.error("[slip] upload failed:", error.message); return null; }
    return `${SUPABASE_URL}/storage/v1/object/public/payment-slips/${path}`;
  } catch (e) {
    console.error("[slip] error:", e);
    return null;
  }
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

      // Push แจ้ง admin ทันที (พร้อม forward รูปสลิป + ชื่อ user)
      if (ADMIN_LINE_ID && lineUserId !== ADMIN_LINE_ID) {
        const { data: prof } = await supabase
          .from("users_profile")
          .select("display_name, nickname, plan")
          .eq("line_user_id", lineUserId)
          .maybeSingle();
        const who     = prof?.display_name || prof?.nickname || "(ไม่ทราบชื่อ)";
        const planNow = prof?.plan ? `\nแผนปัจจุบัน: ${prof.plan}` : "";

        if (msgType === "image") {
          const slipUrl = await uploadSlip(supabase, event.message?.id as string, lineUserId);

          // Attach the slip to the latest pending payment request (create one if none)
          const { data: pr } = await supabase
            .from("payment_requests")
            .select("id, plan, amount")
            .eq("line_user_id", lineUserId)
            .eq("status", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (pr) {
            await supabase.from("payment_requests").update({ slip_url: slipUrl }).eq("id", pr.id);
          } else if (prof) {
            const { data: nodeRow } = await supabase.from("users_profile").select("node_id").eq("line_user_id", lineUserId).maybeSingle();
            if (nodeRow?.node_id) await supabase.from("payment_requests").insert({ node_id: nodeRow.node_id, line_user_id: lineUserId, slip_url: slipUrl });
          }

          const wants = pr?.plan
            ? `\n🎯 ขอแผน: ${String(pr.plan).toUpperCase()}${pr.amount ? ` (฿${pr.amount})` : ""}`
            : "\n🎯 ขอแผน: (ไม่ระบุ — เลือกในแผงอนุมัติ)";
          const notice = `💰 มีแจ้งชำระเงิน!\n\nจาก: ${who}${planNow}${wants}\n\n→ อนุมัติได้เลยที่ Admin Panel (แผง "รออนุมัติ")`;

          if (slipUrl) await pushImage(ADMIN_LINE_ID, slipUrl, notice);
          else         await pushText(ADMIN_LINE_ID, `${notice}\n\n📷 (ดึงรูปสลิปไม่สำเร็จ)`);
        } else {
          const notice = `💬 ข้อความจาก: ${who}${planNow}\nLINE ID: ${lineUserId}`;
          await pushText(ADMIN_LINE_ID, `${notice}\n\n"${msgText.slice(0, 80)}"`);
        }
      }
      continue;
    }
  }

  return respond({ ok: true });
});
