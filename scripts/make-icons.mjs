// Renders the Hailey mark (an open halo ring with a warm point of light) to PNG icons.
// Pure Node — no image libraries. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const TEAL = [15, 95, 88];
const AMBER = [242, 182, 90];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Returns [r,g,b,a] for a point in unit space (0..1). */
function shade(x, y, { maskable, badge }) {
  const s = maskable ? 0.78 : 1; // keep the mark inside the maskable safe zone
  const u = (x - 0.5) / s + 0.5;
  const v = (y - 0.5) / s + 0.5;
  // Background: rounded square (or full bleed for maskable)
  let bg = 1;
  if (!maskable && !badge) {
    const r = 0.22, dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    bg = Math.hypot(dx, dy) <= r ? 1 : 0;
  }
  if (badge) bg = 0;
  const cx = 0.5, cy = 0.53, R = 0.25, W = 0.085;
  const d = Math.hypot(u - cx, v - cy);
  const ang = Math.atan2(v - cy, u - cx) * 180 / Math.PI; // -180..180, y down
  const inGap = ang > -78 && ang < -12;
  const ring = Math.abs(d - R) <= W / 2 && !inGap;
  const a = -45 * Math.PI / 180;
  const dot = Math.hypot(u - (cx + R * Math.cos(a)), v - (cy + R * Math.sin(a))) <= 0.062;
  if (dot) return badge ? [...WHITE, 255] : [...AMBER, 255];
  if (ring) return [...WHITE, 255];
  return bg ? [...TEAL, 255] : [0, 0, 0, 0];
}

function render(size, opts = {}) {
  const ss = 4;
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, opts);
        r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; al += c[3];
      }
      const i = (py * size + px) * 4;
      out[i] = al ? Math.round(r / al) : 0;
      out[i + 1] = al ? Math.round(g / al) : 0;
      out[i + 2] = al ? Math.round(b / al) : 0;
      out[i + 3] = Math.round(al / (ss * ss));
    }
  }
  return png(size, out);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192));
writeFileSync('public/icons/icon-512.png', render(512));
writeFileSync('public/icons/maskable-512.png', render(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', render(180, { maskable: true }));
writeFileSync('public/icons/badge-96.png', render(96, { badge: true }));
writeFileSync('public/icons/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#0f5f58"/>
<path d="M ${32 + 16 * Math.cos(-12 * Math.PI / 180)} ${34 + 16 * Math.sin(-12 * Math.PI / 180)} A 16 16 0 1 1 ${32 + 16 * Math.cos(-78 * Math.PI / 180)} ${34 + 16 * Math.sin(-78 * Math.PI / 180)}" fill="none" stroke="#fff" stroke-width="5.4" stroke-linecap="butt"/>
<circle cx="${32 + 16 * Math.cos(-Math.PI / 4)}" cy="${34 + 16 * Math.sin(-Math.PI / 4)}" r="4" fill="#f2b65a"/></svg>\n`);
console.log('Icons written to public/icons');
