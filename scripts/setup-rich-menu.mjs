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
import { writeFileSync, readFileSync } from 'fs';

function u32be(n) {
  return [(n >>> 24)&0xff,(n >>> 16)&0xff,(n >>> 8)&0xff,n&0xff];
}
function crc32(buf) {
  const T = (() => {
    const t = new Uint32Array(256);
    for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c;}
    return t;
  })();
  let c=0xffffffff;
  for (const b of buf) c=T[(c^b)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function adler32(buf){let s1=1,s2=0;for(const b of buf){s1=(s1+b)%65521;s2=(s2+s1)%65521;}return(s2<<16)|s1;}
function chunk(type,data){
  const tb=[...type].map(c=>c.charCodeAt(0));
  const crcIn=new Uint8Array([...tb,...data]);
  return [...u32be(data.length),...tb,...data,...u32be(crc32(crcIn))];
}
function deflateStore(data){
  const r=[];let o=0;
  while(o<data.length){
    const ch=data.slice(o,o+65535);const last=o+ch.length>=data.length?1:0;
    r.push(last,ch.length&0xff,(ch.length>>8)&0xff,(~ch.length)&0xff,((~ch.length)>>8)&0xff,...ch);
    o+=ch.length;
  }
  return new Uint8Array([0x78,0x01,...r,...u32be(adler32(data))]);
}

function makeBgPng() {
  const W=2500, H=843;
  const raw=[];
  for(let y=0;y<H;y++){
    raw.push(0); // filter none
    for(let x=0;x<W;x++){
      // Left half: red bg
      const isLeft = x < W/2;
      if(isLeft){ raw.push(0xe2,0x4b,0x4a,0xff); }
      else       { raw.push(0x25,0x25,0x27,0xff); }
    }
  }
  // Divider line
  const d=deflateStore(new Uint8Array(raw));
  const ihdr=chunk('IHDR',[...u32be(W),...u32be(H),8,6,0,0,0]);
  const idat=chunk('IDAT',Array.from(d));
  const iend=chunk('IEND',[]);
  return new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,...ihdr,...idat,...iend]);
}

const IMG_PATH = '/tmp/tannote-rich-menu.png';

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
