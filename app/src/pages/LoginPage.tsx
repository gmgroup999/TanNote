import { useState } from 'react';
import { sendMagicLink } from '../lib/auth';

export default function LoginPage() {
  const [email, setEmail]   = useState('');
  const [sent, setSent]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
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
          {!sent ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">เข้าสู่ระบบ</h2>
                <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">รับ magic link ทางอีเมล — ไม่ต้องตั้ง password</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400">อีเมล</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
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
          ) : (
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
                onClick={() => { setSent(false); setEmail(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline transition-colors"
              >
                ใช้อีเมลอื่น
              </button>
            </div>
          )}
        </div>

        <p className="text-[11px] text-center text-gray-300 dark:text-gray-700 leading-relaxed">
          เปิดใน LINE แล้วล็อกอินอัตโนมัติ<br />ไม่ต้องกรอกอีเมล
        </p>
      </div>
    </div>
  );
}
