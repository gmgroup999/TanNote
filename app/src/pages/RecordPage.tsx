import { useCallback, useEffect, useRef, useState } from 'react';
import { saveAudio, updateAudioRecord, type AudioRecord } from '../lib/db';
import {
  RECORDING_TYPE_ORDER,
  RECORDING_TYPES,
  type RecordingTypeKey,
} from '../config/recordingTypes';
import { transcribeAudio } from '../lib/api';

type RecordingState = 'idle' | 'recording' | 'saving';
type AiStep = 'uploading' | 'processing' | 'done' | 'error';

const AI_STEP_LABEL: Partial<Record<AiStep, string>> = {
  uploading:  'กำลังส่งไฟล์...',
  processing: 'กำลังประมวลผล...',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function RecordPage() {
  const [recordingType, setRecordingType] = useState<RecordingTypeKey>('auto');
  const [state, setState] = useState<RecordingState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [aiStep, setAiStep] = useState<AiStep | null>(null);
  const [storageWarning, setStorageWarning] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const lastBlobRef = useRef<Blob | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      releaseWakeLock();
    };
  }, []);

  // Check device storage
  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(({ quota = 0, usage = 0 }) => {
        const free = quota - usage;
        if (free < 50 * 1024 * 1024 || (quota > 0 && usage / quota > 0.85)) {
          setStorageWarning(true);
        }
      }).catch(() => {});
    }
  }, []);

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Wake Lock not critical — continue without it
    }
  }

  async function releaseWakeLock() {
    try {
      await wakeLockRef.current?.release();
      wakeLockRef.current = null;
    } catch {
      // ignore
    }
  }

  function startTimer() {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Prefer Opus at 32kbps; fall back to browser default if unsupported
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : '';

      const options: MediaRecorderOptions = mimeType
        ? { mimeType, audioBitsPerSecond: 32_000 }
        : { audioBitsPerSecond: 32_000 };

      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(1000); // collect chunks every 1 s
      mediaRecorderRef.current = recorder;

      await requestWakeLock();
      setState('recording');
      startTimer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ไม่สามารถเข้าถึงไมค์ได้';
      setError(`เกิดข้อผิดพลาด: ${msg}`);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    stopTimer();
    await releaseWakeLock();
    setState('saving');

    recorder.onstop = async () => {
      // Stop all mic tracks
      recorder.stream.getTracks().forEach((t) => t.stop());

      const mimeType = recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const durationSeconds = elapsed;

      const newId = generateId();
      lastBlobRef.current = blob;
      await saveAudio({
        id: newId,
        blob,
        recordingType,
        durationSeconds,
        createdAt: new Date(),
      });

      setSavedCount((n) => n + 1);
      setLastSavedId(newId);
      setElapsed(0);
      setState('idle');
    };

    recorder.stop();
    mediaRecorderRef.current = null;
  }, [elapsed, recordingType]);

  const handleButtonClick = () => {
    if (state === 'idle') startRecording();
    else if (state === 'recording') stopRecording();
  };

  async function runAiOnLast() {
    if (!lastSavedId || !lastBlobRef.current) return;
    setAiStep('uploading');
    try {
      // ส่งไป Edge Function — Gemini key อยู่ใน server เท่านั้น
      const tempRecord = {
        id: lastSavedId,
        blob: lastBlobRef.current,
        recordingType,
        durationSeconds: 0,
        createdAt: new Date(),
      };
      const result = await transcribeAudio(tempRecord, (step) => setAiStep(step));
      const patch: Partial<AudioRecord> = {
        aiStatus:     'done',
        transcript:   result.transcript,
        detectedType: result.detected_type,
        title:        result.title,
        summary:      result.summary,
        keyPoints:    result.key_points,
        actions:      result.action_items.map((a) => a.task),
        hashtags:     result.tags,
        sentiment:    result.sentiment,
      };
      await updateAudioRecord(lastSavedId, patch);
      setAiStep('done');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
      await updateAudioRecord(lastSavedId, { aiStatus: 'error', aiError: msg });
      setAiStep('error');
      setError(msg);
    }
  }

  const isRecording = state === 'recording';
  const isSaving = state === 'saving';

  return (
    <div className="min-h-svh flex flex-col items-center bg-[#FAFAF7] dark:bg-[#18181A]">
      {/* Header */}
      <header className="w-full max-w-md px-5 pt-10 pb-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
          ทันโน้ต
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
          กดปุ่มเดียว — ที่เหลือ AI จัดให้
        </p>
      </header>

      {/* Main card */}
      <main className="w-full max-w-md px-5 flex flex-col items-center gap-8 mt-4">
        {/* Recording type selector */}
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            ประเภทการบันทึก
          </label>
          <div className="relative">
            <select
              value={recordingType}
              onChange={(e) => setRecordingType(e.target.value as RecordingTypeKey)}
              disabled={isRecording || isSaving}
              className="w-full appearance-none rounded-xl border border-gray-200 dark:border-[#444448] bg-white dark:bg-[#252527] px-4 py-3 pr-10 text-base text-gray-900 dark:text-gray-100 shadow-sm focus:border-[#E24B4A] focus:outline-none focus:ring-2 focus:ring-[#E24B4A]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {RECORDING_TYPE_ORDER.map((key) => (
                <option key={key} value={key}>
                  {RECORDING_TYPES[key].label}
                </option>
              ))}
            </select>
            {/* Chevron */}
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400">
              ▾
            </span>
          </div>
          {recordingType === 'auto' && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-600">
              AI จะวิเคราะห์เนื้อหาและเลือกประเภทให้อัตโนมัติ
            </p>
          )}
        </div>

        {/* Timer */}
        <div className="flex flex-col items-center gap-2">
          <span
            className={`text-4xl font-mono font-semibold tabular-nums tracking-widest transition-colors ${
              isRecording ? 'text-[#E24B4A]' : 'text-gray-300 dark:text-gray-700'
            }`}
          >
            {formatDuration(elapsed)}
          </span>
          {isRecording && (
            <span className="flex items-center gap-1.5 text-sm text-[#E24B4A] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-[#E24B4A] inline-block" />
              กำลังบันทึก...
            </span>
          )}
          {isSaving && (
            <span className="text-sm text-gray-400 dark:text-gray-600">กำลังบันทึกไฟล์...</span>
          )}
        </div>

        {/* Record button */}
        <button
          onClick={handleButtonClick}
          disabled={isSaving}
          aria-label={isRecording ? 'หยุดบันทึก' : 'เริ่มบันทึก'}
          className={`
            w-24 h-24 rounded-full flex items-center justify-center
            shadow-lg active:scale-95 transition-all duration-150
            disabled:cursor-not-allowed disabled:opacity-50
            ${
              isRecording
                ? 'bg-[#E24B4A] ring-4 ring-[#E24B4A]/30 ring-offset-4 ring-offset-[#FAFAF7] dark:ring-offset-[#18181A]'
                : 'bg-[#E24B4A] hover:bg-[#C73B3A]'
            }
          `}
        >
          {isRecording ? (
            /* Stop icon */
            <span className="w-7 h-7 rounded-md bg-white" />
          ) : (
            /* Mic icon */
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
              />
            </svg>
          )}
        </button>

        {/* Privacy badge */}
        <div className="flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-2">
          <svg
            className="w-4 h-4 text-green-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
            />
          </svg>
          <span className="text-sm font-medium text-green-700">
            เสียงเก็บในเครื่องคุณเท่านั้น
          </span>
        </div>

        {/* Storage warning */}
        {storageWarning && (
          <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>พื้นที่เก็บข้อมูลในเครื่องใกล้เต็ม — ลบบันทึกเก่าออกเพื่อเพิ่มพื้นที่</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="w-full rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Post-recording: AI prompt */}
        {savedCount > 0 && state === 'idle' && lastSavedId && aiStep !== 'done' && (
          <div className="w-full rounded-xl bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#444448] shadow-sm px-4 py-4 flex flex-col gap-3">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">✅ บันทึกเสร็จแล้ว</p>
            {aiStep === null && (
              <button onClick={runAiOnLast}
                className="flex items-center justify-center gap-2 w-full rounded-xl py-2.5 text-sm font-medium bg-[#E24B4A] text-white hover:bg-[#C73B3A] transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                ถอดเสียง + วิเคราะห์ AI เดี๋ยวนี้
              </button>
            )}
            {(aiStep === 'uploading' || aiStep === 'processing') && (
              <div className="flex items-center gap-2.5 text-sm text-[#E24B4A]">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                {AI_STEP_LABEL[aiStep] ?? 'กำลังประมวลผล...'}
              </div>
            )}
            {aiStep === 'error' && (
              <p className="text-xs text-red-500">วิเคราะห์ไม่สำเร็จ — ลองได้ใหม่ที่หน้ารายการ</p>
            )}
          </div>
        )}

        {savedCount > 0 && state === 'idle' && aiStep === 'done' && (
          <div className="w-full rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            ✅ ถอดเสียงและวิเคราะห์เสร็จแล้ว — ดูผลได้ที่หน้ารายการ
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto pb-8 pt-12 text-center px-5">
        <p className="text-xs text-gray-400 dark:text-gray-600 leading-relaxed">
          เสียงจะถูกเก็บใน IndexedDB ของเบราว์เซอร์
          <br />
          ไม่มีการส่งเสียงขึ้นเซิร์ฟเวอร์
        </p>
      </footer>
    </div>
  );
}
