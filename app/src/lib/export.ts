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

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
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

function safeFilename(title: string | undefined, ext: string): string {
  const base = (title ?? 'tannote')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return `${base}.${ext}`;
}

export function exportMarkdown(record: AudioRecord) {
  downloadBlob(buildMarkdown(record), safeFilename(record.title, 'md'), 'text/markdown');
}

export function exportText(record: AudioRecord) {
  downloadBlob(buildPlainText(record), safeFilename(record.title, 'txt'), 'text/plain');
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

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 300);
}
