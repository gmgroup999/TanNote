import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface StructuredTag {
  name:    string;
  type:    'people' | 'project' | 'topic' | 'action' | 'status';
  tag_id?: string;  // Supabase UUID
}

export interface SuggestedLink {
  id:             string;   // note_links UUID (Supabase)
  linkedNoteId:   string;   // target note Supabase UUID
  linkedTitle:    string;
  similarity:     number;
  confirmed:      boolean | null;  // null=pending, true=yes, false=no
}

export interface ReminderItem {
  id:           string;   // Supabase reminders UUID
  type:         string;   // task|appointment|routine|followup|greeting|system
  title:        string;
  message?:     string;
  remind_at:    string;   // ISO 8601
  repeat_rule?: string | null;
  status:       string;   // pending|sent|done|snoozed|cancelled
}

export interface AudioRecord {
  id: string;
  blob: Blob;
  recordingType: string;
  durationSeconds: number;
  createdAt: Date;
  // AI fields (populated after processing)
  aiStatus?: 'processing' | 'done' | 'error';
  aiError?: string;
  noteId?: string;        // Supabase notes.id
  transcript?: string;
  detectedType?: string;
  title?: string;
  summary?: string;
  keyPoints?: string[];
  actions?: string[];
  hashtags?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
  // Phase 3
  structuredTags?: StructuredTag[];
  suggestedLinks?: SuggestedLink[];
  // Phase 5
  reminders?: ReminderItem[];
  // Extra: cloud backup
  hasCloudBackup?: boolean;
  cloudAudioUrl?:  string;
}

interface TanNoteDB extends DBSchema {
  audioRecordings: {
    key: string;
    value: AudioRecord;
    indexes: { 'by-created': Date };
  };
}

let dbPromise: Promise<IDBPDatabase<TanNoteDB>> | null = null;

function getDB(): Promise<IDBPDatabase<TanNoteDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TanNoteDB>('tannote', 1, {
      upgrade(db) {
        const store = db.createObjectStore('audioRecordings', { keyPath: 'id' });
        store.createIndex('by-created', 'createdAt');
      },
    });
  }
  return dbPromise;
}

export async function saveAudio(record: AudioRecord): Promise<void> {
  const db = await getDB();
  await db.put('audioRecordings', record);
}

export async function getAudio(id: string): Promise<AudioRecord | undefined> {
  const db = await getDB();
  return db.get('audioRecordings', id);
}

export async function updateAudioRecord(
  id: string,
  patch: Partial<Omit<AudioRecord, 'id' | 'blob' | 'createdAt'>>,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('audioRecordings', id);
  if (!existing) throw new Error(`Record ${id} not found`);
  await db.put('audioRecordings', { ...existing, ...patch });
}

export async function deleteAudio(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('audioRecordings', id);
}

export async function listAudioRecordings(): Promise<AudioRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('audioRecordings', 'by-created');
}
