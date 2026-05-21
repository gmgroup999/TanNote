export type Plan = 'free' | 'starter' | 'pro' | 'extra';

export interface PlanLimits {
  recording_minutes:   number | null;
  ask_notes:           number | null;
  ai_suggest:          number | null;
  text_retention_days: number | null;
  cloud_backup:        boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free:    { recording_minutes: 60,   ask_notes: 10,  ai_suggest: 5,  text_retention_days: 30,  cloud_backup: false },
  starter: { recording_minutes: 800,  ask_notes: 150, ai_suggest: 50, text_retention_days: 365, cloud_backup: false },
  pro:     { recording_minutes: 2500, ask_notes: null, ai_suggest: null, text_retention_days: null, cloud_backup: false },
  extra:   { recording_minutes: null, ask_notes: null, ai_suggest: null, text_retention_days: null, cloud_backup: true },
};

export const PLAN_INFO: Record<Plan, {
  label: string; price: number; badge?: string; description: string;
}> = {
  free:    { label: 'ฟรี',     price: 0,   description: 'เริ่มต้นใช้งาน' },
  starter: { label: 'Starter', price: 199, description: 'สำหรับคนใช้บ่อย' },
  pro:     { label: 'Pro',     price: 399, description: 'ใช้ได้ไม่จำกัด', badge: 'คุ้มสุด ⭐' },
  extra:   { label: 'Extra',   price: 599, description: 'Pro + Cloud Backup' },
};

/** Returns usage color class based on percentage used */
export function usageColor(used: number, limit: number | null): string {
  if (limit === null) return 'bg-green-500';
  const pct = used / limit;
  if (pct >= 0.85) return 'bg-red-500';
  if (pct >= 0.6)  return 'bg-amber-400';
  return 'bg-green-500';
}

/** Smart recommendation message based on quota usage */
export function usageRecommendation(
  plan: Plan,
  recording: { used: number; limit: number | null },
  ask: { used: number; limit: number | null },
): string | null {
  const recordingPct = recording.limit ? recording.used / recording.limit : 0;
  const askPct       = ask.limit       ? ask.used / ask.limit             : 0;
  const maxPct       = Math.max(recordingPct, askPct);

  if (plan === 'pro' || plan === 'extra') return null;

  if (maxPct >= 1.0) {
    return plan === 'free'
      ? 'โควต้าเต็มแล้ว — อัพเกรดเป็น Starter เพื่อใช้ต่อ'
      : 'โควต้าเต็มแล้ว — อัพเกรดเป็น Pro เพื่อใช้ไม่จำกัด';
  }
  if (maxPct >= 0.85) {
    return plan === 'free'
      ? 'โควต้าใกล้เต็ม — อัพเกรดเพื่อไม่ให้สะดุด'
      : 'โควต้าใกล้เต็ม — Pro ใช้ได้ไม่จำกัด';
  }
  return null;
}
