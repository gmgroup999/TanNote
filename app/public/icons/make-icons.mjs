/**
 * Generates TanNote PWA icons as PNG using pure Node.js (no dependencies).
 * Usage: node make-icons.mjs
 * Output: icon-192.png, icon-512.png, icon-maskable-192.png, icon-maskable-512.png
 */

import { writeFileSync } from 'fs';

const CRC_TABLE = buildCrcTable();

function buildCrcTable() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf) {
  let s1 = 1, s2 = 0;
  for (const b of buf) { s1 = (s1 + b) % 65521; s2 = (s2 + s1) % 65521; }
  return (s2 << 16) | s1;
}

function u32be(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type, data) {
  const typeBytes = [...type].map(c => c.charCodeAt(0));
  const len = u32be(data.length);
  const crcInput = new Uint8Array([...typeBytes, ...data]);
  const crc = u32be(crc32(crcInput));
  return [...len, ...typeBytes, ...data, ...crc];
}

function deflateStore(data) {
  const result = [];
  let offset = 0;
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + 65535);
    const last = offset + chunk.length >= data.length ? 1 : 0;
    result.push(last, chunk.length & 0xff, (chunk.length >> 8) & 0xff,
      (~chunk.length) & 0xff, ((~chunk.length) >> 8) & 0xff, ...chunk);
    offset += chunk.length;
  }
  const a = adler32(data);
  const deflated = new Uint8Array([0x78, 0x01, ...result, ...u32be(a)]);
  return deflated;
}

function makePng(size, r, g, b, radius) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const rad = radius; // corner radius
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inRect = inRoundRect(x, y, 0, 0, size, size, rad);
      if (inRect) {
        pixels[i]   = r;
        pixels[i+1] = g;
        pixels[i+2] = b;
        pixels[i+3] = 255;
      } else {
        pixels[i] = pixels[i+1] = pixels[i+2] = pixels[i+3] = 0;
      }
    }
  }

  // Draw "T" letter centered (white)
  const letterSize = Math.round(size * 0.48);
  const lx = Math.round(cx - letterSize * 0.29);
  const ly = Math.round(cy - letterSize * 0.5);
  drawLetter(pixels, size, lx, ly, letterSize, 255, 255, 255);

  // Build PNG
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter type: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rawData.push(pixels[i], pixels[i+1], pixels[i+2], pixels[i+3]);
    }
  }

  const deflated = deflateStore(new Uint8Array(rawData));
  const ihdr = chunk('IHDR', [
    ...u32be(size), ...u32be(size),
    8, 6, 0, 0, 0
  ]);
  const idat = chunk('IDAT', Array.from(deflated));
  const iend = chunk('IEND', []);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...ihdr, ...idat, ...iend
  ]);
}

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const corners = [
    [x + r, y + r], [x + w - r, y + r],
    [x + r, y + h - r], [x + w - r, y + h - r]
  ];
  if (px < x + r && py < y + r)       return dist(px, py, corners[0]) <= r;
  if (px >= x + w - r && py < y + r)  return dist(px, py, corners[1]) <= r;
  if (px < x + r && py >= y + h - r)  return dist(px, py, corners[2]) <= r;
  if (px >= x + w - r && py >= y + h - r) return dist(px, py, corners[3]) <= r;
  return true;
}

function dist(x, y, [cx, cy]) {
  return Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
}

function setPixel(pixels, size, x, y, r, g, b) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  pixels[i] = r; pixels[i+1] = g; pixels[i+2] = b; pixels[i+3] = 255;
}

function fillRect(pixels, size, x, y, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      setPixel(pixels, size, x + dx, y + dy, r, g, b);
}

function drawLetter(pixels, size, ox, oy, ls, r, g, b) {
  // Draw "T": horizontal bar on top + vertical stem
  const thick = Math.max(2, Math.round(ls * 0.14));
  const barW  = Math.round(ls * 0.58);
  const stemW = thick;
  const barH  = thick;
  const stemH = Math.round(ls * 0.66);

  const barX = ox;
  const barY = oy;
  const stemX = ox + Math.round((barW - stemW) / 2);
  const stemY = oy + barH;

  fillRect(pixels, size, barX, barY, barW, barH, r, g, b);
  fillRect(pixels, size, stemX, stemY, stemW, stemH, r, g, b);
}

// ─── Generate icons ─────────────────────────────────────────────────────────

const RED   = [0xe2, 0x4b, 0x4a]; // #E24B4A brand red
const sizes = [192, 512];

for (const s of sizes) {
  const radius = Math.round(s * 0.20);  // ~20% corner radius for regular icons
  const mRadius = Math.round(s * 0.10); // 10% for maskable (Android clips a circle anyway)

  writeFileSync(`icon-${s}.png`,             makePng(s, ...RED, radius));
  writeFileSync(`icon-maskable-${s}.png`,    makePng(s, ...RED, mRadius));
  console.log(`✓ icon-${s}.png  icon-maskable-${s}.png`);
}

console.log('Done!');
