/** Shared plan limits — used by transcribe, ask, and future functions */

interface PlanLimits {
  recording_minutes:   number | null;
  ask_notes:           number | null;
  ai_suggest:          number | null;
  text_retention_days: number | null;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:    { recording_minutes: 60,   ask_notes: 10,  ai_suggest: 5,   text_retention_days: 30  },
  starter: { recording_minutes: 800,  ask_notes: 150, ai_suggest: 50,  text_retention_days: 365 },
  pro:     { recording_minutes: 2500, ask_notes: null, ai_suggest: null, text_retention_days: null },
  extra:   { recording_minutes: null, ask_notes: null, ai_suggest: null, text_retention_days: null },
};

export const SUPPORTED_LANGUAGES: Record<string, string[]> = {
  free:    ['th'],
  starter: ['th', 'en'],
  pro:     ['th', 'en', 'zh', 'ja'],
  extra:   ['th', 'en', 'zh', 'ja', 'ko', 'auto'],
};

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Quota window key per plan tier — MUST match period_for_plan() in
 * supabase/migrations (same output strings, Asia/Bangkok boundaries):
 *   free    → monthly  (YYYY-MM)
 *   starter → yearly   (Y{YYYY})
 *   pro     → lifetime (recording capped at 2500 total)
 *   extra   → lifetime (unlimited anyway)
 */
export function periodForPlan(plan: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  if (plan === "starter") return `Y${y}`;
  if (plan === "pro" || plan === "extra") return "lifetime";
  return `${y}-${m}`;
}

export function quotaExceededResponse(
  plan: string, quota: string, limit: number, used: number
): Response {
  const body = JSON.stringify({
    error: `โควต้า${quota} ${limit} ของแพลน "${plan}" ครบแล้ว`,
    quota_exceeded: true,
    plan,
    limit,
    used,
  });
  return new Response(body, {
    status: 402,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
