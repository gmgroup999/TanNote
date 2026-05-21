/** Shared plan limits — used by transcribe, ask, and future functions */

interface PlanLimits {
  recording_minutes: number | null;
  ask_notes:         number | null;
  ai_suggest:        number | null;
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:    { recording_minutes: 60,   ask_notes: 10,  ai_suggest: 5  },
  starter: { recording_minutes: 800,  ask_notes: 150, ai_suggest: 50 },
  pro:     { recording_minutes: 2500, ask_notes: null, ai_suggest: null },
  extra:   { recording_minutes: null, ask_notes: null, ai_suggest: null },
};

export function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
