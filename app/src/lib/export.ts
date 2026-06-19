import type { AudioRecord } from './db';

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

/** True if the Web Share API can share this file (mobile/WebView path). */
function canShareFile(file: File): boolean {
  return isMobile() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
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
 * Save a generated file. On mobile / LINE in-app browser the `<a download>`
 * trick is ignored, so use the native share sheet (Web Share API) which lets
 * the user save or forward the file. Desktop keeps the direct download.
 */
async function saveOrShare(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const file = new File([blob], filename, { type: mime });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // User cancelled the share sheet — don't fall through to a download.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Any other failure: fall back to download below.
    }
  }
  downloadBlob(blob, filename);
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
      // WebView can't print — share the HTML file as a fallback.
      void saveOrShare(html, safeFilename(record.title, 'html'), 'text/html');
    }
  };

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
  } else {
    document.body.removeChild(iframe);
    void saveOrShare(html, safeFilename(record.title, 'html'), 'text/html');
  }
}
