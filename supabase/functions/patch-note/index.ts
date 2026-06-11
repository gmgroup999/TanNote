/**
 * PATCH /api/patch-note
 * Body: { note_id, title?, recording_type?, remove_tags?: string[] }
 * Header: x-line-user-id
 *
 * Updates note title/type; removes specified tags from note_tags.
 * Service role only — no JWT required.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLiffToken } from "../_shared/liff-verify.ts";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINE_CHANNEL_ID = Deno.env.get("LINE_CHANNEL_ID") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-user-id, x-liff-token",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "PATCH") return respond({ error: "Method not allowed" }, 405);

  try {
    const liffToken  = req.headers.get("x-liff-token");
    let   lineUserId = req.headers.get("x-line-user-id") ?? "anonymous";

    if (liffToken) {
      const verified = await verifyLiffToken(liffToken, LINE_CHANNEL_ID);
      if (!verified) return respond({ error: "LIFF token ไม่ถูกต้องหรือหมดอายุ" }, 401);
      lineUserId = verified;
    }

    const { note_id, title, recording_type, remove_tags } = await req.json() as {
      note_id: string;
      title?: string;
      recording_type?: string;
      remove_tags?: string[];
    };

    if (!note_id) return respond({ error: "note_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

    // Verify ownership — note must belong to the requesting user
    const { data: noteOwner } = await supabase
      .from("notes")
      .select("user_id")
      .eq("id", note_id)
      .maybeSingle();

    if (noteOwner) {
      const { data: userRow } = await supabase
        .from("users_profile")
        .select("id")
        .eq("line_user_id", lineUserId)
        .maybeSingle();
      if (!userRow || noteOwner.user_id !== userRow.id) {
        return respond({ error: "ไม่มีสิทธิ์แก้ไขบันทึกนี้" }, 403);
      }
    }

    // Update note fields
    const noteUpdate: Record<string, string> = {};
    if (title) noteUpdate.title = title.trim().slice(0, 200);
    if (recording_type) noteUpdate.recording_type = recording_type;

    if (Object.keys(noteUpdate).length > 0) {
      const { error } = await supabase.from("notes").update(noteUpdate).eq("id", note_id);
      if (error) return respond({ error: error.message }, 500);
    }

    // Remove tags by name
    if (remove_tags?.length) {
      const { data: tagRows } = await supabase
        .from("tags")
        .select("id")
        .in("name", remove_tags);

      if (tagRows?.length) {
        const tagIds = tagRows.map((t: { id: string }) => t.id);
        await supabase.from("note_tags")
          .delete()
          .eq("note_id", note_id)
          .in("tag_id", tagIds);
      }
    }

    return respond({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return respond({ error: msg }, 500);
  }
});
