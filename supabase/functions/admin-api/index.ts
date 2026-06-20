/**
 * TanNote — /admin-api
 * Deploy: supabase functions deploy admin-api --no-verify-jwt
 *
 * All endpoints require a valid Supabase Auth JWT (Authorization: Bearer <token>)
 * AND the user's email must be in the ADMIN_EMAILS secret (comma-separated).
 *
 * Body: { action, ...params }
 * Actions: list_users | update_plan | suspend_user | delete_user | get_stats | reset_usage
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

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

const VALID_PLANS = ["free", "starter", "pro", "extra"];

/** Auto-calculate plan_expires_at based on plan type */
function autoPlanExpiry(plan: string): string | null {
  if (plan === "starter") {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  }
  return null; // free, pro, extra = no expiry
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  // ── Verify caller is admin ──────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return respond({ error: "Unauthorized" }, 401);

  const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: { user }, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !user?.email) return respond({ error: "Unauthorized" }, 401);
  if (!ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return respond({ error: "Forbidden" }, 403);
  }

  // ── Service role client for admin ops ──────────────────────────────────────
  const svc = createClient(SUPABASE_URL, SUPABASE_SVC);

  try {
    const body = await req.json() as { action?: string; [k: string]: unknown };

    // ── list_users ────────────────────────────────────────────────────────────
    if (body.action === "list_users") {
      const period = new Date().toISOString().slice(0, 7);
      const { data, error } = await svc.rpc("admin_list_users", { p_period: period });
      if (error) throw new Error(error.message);
      return respond({ users: data ?? [] });
    }

    // ── get_stats ─────────────────────────────────────────────────────────────
    if (body.action === "get_stats") {
      const period = new Date().toISOString().slice(0, 7);

      const [usersRes, notesRes, usageRes] = await Promise.all([
        svc.from("users_profile").select("id, plan, is_suspended", { count: "exact", head: false }),
        svc.from("notes").select("id", { count: "exact", head: true }),
        svc.from("usage_tracking").select("recording_minutes, ask_notes_count").eq("period", period),
      ]);

      const totalUsers  = usersRes.data?.length ?? 0;
      const activeUsers = usersRes.data?.filter((u: { is_suspended: boolean }) => !u.is_suspended).length ?? 0;
      const planCounts  = (usersRes.data ?? []).reduce((acc: Record<string, number>, u: { plan: string }) => {
        acc[u.plan] = (acc[u.plan] ?? 0) + 1; return acc;
      }, {});
      const totalNotes  = notesRes.count ?? 0;
      const monthMins   = (usageRes.data ?? []).reduce((s: number, r: { recording_minutes: number }) => s + (r.recording_minutes ?? 0), 0);
      const monthAsks   = (usageRes.data ?? []).reduce((s: number, r: { ask_notes_count: number }) => s + (r.ask_notes_count ?? 0), 0);

      return respond({ totalUsers, activeUsers, planCounts, totalNotes, monthMins, monthAsks, period });
    }

    // ── update_plan ───────────────────────────────────────────────────────────
    if (body.action === "update_plan") {
      const { userId, plan } = body as { userId?: string; plan?: string };
      if (!userId || !plan || !VALID_PLANS.includes(plan))
        return respond({ error: "userId และ plan ต้องระบุ (free/starter/pro/extra)" }, 400);

      // Use provided expiresAt if explicitly passed, otherwise auto-calculate
      const plan_expires_at = "expiresAt" in body
        ? (body.expiresAt as string | null)
        : autoPlanExpiry(plan);

      const { error } = await svc
        .from("users_profile")
        .update({ plan, plan_expires_at })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      return respond({ ok: true, plan_expires_at });
    }

    // ── suspend_user ──────────────────────────────────────────────────────────
    if (body.action === "suspend_user") {
      const { userId, suspend } = body as { userId?: string; suspend?: boolean };
      if (!userId || typeof suspend !== "boolean")
        return respond({ error: "userId และ suspend (boolean) ต้องระบุ" }, 400);

      const { error } = await svc
        .from("users_profile")
        .update({ is_suspended: suspend, suspended_at: suspend ? new Date().toISOString() : null })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      return respond({ ok: true });
    }

    // ── reset_usage ───────────────────────────────────────────────────────────
    if (body.action === "reset_usage") {
      const { userId } = body as { userId?: string };
      if (!userId) return respond({ error: "userId ต้องระบุ" }, 400);

      // Clear every period bucket so the reset works for any plan tier
      // (free=monthly, starter=yearly, pro/extra=lifetime).
      const { error } = await svc
        .from("usage_tracking")
        .delete()
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return respond({ ok: true });
    }

    // ── delete_user ───────────────────────────────────────────────────────────
    if (body.action === "delete_user") {
      const { userId } = body as { userId?: string };
      if (!userId) return respond({ error: "userId ต้องระบุ" }, 400);

      await svc.from("notes").delete().eq("user_id", userId);
      await svc.from("user_memory").delete().eq("user_id", userId);
      await svc.from("usage_tracking").delete().eq("user_id", userId);
      const { error } = await svc.from("users_profile").delete().eq("id", userId);
      if (error) throw new Error(error.message);
      return respond({ ok: true });
    }

    // ── list_payment_requests ──────────────────────────────────────────────────
    if (body.action === "list_payment_requests") {
      const { data, error } = await svc.rpc("admin_list_payment_requests");
      if (error) throw new Error(error.message);
      return respond({ requests: data ?? [] });
    }

    // ── approve_payment_request ────────────────────────────────────────────────
    if (body.action === "approve_payment_request") {
      const { requestId, plan: overridePlan } = body as { requestId?: string; plan?: string };
      if (!requestId) return respond({ error: "requestId ต้องระบุ" }, 400);

      const { data: reqRow } = await svc
        .from("payment_requests")
        .select("line_user_id, plan, status")
        .eq("id", requestId)
        .maybeSingle();
      if (!reqRow) return respond({ error: "ไม่พบคำขอ" }, 404);

      const plan = overridePlan ?? reqRow.plan;
      if (!plan || !VALID_PLANS.includes(plan))
        return respond({ error: "ต้องระบุแพลน (free/starter/pro/extra)" }, 400);

      const plan_expires_at = autoPlanExpiry(plan);
      const { error: upErr } = await svc
        .from("users_profile")
        .update({ plan, plan_expires_at })
        .eq("line_user_id", reqRow.line_user_id);
      if (upErr) throw new Error(upErr.message);

      await svc.from("payment_requests")
        .update({ status: "approved", plan, decided_at: new Date().toISOString() })
        .eq("id", requestId);

      // Notify the user on LINE (best-effort)
      const lineToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
      if (lineToken && /^U[a-zA-Z0-9]{32}$/.test(reqRow.line_user_id)) {
        await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${lineToken}` },
          body: JSON.stringify({
            to: reqRow.line_user_id,
            messages: [{ type: "text", text: `🎉 อัปเกรดเป็นแผน ${plan.toUpperCase()} เรียบร้อยแล้ว!\nขอบคุณที่ใช้งาน TanNote ค่ะ 🙏` }],
          }),
        }).catch(() => {});
      }

      return respond({ ok: true, plan, plan_expires_at });
    }

    // ── reject_payment_request ─────────────────────────────────────────────────
    if (body.action === "reject_payment_request") {
      const { requestId } = body as { requestId?: string };
      if (!requestId) return respond({ error: "requestId ต้องระบุ" }, 400);
      const { error } = await svc.from("payment_requests")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw new Error(error.message);
      return respond({ ok: true });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    console.error("[admin-api]", msg);
    return respond({ error: msg }, 500);
  }
});
