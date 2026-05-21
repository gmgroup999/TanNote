import { useEffect, useRef, useState } from 'react';
import { listAudioRecordings, deleteAudio, updateAudioRecord, type AudioRecord, type StructuredTag, type SuggestedLink, type ReminderItem } from '../lib/db';
import { RECORDING_TYPES, type RecordingTypeKey } from '../config/recordingTypes';
import { transcribeAudio, confirmNoteLink, deleteNote, deleteReminder } from '../lib/api';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

const SENTIMENT_LABEL: Record<string, string> = {
  positive: '😊 เชิงบวก',
  neutral:  '😐 กลางๆ',
  negative: '😔 เชิงลบ',
};

const REMINDER_EMOJI: Record<string, string> = {
  task:        '✓',
  appointment: '📅',
  routine:     '🔁',
  followup:    '📞',
  greeting:    '🎂',
  system:      '⚙️',
};

function formatThaiDatetime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const TAG_TYPE_CONFIG: Record<StructuredTag['type'], { label: string; color: string }> = {
  people:  { label: 'คน',      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  project: { label: 'โปรเจกต์', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  topic:   { label: 'หัวข้อ',   color: 'bg-amber-50 text-amber-700 border-amber-200' },
  action:  { label: 'action',   color: 'bg-green-50 text-green-700 border-green-200' },
  status:  { label: 'สถานะ',   color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

// ─── AudioPlayer ─────────────────────────────────────────────────────────────

function AudioPlayer({ blob, duration }: { blob: Blob; duration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration);
  const [seeking, setSeeking] = useState(false);

  // StrictMode-safe: cleanup revokes, re-run creates a fresh URL
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  function toggle() {
    const a = audioRef.current;
    if (!a || !url) return;
    playing ? a.pause() : a.play();
  }

  const pct = dur > 0 ? (current / dur) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={toggle}
        disabled={!url}
        aria-label={playing ? 'หยุด' : 'เล่น'}
        className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center transition-colors disabled:opacity-40 ${
          playing ? 'bg-[#E24B4A] text-white' : 'bg-gray-100 dark:bg-[#333336] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#444448]'
        }`}
      >
        {playing ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-4 h-4 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="relative h-5 flex items-center">
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-100 dark:bg-[#333336] overflow-hidden pointer-events-none">
            <div className="h-full rounded-full bg-[#E24B4A]" style={{ width: `${pct}%` }} />
          </div>
          <input
            type="range" min={0} max={dur || 1} step={0.1} value={current}
            onChange={(e) => { setSeeking(true); setCurrent(+e.target.value); }}
            onMouseUp={(e) => { audioRef.current!.currentTime = +(e.currentTarget.value); setSeeking(false); }}
            onTouchEnd={(e) => { audioRef.current!.currentTime = +(e.currentTarget.value); setSeeking(false); }}
            aria-label="เลือกช่วงเวลา"
            className="absolute inset-x-0 w-full h-full cursor-pointer"
            style={{ WebkitAppearance: 'none', background: 'transparent', opacity: 1 }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600 tabular-nums">
          <span>{formatTime(current)}</span>
          <span>{formatTime(dur)}</span>
        </div>
      </div>

      <audio ref={audioRef} src={url || undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrent(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
        onTimeUpdate={() => { if (!seeking && audioRef.current) setCurrent(audioRef.current.currentTime); }}
        onLoadedMetadata={() => { const d = audioRef.current?.duration; if (d && isFinite(d)) setDur(d); }}
        className="hidden"
      />
    </div>
  );
}

// ─── AiPanel ─────────────────────────────────────────────────────────────────

function AiPanel({
  record,
  onTagRemove,
  onLinkAnswer,
  onReminderDelete,
}: {
  record: AudioRecord;
  onTagRemove: (tagName: string) => void;
  onLinkAnswer: (linkId: string, confirmed: boolean) => void;
  onReminderDelete: (reminderId: string) => void;
}) {
  const [showTranscript, setShowTranscript] = useState(false);

  if (record.aiStatus === 'error') {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
        ⚠️ {record.aiError ?? 'เกิดข้อผิดพลาด'}
      </div>
    );
  }

  if (record.aiStatus !== 'done') return null;

  const pendingLinks = record.suggestedLinks?.filter((l) => l.confirmed === null) ?? [];

  return (
    <div className="flex flex-col gap-2.5 border-t border-gray-100 dark:border-[#333336] pt-3">
      {/* Title + detected type */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug flex-1">
          {record.title ?? 'บันทึกเสียง'}
        </p>
        {record.detectedType && record.detectedType !== record.recordingType && (
          <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 rounded-full px-2 py-0.5 flex-shrink-0">
            AI: {RECORDING_TYPES[record.detectedType as RecordingTypeKey]?.label ?? record.detectedType}
          </span>
        )}
      </div>

      {/* Summary */}
      {record.summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{record.summary}</p>
      )}

      {/* Key points */}
      {(record.keyPoints?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1">ประเด็นสำคัญ</p>
          <ul className="flex flex-col gap-1">
            {record.keyPoints!.map((pt, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span className="text-[#E24B4A] mt-0.5 flex-shrink-0">•</span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action items */}
      {(record.actions?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1">สิ่งที่ต้องทำ</p>
          <ul className="flex flex-col gap-1">
            {record.actions!.map((a, i) => (
              <li key={i} className="flex gap-1.5 text-xs text-gray-700 dark:text-gray-300">
                <span className="text-green-500 mt-0.5 flex-shrink-0">☐</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Structured tags (Phase 3) */}
      {(record.structuredTags?.length ?? 0) > 0 ? (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1.5">แท็ก</p>
          <div className="flex flex-col gap-1.5">
            {(['people', 'project', 'topic', 'action', 'status'] as StructuredTag['type'][]).map((cat) => {
              const catTags = record.structuredTags!.filter((t) => t.type === cat);
              if (!catTags.length) return null;
              const cfg = TAG_TYPE_CONFIG[cat];
              return (
                <div key={cat} className="flex items-start gap-1.5 flex-wrap">
                  <span className="text-[9px] text-gray-400 mt-1 w-10 flex-shrink-0">{cfg.label}</span>
                  {catTags.map((tag) => (
                    <span
                      key={tag.name}
                      className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border ${cfg.color}`}
                    >
                      {tag.name}
                      <button
                        onClick={() => onTagRemove(tag.name)}
                        className="opacity-50 hover:opacity-100 transition-opacity leading-none"
                        aria-label={`ลบแท็ก ${tag.name}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (record.hashtags?.length ?? 0) > 0 ? (
        /* Fallback: flat hashtags for older records */
        <div className="flex flex-wrap gap-1.5">
          {record.hashtags!.map((tag) => (
            <span key={tag} className="text-xs bg-[#E24B4A]/8 text-[#E24B4A] rounded-full px-2.5 py-0.5 border border-[#E24B4A]/20">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Reminders (Phase 5) */}
      {(record.reminders?.length ?? 0) > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-1.5">การเตือน</p>
          <div className="flex flex-col gap-1.5">
            {record.reminders!.map((reminder: ReminderItem) => (
              <div key={reminder.id}
                className="flex items-center gap-2 bg-orange-50 dark:bg-orange-950/30 rounded-xl px-3 py-2 border border-orange-100 dark:border-orange-900/50">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                    {REMINDER_EMOJI[reminder.type] ?? '🔔'} {reminder.title}
                  </p>
                  <p className="text-[10px] text-orange-600 mt-0.5">
                    {formatThaiDatetime(reminder.remind_at)}
                    {reminder.repeat_rule && (
                      <span className="ml-1 text-gray-400">
                        ({reminder.repeat_rule === 'daily' ? 'ทุกวัน' : 'ทุกสัปดาห์'})
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onReminderDelete(reminder.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0"
                  aria-label="ลบการเตือน"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sentiment */}
      {record.sentiment && (
        <p className="text-[10px] text-gray-400 dark:text-gray-600">{SENTIMENT_LABEL[record.sentiment] ?? record.sentiment}</p>
      )}

      {/* Suggested links (Phase 3) */}
      {pendingLinks.length > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex flex-col gap-2">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide">
            🔗 โน้ตที่อาจเกี่ยวข้อง
          </p>
          {pendingLinks.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-700 flex-1 leading-snug">
                «{link.linkedTitle}»
                <span className="ml-1 text-[10px] text-gray-400">
                  ({Math.round(link.similarity * 100)}%)
                </span>
              </p>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onLinkAnswer(link.id, true)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition-colors font-medium"
                >
                  ใช่
                </button>
                <button
                  onClick={() => onLinkAnswer(link.id, false)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  ไม่ใช่
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transcript toggle */}
      <button
        onClick={() => setShowTranscript((v) => !v)}
        className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors self-start"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${showTranscript ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {showTranscript ? 'ซ่อน' : 'ดู'} transcript เต็ม
      </button>
      {showTranscript && record.transcript && (
        <div className="bg-gray-50 dark:bg-[#1E1E20] rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
          {record.transcript}
        </div>
      )}
    </div>
  );
}

// ─── RecordingItem ────────────────────────────────────────────────────────────

type AiStep = 'uploading' | 'processing';

const AI_STEP_LABEL: Record<AiStep, string> = {
  uploading:  'กำลังส่งไฟล์...',
  processing: 'กำลังประมวลผล...',
};

function RecordingItem({
  record: initialRecord,
  onDelete,
  onUpdate,
}: {
  record: AudioRecord;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<AudioRecord>) => void;
}) {
  const [record, setRecord] = useState(initialRecord);
  const [aiStep, setAiStep] = useState<AiStep | null>(null);

  const typeLabel = RECORDING_TYPES[record.recordingType as RecordingTypeKey]?.label ?? record.recordingType;
  const sizeMB = (record.blob.size / 1024 / 1024).toFixed(1);
  const isProcessing = record.aiStatus === 'processing';
  const isDone = record.aiStatus === 'done';

  async function applyPatch(patch: Partial<AudioRecord>) {
    setRecord((r) => ({ ...r, ...patch }));
    await updateAudioRecord(record.id, patch);
    onUpdate(record.id, patch);
  }

  async function runAi() {
    await applyPatch({ aiStatus: 'processing' });

    try {
      const result = await transcribeAudio(record, (step) => setAiStep(step));
      await applyPatch({
        aiStatus:      'done',
        noteId:        result.note_id,
        transcript:    result.transcript,
        detectedType:  result.detected_type,
        title:         result.title,
        summary:       result.summary,
        keyPoints:     result.key_points,
        actions:       result.action_items.map((a) => a.task),
        hashtags:      result.tags,
        sentiment:     result.sentiment,
        structuredTags: result.structured_tags,
        suggestedLinks: result.note_links.map((l) => ({
          id:           l.id,
          linkedNoteId: l.linkedNoteId ?? (l as any).linked_note_id,
          linkedTitle:  l.linkedTitle  ?? (l as any).linked_title,
          similarity:   l.similarity,
          confirmed:    l.confirmed,
        })),
        reminders: result.reminders,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      await applyPatch({ aiStatus: 'error', aiError: msg });
    } finally {
      setAiStep(null);
    }
  }

  async function handleTagRemove(tagName: string) {
    const updated = record.structuredTags?.filter((t) => t.name !== tagName) ?? [];
    await applyPatch({ structuredTags: updated });
  }

  async function handleLinkAnswer(linkId: string, confirmed: boolean) {
    const updated = record.suggestedLinks?.map((l) =>
      l.id === linkId ? { ...l, confirmed } : l
    ) ?? [];
    await applyPatch({ suggestedLinks: updated });
    confirmNoteLink(linkId, confirmed); // fire-and-forget to Supabase
  }

  async function handleReminderDelete(reminderId: string) {
    const updated = record.reminders?.filter((r) => r.id !== reminderId) ?? [];
    await applyPatch({ reminders: updated });
    deleteReminder(reminderId); // fire-and-forget to Supabase
  }

  return (
    <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {isDone && record.title ? (
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5 leading-snug">{record.title}</p>
          ) : null}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs bg-gray-100 dark:bg-[#333336] text-gray-600 dark:text-gray-400 rounded-full px-2.5 py-0.5">{typeLabel}</span>
            <span className="text-xs text-gray-400 dark:text-gray-600">{sizeMB} MB</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">{formatDate(record.createdAt)}</p>
        </div>
        <button onClick={() => onDelete(record.id)} aria-label="ลบ"
          className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Player */}
      <AudioPlayer blob={record.blob} duration={record.durationSeconds} />

      {/* AI button / progress / panel */}
      {!isDone && !isProcessing && (
        <button onClick={runAi}
          className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-medium bg-gray-50 dark:bg-[#333336] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3E3E42] transition-colors border border-gray-200 dark:border-[#444448]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          ถอดเสียง + วิเคราะห์ AI
        </button>
      )}

      {isProcessing && (
        <div className="flex items-center justify-center gap-2.5 py-3 text-sm text-[#E24B4A]">
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {aiStep ? AI_STEP_LABEL[aiStep] : 'กำลังประมวลผล...'}
        </div>
      )}

      <AiPanel record={record} onTagRemove={handleTagRemove} onLinkAnswer={handleLinkAnswer} onReminderDelete={handleReminderDelete} />
    </div>
  );
}

// ─── RecordingsPage ───────────────────────────────────────────────────────────

export default function RecordingsPage({
  focusNoteId,
  onFocusConsumed,
}: {
  focusNoteId?: string | null;
  onFocusConsumed?: () => void;
} = {}) {
  const [records, setRecords] = useState<AudioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchRunning, setBatchRunning] = useState(false);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      const data = await listAudioRecordings();
      setRecords(data.slice().reverse());
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!focusNoteId || loading) return;
    const target = records.find(r => r.noteId === focusNoteId);
    if (!target) return;
    const el = noteRefs.current[target.id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-[#E24B4A]', 'ring-offset-2');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-[#E24B4A]', 'ring-offset-2');
        onFocusConsumed?.();
      }, 2500);
    }
  }, [focusNoteId, loading, records]);

  function handleUpdate(id: string, patch: Partial<AudioRecord>) {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function handleDelete(id: string) {
    const record = records.find((r) => r.id === id);
    await deleteAudio(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    // ลบ Supabase row ด้วย (cascade → note_tags, note_links)
    if (record?.noteId) deleteNote(record.noteId);
  }

  async function runBatch() {
    setBatchRunning(true);
    const pending = records.filter((r) => !r.aiStatus || r.aiStatus === 'error');
    for (const r of pending) {
      try {
        const result = await transcribeAudio(r);
        const done: Partial<AudioRecord> = {
          aiStatus:      'done',
          noteId:        result.note_id,
          transcript:    result.transcript,
          detectedType:  result.detected_type,
          title:         result.title,
          summary:       result.summary,
          keyPoints:     result.key_points,
          actions:       result.action_items.map((a) => a.task),
          hashtags:      result.tags,
          sentiment:     result.sentiment,
          structuredTags: result.structured_tags,
          suggestedLinks: result.note_links.map((l) => ({
            id:           l.id,
            linkedNoteId: l.linkedNoteId ?? (l as any).linked_note_id,
            linkedTitle:  l.linkedTitle  ?? (l as any).linked_title,
            similarity:   l.similarity,
            confirmed:    l.confirmed,
          })),
          reminders: result.reminders,
        };
        await updateAudioRecord(r.id, done);
        handleUpdate(r.id, done);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        const ep: Partial<AudioRecord> = { aiStatus: 'error', aiError: msg };
        await updateAudioRecord(r.id, ep);
        handleUpdate(r.id, ep);
      }
    }
    setBatchRunning(false);
  }

  const pendingCount = records.filter((r) => !r.aiStatus || r.aiStatus === 'error').length;

  // All unique topics/hashtags for knowledge graph cloud
  const allHashtags = Array.from(
    new Set(records.flatMap((r) =>
      r.structuredTags?.map((t) => t.name) ?? r.hashtags ?? []
    ))
  );

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      <header className="w-full max-w-md mx-auto px-5 pt-10 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">รายการบันทึก</h1>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">เสียงทั้งหมดเก็บในเครื่องของคุณ</p>
      </header>

      <main className="w-full max-w-md mx-auto px-5 flex-1 flex flex-col gap-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-600 text-sm">กำลังโหลด...</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-[#333336] flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-500 text-sm">ยังไม่มีการบันทึก</p>
            <p className="text-gray-400 dark:text-gray-600 text-xs">กดปุ่มไมค์ที่หน้าบันทึกเพื่อเริ่ม</p>
          </div>
        ) : (
          <>
            {/* Batch AI button */}
            {pendingCount > 0 && (
              <button onClick={runBatch} disabled={batchRunning}
                className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-medium bg-[#E24B4A] text-white hover:bg-[#C73B3A] disabled:opacity-60 transition-colors shadow-sm">
                {batchRunning ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    กำลังประมวลผล...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    ถอดเสียง + วิเคราะห์ทั้งหมด ({pendingCount} รายการ)
                  </>
                )}
              </button>
            )}

            {/* Knowledge graph hashtag cloud */}
            {allHashtags.length > 0 && (
              <div className="bg-white dark:bg-[#252527] rounded-2xl border border-gray-100 dark:border-[#333336] shadow-sm p-4">
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide mb-2.5">
                  🕸️ หัวข้อทั้งหมด (Knowledge Graph)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {allHashtags.map((tag) => {
                    const count = records.filter((r) =>
                      r.structuredTags?.some((t) => t.name === tag) || r.hashtags?.includes(tag)
                    ).length;
                    return (
                      <span key={tag}
                        className="text-xs bg-[#E24B4A]/8 text-[#E24B4A] rounded-full px-2.5 py-0.5 border border-[#E24B4A]/20"
                        title={`${count} รายการ`}>
                        {tag}
                        {count > 1 && <span className="ml-1 opacity-60">×{count}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 dark:text-gray-600">{records.length} รายการ</p>
            {records.map((r) => (
              <div key={r.id} ref={el => { noteRefs.current[r.id] = el; }} className="rounded-2xl transition-shadow duration-500">
                <RecordingItem record={r} onDelete={handleDelete} onUpdate={handleUpdate} />
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
