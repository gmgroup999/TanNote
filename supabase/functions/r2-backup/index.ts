/**
 * POST /api/r2-backup
 * Multipart form: audio (File) + note_id (string)
 * Header: x-line-user-id
 *
 * Uploads audio to Cloudflare R2, updates notes.cloud_audio_url + has_cloud_backup.
 * Only works for Extra-plan users with cloud_backup_enabled = true.
 *
 * Required Supabase secrets:
 *   R2_ACCOUNT_ID       — Cloudflare Account ID
 *   R2_ACCESS_KEY_ID    — R2 Access Key ID
 *   R2_SECRET_ACCESS_KEY— R2 Secret Access Key
 *   R2_BUCKET_NAME      — R2 bucket name
 *   R2_PUBLIC_URL       — e.g. https://pub-xxx.r2.dev  (public bucket URL, no trailing slash)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NODE_ID         = Deno.env.get("NODE_ID") ?? "00000000-0000-0000-0000-000000000001";

const R2_ACCOUNT_ID   = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const R2_ACCESS_KEY   = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const R2_SECRET_KEY   = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
const R2_BUCKET       = Deno.env.get("R2_BUCKET_NAME") ?? "";
const R2_PUBLIC_URL   = Deno.env.get("R2_PUBLIC_URL") ?? "";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-line-user-id",
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

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET) {
    return respond({ error: "R2 not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME secrets" }, 503);
  }

  try {
    const formData    = await req.formData();
    const audioFile   = formData.get("audio") as File | null;
    const noteId      = formData.get("note_id") as string | null;
    const lineUserId  = req.headers.get("x-line-user-id") ?? "anonymous";

    if (!audioFile || !noteId) return respond({ error: "audio and note_id required" }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC);

    // Verify user is Extra plan with cloud_backup_enabled
    const { data: userRow } = await supabase
      .from("users_profile")
      .select("id, plan, cloud_backup_enabled")
      .eq("line_user_id", lineUserId)
      .single();

    if (userRow?.plan !== "extra") {
      return respond({ error: "Cloud backup requires Extra plan" }, 403);
    }
    if (!userRow.cloud_backup_enabled) {
      return respond({ error: "Cloud backup not enabled — toggle in Settings" }, 403);
    }

    // Upload to R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
    });

    const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
    const mimeType   = audioFile.type || "audio/webm";
    const objectKey  = `${NODE_ID}/${lineUserId}/${noteId}.webm`;

    await s3.send(new PutObjectCommand({
      Bucket:      R2_BUCKET,
      Key:         objectKey,
      Body:        audioBytes,
      ContentType: mimeType,
    }));

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${objectKey}`
      : `https://${R2_BUCKET}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${objectKey}`;

    // Update note
    await supabase.from("notes").update({
      has_cloud_backup: true,
      cloud_audio_url:  publicUrl,
      audio_location:   "cloud",
    }).eq("id", noteId);

    return respond({ ok: true, url: publicUrl });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[r2-backup]", msg);
    return respond({ error: msg }, 500);
  }
});
