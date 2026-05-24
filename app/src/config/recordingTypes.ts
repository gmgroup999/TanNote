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
  label:        string;
  description:  string;
  summaryFocus: string;
}

export const RECORDING_TYPES: Record<RecordingTypeKey, RecordingType> = {
  auto:      { label: '✨ ให้ AI เลือกให้',   description: 'ไม่แน่ใจว่าเนื้อหาเข้าพวกไหน? AI วิเคราะห์บริบทเสียงและเลือกโครงสร้างสรุปที่เหมาะสมที่สุดให้อัตโนมัติ',                  summaryFocus: 'วิเคราะห์ context อัตโนมัติ' },
  meeting:   { label: '👥 การประชุม',         description: 'เหมาะกับประชุมทีมทุกขนาด ดึงมติ ผู้รับผิดชอบ และ deadline ออกมาชัดเจน พร้อม action items ครบถ้วน',                       summaryFocus: 'มติ + action items + ผู้รับผิดชอบ' },
  sales:     { label: '📞 สายลูกค้า/ขาย',    description: 'บันทึกการคุยกับลูกค้าหรือ sales call จับ order ราคา วันนัดหมาย และสิ่งที่ต้อง follow-up ได้ครบ',                          summaryFocus: 'order, ราคา, นัดหมาย, follow-up' },
  idea:      { label: '💡 บันทึกไอเดีย',      description: 'สำหรับ brainstorm ทั้งเดี่ยวและกลุ่ม จัดกลุ่มความคิด และเชื่อมต่อกับไอเดียที่มีอยู่แล้วใน Knowledge Graph',              summaryFocus: 'จัดกลุ่มความคิด, เชื่อมไอเดียเก่า' },
  lecture:   { label: '🎓 เลคเชอร์/เรียน',   description: 'ถอดเนื้อหาการเรียนหรือบรรยาย สรุป key points และสร้าง flashcard พร้อมจัดลำดับ concept หลัก',                              summaryFocus: 'หัวข้อ, key points, flashcard' },
  interview: { label: '🎤 สัมภาษณ์',          description: 'จัดระเบียบ Q&A บันทึกการสัมภาษณ์งานหรือเก็บข้อมูล ดึงประเด็นสำคัญและ quote ที่น่าสนใจ',                               summaryFocus: 'คำถาม-คำตอบ, ประเด็นสำคัญ' },
  diary:     { label: '📔 ไดอารี่/ส่วนตัว',  description: 'บันทึกความรู้สึกและเหตุการณ์ประจำวัน AI สรุปด้วยโทนอบอุ่นและเป็นส่วนตัว ไม่ตัดสิน',                                   summaryFocus: 'เหตุการณ์/อารมณ์, โทนอบอุ่น' },
  general:   { label: '🎙️ ทั่วไป',            description: 'เนื้อหาที่ไม่เข้าพวกไหนเป็นพิเศษ AI ถอดเสียงและสรุปแบบกลางๆ ครอบคลุมทุกประเภท',                                        summaryFocus: 'ถอด + สรุปกลางๆ' },
};

export const RECORDING_TYPE_ORDER: RecordingTypeKey[] = [
  'auto', 'meeting', 'sales', 'idea', 'lecture', 'interview', 'diary', 'general',
];
