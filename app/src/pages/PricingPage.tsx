import { PLAN_INFO, PLAN_LIMITS, EARLY_BIRD_TOTAL, EARLY_BIRD_TAKEN, type Plan } from '../config/plans';

const PLANS: Plan[] = ['free', 'starter', 'pro'];
const EARLY_BIRD_LEFT = EARLY_BIRD_TOTAL - EARLY_BIRD_TAKEN;
const EARLY_BIRD_ACTIVE = EARLY_BIRD_LEFT > 0;

function formatLimit(val: number | null, unit: string): string {
  return val === null ? `∞ ${unit}` : `${val.toLocaleString()} ${unit}`;
}

function CheckRow({ label, available = true }: { label: string; available?: boolean }) {
  return (
    <li className={`flex items-start gap-2 text-xs leading-snug ${available ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-700'}`}>
      <span className={`mt-0.5 flex-shrink-0 ${available ? 'text-green-500' : 'text-gray-300'}`}>
        {available ? '✓' : '–'}
      </span>
      {label}
    </li>
  );
}

export default function PricingPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-svh bg-[#FAFAF7] dark:bg-[#18181A]">
      {/* Header */}
      <header className="w-full max-w-md mx-auto px-5 pt-10 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          กลับ
        </button>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">แพลนราคา</h1>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">ทุกแพลนเข้าถึงทุกฟีเจอร์ — ต่างกันแค่ปริมาณ</p>

        {/* Early bird banner */}
        {EARLY_BIRD_ACTIVE && (
          <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-2xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl leading-none mt-0.5">🎉</span>
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Early Bird — {EARLY_BIRD_LEFT} ที่นั่งสุดท้าย!</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                100 คนแรกได้ราคาพิเศษ ล็อกตลอดชีพ · ราคาจะกลับสู่ปกติเมื่อครบ
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Plan cards */}
      <main className="w-full max-w-md mx-auto px-5 pb-24 flex flex-col gap-4">
        {PLANS.map((plan) => {
          const info   = PLAN_INFO[plan];
          const limits = PLAN_LIMITS[plan];
          const isPopular = plan === 'pro';

          return (
            <div
              key={plan}
              className={`relative bg-white dark:bg-[#252527] rounded-2xl border shadow-sm overflow-hidden ${
                isPopular ? 'border-[#E24B4A] shadow-[#E24B4A]/10 shadow-md' : 'border-gray-100 dark:border-[#333336]'
              }`}
            >
              {/* Popular badge */}
              {isPopular && (
                <div className="bg-[#E24B4A] text-white text-[11px] font-bold text-center py-1.5 tracking-wide">
                  {info.badge}
                </div>
              )}

              <div className="p-5">
                {/* Plan name + price */}
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{info.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-600">{info.description}</p>
                  </div>
                  <div className="text-right">
                    {info.price === 0 ? (
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">ฟรี</p>
                    ) : EARLY_BIRD_ACTIVE && info.earlyBirdPrice ? (
                      <>
                        <p className="text-xs text-gray-400 line-through">฿{info.price.toLocaleString()}</p>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          ฿{info.earlyBirdPrice.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500 font-medium">/เดือน · early bird</p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                          ฿{info.price.toLocaleString()}
                        </p>
                        <p className="text-xs text-gray-400">/เดือน</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Key limits */}
                <div className="bg-gray-50 dark:bg-[#1E1E20] rounded-xl p-3 mb-4 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide">บันทึกเสียง</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {formatLimit(limits.recording_minutes, 'น./ด.')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide">เก็บข้อมูล</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {limits.text_retention_days === null
                        ? 'ตลอดชีพ'
                        : limits.text_retention_days === 30
                        ? '30 วัน'
                        : '1 ปี'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide">ถามโน้ต</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {formatLimit(limits.ask_notes, 'ครั้ง/ด.')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide">AI แนะนำ</p>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {formatLimit(limits.ai_suggest, 'ครั้ง/ด.')}
                    </p>
                  </div>
                </div>

                {/* Feature list */}
                <ul className="flex flex-col gap-1.5 mb-5">
                  <CheckRow label="ถอดเสียง + สรุป AI" />
                  <CheckRow label="Auto-tagging + Knowledge Graph" />
                  <CheckRow label="ถามโน้ต (RAG)" />
                  <CheckRow label="ระบบเตือนผ่าน LINE" />
                  <CheckRow label="เสียงเก็บในเครื่อง (Privacy)" />
                  <CheckRow label="Cloud Backup (R2)" available={limits.cloud_backup} />
                </ul>

                {/* CTA */}
                {plan === 'free' ? (
                  <div className="w-full py-3 rounded-xl text-sm font-medium bg-gray-100 text-gray-500 text-center">
                    แผนปัจจุบัน
                  </div>
                ) : (
                  <a
                    href="https://line.me/R/ti/p/@077vkaxj"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block w-full py-3 rounded-xl text-sm font-semibold text-center transition-colors ${
                      isPopular
                        ? 'bg-[#E24B4A] text-white hover:bg-[#C73B3A]'
                        : 'bg-gray-900 text-white hover:bg-gray-700'
                    }`}
                  >
                    อัพเกรดเป็น {info.label}
                  </a>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 pt-2 leading-relaxed">
          ราคาในสกุลเงินบาท · ยกเลิกได้ทุกเมื่อ
          {EARLY_BIRD_ACTIVE && (
            <><br /><span className="text-amber-600 dark:text-amber-500 font-medium">Early bird ราคาล็อกตลอดชีพ ไม่ปรับราคาขึ้นอีก</span></>
          )}
        </p>
      </main>
    </div>
  );
}
