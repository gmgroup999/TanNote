import { useState } from 'react';
import { sendMagicLink } from '../lib/auth';
import { LIFF_ENABLED, loginWithLiff } from '../lib/liff';

type Mode = 'choose' | 'email';

export default function LoginPage() {
  const [mode, setMode]         = useState<Mode>('choose');
  const [email, setEmail]       = useState('');
  const [sent, setSent]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const [lineLoading, setLineLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleLineLogin() {
    setLineLoading(true);
    await loginWithLiff();
    // If loginWithLiff didn't redirect (user already had LIFF session),
    // reload to re-evaluate the auth gate with the freshly saved userId.
    window.location.reload();
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) { setError('กรุณากรอกอีเมลที่ถูกต้อง'); return; }
    setLoading(true);
    setError(null);
    const err = await sendMagicLink(trimmed);
    setLoading(false);
    if (err) { setError(err); return; }
    setSent(true);
  }

  return (
    <div className="min-h-svh flex flex-col items-center justify-center bg-[#FAFAF7] dark:bg-[#18181A] px-5">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-[#E24B4A] flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">ทันโน้ต</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500">เพื่อนและเลขาส่วนตัวของคุณ</p>
        </div>

        {/* Card */}
        <div className="w-full bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-6">

          {sent ? (
            /* ── Email sent ── */
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <div className="w-14 h-14 rounded-full bg-green-50 dark:bg-[#1A3A2A] flex items-center justify-center text-2xl">📬</div>
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">เช็คอีเมลของคุณ</p>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                  ส่ง magic link ไปที่<br />
                  <span className="font-medium text-gray-600 dark:text-gray-400">{email}</span>
                </p>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-gray-600">คลิก link ในอีเมลเพื่อเข้าสู่ระบบ<br />link มีอายุ 60 นาที</p>
              <button
                onClick={() => { setSent(false); setEmail(''); setMode('choose'); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
              >
                กลับหน้าเลือกวิธีเข้าสู่ระบบ
              </button>
            </div>

          ) : mode === 'choose' ? (
            /* ── Choose method ── */
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">เข้าสู่ระบบ</h2>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">เลือกวิธีที่ต้องการ</p>
              </div>

              {/* LINE */}
              {LIFF_ENABLED && (
                <button
                  onClick={handleLineLogin}
                  disabled={lineLoading}
                  className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-[#06C755] hover:bg-[#05b34c] disabled:opacity-60 text-white text-sm font-semibold transition-colors"
                >
                  {lineLoading ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                    </svg>
                  )}
                  {lineLoading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย LINE'}
                </button>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-100 dark:bg-[#333336]" />
                <span className="text-xs text-gray-400 dark:text-gray-600">หรือ</span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-[#333336]" />
              </div>

              {/* Email option */}
              <button
                onClick={() => setMode('email')}
                className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl border border-gray-200 dark:border-[#444448] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-[#333336] transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                เข้าสู่ระบบด้วยอีเมล
              </button>
            </div>

          ) : (
            /* ── Email form ── */
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('choose'); setError(null); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  aria-label="กลับ"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <div>
                  <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">เข้าสู่ระบบด้วยอีเมล</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">รับ magic link — ไม่ต้องตั้ง password</p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">อีเมล</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#1E1E20] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 focus:border-[#E24B4A]"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-[#3D1F1F] rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full py-3 rounded-xl bg-[#E24B4A] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#C73B3A] transition-colors"
              >
                {loading ? 'กำลังส่ง...' : 'ส่ง Magic Link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
