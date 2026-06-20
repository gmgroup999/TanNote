import { useEffect, useState } from 'react';
import type { Session } from '../lib/auth';
import { signOut } from '../lib/auth';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PLAN_COLOR: Record<string, string> = {
  free:    'bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400',
  starter: 'bg-blue-50 dark:bg-[#1A2A4A] text-blue-600 dark:text-blue-400',
  pro:     'bg-[#E24B4A]/10 text-[#E24B4A]',
  extra:   'bg-purple-50 dark:bg-[#2A1A4A] text-purple-600 dark:text-purple-400',
};

interface AdminUser {
  id:                string;
  line_user_id:      string;
  nickname:          string | null;
  display_name:      string | null;
  picture_url:       string | null;
  primary_use:       string[] | null;
  tone:              string | null;
  email:             string | null;
  last_sign_in_at:   string | null;
  plan:              string;
  plan_expires_at:   string | null;
  is_suspended:      boolean;
  suspended_at:      string | null;
  created_at:        string;
  recording_minutes: number;
  ask_notes_count:   number;
  ai_suggest_count:  number;
  note_count:        number;
}

/** Compute plan_expires_at when admin changes plan */
function computePlanExpiry(plan: string): string | null {
  if (plan === 'starter') {
    const d = new Date();
    d.setMonth(d.getMonth() + 1); // monthly subscription
    return d.toISOString();
  }
  return null;
}

/** Format expiry for display */
function formatExpiry(expiresAt: string | null): { text: string; color: string } | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0)  return { text: 'หมดอายุแล้ว', color: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400' };
  if (daysLeft <= 30) return { text: `เหลือ ${daysLeft} วัน`, color: 'bg-amber-50 dark:bg-[#2A2A1A] text-amber-600 dark:text-amber-400' };
  return {
    text: new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeZone: 'Asia/Bangkok' }).format(d),
    color: 'bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400',
  };
}

interface Stats {
  totalUsers:  number;
  activeUsers: number;
  planCounts:  Record<string, number>;
  totalNotes:  number;
  monthMins:   number;
  monthAsks:   number;
  period:      string;
}

async function callAdmin(session: Session, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-api`, {
    method:  'POST',
    headers: {
      'Authorization':  `Bearer ${session.access_token}`,
      'apikey':         SUPABASE_ANON,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
  return json;
}

interface PaymentRequest {
  id: string;
  line_user_id: string;
  plan: string | null;
  amount: number | null;
  slip_url: string | null;
  created_at: string;
  display_name: string | null;
  nickname: string | null;
  picture_url: string | null;
  current_plan: string | null;
}

export default function AdminPage({ session }: { session: Session }) {
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [pending, setPending] = useState<PaymentRequest[]>([]);
  const [chosen,  setChosen]  = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [error,   setError]   = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, statsRes, pendingRes] = await Promise.all([
        callAdmin(session, { action: 'list_users' }),
        callAdmin(session, { action: 'get_stats'  }),
        callAdmin(session, { action: 'list_payment_requests' }),
      ]);
      setUsers((usersRes.users as AdminUser[]) ?? []);
      setStats(statsRes as unknown as Stats);
      setPending((pendingRes.requests as PaymentRequest[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'โหลดไม่ได้');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function approveRequest(req: PaymentRequest) {
    const plan = chosen[req.id] ?? req.plan ?? 'starter';
    if (!confirm(`อนุมัติ ${req.display_name || req.nickname || req.line_user_id} → แผน ${plan.toUpperCase()}?`)) return;
    setActionLoading(req.id + '_approve');
    try {
      await callAdmin(session, { action: 'approve_payment_request', requestId: req.id, plan });
      setPending((prev) => prev.filter((p) => p.id !== req.id));
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  async function rejectRequest(req: PaymentRequest) {
    if (!confirm('ปฏิเสธคำขอนี้?')) return;
    setActionLoading(req.id + '_reject');
    try {
      await callAdmin(session, { action: 'reject_payment_request', requestId: req.id });
      setPending((prev) => prev.filter((p) => p.id !== req.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  async function updatePlan(userId: string, plan: string) {
    setActionLoading(userId + '_plan');
    const expiresAt = computePlanExpiry(plan);
    try {
      await callAdmin(session, { action: 'update_plan', userId, plan, expiresAt });
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, plan, plan_expires_at: expiresAt } : u
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  async function resetUsage(userId: string) {
    if (!confirm('Reset usage เดือนนี้ของ user นี้?')) return;
    setActionLoading(userId + '_reset');
    try {
      await callAdmin(session, { action: 'reset_usage', userId });
      setUsers((prev) => prev.map((u) =>
        u.id === userId ? { ...u, recording_minutes: 0, ask_notes_count: 0, ai_suggest_count: 0 } : u
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  async function toggleSuspend(user: AdminUser) {
    const suspend = !user.is_suspended;
    setActionLoading(user.id + '_suspend');
    try {
      await callAdmin(session, { action: 'suspend_user', userId: user.id, suspend });
      setUsers((prev) => prev.map((u) =>
        u.id === user.id ? { ...u, is_suspended: suspend, suspended_at: suspend ? new Date().toISOString() : null } : u
      ));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  async function deleteUser(user: AdminUser) {
    if (!confirm(`ลบ "${user.nickname ?? user.line_user_id}" และข้อมูลทั้งหมด? ทำไม่ได้ย้อนกลับ`)) return;
    setActionLoading(user.id + '_delete');
    try {
      await callAdmin(session, { action: 'delete_user', userId: user.id });
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด');
    } finally { setActionLoading(null); }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (u.nickname ?? '').toLowerCase().includes(q)
      || u.line_user_id.toLowerCase().includes(q)
      || (u.display_name ?? '').toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q);
    const matchPlan = planFilter === 'all' || u.plan === planFilter;
    return matchSearch && matchPlan;
  });

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      {/* Header */}
      <header className="w-full max-w-3xl mx-auto px-5 pt-10 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Admin</h1>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{session.user.email}</p>
        </div>
        <button
          onClick={signOut}
          className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-3 py-1.5 rounded-full hover:bg-red-50 dark:hover:bg-[#3D1F1F]"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="w-full max-w-3xl mx-auto px-5 pb-24 flex flex-col gap-5">

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Users ทั้งหมด', value: stats.totalUsers,  sub: `${stats.activeUsers} active` },
              { label: 'Notes ทั้งหมด', value: stats.totalNotes,  sub: 'ทุก user' },
              { label: 'บันทึกเดือนนี้', value: `${stats.monthMins}น.`, sub: stats.period },
              { label: 'Ask เดือนนี้',   value: stats.monthAsks,  sub: 'ครั้ง' },
            ].map((s) => (
              <div key={s.label} className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm px-4 py-3">
                <p className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{s.value}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-600">{s.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Plan breakdown */}
        {stats?.planCounts && (
          <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm px-4 py-3 flex gap-4 flex-wrap">
            {Object.entries(stats.planCounts).map(([plan, count]) => (
              <div key={plan} className="flex items-center gap-1.5">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PLAN_COLOR[plan] ?? PLAN_COLOR.free}`}>
                  {plan.toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Payment approval queue */}
        {pending.length > 0 && (
          <div className="bg-white dark:bg-[#252527] rounded-2xl border-2 border-[#E24B4A]/40 shadow-sm p-4 flex flex-col gap-3">
            <p className="text-sm font-bold text-[#E24B4A]">💰 รออนุมัติ ({pending.length})</p>
            {pending.map((req) => {
              const name = req.display_name || req.nickname || '(ไม่ทราบชื่อ)';
              const planVal = chosen[req.id] ?? req.plan ?? 'starter';
              return (
                <div key={req.id} className="flex gap-3 border-t border-gray-100 dark:border-[#333336] pt-3">
                  {req.picture_url ? (
                    <img src={req.picture_url} alt="" className="w-12 h-12 rounded-full flex-shrink-0 object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full flex-shrink-0 bg-[#E24B4A]/10 flex items-center justify-center text-[#E24B4A] font-bold">{name[0]}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      ขอแผน: <b className="text-[#E24B4A]">{req.plan ? req.plan.toUpperCase() : '— (เลือกเอง)'}</b>
                      {req.amount ? ` · ฿${req.amount}` : ''} · ปัจจุบัน: {req.current_plan ?? '-'}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-600">{new Date(req.created_at).toLocaleString('th-TH')}</p>
                    {req.slip_url ? (
                      <a href={req.slip_url} target="_blank" rel="noreferrer">
                        <img src={req.slip_url} alt="slip" className="mt-2 max-h-44 rounded-lg border border-gray-200 dark:border-[#444448]" />
                      </a>
                    ) : (
                      <p className="text-[11px] text-amber-600 mt-1">⏳ ยังไม่ได้รับสลิป</p>
                    )}
                    <div className="flex gap-2 mt-2 items-center flex-wrap">
                      <select
                        value={planVal}
                        onChange={(e) => setChosen((p) => ({ ...p, [req.id]: e.target.value }))}
                        className="rounded-lg border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#252527] text-gray-700 dark:text-gray-300 px-2 py-1.5 text-xs focus:outline-none"
                      >
                        <option value="starter">Starter</option>
                        <option value="pro">Pro</option>
                        <option value="extra">Extra</option>
                        <option value="free">Free</option>
                      </select>
                      <button
                        onClick={() => approveRequest(req)}
                        disabled={actionLoading === req.id + '_approve'}
                        className="text-xs font-semibold text-white bg-[#E24B4A] hover:bg-[#cf3f3e] rounded-lg px-3 py-1.5 disabled:opacity-60"
                      >
                        ✓ อนุมัติ {planVal.toUpperCase()}
                      </button>
                      <button
                        onClick={() => rejectRequest(req)}
                        disabled={actionLoading === req.id + '_reject'}
                        className="text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-[#444448] rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-[#333336] disabled:opacity-60"
                      >
                        ✗ ปฏิเสธ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Search + filter */}
        <div className="flex gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา nickname / LINE ID..."
            className="flex-1 min-w-0 rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#252527] text-gray-900 dark:text-gray-100 placeholder-gray-300 dark:placeholder-gray-600 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 focus:border-[#E24B4A]"
          />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#252527] text-gray-700 dark:text-gray-300 px-3 py-2.5 text-sm focus:outline-none"
          >
            <option value="all">ทุก plan</option>
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="extra">Extra</option>
          </select>
          <button
            onClick={load}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-[#444448] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#333336] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-[#3D1F1F] border border-red-200 dark:border-red-900 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        {/* User list */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-20 bg-gray-100 dark:bg-[#252527] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtered.length === 0 ? (
              <p className="text-center text-gray-400 dark:text-gray-600 text-sm py-8">ไม่พบ user</p>
            ) : filtered.map((u) => (
              <div
                key={u.id}
                className={`bg-white dark:bg-[#252527] rounded-2xl border shadow-sm px-4 py-3 flex items-center gap-3 ${
                  u.is_suspended ? 'border-red-200 dark:border-red-900 opacity-60' : 'border-gray-100 dark:border-[#333336]'
                }`}
              >
                {/* Avatar / Profile pic */}
                <div className="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-[#E24B4A]/10 flex items-center justify-center text-[#E24B4A] font-bold text-base">
                  {u.picture_url
                    ? <img src={u.picture_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    : (u.nickname ?? u.display_name ?? u.line_user_id).charAt(0).toUpperCase()
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {/* Row 1: name + badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {u.nickname ?? u.display_name ?? '—'}
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${PLAN_COLOR[u.plan] ?? PLAN_COLOR.free}`}>
                      {u.plan.toUpperCase()}
                    </span>
                    {(() => {
                      const exp = formatExpiry(u.plan_expires_at);
                      return exp ? (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${exp.color}`}>
                          {exp.text}
                        </span>
                      ) : null;
                    })()}
                    {u.is_suspended && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
                        SUSPENDED
                      </span>
                    )}
                  </div>
                  {/* Row 2: LINE ID / email */}
                  <p className="text-[11px] text-gray-400 dark:text-gray-600 truncate mt-0.5 font-mono">
                    {u.line_user_id}
                  </p>
                  {u.email && (
                    <p className="text-[11px] text-blue-400 dark:text-blue-500 truncate">
                      {u.email}
                    </p>
                  )}
                  {/* Row 3: usage stats */}
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-400 dark:text-gray-600">
                    <span>📝 {u.note_count}</span>
                    <span>🎙 {u.recording_minutes}น.</span>
                    <span>💬 {u.ask_notes_count}</span>
                    {u.ai_suggest_count > 0 && <span>✨ {u.ai_suggest_count}</span>}
                  </div>
                  {/* Row 4: primary_use + tone + dates */}
                  <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                    {u.primary_use?.map((use) => (
                      <span key={use} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400">
                        {use}
                      </span>
                    ))}
                    {u.tone && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-[#1A2A3A] text-blue-500 dark:text-blue-400">
                        {u.tone}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-300 dark:text-gray-700">
                      สมัคร {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(u.created_at))}
                    </span>
                    {u.last_sign_in_at && (
                      <span className="text-[10px] text-gray-300 dark:text-gray-700">
                        · ล่าสุด {new Intl.DateTimeFormat('th-TH', { dateStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(u.last_sign_in_at))}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Plan selector */}
                  <select
                    value={u.plan}
                    disabled={!!actionLoading}
                    onChange={(e) => updatePlan(u.id, e.target.value)}
                    className="text-xs rounded-lg border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#1E1E20] text-gray-700 dark:text-gray-300 px-2 py-1 focus:outline-none disabled:opacity-50"
                  >
                    <option value="free">Free</option>
                    <option value="starter">Starter +1เดือน</option>
                    <option value="pro">Pro ∞</option>
                    <option value="extra">Extra ∞</option>
                  </select>

                  {/* Reset usage */}
                  <button
                    onClick={() => resetUsage(u.id)}
                    disabled={!!actionLoading}
                    title="Reset usage เดือนนี้"
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-[#1A2A3A] text-blue-500 hover:bg-blue-100 dark:hover:bg-[#1A2A4A] transition-colors disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>

                  {/* Suspend toggle */}
                  <button
                    onClick={() => toggleSuspend(u)}
                    disabled={!!actionLoading}
                    title={u.is_suspended ? 'Unsuspend' : 'Suspend'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 ${
                      u.is_suspended
                        ? 'bg-green-50 dark:bg-[#1A3A2A] text-green-600 hover:bg-green-100'
                        : 'bg-amber-50 dark:bg-[#2A2A1A] text-amber-600 hover:bg-amber-100'
                    }`}
                  >
                    {u.is_suspended ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    )}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteUser(u)}
                    disabled={!!actionLoading}
                    title="ลบ user"
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 dark:bg-[#3D1F1F] text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-300 dark:text-gray-700">
          {filtered.length} / {users.length} users
        </p>
      </main>
    </div>
  );
}
