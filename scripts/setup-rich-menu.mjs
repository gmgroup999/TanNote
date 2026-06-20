/**
 * TanNote Rich Menu Setup
 *
 * สร้าง LINE Rich Menu 1 ปุ่ม — กดที่ไหนก็เปิด TanNote ทันที
 * ภาพ: โลโก้ TanNote (ไมค์ + REC + TanNote) บนพื้นแดง
 *
 * Usage:
 *   node scripts/setup-rich-menu.mjs <LINE_CHANNEL_ACCESS_TOKEN>
 *
 * ครั้งแรก ต้อง install Chromium ก่อน:
 *   cd app && npx playwright install chromium
 */

import { writeFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/setup-rich-menu.mjs <LINE_CHANNEL_ACCESS_TOKEN>');
  console.error('Token: LINE Developer Console → Messaging API → Channel access token');
  process.exit(1);
}

const LIFF_URL = 'https://liff.line.me/2010157477-I2NTp3zI';

// ─── Rich Menu: 1 ปุ่มเดียวครอบทั้งหมด ────────────────────────────────────────
const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'TanNote',
  chatBarText: 'TanNote',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: 'uri', label: 'เปิด TanNote', uri: LIFF_URL },
    },
  ],
};

// ─── Rich Menu HTML — โลโก้ TanNote กึ่งกลาง ─────────────────────────────────
const RICH_MENU_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@700;800&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:2500px;height:843px;overflow:hidden}
body{
  background:#E24B4A;
  display:flex;
  align-items:center;
  justify-content:center;
}
.logo{
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:22px;
}
svg{
  width:340px;height:340px;
  stroke:white;fill:none;
  stroke-width:1.8;
  stroke-linecap:round;stroke-linejoin:round;
}
.rec{
  display:flex;align-items:center;gap:16px;
}
.rec-dot{
  width:26px;height:26px;
  background:white;
  border-radius:50%;
}
.rec-text{
  font-family:'Noto Sans Thai','Tahoma',system-ui,sans-serif;
  font-size:68px;font-weight:700;
  color:white;letter-spacing:6px;
}
.brand{
  font-family:'Noto Sans Thai','Tahoma',system-ui,sans-serif;
  font-size:168px;font-weight:800;
  color:white;letter-spacing:-3px;
  line-height:1;
}
</style>
</head>
<body>
  <div class="logo">
    <svg viewBox="0 0 24 24">
      <path d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"/>
    </svg>
    <div class="rec">
      <span class="rec-dot"></span>
      <span class="rec-text">REC</span>
    </div>
    <div class="brand">TanNote</div>
  </div>
</body>
</html>`;

// ─── Generate PNG via Playwright ──────────────────────────────────────────────
async function generateImage() {
  const playwrightPath = join(__dirname, '..', 'app', 'node_modules', 'playwright', 'index.js');
  const playwrightUrl = pathToFileURL(playwrightPath).href;
  let chromium;
  try {
    const pw = await import(playwrightUrl);
    chromium = pw.chromium ?? pw.default?.chromium;
    if (!chromium) throw new Error('chromium not found in module exports');
  } catch (err) {
    console.error('❌ Playwright ไม่พบ — รัน: cd app && npx playwright install chromium');
    console.error(err.message);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 2500, height: 843 });

  // รอโหลด Google Font — ถ้า timeout ใช้ system font แทน
  try {
    await page.setContent(RICH_MENU_HTML, { waitUntil: 'networkidle', timeout: 12000 });
  } catch {
    await page.setContent(RICH_MENU_HTML, { waitUntil: 'domcontentloaded' });
  }

  const buf = await page.screenshot({ type: 'png' });
  await browser.close();
  return buf;
}

// ─── LINE API ─────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(`https://api.line.me/v2/bot${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const IMG_PATH = join(__dirname, 'tannote-rich-menu.png');

async function run() {
  console.log('1. สร้าง Rich Menu (1 ปุ่ม)...');
  const created = await api('POST', '/richmenu', richMenu);
  if (!created.richMenuId) { console.error('Failed:', created); process.exit(1); }
  const menuId = created.richMenuId;
  console.log('   richMenuId:', menuId);

  console.log('2. Generate image...');
  const png = await generateImage();
  writeFileSync(IMG_PATH, png);
  console.log('   Saved →', IMG_PATH);

  console.log('3. Upload image...');
  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${menuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'image/png' },
    body: png,
  });
  if (!imgRes.ok) { console.error('Upload failed:', await imgRes.text()); process.exit(1); }
  console.log('   Uploaded ✓');

  console.log('4. Set as default for all users...');
  await api('POST', `/user/all/richmenu/${menuId}`);
  console.log('   Set ✓');

  console.log('\n✅ เสร็จแล้ว! กดที่ rich menu ใน LINE → เปิด TanNote ทันที');
  console.log('   richMenuId:', menuId);
}

run().catch(console.error);
