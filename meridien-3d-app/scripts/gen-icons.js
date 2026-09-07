// Génère des icônes PNG simples (fond dégradé + point d'acupuncture stylisé)
// sans dépendance externe, en écrivant directement les octets PNG.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePNG(size, drawFn) {
  const width = size, height = size;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filtre "none"
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = drawFn(x, y, width, height);
      raw[offset++] = r; raw[offset++] = g; raw[offset++] = b; raw[offset++] = a;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a, b, t) { return a + (b - a) * t; }

function draw(x, y, w, h) {
  const cx = w / 2, cy = h / 2;
  const t = y / h;
  const top = hexToRgb('#1b2a4a');
  const bot = hexToRgb('#0d1526');
  const r = Math.round(lerp(top[0], bot[0], t));
  const g = Math.round(lerp(top[1], bot[1], t));
  const b = Math.round(lerp(top[2], bot[2], t));

  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const R = w * 0.30;

  // point central (acupoint) lumineux
  if (dist < R) {
    const glow = 1 - dist / R;
    const cr = Math.round(lerp(r, 230, glow));
    const cg = Math.round(lerp(g, 200, glow));
    const cb = Math.round(lerp(b, 90, glow));
    return [cr, cg, cb, 255];
  }
  // anneau
  if (dist < R * 1.18) {
    return [230, 200, 90, 255];
  }
  // méridiens (lignes courbes simplifiées) traversant l'icône
  const ringA = Math.abs(dist - R * 1.7);
  const ringB = Math.abs(dist - R * 2.3);
  if (ringA < w * 0.012 || ringB < w * 0.012) {
    return [110, 200, 220, 230];
  }
  return [r, g, b, 255];
}

const sizes = [
  { name: 'icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'favicon-32.png', size: 32 },
];

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const { name, size } of sizes) {
  const buf = makePNG(size, draw);
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log('écrit', name, buf.length, 'octets');
}
