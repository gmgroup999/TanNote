/**
 * TanNote Rich Menu Setup
 * Usage: node scripts/setup-rich-menu.mjs <LINE_CHANNEL_ACCESS_TOKEN>
 *
 * Creates a simple 2-button rich menu:
 *   [🎙️ บันทึกเสียง] [📋 รายการบันทึก]
 */

const TOKEN = process.argv[2];
if (!TOKEN) {
  console.error('Usage: node scripts/setup-rich-menu.mjs <LINE_CHANNEL_ACCESS_TOKEN>');
  console.error('Token อยู่ที่: LINE Developer Console → Messaging API → Channel access token');
  process.exit(1);
}

const LIFF_URL = 'https://liff.line.me/2010157477-I2NTp3zI';

const richMenu = {
  size:      { width: 2500, height: 843 },
  selected:  true,
  name:      'TanNote Menu',
  chatBarText: 'TanNote',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 1250, height: 843 },
      action: { type: 'uri', label: 'บันทึกเสียง', uri: `${LIFF_URL}?tab=record` },
    },
    {
      bounds: { x: 1250, y: 0, width: 1250, height: 843 },
      action: { type: 'uri', label: 'รายการบันทึก', uri: `${LIFF_URL}?tab=recordings` },
    },
  ],
};

async function api(method, path, body) {
  const res = await fetch(`https://api.line.me/v2/bot${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

// ─── Generate simple background image (2500×843 PNG) ─────────────────────────
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function u32be(n) {
  const b = Buffer.alloc(4); b.writeUInt32BE(n); return b;
}
function crc32(buf) {
  const T = new Uint32Array(256);
  for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;T[n]=c;}
  let c=0xffffffff;
  for (const b of buf) c=T[(c^b)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function chunk(type, data) {
  const tBuf = Buffer.from(type, 'ascii');
  const dBuf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tBuf, dBuf])));
  const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(dBuf.length);
  return Buffer.concat([lenBuf, tBuf, dBuf, crcBuf]);
}

function makeBgPng() {
  const W=2500, H=843;
  // Build raw scanlines: filter byte (0) + RGB pixels
  const scanline = Buffer.alloc(1 + W * 3);
  const rows = [];
  for (let y=0; y<H; y++) {
    const row = Buffer.alloc(1 + W * 3);
    // filter = none
    for (let x=0; x<W; x++) {
      const off = 1 + x * 3;
      if (x < W/2) { row[off]=0xe2; row[off+1]=0x4b; row[off+2]=0x4a; } // red
      else         { row[off]=0x25; row[off+1]=0x25; row[off+2]=0x27; } // dark
    }
    rows.push(row);
  }
  const raw = Buffer.concat(rows);
  const compressed = deflateSync(raw, { level: 9 });

  const sig   = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const ihdr  = chunk('IHDR', Buffer.concat([u32be(W), u32be(H), Buffer.from([8,2,0,0,0])]));
  const idat  = chunk('IDAT', compressed);
  const iend  = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const IMG_PATH = join(__dirname, 'tannote-rich-menu.png');

async function run() {
  console.log('1. สร้าง Rich Menu...');
  const created = await api('POST', '/richmenu', richMenu);
  if (!created.richMenuId) {
    console.error('Failed:', created);
    process.exit(1);
  }
  const menuId = created.richMenuId;
  console.log('   richMenuId:', menuId);

  console.log('2. สร้างและอัปโหลด background image...');
  const png = makeBgPng();
  writeFileSync(IMG_PATH, png);

  const imgRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${menuId}/content`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type':  'image/png',
    },
    body: png,
  });
  const imgBody = await imgRes.text();
  if (!imgRes.ok) { console.error('Image upload failed:', imgBody); process.exit(1); }
  console.log('   Image uploaded ✓');

  console.log('3. ตั้งเป็น Default Rich Menu...');
  const setDefault = await api('POST', `/user/all/richmenu/${menuId}`);
  console.log('   Default set ✓', setDefault);

  console.log('\n✅ Rich Menu พร้อมใช้งานแล้ว!');
  console.log('   ผู้ใช้ทุกคนจะเห็นเมนูด้านล่างใน LINE chat');
  console.log('   richMenuId:', menuId);
}

run().catch(console.error);
