/**
 * Generates the PWA icons (PNG) without any image library: the same launcher grid as
 * public/favicon.svg — four rounded tiles on the UEL blue, the top-right one in the accent amber.
 * Run with `npm run icons`. Output goes to public/.
 *
 * Adapted from the generator in UELNikoStockManagement, which draws a barcode instead. The PNG
 * encoder below is unchanged; only the drawing differs.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

const BLUE = [0x0f, 0x4c, 0x81];
const WHITE = [255, 255, 255];
const AMBER = [0xf5, 0x9e, 0x0b];

// ---- tiny PNG encoder ----
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, pixelAt) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Is (x, y) inside a rounded rectangle from (x0, y0) to (x1, y1)? All in the same units. */
function inRoundedRect(x, y, x0, y0, x1, y1, radius) {
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return Math.hypot(x - cx, y - cy) <= radius;
}

// The four tiles, in unit coordinates, matching public/favicon.svg exactly: its 32-unit viewBox
// puts them at 7 and 17 with a side of 8 and a corner radius of 2.
const CELL = 8 / 32;
const CELL_RADIUS = 2 / 32;
const NEAR = 7 / 32;
const FAR = 17 / 32;
const CELLS = [
  { x: NEAR, y: NEAR, colour: WHITE },
  { x: FAR, y: NEAR, colour: AMBER }, // the accent tile, top right
  { x: NEAR, y: FAR, colour: WHITE },
  { x: FAR, y: FAR, colour: WHITE },
];

function makeIcon(size, { fullBleed }) {
  // A maskable icon is cropped to whatever shape the platform likes, so the glyph shrinks into the
  // safe zone and the background runs to the edges. A normal icon keeps its own rounded corners.
  const radius = fullBleed ? 0 : size * 0.18;
  const scale = fullBleed ? 0.72 : 0.92;
  const map = (u) => 0.5 + (u - 0.5) * scale;
  const S = 4; // supersampling, for smooth edges

  return encodePng(size, (x, y) => {
    let covered = 0;
    let r = 0;
    let g = 0;
    let b = 0;

    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const px = x + (sx + 0.5) / S;
        const py = y + (sy + 0.5) / S;
        if (!fullBleed && !inRoundedRect(px, py, 0, 0, size, size, radius)) continue;
        covered++;

        const u = px / size;
        const v = py / size;
        let colour = BLUE;
        for (const cell of CELLS) {
          if (
            inRoundedRect(
              u,
              v,
              map(cell.x),
              map(cell.y),
              map(cell.x + CELL),
              map(cell.y + CELL),
              CELL_RADIUS * scale,
            )
          ) {
            colour = cell.colour;
            break;
          }
        }
        r += colour[0];
        g += colour[1];
        b += colour[2];
      }
    }

    if (covered === 0) return [0, 0, 0, 0];
    return [
      Math.round(r / covered),
      Math.round(g / covered),
      Math.round(b / covered),
      Math.round((255 * covered) / (S * S)),
    ];
  });
}

const outputs = [
  [join(iconsDir, 'icon-192.png'), 192, { fullBleed: false }],
  [join(iconsDir, 'icon-512.png'), 512, { fullBleed: false }],
  [join(iconsDir, 'maskable-512.png'), 512, { fullBleed: true }],
  [join(publicDir, 'apple-touch-icon.png'), 180, { fullBleed: true }],
];
for (const [file, size, opts] of outputs) {
  writeFileSync(file, makeIcon(size, opts));
  console.log(`wrote ${file} (${size}px)`);
}
