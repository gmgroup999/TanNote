import { useEffect, useState } from 'react';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 focus:outline-none disabled:opacity-40 ${
        checked ? 'bg-[#E24B4A]' : 'bg-gray-200'
      }`}
    >
      <span
        className="absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}
import {
  getReminderSettings, saveReminderSettings, type ReminderSettings,
  fetchUsage, saveCloudBackupEnabled, type UsageSummary,
} from '../lib/api';
import UsageIndicator from '../components/UsageIndicator';

const TYPE_CONFIG = [
  { key: 'task',        label: '✓ งาน',        desc: 'งานที่ต้องทำ' },
  { key: 'appointment', label: '📅 นัดหมาย',    desc: 'การนัดหมาย' },
  { key: 'routine',     label: '🔁 งานประจำ',   desc: 'งานซ้ำทุกวัน/สัปดาห์' },
  { key: 'followup',    label: '📞 ติดตาม',      desc: 'ติดตามงาน/ลูกค้า' },
  { key: 'greeting',    label: '🎂 อวยพร',       desc: 'วันเกิด, เทศกาล' },
  { key: 'system',      label: '⚙️ ระบบ',        desc: 'แจ้งเตือนจากระบบ' },
];

const DEFAULT: ReminderSettings = {
  types:       ['task', 'appointment', 'routine', 'followup', 'greeting', 'system'],
  quiet_start: '22:00',
  quiet_end:   '08:00',
};

export default function SettingsPage({ onOpenPricing }: { onOpenPricing: () => void }) {
  const [settings, setSettings]       = useState<ReminderSettings>(DEFAULT);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [usage, setUsage]             = useState<UsageSummary | null>(null);
  const [cloudBackup, setCloudBackup] = useState(false);
  useEffect(() => {
    Promise.all([
      getReminderSettings(),
      fetchUsage(),
    ]).then(([s, u]) => {
      setSettings(s);
      if (u) { setUsage(u); setCloudBackup(u.cloud_backup_enabled); }
    }).finally(() => setLoading(false));
  }, []);

  function toggleType(key: string) {
    setSaved(false);
    setSettings((prev) => ({
      ...prev,
      types: prev.types.includes(key)
        ? prev.types.filter((t) => t !== key)
        : [...prev.types, key],
    }));
  }

  async function handleSave() {
    setSaving(true);
    await saveReminderSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function toggleCloudBackup() {
    const next = !cloudBackup;
    setCloudBackup(next);
    await saveCloudBackupEnabled(next);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh text-gray-400 text-sm">
        กำลังโหลด...
      </div>
    );
  }

  const isExtra = usage?.plan === 'extra';

  return (
    <div className="min-h-svh bg-[#FAFAF7] dark:bg-[#18181A]">
      <header className="w-full max-w-md lg:max-w-xl mx-auto px-5 pt-10 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">ตั้งค่า</h1>
      </header>

      <main className="w-full max-w-md lg:max-w-xl mx-auto px-5 pb-24 flex flex-col gap-5">

        {/* Usage indicator */}
        <UsageIndicator onOpenPricing={onOpenPricing} />

        {/* Cloud backup (Extra plan) */}
        <section className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">☁️ Cloud Backup</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                {isExtra
                  ? 'สำรองเสียงขึ้น Cloud อัตโนมัติ'
                  : 'เฉพาะแผน Extra — อัพเกรดเพื่อใช้งาน'}
              </p>
            </div>
            <Toggle
              checked={cloudBackup && isExtra}
              onChange={isExtra ? toggleCloudBackup : onOpenPricing}
              disabled={!isExtra}
            />
          </div>
        </section>

        {/* Reminder type toggles */}
        <section className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 dark:border-[#333336]">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">การแจ้งเตือน</p>
            <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">เลือกประเภทที่ต้องการรับการเตือน</p>
          </div>
          {TYPE_CONFIG.map(({ key, label, desc }) => {
            const active = settings.types.includes(key);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-50 dark:border-[#333336] last:border-0"
              >
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-600">{desc}</p>
                </div>
                <Toggle checked={active} onChange={() => toggleType(key)} />
              </div>
            );
          })}
        </section>

        {/* Quiet hours */}
        <section className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-0.5">ช่วงเวลาเงียบ</p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mb-4">ไม่ส่งการแจ้งเตือนในช่วงเวลานี้</p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-500 mb-1.5 block">เริ่ม</label>
              <input
                type="time"
                value={settings.quiet_start}
                onChange={(e) => { setSaved(false); setSettings((p) => ({ ...p, quiet_start: e.target.value })); }}
                className="w-full rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#1E1E20] px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30"
              />
            </div>
            <span className="text-gray-300 dark:text-gray-700 pb-2.5">—</span>
            <div className="flex-1">
              <label className="text-xs text-gray-500 dark:text-gray-500 mb-1.5 block">ถึง</label>
              <input
                type="time"
                value={settings.quiet_end}
                onChange={(e) => { setSaved(false); setSettings((p) => ({ ...p, quiet_end: e.target.value })); }}
                className="w-full rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#1E1E20] px-3 py-2 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30"
              />
            </div>
          </div>
        </section>

{/* Save reminders settings */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-all shadow-sm ${
            saved
              ? 'bg-green-500 text-white'
              : 'bg-[#E24B4A] text-white hover:bg-[#C73B3A] disabled:opacity-60'
          }`}
        >
          {saving ? 'กำลังบันทึก...' : saved ? '✓ บันทึกแล้ว' : 'บันทึกการตั้งค่า'}
        </button>
      </main>
    </div>
  );
}
