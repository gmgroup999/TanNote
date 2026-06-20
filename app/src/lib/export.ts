import type { AudioRecord } from './db';
import { openExternalBrowser } from './liff';

function formatDateTH(d: Date) {
  return new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Bangkok',
  }).format(d);
}

function buildMarkdown(record: AudioRecord): string {
  const date = formatDateTH(new Date(record.createdAt));
  const type = record.detectedType ?? record.recordingType;
  const lines: string[] = [];

  lines.push(`# ${record.title ?? 'บันทึกเสียง'}`);
  lines.push('');
  lines.push(`**วันที่:** ${date}`);
  lines.push(`**ประเภท:** ${type}`);
  if (record.sentiment) lines.push(`**โทน:** ${record.sentiment}`);
  lines.push('');

  if (record.summary) {
    lines.push('## สรุป');
    lines.push(record.summary);
    lines.push('');
  }

  if (record.keyPoints?.length) {
    lines.push('## ประเด็นสำคัญ');
    record.keyPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  }

  if (record.actions?.length) {
    lines.push('## สิ่งที่ต้องทำ');
    record.actions.forEach((a) => lines.push(`- [ ] ${a}`));
    lines.push('');
  }

  if (record.structuredTags?.length) {
    lines.push('## แท็ก');
    const cats: Record<string, string[]> = {};
    record.structuredTags.forEach((t) => {
      (cats[t.type] = cats[t.type] ?? []).push(t.name);
    });
    Object.entries(cats).forEach(([cat, names]) => {
      lines.push(`**${cat}:** ${names.join(', ')}`);
    });
    lines.push('');
  }

  if (record.transcript) {
    lines.push('## Transcript');
    lines.push(record.transcript);
    lines.push('');
  }

  return lines.join('\n');
}

function buildPlainText(record: AudioRecord): string {
  const date = formatDateTH(new Date(record.createdAt));
  const type = record.detectedType ?? record.recordingType;
  const lines: string[] = [];

  lines.push(record.title ?? 'บันทึกเสียง');
  lines.push(`วันที่: ${date}  |  ประเภท: ${type}`);
  lines.push('─'.repeat(40));

  if (record.summary) {
    lines.push('');
    lines.push('สรุป:');
    lines.push(record.summary);
  }
  if (record.keyPoints?.length) {
    lines.push('');
    lines.push('ประเด็นสำคัญ:');
    record.keyPoints.forEach((p) => lines.push(`  • ${p}`));
  }
  if (record.actions?.length) {
    lines.push('');
    lines.push('สิ่งที่ต้องทำ:');
    record.actions.forEach((a) => lines.push(`  ☐ ${a}`));
  }
  if (record.transcript) {
    lines.push('');
    lines.push('Transcript:');
    lines.push(record.transcript);
  }

  return lines.join('\n');
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** True inside the LINE in-app browser (which has no file-download handler). */
function isLineInApp(): boolean {
  return typeof navigator !== 'undefined' && /\bLine\//i.test(navigator.userAgent);
}

/** UTF-8 → base64 (chunked to avoid call-stack limits on large content). */
function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(bin);
}

// Conservative cap on the base64 length we put in the handoff URL. Beyond this
// we fall back to the copy overlay (the URL may be truncated on the LINE→browser
// handoff). Typical notes are a few KB; this covers very long transcripts too.
const URL_PAYLOAD_LIMIT = 120000;

/**
 * Hand the content to the external system browser for a REAL download. Inside
 * LINE this uses liff.openWindow({external:true}); a tiny static page
 * (/download.html) reads the content from the URL fragment (never sent to the
 * server) and triggers the actual file download / PDF print there.
 * @returns false if the payload is too large for a URL (caller should fall back).
 */
function externalDownload(content: string, filename: string, kind: 'txt' | 'md' | 'html' | 'pdf'): boolean {
  const b64 = toBase64(content);
  if (b64.length > URL_PAYLOAD_LIMIT) return false;
  const url = `${window.location.origin}/download.html#t=${kind}` +
    `&n=${encodeURIComponent(filename)}&d=${encodeURIComponent(b64)}`;
  // Inside LINE → open the system browser via the LIFF API. If that isn't
  // available (not in the LINE client), a normal navigation works in a real browser.
  if (openExternalBrowser(url)) return true;
  window.location.href = url;
  return true;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Last-resort, never-silent fallback for in-app WebViews (notably LINE on
 * Android) where navigator.share is missing, clipboard is blocked, and
 * `<a download>` is ignored — so every other path fails without feedback.
 * Shows the content in a selectable textarea with a one-tap copy button and a
 * hint to open an external browser for a real file download.
 */
function showContentOverlay(content: string, filename: string, note?: string) {
  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '99999',
    background: 'rgba(0,0,0,0.6)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '16px',
  } as CSSStyleDeclaration);

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    background: '#1E1E20', color: '#fff', borderRadius: '16px',
    width: '100%', maxWidth: '520px', maxHeight: '85vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
  } as CSSStyleDeclaration);

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #333336',
  } as CSSStyleDeclaration);
  const title = document.createElement('span');
  title.textContent = filename;
  Object.assign(title.style, { fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSStyleDeclaration);
  const closeX = document.createElement('button');
  closeX.textContent = '✕';
  Object.assign(closeX.style, { background: 'none', border: 'none', color: '#aaa', fontSize: '18px', cursor: 'pointer', padding: '0 4px' } as CSSStyleDeclaration);
  header.append(title, closeX);

  const ta = document.createElement('textarea');
  ta.value = content;
  ta.readOnly = true;
  Object.assign(ta.style, {
    flex: '1', margin: '12px 16px 0', padding: '10px', minHeight: '160px',
    background: '#252527', color: '#eee', border: '1px solid #333336',
    borderRadius: '10px', fontSize: '12px', lineHeight: '1.6', resize: 'none',
    fontFamily: 'inherit',
  } as CSSStyleDeclaration);

  const hint = document.createElement('p');
  hint.textContent = note ?? 'แตะ "คัดลอกทั้งหมด" แล้ววางในแอปอื่นได้เลย • อยากได้ไฟล์จริง: เมนู ⋮ ของ LINE → เปิดในเบราว์เซอร์ แล้วกด export อีกครั้ง';
  Object.assign(hint.style, { fontSize: '11px', color: '#999', margin: '8px 16px', lineHeight: '1.5' } as CSSStyleDeclaration);

  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'คัดลอกทั้งหมด';
  Object.assign(copyBtn.style, {
    margin: '0 16px 16px', padding: '12px', background: '#E24B4A', color: '#fff',
    border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
  } as CSSStyleDeclaration);

  const close = () => { if (overlay.parentNode) document.body.removeChild(overlay); };
  closeX.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  copyBtn.onclick = async () => {
    ta.focus(); ta.select();
    const ok = await copyToClipboard(content);
    copyBtn.textContent = ok ? 'คัดลอกแล้ว ✓' : 'เลือกข้อความแล้วคัดลอกเอง';
    if (ok) setTimeout(close, 700);
  };

  panel.append(header, ta, hint, copyBtn);
  overlay.append(panel);
  document.body.appendChild(overlay);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Save/export generated content across environments:
 *   • Desktop + normal mobile browsers → direct file download (`<a download>`).
 *   • LINE in-app browser (no download handler) → hand off to the external
 *     browser via /download.html for a real file download. If the payload is too
 *     large for a URL, fall back to the in-app copy overlay.
 */
function saveOrShare(content: string, filename: string, mime: string) {
  const kind: 'txt' | 'md' | 'html' =
    mime.includes('markdown') ? 'md' : mime.includes('html') ? 'html' : 'txt';

  // LINE in-app browser can't download — bounce to the external browser.
  if (isLineInApp()) {
    if (externalDownload(content, filename, kind)) return;
    showContentOverlay(content, filename); // payload too large for URL
    return;
  }

  // Desktop and normal mobile browsers support <a download> directly.
  downloadBlob(new Blob([content], { type: mime }), filename);
}

function safeFilename(title: string | undefined, ext: string): string {
  const base = (title ?? 'tannote')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${base}.${ext}`;
}

export function exportMarkdown(record: AudioRecord) {
  return saveOrShare(buildMarkdown(record), safeFilename(record.title, 'md'), 'text/markdown');
}

export function exportText(record: AudioRecord) {
  return saveOrShare(buildPlainText(record), safeFilename(record.title, 'txt'), 'text/plain');
}

export function exportPdf(record: AudioRecord) {
  const md = buildMarkdown(record);
  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<title>${record.title ?? 'TanNote'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600&display=swap');
  body { font-family: 'IBM Plex Sans Thai', sans-serif; font-size: 13px; color: #1a1a1a; max-width: 680px; margin: 40px auto; line-height: 1.7; }
  h1 { font-size: 20px; font-weight: 600; border-bottom: 2px solid #E24B4A; padding-bottom: 6px; }
  h2 { font-size: 14px; font-weight: 600; margin-top: 20px; color: #E24B4A; }
  p, li { margin: 4px 0; }
  pre { background: #f5f5f5; border-radius: 8px; padding: 12px; font-size: 12px; white-space: pre-wrap; word-break: break-word; }
  .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
</style>
</head>
<body>
${md
  .split('\n')
  .map((line) => {
    if (line.startsWith('# ')) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith('## ')) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith('**') && line.endsWith('**')) return `<p class="meta">${line.replace(/\*\*/g, '')}</p>`;
    if (line.startsWith('- [ ] ')) return `<li>☐ ${line.slice(6)}</li>`;
    if (line.startsWith('- ')) return `<li>${line.slice(2)}</li>`;
    if (line === '') return '<br>';
    return `<p>${line}</p>`;
  })
  .join('\n')}
</body>
</html>`;

  // LINE in-app browser can't print/download — hand the styled HTML to the
  // external browser, where /download.html opens the print dialog (→ Save as PDF).
  if (isLineInApp()) {
    if (externalDownload(html, safeFilename(record.title, 'pdf'), 'pdf')) return;
    showContentOverlay(md, safeFilename(record.title, 'txt'),
      'เปิดเบราว์เซอร์ภายนอกไม่สำเร็จ — คัดลอกข้อความได้เลย หรือเปิดในเบราว์เซอร์ภายนอกแล้วกด PDF อีกครั้ง');
    return;
  }

  // Print via a hidden iframe instead of window.open: popup blockers and
  // mobile WebViews return null from window.open, making the PDF button do
  // nothing. The iframe approach prints (→ "Save as PDF") on desktop and
  // Android Chrome. On WebViews without print support, fall back to sharing
  // the HTML file so the user still gets the content.
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 1000);
  };

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow;
      if (!win || typeof win.print !== 'function') throw new Error('no print');
      win.focus();
      win.print();
      cleanup();
    } catch {
      cleanup();
      pdfFallback();
    }
  };

  const pdfFallback = () => {
    if (isMobile()) {
      showContentOverlay(
        md,
        safeFilename(record.title, 'txt'),
        'เบราว์เซอร์ในแอป LINE บันทึก PDF ไม่ได้ • คัดลอกข้อความได้เลย หรือเปิดในเบราว์เซอร์ภายนอก (เมนู ⋮ → เปิดในเบราว์เซอร์) แล้วกด PDF เพื่อสั่งพิมพ์ → บันทึกเป็น PDF',
      );
    } else {
      downloadBlob(new Blob([html], { type: 'text/html' }), safeFilename(record.title, 'html'));
    }
  };

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  } else {
    document.body.removeChild(iframe);
    pdfFallback();
  }
}
