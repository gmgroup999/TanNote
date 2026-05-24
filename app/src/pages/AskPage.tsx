import { useEffect, useRef, useState, Fragment } from 'react';
import { askNotes, saveMemory, fetchMemories, deleteMemory, saveProfile, type AskSource, type SuggestedMemory, type UserMemory, type ChatHistory, type LocalNoteContext } from '../lib/api';
import { listAudioRecordings } from '../lib/db';

// ─── types ────────────────────────────────────────────────────────────────────

export interface Message {
  role:             'user' | 'ai';
  text:             string;
  sources?:         AskSource[];
  suggestedMemory?: SuggestedMemory;
  memSaved?:        boolean;
}

type View = 'onboarding' | 'chat' | 'memory';

function inlineBold(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = baseKey;
  while (rest) {
    const m = rest.match(/\*\*(.+?)\*\*/);
    if (m && m.index !== undefined) {
      if (m.index > 0) nodes.push(<Fragment key={key++}>{rest.slice(0, m.index)}</Fragment>);
      nodes.push(<strong key={key++} className="font-semibold text-gray-900 dark:text-gray-100">{m[1]}</strong>);
      rest = rest.slice(m.index + m[0].length);
    } else {
      nodes.push(<Fragment key={key++}>{rest}</Fragment>);
      break;
    }
  }
  return nodes;
}

function renderMarkdown(text: string) {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    const lines = para.split('\n').filter(l => l.trim());
    const isNumbered = lines.every(l => /^\d+\./.test(l.trim()));
    const isBullet   = lines.every(l => /^[-•]/.test(l.trim()));

    if (isNumbered && lines.length > 1) {
      return (
        <ol key={pi} className="flex flex-col gap-1.5 mt-1">
          {lines.map((l, li) => {
            const content = l.replace(/^\d+\.\s*/, '');
            return (
              <li key={li} className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#E24B4A]/10 text-[#E24B4A] text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {li + 1}
                </span>
                <span className="flex-1 text-gray-700">{inlineBold(content, li * 10)}</span>
              </li>
            );
          })}
        </ol>
      );
    }

    if (isBullet && lines.length > 1) {
      return (
        <ul key={pi} className="flex flex-col gap-1 mt-1">
          {lines.map((l, li) => {
            const content = l.replace(/^[-•]\s*/, '');
            return (
              <li key={li} className="flex gap-2">
                <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#E24B4A]/60" />
                <span className="flex-1 text-gray-700">{inlineBold(content, li * 10)}</span>
              </li>
            );
          })}
        </ul>
      );
    }

    const combined = lines.join(' ');
    return (
      <p key={pi} className={pi > 0 ? 'mt-2' : ''}>
        {inlineBold(combined, pi * 100)}
      </p>
    );
  });
}

const PRIMARY_USE_OPTIONS = [
  { id: 'work',     label: '💼 งาน' },
  { id: 'idea',     label: '💡 ไอเดีย' },
  { id: 'study',    label: '📚 เรียน' },
  { id: 'personal', label: '🏠 ส่วนตัว' },
];

// ─── Onboarding ───────────────────────────────────────────────────────────────

function OnboardingView({ onDone }: { onDone: () => void }) {
  const [step, setStep]           = useState(0);
  const [nickname, setNickname]   = useState('');
  const [uses, setUses]           = useState<string[]>([]);
  const [tone, setTone]           = useState<'casual' | 'formal'>('casual');
  const [saving, setSaving]       = useState(false);

  async function finish() {
    setSaving(true);
    await saveProfile({ nickname: nickname.trim() || undefined, primary_use: uses, tone });
    onDone();
  }

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      <div className="w-full max-w-md lg:max-w-2xl mx-auto px-5 pt-14 pb-6 flex-1 flex flex-col">
        {/* Progress dots */}
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-[#E24B4A]' : 'w-1.5 bg-gray-200'}`} />
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-col gap-5 flex-1">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">ยินดีต้อนรับ!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">ทันโน้ตจะเป็นเพื่อนและเลขาส่วนตัวของคุณ ตอบได้ 3 คำถามสั้นๆ ก่อนนะ</p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">ชื่อที่อยากให้เรียก</label>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="เช่น แทน, Tan, ไม่ต้องใส่ก็ได้"
                className="w-full rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#252527] text-gray-900 dark:text-gray-100 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/30 focus:border-[#E24B4A]"
              />
            </div>
            <div className="mt-auto">
              <button onClick={() => setStep(1)}
                className="w-full py-3 rounded-xl bg-[#E24B4A] text-white font-medium text-sm hover:bg-[#C73B3A] transition-colors">
                ถัดไป
              </button>
              <button onClick={onDone} className="w-full py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-2">
                ข้ามไปก่อน
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-5 flex-1">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">ใช้ทำอะไรหลักๆ?</h2>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">เลือกได้หลายอย่าง</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {PRIMARY_USE_OPTIONS.map((opt) => {
                const active = uses.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => setUses((u) => active ? u.filter((x) => x !== opt.id) : [...u, opt.id])}
                    className={`rounded-xl py-4 text-sm font-medium border transition-colors ${
                      active ? 'bg-[#E24B4A]/10 border-[#E24B4A] text-[#E24B4A]' : 'bg-white dark:bg-[#252527] border-gray-200 dark:border-[#444448] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-auto flex gap-2.5">
              <button onClick={() => setStep(0)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-[#444448] text-sm text-gray-600 dark:text-gray-400">ย้อนกลับ</button>
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-xl bg-[#E24B4A] text-white font-medium text-sm">ถัดไป</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5 flex-1">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">สไตล์การตอบ</h2>
              <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">ปรับได้ภายหลัง</p>
            </div>
            <div className="flex flex-col gap-3">
              {(['casual', 'formal'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`rounded-xl p-4 text-left border transition-colors ${
                    tone === t ? 'bg-[#E24B4A]/10 border-[#E24B4A]' : 'bg-white dark:bg-[#252527] border-gray-200 dark:border-[#444448] hover:border-gray-300'
                  }`}
                >
                  <p className={`text-sm font-medium ${tone === t ? 'text-[#E24B4A]' : 'text-gray-800 dark:text-gray-200'}`}>
                    {t === 'casual' ? '🤙 เป็นกันเอง' : '🎩 สุภาพ'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
                    {t === 'casual' ? 'พูดคุยเหมือนเพื่อน ตรงไปตรงมา' : 'ภาษาสุภาพ เป็นทางการ'}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-auto flex gap-2.5">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-[#444448] text-sm text-gray-600 dark:text-gray-400">ย้อนกลับ</button>
              <button onClick={finish} disabled={saving}
                className="flex-1 py-3 rounded-xl bg-[#E24B4A] text-white font-medium text-sm disabled:opacity-60">
                {saving ? 'กำลังบันทึก...' : 'เริ่มใช้งาน'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Memory View ──────────────────────────────────────────────────────────────

function MemoryView({ onBack }: { onBack: () => void }) {
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchMemories().then((m) => { setMemories(m); setLoading(false); });
  }, []);

  async function handleDelete(id: string) {
    await deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      <header className="w-full max-w-md lg:max-w-2xl mx-auto px-5 pt-10 pb-4 flex items-center gap-3">
        <button onClick={onBack} className="w-8 h-8 rounded-full bg-gray-100 dark:bg-[#333336] flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#444448] transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">สิ่งที่ทันโน้ตจำ</h1>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">ข้อมูลเกี่ยวกับคุณ — ลบได้ทุกเมื่อ</p>
        </div>
      </header>

      <main className="w-full max-w-md lg:max-w-2xl mx-auto px-5 flex-1 pb-6">
        {loading ? (
          <p className="text-center text-gray-400 dark:text-gray-600 text-sm py-10">กำลังโหลด...</p>
        ) : memories.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-[#333336] flex items-center justify-center text-2xl">🧠</div>
            <p className="text-gray-500 dark:text-gray-500 text-sm">ยังไม่มีข้อมูลที่จำ</p>
            <p className="text-gray-400 dark:text-gray-600 text-xs">ทันโน้ตจะเรียนรู้จากบทสนทนาของคุณ</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {memories.map((m) => (
              <div key={m.id} className="bg-white dark:bg-[#252527] rounded-xl border border-gray-100 dark:border-[#333336] shadow-sm px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-600 uppercase tracking-wide">{m.key}</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-snug">{m.value}</p>
                  <p className="text-[10px] text-gray-300 dark:text-gray-600 mt-1">
                    {m.source === 'confirmed' ? '✓ ยืนยันแล้ว' : m.source === 'inferred' ? 'AI สรุปมา' : 'เพิ่มเอง'}
                  </p>
                </div>
                <button onClick={() => handleDelete(m.id)} aria-label="ลบ"
                  className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────

function ChatView({ onOpenMemory, onOpenNote, messages, setMessages }: {
  onOpenMemory: () => void;
  onOpenNote?: (noteId: string) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}) {
  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const inputRef                = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;

    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);

    try {
      const history: ChatHistory[] = messages.map(m => ({ role: m.role, text: m.text }));
      const records = await listAudioRecordings();
      const localNotes: LocalNoteContext[] = records
        .filter(r => r.aiStatus === 'done' && (r.title || r.summary))
        .map(r => ({
          note_id:    r.noteId,
          title:      r.title ?? 'บันทึกเสียง',
          summary:    r.summary ?? '',
          created_at: r.createdAt.toISOString(),
        }));
      const result = await askNotes(q, history, localNotes);
      setMessages((prev) => [...prev, {
        role:            'ai',
        text:            result.answer,
        sources:         result.sources,
        suggestedMemory: result.suggested_memory ?? undefined,
      }]);
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      const is429 = raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED') || raw.includes('quota');
      const msg = is429
        ? '⏳ AI ยุ่งมากชั่วคราว (rate limit) กรุณารอ 1 นาทีแล้วลองใหม่'
        : `⚠️ ${raw}`;
      setMessages((prev) => [...prev, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleMemorySave(msgIdx: number) {
    const msg = messages[msgIdx];
    if (!msg.suggestedMemory) return;
    await saveMemory(msg.suggestedMemory.key, msg.suggestedMemory.value, 'confirmed');
    setMessages((prev) => prev.map((m, i) => i === msgIdx ? { ...m, memSaved: true } : m));
  }

  function handleMemoryDismiss(msgIdx: number) {
    setMessages((prev) => prev.map((m, i) => i === msgIdx ? { ...m, memSaved: false } : m));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="min-h-svh flex flex-col bg-[#FAFAF7] dark:bg-[#18181A]">
      {/* Header */}
      <header className="w-full max-w-md lg:max-w-2xl mx-auto px-5 pt-10 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">ถามบันทึก</h1>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">ถามอะไรก็ได้จากบันทึกของคุณ</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1.5 rounded-full hover:bg-red-50"
              title="เคลียร์หน้าจอ"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              เคลียร์
            </button>
          )}
          <button
            onClick={onOpenMemory}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#444448] rounded-full px-3 py-1.5 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
          >
            <span>🧠</span> ความจำ
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="w-full max-w-md lg:max-w-2xl mx-auto px-5 flex-1 flex flex-col gap-4 pb-4 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#E24B4A]/10 flex items-center justify-center text-3xl">💬</div>
            <p className="text-gray-500 text-sm">ถามได้เลย เช่น</p>
            <div className="flex flex-col gap-2 w-full">
              {[
                'สรุป action items จากประชุมอาทิตย์นี้',
                'ฉันพูดถึงโปรเจกต์ไหนบ้าง?',
                'ไอเดียที่บันทึกไว้ล่าสุดคืออะไร?',
              ].map((hint) => (
                <button
                  key={hint}
                  onClick={() => { setInput(hint); inputRef.current?.focus(); }}
                  className="text-left bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#444448] rounded-xl px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hover:border-[#E24B4A]/40 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <span className={`text-[11px] font-bold px-1 ${
              msg.role === 'user'
                ? 'text-gray-400 dark:text-gray-600'
                : 'text-[#E24B4A]'
            }`}>
              {msg.role === 'user' ? 'คุณ' : 'ทันโน้ต'}
            </span>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#E24B4A] text-white rounded-br-sm'
                : 'bg-white dark:bg-[#252527] border border-gray-100 dark:border-[#333336] shadow-sm text-gray-800 dark:text-gray-200 rounded-bl-sm'
            }`}>
              {msg.role === 'ai' ? renderMarkdown(msg.text) : msg.text}
            </div>

            {/* Sources */}
            {msg.role === 'ai' && (msg.sources?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 max-w-[85%]">
                {msg.sources!.map((s, si) => (
                  <button
                    key={si}
                    onClick={() => onOpenNote?.(s.note_id)}
                    className="flex items-center gap-1 text-[10px] bg-gray-100 dark:bg-[#333336] text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5 hover:bg-[#E24B4A]/10 hover:text-[#E24B4A] transition-colors"
                  >
                    <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                    {s.title}
                  </button>
                ))}
              </div>
            )}

            {/* Suggested memory card */}
            {msg.role === 'ai' && msg.suggestedMemory && msg.memSaved === undefined && (
              <div className="max-w-[85%] bg-amber-50 border border-amber-100 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs text-amber-800">
                  🧠 จำไว้มั้ย? <span className="font-medium">{msg.suggestedMemory.value}</span>
                </p>
                <p className="text-[10px] text-amber-600">{msg.suggestedMemory.reason}</p>
                <div className="flex gap-2">
                  <button onClick={() => handleMemorySave(i)}
                    className="text-xs px-3 py-1 rounded-full bg-amber-200 text-amber-800 hover:bg-amber-300 transition-colors font-medium">
                    จำไว้เลย
                  </button>
                  <button onClick={() => handleMemoryDismiss(i)}
                    className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                    ไม่ต้อง
                  </button>
                </div>
              </div>
            )}
            {msg.role === 'ai' && msg.memSaved === true && (
              <p className="text-[10px] text-green-600 max-w-[85%]">✓ จำไว้แล้ว</p>
            )}
          </div>
        ))}

        {/* Loading bubble */}
        {loading && (
          <div className="flex items-start">
            <div className="bg-white dark:bg-[#252527] border border-gray-100 dark:border-[#333336] shadow-sm rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="w-full max-w-md mx-auto px-4 pb-24 pt-2 bg-[#FAFAF7] dark:bg-[#18181A]">
        <div className="flex items-end gap-2 bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#444448] rounded-2xl shadow-sm px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ถามอะไรก็ได้..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none py-1.5 max-h-28 overflow-y-auto"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-8 h-8 rounded-xl bg-[#E24B4A] text-white flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-[#C73B3A] transition-colors mb-0.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>
        <p className="text-[10px] text-center text-gray-300 dark:text-gray-700 mt-2">Enter ส่ง · Shift+Enter ขึ้นบรรทัด</p>
      </div>
    </div>
  );
}

// ─── AskPage ──────────────────────────────────────────────────────────────────

export default function AskPage({
  onOpenNote,
  messages,
  setMessages,
}: {
  onOpenNote?: (noteId: string) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}) {
  const [view, setView] = useState<View>(() => {
    return localStorage.getItem('tannote_onboarded') ? 'chat' : 'onboarding';
  });

  function handleOnboardingDone() {
    localStorage.setItem('tannote_onboarded', '1');
    setView('chat');
  }

  if (view === 'onboarding') return <OnboardingView onDone={handleOnboardingDone} />;
  if (view === 'memory')     return <MemoryView onBack={() => setView('chat')} />;
  return (
    <ChatView
      onOpenMemory={() => setView('memory')}
      onOpenNote={onOpenNote}
      messages={messages}
      setMessages={setMessages}
    />
  );
}
