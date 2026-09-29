import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createMascotFrames } from '../src/avatar/mascot.ts';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function render(size: number, scale: number, background: string): Uint8Array {
  const frame = createMascotFrames().happy;
  const out = new Uint8Array(size * size * 4);
  const [br, bg, bb] = rgb(background);
  const offset = Math.floor((size - 32 * scale) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = Math.floor((x - offset) / scale);
      const fy = Math.floor((y - offset) / scale);
      const color = fx >= 0 && fy >= 0 && fx < 32 && fy < 32 ? frame[fy * 32 + fx] : null;
      const [r, g, b] = color ? rgb(color) : [br, bg, bb];
      out.set([r, g, b, 255], (y * size + x) * 4);
    }
  }
  return out;
}

mkdirSync('public/icons', { recursive: true });
const BG = '#29366f';
for (const [name, size, scale] of [
  ['icon-192.png', 192, 5],
  ['icon-512.png', 512, 14],
  ['apple-touch-icon.png', 180, 5],
  ['favicon.png', 64, 2],
] as const) {
  writeFileSync(`public/icons/${name}`, png(size, render(size, scale, BG)));
  console.log(`wrote public/icons/${name}`);
}
