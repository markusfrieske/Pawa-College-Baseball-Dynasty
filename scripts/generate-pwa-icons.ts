import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, 'ascii');
  const combined = Buffer.concat([t, data]);
  const crcVal = crc32(combined);
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crcVal);
  return Buffer.concat([len, combined, crcBuf]);
}

type Pixel = [number, number, number];

function generatePNG(pixels: (x: number, y: number) => Pixel, size: number): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rowSize = 1 + size * 3;
  const raw = Buffer.allocUnsafe(size * rowSize);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixels(x, y);
      raw[y * rowSize + 1 + x * 3 + 0] = r;
      raw[y * rowSize + 1 + x * 3 + 1] = g;
      raw[y * rowSize + 1 + x * 3 + 2] = b;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function makeIconPixels(x: number, y: number, size: number): Pixel {
  const nx = x / size;
  const ny = y / size;
  const cx = 0.5, cy = 0.5;

  const BG: Pixel = [0x15, 0x2a, 0x15];
  const GOLD: Pixel = [0xc4, 0xa3, 0x5a];
  const DARK: Pixel = [0x0d, 0x1f, 0x0d];
  const WHITE: Pixel = [0xff, 0xff, 0xff];

  const dx = nx - cx;
  const dy = ny - cy;

  const inCircle = Math.sqrt(dx * dx + dy * dy) < 0.46;
  if (!inCircle) return BG;

  const outerRing = Math.sqrt(dx * dx + dy * dy) > 0.42;
  if (outerRing) return GOLD;

  const innerBg = DARK;

  const diamondSize = 0.22;
  const rdx = Math.abs(dx) + Math.abs(dy);
  const inDiamond = rdx < diamondSize;
  const onDiamondEdge = Math.abs(rdx - diamondSize) < 0.025;
  if (onDiamondEdge) return GOLD;
  if (inDiamond) return GOLD;

  const baseRadius = 0.05;
  const bases: [number, number][] = [
    [cx - 0.16, cy],
    [cx, cy - 0.16],
    [cx + 0.16, cy],
    [cx, cy + 0.16],
  ];
  for (const [bx, by] of bases) {
    const dist = Math.sqrt((nx - bx) ** 2 + (ny - by) ** 2);
    if (dist < baseRadius) return WHITE;
  }

  const lineThick = 0.012;
  for (let i = 0; i < bases.length; i++) {
    const [ax, ay] = bases[i];
    const [bx, by] = bases[(i + 1) % 4];
    const ldx = bx - ax, ldy = by - ay;
    const len = Math.sqrt(ldx * ldx + ldy * ldy);
    const t = Math.max(0, Math.min(1, ((nx - ax) * ldx + (ny - ay) * ldy) / (len * len)));
    const px = ax + t * ldx, py = ay + t * ldy;
    const d = Math.sqrt((nx - px) ** 2 + (ny - py) ** 2);
    if (d < lineThick) return GOLD;
  }

  return innerBg;
}

const outDir = join(process.cwd(), 'client', 'public');

for (const size of [192, 512]) {
  const png = generatePNG((x, y) => makeIconPixels(x, y, size), size);
  const path = join(outDir, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Generated ${path} (${png.length} bytes)`);
}
