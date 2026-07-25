import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

function crc32(buf) {
  let table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crcBuf]);
}

function createPNG(width, height, r, g, b, r2, g2, b2) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk('IHDR', ihdrData);

  // Build raw image: filter byte (0) + RGB pixels per row
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // filter: None
    const t = height > 1 ? y / (height - 1) : 0; // gradient factor 0..1
    const cr = Math.round(r + (r2 - r) * t);
    const cg = Math.round(g + (g2 - g) * t);
    const cb = Math.round(b + (b2 - b) * t);
    for (let x = 0; x < width; x++) {
      const px = rowOffset + 1 + x * 3;
      rawData[px] = cr;
      rawData[px + 1] = cg;
      rawData[px + 2] = cb;
    }
  }

  const compressed = deflateSync(rawData, { level: 9 });
  const idat = chunk('IDAT', compressed);
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Green gradient: #10b981 (16,185,129) -> #059669 (5,150,105)
const configs = [
  { name: 'icon-128.png',     size: 128 },
  { name: 'icon-192.png',     size: 192 },
  { name: 'icon-512.png',     size: 512 },
  { name: 'apple-touch-icon.png', size: 192 },
];

for (const { name, size } of configs) {
  const png = createPNG(size, size, 16, 185, 129, 5, 150, 105);
  const out = join(PUBLIC_DIR, name);
  writeFileSync(out, png);
  const valid = png[0] === 0x89 && png.toString('ascii', 1, 4) === 'PNG';
  console.log(`${name}: ${size}x${size}, ${png.length} bytes, valid=${valid}`);
}

console.log('\nDone. All PNGs generated.');
