import { useEffect, useState } from 'react';
import { fetchUsage, type UsageSummary } from '../lib/api';
import { PLAN_LIMITS, PLAN_INFO, usageColor, usageRecommendation, quotaPeriodLabel, type Plan } from '../config/plans';
import { setPlanCache } from '../lib/planCache';

function Bar({ label, used, limit, unit, plan }: {
  label: string; used: number; limit: number | null; unit: string; plan: Plan;
}) {
  const pct       = limit ? Math.min(1, used / limit) * 100 : 0;
  const colorClass = usageColor(used, limit);
  const { suffix, lifetime } = quotaPeriodLabel(plan);
  const labelText  = limit === null
    ? `${used} ${unit} (ไม่จำกัด)`
    : lifetime
    ? `${used}/${limit} ${unit} (ตลอดชีพ)`
    : `${used}/${limit} ${unit}${suffix}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
        <span className={`text-[11px] font-medium ${
          limit && used / limit >= 0.85 ? 'text-red-600' :
          limit && used / limit >= 0.6  ? 'text-amber-600' : 'text-gray-500'
        }`}>
          {labelText}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-[#333336] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${colorClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** Human-readable plan expiry / renewal status. */
function expiryStatus(plan: Plan, expiresAt: string | null): { text: string; warn: boolean } {
  if (plan === 'extra') return { text: 'ตลอดชีพ — ไม่มีวันหมดอายุ', warn: false };
  if (plan === 'free') return { text: 'ฟรี — ไม่มีวันหมดอายุ', warn: false };
  // starter + pro (monthly)
  if (!expiresAt) return { text: 'ไม่ระบุวันหมดอายุ', warn: false };
  const d = new Date(expiresAt);
  const dateStr = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `หมดอายุแล้ว (${dateStr})`, warn: true };
  if (days === 0) return { text: `หมดอายุวันนี้ (${dateStr})`, warn: true };
  return { text: `ครบกำหนด ${dateStr} · เหลือ ${days} วัน`, warn: days <= 7 };
}

export default function UsageIndicator({ onOpenPricing }: { onOpenPricing?: () => void }) {
  const [usage, setUsage]     = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsage().then((u) => {
      setUsage(u);
      if (u?.plan) setPlanCache(u.plan);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse h-20 bg-gray-50 dark:bg-[#1E1E20] rounded-2xl border border-gray-100 dark:border-[#333336]" />
    );
  }

  if (!usage) return null;

  const plan    = usage.plan as Plan;
  const limits  = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const info    = PLAN_INFO[plan]   ?? PLAN_INFO.free;

  const recommendation = usageRecommendation(
    plan,
    { used: usage.recording_minutes, limit: limits.recording_minutes },
    { used: usage.ask_notes_count,   limit: limits.ask_notes },
  );

  return (
    <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4 flex flex-col gap-3">
      {/* Plan badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide">แผนปัจจุบัน</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
            plan === 'pro' || plan === 'extra'
              ? 'bg-[#E24B4A]/10 text-[#E24B4A]'
              : 'bg-gray-100 dark:bg-[#333336] text-gray-600 dark:text-gray-400'
          }`}>
            {info.label}
          </span>
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-600">
          {plan === 'extra'
            ? 'ตลอดชีพ'
            : new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Plan expiry / renewal */}
      {(() => {
        const { text, warn } = expiryStatus(plan, usage.plan_expires_at);
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-gray-400 dark:text-gray-500">📅 วันครบกำหนด:</span>
            <span className={warn ? 'text-red-600 font-semibold' : 'text-gray-600 dark:text-gray-300'}>{text}</span>
          </div>
        );
      })()}

      {/* Progress bars */}
      <div className="flex flex-col gap-2.5">
        <Bar
          label="🎙 บันทึกเสียง"
          used={usage.recording_minutes}
          limit={limits.recording_minutes}
          unit="นาที"
          plan={plan}
        />
        <Bar
          label="💬 ถามโน้ต"
          used={usage.ask_notes_count}
          limit={limits.ask_notes}
          unit="ครั้ง"
          plan={plan}
        />
        <Bar
          label="🤖 AI แนะนำแท็ก"
          used={usage.ai_suggest_count}
          limit={limits.ai_suggest}
          unit="ครั้ง"
          plan={plan}
        />
      </div>

      {/* Smart recommendation */}
      {recommendation && (
        <div className="bg-amber-50 rounded-xl px-3 py-2 flex items-start gap-2 border border-amber-100">
          <span className="text-amber-500 mt-0.5 text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-amber-700 leading-snug">{recommendation}</p>
        </div>
      )}

      {/* View plans / upgrade — always available so users can find & change plan */}
      {onOpenPricing && (
        <button
          onClick={onOpenPricing}
          className="mt-1 w-full text-sm font-semibold text-white bg-[#E24B4A] hover:bg-[#cf3f3e] rounded-xl py-2.5 transition-colors"
        >
          {plan === 'free' || plan === 'starter' ? 'ดูแพลน & อัปเกรด' : 'ดูแพลนทั้งหมด'}
        </button>
      )}
    </div>
  );
}
