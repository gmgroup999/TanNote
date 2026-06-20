/**
 * TanNote — /api/save-memory
 * Deploy: supabase functions deploy save-memory --no-verify-jwt
 *
 * JSON body: { key, value, source? }
 * Headers:  X-Line-User-Id
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveLineUserId } from "../_shared/liff-verify.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NODE_ID         = Deno.env.get("NODE_ID") ?? "00000000-0000-0000-0000-000000000001";
const LINE_CHANNEL_ID = Deno.env.get("LINE_CHANNEL_ID") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-user-id, x-liff-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  try {
    const body     = await req.json() as { key?: string; value?: string; source?: string };
    const key      = (body.key   ?? "").trim();
    const value    = (body.value ?? "").trim();
    const source   = body.source ?? "confirmed";

    if (!key || !value) return respond({ error: "key และ value ต้องไม่ว่าง" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

    // Authenticate caller (LIFF token / email session JWT / sandbox)
    const auth = await resolveLineUserId(req, supabase, LINE_CHANNEL_ID);
    if (auth.error) return respond({ error: auth.error }, auth.status);
    const lineUserId = auth.userId;

    // Get or create user
    const { data: userRow } = await supabase
      .from("users_profile")
      .upsert({ node_id: NODE_ID, line_user_id: lineUserId }, { onConflict: "line_user_id" })
      .select("id")
      .single();

    const userId = userRow?.id as string | null;
    if (!userId) return respond({ error: "ไม่พบผู้ใช้" }, 404);

    // Upsert by (user_id, key) — prevent duplicate entries for the same key
    const { data, error } = await supabase
      .from("user_memory")
      .upsert(
        { node_id: NODE_ID, user_id: userId, key, value, source },
        { onConflict: "user_id,key" },
      )
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return respond({ id: data?.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    console.error("[save-memory]", msg);
    return respond({ error: msg }, 500);
  }
});
