// Draws the TrichFree icon (a sage circle with a soft inner ring and a small leaf-like pause mark) as PNGs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x supersampling for smooth edges
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
        for (let i = 0; i < 4; i++) acc[i] += p[i] / 16;
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // un-premultiply
      const a = acc[3];
      raw[o] = a ? Math.round(acc[0] / a) : 0; raw[o + 1] = a ? Math.round(acc[1] / a) : 0; raw[o + 2] = a ? Math.round(acc[2] / a) : 0; raw[o + 3] = Math.round(a * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const SAGE = [63, 143, 107], CREAM = [247, 245, 240];
function icon(u, v) {
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy);
  if (r > 0.48) return [0, 0, 0, 0];
  // two rounded pause bars in cream
  const bar = (cx) => Math.abs(u - cx) < 0.055 && Math.abs(v - 0.5) < 0.17;
  const cap = (cx) => Math.hypot(u - cx, Math.abs(v - 0.5) - 0.17) < 0.055;
  if (bar(0.41) || bar(0.59) || cap(0.41) || cap(0.59)) return [...CREAM, 1];
  const ring = r > 0.36 && r < 0.4;
  const col = ring ? SAGE.map((c) => Math.min(255, c + 40)) : SAGE;
  return [...col, 1];
}
mkdirSync('public/icons', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`public/icons/${s}.png`, png(s, icon));
console.log('[make-icons] wrote public/icons/{16,32,48,128}.png');
