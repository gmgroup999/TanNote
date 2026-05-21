export type RecordingTypeKey =
  | 'meeting'
  | 'sales'
  | 'idea'
  | 'lecture'
  | 'interview'
  | 'diary'
  | 'general'
  | 'auto';

export interface RecordingType {
  label: string;
  summaryFocus: string;
}

export const RECORDING_TYPES: Record<RecordingTypeKey, RecordingType> = {
  meeting:   { label: '👥 การประชุม',       summaryFocus: 'มติ + action items + ผู้รับผิดชอบ' },
  sales:     { label: '📞 สายลูกค้า/ขาย',   summaryFocus: 'order, ราคา, นัดหมาย, follow-up' },
  idea:      { label: '💡 บันทึกไอเดีย',    summaryFocus: 'จัดกลุ่มความคิด, เชื่อมไอเดียเก่า' },
  lecture:   { label: '🎓 เลคเชอร์/เรียน',  summaryFocus: 'หัวข้อ, key points, flashcard' },
  interview: { label: '🎤 สัมภาษณ์',        summaryFocus: 'คำถาม-คำตอบ, ประเด็นสำคัญ' },
  diary:     { label: '📔 ไดอารี่/ส่วนตัว', summaryFocus: 'เหตุการณ์/อารมณ์, โทนอบอุ่น' },
  general:   { label: '🎙️ ทั่วไป',          summaryFocus: 'ถอด + สรุปกลางๆ' },
  auto:      { label: '✨ ให้ AI เลือกให้',   summaryFocus: 'วิเคราะห์ context อัตโนมัติ' },
};

export const RECORDING_TYPE_ORDER: RecordingTypeKey[] = [
  'auto', 'meeting', 'sales', 'idea', 'lecture', 'interview', 'diary', 'general',
];
