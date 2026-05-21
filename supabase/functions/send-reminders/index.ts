/**
 * TanNote — /api/send-reminders
 * เรียกจาก pg_cron ทุก 1 นาที หรือ external cron
 * Deploy: supabase functions deploy send-reminders --no-verify-jwt
 *
 * Secrets: LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const LINE_TOKEN   = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── Reminder type labels (Thai) ─────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
  task:        "✓ งาน",
  appointment: "📅 นัดหมาย",
  routine:     "🔁 งานประจำ",
  followup:    "📞 ติดตาม",
  greeting:    "🎂 อวยพร",
  system:      "⚙️ ระบบ",
};

// ─── LINE Flex Message ────────────────────────────────────────────────────────
function buildFlexMessage(r: {
  id: string; type: string; title: string; message?: string; remind_at: string;
}) {
  const timeStr = new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(new Date(r.remind_at));

  return {
    type:     "flex",
    altText:  `ทันโน้ตเตือน: ${r.title}`,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type:     "box",
        layout:   "vertical",
        spacing:  "sm",
        paddingAll: "16px",
        contents: [
          { type: "text", text: TYPE_LABEL[r.type] ?? r.type, size: "xs", color: "#888888" },
          { type: "text", text: r.title, weight: "bold", size: "md", wrap: true, color: "#1a1a1a", margin: "sm" },
          ...(r.message ? [{ type: "text", text: r.message, size: "sm", color: "#555555", wrap: true, margin: "sm" }] : []),
          { type: "text", text: timeStr, size: "xs", color: "#E24B4A", margin: "md" },
        ],
      },
      footer: {
        type:     "box",
        layout:   "horizontal",
        spacing:  "sm",
        paddingAll: "12px",
        contents: [
          {
            type: "button", style: "primary", color: "#E24B4A", height: "sm",
            action: { type: "postback", label: "✓ เสร็จแล้ว", data: `action=done&id=${r.id}`, displayText: "เสร็จแล้ว!" },
          },
          {
            type: "button", style: "secondary", height: "sm",
            action: { type: "postback", label: "⏰ เลื่อน 1 ชม.", data: `action=snooze&id=${r.id}`, displayText: "เลื่อนไป 1 ชั่วโมง" },
          },
        ],
      },
    },
  };
}

// ─── Quiet-hour check (Bangkok UTC+7) ────────────────────────────────────────
function isQuietHour(now: Date, start: string, end: string): boolean {
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m ?? 0); };
  const bkk   = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok",
  }).format(now);
  const [bh, bm] = bkk.split(":").map(Number);
  const cur   = (isNaN(bh) ? 0 : bh) * 60 + (isNaN(bm) ? 0 : bm);
  const s     = toMin(start ?? "22:00");
  const e     = toMin(end   ?? "08:00");
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

// ─── Next repeat time ─────────────────────────────────────────────────────────
function nextTime(remindAt: string, rule: string | null): string | null {
  if (!rule) return null;
  const d = new Date(remindAt);
  if (rule === "daily")  d.setDate(d.getDate() + 1);
  else if (rule === "weekly") d.setDate(d.getDate() + 7);
  else return null;
  return d.toISOString();
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return respond({ error: "Method not allowed" }, 405);

  if (!LINE_TOKEN) return respond({ skipped: true, reason: "LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า" });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);
    const now      = new Date();

    // ── Query due reminders with user settings ────────────────────────────────
    const { data: dueRows, error } = await supabase
      .from("reminders")
      .select(`
        id, type, title, message, remind_at, repeat_rule, status, line_user_id,
        users_profile!user_id (reminder_settings)
      `)
      .eq("status", "pending")
      .lte("remind_at", now.toISOString())
      .not("line_user_id", "like", "dev_%")
      .not("line_user_id", "is", null)
      .limit(50);

    if (error) throw error;

    const sent: string[] = [];
    const skipped: string[] = [];

    for (const row of (dueRows ?? []) as any[]) {
      const settings  = row.users_profile?.reminder_settings ?? {};
      const types     = (settings.types as string[]) ?? ["task","appointment","routine","followup","greeting","system"];
      const quietStart = settings.quiet_start ?? "22:00";
      const quietEnd   = settings.quiet_end   ?? "08:00";

      // Check reminder type enabled
      if (!types.includes(row.type)) {
        skipped.push(row.id);
        continue;
      }
      // Check quiet hours
      if (isQuietHour(now, quietStart, quietEnd)) {
        skipped.push(row.id);
        continue;
      }

      // Send LINE push
      const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${LINE_TOKEN}` },
        body:    JSON.stringify({ to: row.line_user_id, messages: [buildFlexMessage(row)] }),
      });

      if (pushRes.ok) {
        sent.push(row.id);

        if (row.repeat_rule) {
          // Routine: update remind_at to next occurrence
          const next = nextTime(row.remind_at, row.repeat_rule);
          if (next) {
            await supabase.from("reminders").update({ remind_at: next, status: "pending" }).eq("id", row.id);
          } else {
            await supabase.from("reminders").update({ status: "sent" }).eq("id", row.id);
          }
        } else {
          await supabase.from("reminders").update({ status: "sent" }).eq("id", row.id);
        }
      } else {
        console.error("[send-reminders] LINE push failed:", row.id, await pushRes.text());
      }
    }

    return respond({ sent: sent.length, skipped: skipped.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[send-reminders]", msg);
    return respond({ error: msg }, 500);
  }
});
