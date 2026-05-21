import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(400);

// Seed recordings into IndexedDB
await page.evaluate(async () => {
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('tannote', 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('audioRecordings')) {
        const s = db.createObjectStore('audioRecordings', { keyPath: 'id' });
        s.createIndex('by-created', 'createdAt');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const blob = new Blob([new Uint8Array(80000)], { type: 'audio/webm' });
      const tx = db.transaction('audioRecordings', 'readwrite');
      const store = tx.objectStore('audioRecordings');
      // One processed (done), one pending
      store.put({
        id: 'p2-001', blob, recordingType: 'meeting', durationSeconds: 184,
        createdAt: new Date('2026-05-20T19:00:00'),
        aiStatus: 'done', title: 'ประชุมวางแผน Q3',
        detectedType: 'meeting',
        summary: 'ทีมหารือเป้าหมาย Q3 ครอบคลุมงบ การตลาด และ timeline',
        keyPoints: ['ตั้งเป้า 2M บาท', 'เปิดตัว feature ก.ค.'],
        actions: ['ส่ง budget ให้ CFO ภายในศุกร์'],
        hashtags: ['#ประชุม', '#Q3Planning', '#แผนงาน'],
        sentiment: 'positive',
        transcript: 'ผู้พูด 1: เริ่มประชุมเลยนะครับ วันนี้เรามาคุยเรื่องเป้าหมาย Q3...',
      });
      store.put({
        id: 'p2-002', blob, recordingType: 'auto', durationSeconds: 90,
        createdAt: new Date('2026-05-20T18:30:00'),
      });
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
});

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// Record page
await page.screenshot({ path: 'p2-record.png' });
console.log('SS1: Record page');

// Recordings list
await page.getByRole('button', { name: 'รายการ' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: 'p2-list.png', fullPage: false });
console.log('SS2: Recordings list (1 done, 1 pending)');

// Verify AI button text changed
const aiBtn = await page.locator('button:has-text("ถอดเสียง + วิเคราะห์ AI")').count();
const batchBtn = await page.locator('button:has-text("ถอดเสียง + วิเคราะห์ทั้งหมด")').count();
const title = await page.locator('text=ประชุมวางแผน Q3').count();
const tags = await page.locator('text=#ประชุม').count();
console.log(`AI btn: ${aiBtn} | Batch: ${batchBtn} | Title: ${title} | Tags: ${tags}`);

await browser.close();
