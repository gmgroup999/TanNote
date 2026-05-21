/**
 * TanNote — /api/line-webhook
 * รับ LINE webhook postback: action=done|snooze&id=UUID
 * Deploy: supabase functions deploy line-webhook --no-verify-jwt
 *
 * Secrets: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const LINE_SECRET   = Deno.env.get("LINE_CHANNEL_SECRET")!;
const LINE_TOKEN    = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const SUPABASE_URL  = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

// ─── LINE reply helper ────────────────────────────────────────────────────────
async function replyText(replyToken: string, text: string) {
  if (!LINE_TOKEN || !replyToken) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  }).catch(() => {});
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return respond({ error: "Method not allowed" }, 405);

  const bodyText = await req.text();
  const sig      = req.headers.get("x-line-signature") ?? "";

  if (LINE_SECRET && !(await verifySignature(bodyText, sig))) {
    return respond({ error: "Invalid signature" }, 401);
  }

  let payload: { events?: any[] };
  try { payload = JSON.parse(bodyText); }
  catch { return respond({ error: "Invalid JSON" }, 400); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

  for (const event of payload.events ?? []) {
    if (event.type !== "postback") continue;

    const params     = new URLSearchParams(event.postback?.data ?? "");
    const action     = params.get("action");
    const id         = params.get("id");
    const replyToken = event.replyToken as string;
    const lineUserId = event.source?.userId as string | undefined;

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
  }

  return respond({ ok: true });
});
