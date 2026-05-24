import { useEffect, useState } from 'react';
import { fetchReminders, deleteReminder } from '../lib/api';
import type { ReminderItem } from '../lib/api';

const TYPE_LABELS: Record<string, string> = {
  task:        'งาน',
  appointment: 'นัดหมาย',
  routine:     'กิจวัตร',
  followup:    'ติดตาม',
  greeting:    'ทักทาย',
  system:      'ระบบ',
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('th-TH', {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchReminders()
      .then(setReminders)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    await deleteReminder(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
    setDeletingId(null);
  }

  const now = new Date();

  return (
    <div className="max-w-xl lg:max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">นัดหมาย</h1>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">การแจ้งเตือนที่รอดำเนินการ</p>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 rounded-full border-2 border-[#E24B4A] border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && reminders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#2A2A2C] flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
          </div>
          <p className="text-gray-400 dark:text-gray-500 text-sm">ไม่มีนัดหมายที่รออยู่</p>
        </div>
      )}

      {!loading && reminders.length > 0 && (
        <div className="flex flex-col gap-3">
          {reminders.map((r) => {
            const isOverdue = new Date(r.remind_at) < now;
            return (
              <div
                key={r.id}
                className={`relative rounded-2xl border px-4 py-4 flex gap-3 items-start transition-colors ${
                  isOverdue
                    ? 'bg-red-50 dark:bg-[#3D1F1F] border-red-200 dark:border-[#7A2E2E]'
                    : 'bg-white dark:bg-[#1E1E20] border-gray-100 dark:border-[#2A2A2C]'
                }`}
              >
                {/* Type badge */}
                <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isOverdue
                    ? 'bg-red-100 dark:bg-[#5C2020] text-red-500'
                    : 'bg-[#E24B4A]/10 text-[#E24B4A]'
                }`}>
                  {TYPE_LABELS[r.type]?.[0] ?? 'ร'}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-base font-semibold leading-snug ${isOverdue ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {r.title}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      isOverdue
                        ? 'bg-red-100 dark:bg-[#5C2020] text-red-600 dark:text-red-400'
                        : 'bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400'
                    }`}>
                      {TYPE_LABELS[r.type] ?? r.type}
                    </span>
                    {isOverdue && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-red-500 text-white">
                        เลยเวลาแล้ว
                      </span>
                    )}
                  </div>

                  {r.message && (
                    <p className={`text-sm mt-1 leading-relaxed ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {r.message}
                    </p>
                  )}

                  <p className={`text-xs mt-2 ${isOverdue ? 'text-red-400 dark:text-red-500' : 'text-gray-400 dark:text-gray-500'}`}>
                    {formatDateTime(r.remind_at)}
                    {r.repeat_rule && r.repeat_rule !== 'none' && (
                      <span className="ml-2 text-gray-400 dark:text-gray-500">· ซ้ำ: {r.repeat_rule}</span>
                    )}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(r.id)}
                  disabled={deletingId === r.id}
                  aria-label="ลบนัดหมาย"
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isOverdue
                      ? 'text-red-400 hover:bg-red-100 dark:hover:bg-[#5C2020]'
                      : 'text-gray-400 dark:text-gray-600 hover:bg-gray-100 dark:hover:bg-[#333336] hover:text-red-500'
                  } disabled:opacity-40`}
                >
                  {deletingId === r.id ? (
                    <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
