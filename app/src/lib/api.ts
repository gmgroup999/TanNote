/**
 * Frontend → Supabase Edge Function client
 * Gemini API key ไม่ถูกเปิดเผยใน frontend เลย
 */
import type { AudioRecord, StructuredTag, SuggestedLink, ReminderItem } from './db';
import { getLiffUserId, setLineUserId } from './liff';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── types ────────────────────────────────────────────────────────────────────
export type { StructuredTag, SuggestedLink, ReminderItem };

export interface TranscribeResult {
  note_id:       string;
  detected_type: string;
  transcript:    string;
  title:         string;
  summary:       string;
  key_points:    string[];
  action_items:  { task: string; owner?: string; due?: string }[];
  tags:          string[];
  sentiment:     'positive' | 'neutral' | 'negative';
  // Phase 3
  structured_tags: StructuredTag[];
  note_links:      SuggestedLink[];
  // Phase 5
  reminders:       ReminderItem[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function getEdgeFunctionUrl(name: string): string {
  const base = SUPABASE_URL?.replace(/\/$/, "");
  if (!base || base.includes("your-project")) {
    throw new Error(
      "กรุณาตั้งค่า VITE_SUPABASE_URL ใน app/.env.local ก่อน\n" +
      "สร้างโปรเจกต์ที่ supabase.com แล้วใส่ URL จริง"
    );
  }
  return `${base}/functions/v1/${name}`;
}

function restUrl(table: string, query = "") {
  const base = SUPABASE_URL?.replace(/\/$/, "");
  return `${base}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

function anonHeaders() {
  return {
    apikey:          SUPABASE_ANON,
    "Content-Type":  "application/json",
    "Prefer":        "return=representation",
  };
}

/** อ่าน LINE userId ปัจจุบัน (ใช้ใน Settings) */
export function readLineUserId(): string { return getLiffUserId(); }

/** บันทึก LINE userId จริง (สำหรับทดสอบ / override ก่อน Phase 3 LIFF auth จริง) */
export function saveLineUserId(id: string): void { setLineUserId(id); }

// ─── transcribeAudio ──────────────────────────────────────────────────────────
export async function transcribeAudio(
  record: AudioRecord,
  onProgress?: (step: "uploading" | "processing") => void,
): Promise<TranscribeResult> {
  const url = getEdgeFunctionUrl("transcribe");

  onProgress?.("uploading");

  const form = new FormData();
  form.append("audio",            record.blob, `audio-${record.id}.webm`);
  form.append("recording_type",   record.recordingType);
  form.append("duration_seconds", String(record.durationSeconds));
  form.append("local_audio_id",   record.id);
  if ((record as any).language) form.append("language", (record as any).language);

  onProgress?.("processing");

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
      "x-line-user-id": getLiffUserId(),
    },
    body: form,
  });

  const json = await res.json() as TranscribeResult & { error?: string };

  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Server error ${res.status}`);
  }

  return {
    ...json,
    structured_tags: json.structured_tags ?? [],
    note_links:      json.note_links ?? [],
    reminders:       json.reminders ?? [],
  };
}

// ─── deleteNote ───────────────────────────────────────────────────────────────
/** ลบ Supabase notes row + cascade note_tags, note_links (non-critical) */
export async function deleteNote(noteId: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON || SUPABASE_URL.includes("your-project")) return;
  try {
    await fetch(restUrl("notes", `id=eq.${noteId}`), {
      method:  "DELETE",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    });
  } catch { /* non-critical */ }
}

// ─── uploadR2Backup ───────────────────────────────────────────────────────────
export async function uploadR2Backup(blob: Blob, noteId: string): Promise<string | null> {
  if (!isSupabaseReady()) return null;
  try {
    const form = new FormData();
    form.append("audio", blob, `${noteId}.webm`);
    form.append("note_id", noteId);
    const res = await fetch(getEdgeFunctionUrl("r2-backup"), {
      method:  "POST",
      headers: {
        ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
        "x-line-user-id": getLiffUserId(),
      },
      body: form,
    });
    const json = await res.json() as { ok?: boolean; url?: string; error?: string };
    return json.url ?? null;
  } catch { return null; }
}

// ─── patchNote ────────────────────────────────────────────────────────────────
export async function patchNote(
  noteId: string,
  patch: { title?: string; recording_type?: string; remove_tags?: string[] },
): Promise<void> {
  if (!isSupabaseReady()) return;
  await fetch(getEdgeFunctionUrl("patch-note"), {
    method:  "PATCH",
    headers: {
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ note_id: noteId, ...patch }),
  }).catch(() => {});
}

// ─── reprocessNote ────────────────────────────────────────────────────────────
/** ลบ note เก่าออกจาก Supabase ก่อนที่จะสร้างใหม่ (re-process with new type) */
export async function reprocessNote(noteId: string): Promise<void> {
  await deleteNote(noteId);
}

// ─── confirmNoteLink ──────────────────────────────────────────────────────────
/** ยืนยัน/ปฏิเสธ link ใน Supabase note_links (non-critical: ไม่ throw ถ้าล้มเหลว) */
export async function confirmNoteLink(linkId: string, confirmed: boolean): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON || SUPABASE_URL.includes("your-project")) return;
  try {
    await fetch(restUrl("note_links", `id=eq.${linkId}`), {
      method:  "PATCH",
      headers: anonHeaders(),
      body:    JSON.stringify({ confirmed }),
    });
  } catch { /* non-critical */ }
}

// ─── fetchNoteById ────────────────────────────────────────────────────────────
export async function fetchNoteById(noteId: string): Promise<Record<string, unknown> | null> {
  if (!SUPABASE_URL || SUPABASE_URL.includes("your-project")) return null;
  const res = await fetch(
    restUrl("notes", `id=eq.${noteId}&select=*`),
    { headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" } },
  );
  const data = await res.json() as Record<string, unknown>[];
  return data[0] ?? null;
}

// ─── Phase 4: Ask Notes (RAG) ─────────────────────────────────────────────────

export interface AskSource {
  title:      string;
  note_id:    string;
  similarity: number;
}

export interface SuggestedMemory {
  key:    string;
  value:  string;
  reason: string;
}

export interface AskResult {
  answer:            string;
  sources:           AskSource[];
  suggested_memory:  SuggestedMemory | null;
}

export interface ChatHistory {
  role: 'user' | 'ai';
  text: string;
}

export interface LocalNoteContext {
  note_id?:   string;
  title:      string;
  summary:    string;
  created_at?: string;
}

export async function askNotes(question: string, history: ChatHistory[] = [], localNotes: LocalNoteContext[] = []): Promise<AskResult> {
  const url = getEdgeFunctionUrl("ask");
  const res = await fetch(url, {
    method:  "POST",
    headers: {
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
      "Content-Type":  "application/json",
      "x-line-user-id": getLiffUserId(),
    },
    body: JSON.stringify({ question, history: history.slice(-6), local_notes: localNotes }),
  });
  const json = await res.json() as AskResult & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Server error ${res.status}`);
  return { answer: json.answer, sources: json.sources ?? [], suggested_memory: json.suggested_memory ?? null };
}

// ─── Phase 4: User Memory CRUD ───────────────────────────────────────────────

export interface UserMemory {
  id:         string;
  key:        string;
  value:      string;
  source:     string;
  created_at: string;
}

function isSupabaseReady() {
  return SUPABASE_URL && SUPABASE_ANON && !SUPABASE_URL.includes("your-project");
}

export async function fetchMemories(): Promise<UserMemory[]> {
  if (!isSupabaseReady()) return [];
  const res = await fetch(
    restUrl("user_memory", "select=id,key,value,source,created_at&order=created_at.desc"),
    { headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" } },
  );
  return res.ok ? (await res.json() as UserMemory[]) : [];
}

export async function saveMemory(key: string, value: string, source = "confirmed"): Promise<void> {
  if (!isSupabaseReady()) return;
  // Get userId from cached session storage line_user_id
  const lineUserId = getLiffUserId();
  await fetch(getEdgeFunctionUrl("save-memory"), {
    method:  "POST",
    headers: {
      ...(SUPABASE_ANON ? { apikey: SUPABASE_ANON } : {}),
      "Content-Type":   "application/json",
      "x-line-user-id": lineUserId,
    },
    body: JSON.stringify({ key, value, source }),
  }).catch(() => {});
}

export async function deleteMemory(id: string): Promise<void> {
  if (!isSupabaseReady()) return;
  await fetch(restUrl("user_memory", `id=eq.${id}`), {
    method:  "DELETE",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
  }).catch(() => {});
}

// ─── Phase 4: Profile / Onboarding ───────────────────────────────────────────

export interface UserProfile {
  nickname?:    string;
  primary_use?: string[];
  tone?:        string;
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  if (!isSupabaseReady()) return;
  const lineUserId = getLiffUserId();
  await fetch(
    restUrl("users_profile", `line_user_id=eq.${lineUserId}`),
    {
      method:  "PATCH",
      headers: anonHeaders(),
      body:    JSON.stringify(profile),
    },
  ).catch(() => {});
}

// ─── Phase 5: Reminders ───────────────────────────────────────────────────────

export async function fetchReminders(): Promise<ReminderItem[]> {
  if (!isSupabaseReady()) return [];
  const lineUserId = getLiffUserId();
  const res = await fetch(
    restUrl("reminders", `line_user_id=eq.${lineUserId}&status=eq.pending&order=remind_at.asc&select=id,type,title,message,remind_at,repeat_rule,status`),
    { headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" } },
  ).catch(() => null);
  return res?.ok ? (await res.json() as ReminderItem[]) : [];
}

export async function deleteReminder(id: string): Promise<void> {
  if (!isSupabaseReady()) return;
  await fetch(restUrl("reminders", `id=eq.${id}`), {
    method:  "DELETE",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
  }).catch(() => {});
}

// ─── Phase 5: Reminder Settings ──────────────────────────────────────────────

export interface ReminderSettings {
  types:       string[];
  quiet_start: string;
  quiet_end:   string;
}

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  types:       ["task", "appointment", "routine", "followup", "greeting", "system"],
  quiet_start: "22:00",
  quiet_end:   "08:00",
};

export async function getReminderSettings(): Promise<ReminderSettings> {
  if (!isSupabaseReady()) return DEFAULT_REMINDER_SETTINGS;
  const lineUserId = getLiffUserId();
  const res = await fetch(
    restUrl("users_profile", `line_user_id=eq.${lineUserId}&select=reminder_settings`),
    { headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" } },
  ).catch(() => null);
  if (!res?.ok) return DEFAULT_REMINDER_SETTINGS;
  const data = await res.json() as { reminder_settings: ReminderSettings }[];
  return data[0]?.reminder_settings ?? DEFAULT_REMINDER_SETTINGS;
}

export async function saveReminderSettings(settings: ReminderSettings): Promise<void> {
  if (!isSupabaseReady()) return;
  const lineUserId = getLiffUserId();
  await fetch(
    restUrl("users_profile", `line_user_id=eq.${lineUserId}`),
    {
      method:  "PATCH",
      headers: anonHeaders(),
      body:    JSON.stringify({ reminder_settings: settings }),
    },
  ).catch(() => {});
}

// ─── Phase 6: Usage + Plan ────────────────────────────────────────────────────

export interface UsageSummary {
  plan:                  string;
  period:                string;
  cloud_backup_enabled:  boolean;
  recording_minutes:     number;
  ask_notes_count:       number;
  ai_suggest_count:      number;
}

export async function fetchUsage(): Promise<UsageSummary | null> {
  if (!isSupabaseReady()) return null;
  const lineUserId = getLiffUserId();
  const period     = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_current_usage`,
    {
      method:  "POST",
      headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
      body:    JSON.stringify({ p_line_user_id: lineUserId, p_period: period }),
    },
  ).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json() as UsageSummary | null;
  return data ? { ...data, period } : null;
}

export async function saveCloudBackupEnabled(enabled: boolean): Promise<void> {
  if (!isSupabaseReady()) return;
  const lineUserId = getLiffUserId();
  await fetch(
    restUrl("users_profile", `line_user_id=eq.${lineUserId}`),
    {
      method:  "PATCH",
      headers: anonHeaders(),
      body:    JSON.stringify({ cloud_backup_enabled: enabled }),
    },
  ).catch(() => {});
}
