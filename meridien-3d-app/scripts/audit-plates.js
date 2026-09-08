// Contrôle visuel du placement des points.
//
// Redessine chaque planche avec ses points numérotés, pour vérifier à l'œil
// qu'ils tombent sur le bon repère anatomique. Le numéro renvoie à la liste
// imprimée dans la console.
//
// Usage : node scripts/audit-plates.js [planche]

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const { PLATES_INFO, PLATE_POINTS } = require(path.join(ROOT, 'js', 'plates.js'));
const OUT = process.env.AUDIT_DIR || '/tmp/audit';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Chiffres 3x5, suffisants pour numéroter les repères.
const FONT = {
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['111','001','111','100','111'], '3': ['111','001','111','001','111'],
  '4': ['101','101','111','001','001'], '5': ['111','100','111','001','111'],
  '6': ['111','100','111','101','111'], '7': ['111','001','010','010','010'],
  '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111'],
};

function readPNG(file) {
  const b = fs.readFileSync(file);
  let off = 8, w = 0, h = 0; const idat = [];
  while (off < b.length) {
    const len = b.readUInt32BE(off), type = b.toString('ascii', off + 4, off + 8);
    const d = b.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); }
    if (type === 'IDAT') idat.push(d);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 3;
  const px = Buffer.alloc(w * h * 3);
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    for (let x = 0; x < stride; x++) {
      const v = raw[o++];
      const a = x >= 3 ? px[y*stride + x - 3] : 0;
      const bq = y > 0 ? px[(y-1)*stride + x] : 0;
      const c = (x >= 3 && y > 0) ? px[(y-1)*stride + x - 3] : 0;
      let r;
      switch (f) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + bq; break;
        case 3: r = v + ((a + bq) >> 1); break;
        default: { const pr = a + bq - c, pa = Math.abs(pr-a), pb = Math.abs(pr-bq), pc = Math.abs(pr-c);
          r = v + (pa <= pb && pa <= pc ? a : (pb <= pc ? bq : c)); }
      }
      px[y*stride + x] = r & 255;
    }
  }
  return { w, h, px };
}

function writePNG(file, w, h, px) {
  function crc32(buf) {
    let c; const t = crc32.t || (crc32.t = (() => { const a = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; a[n] = c; } return a; })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, data) {
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, 'ascii');
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([l, tb, data, cb]);
  }
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) { raw[o++] = 0; for (let x = 0; x < w * 3; x++) raw[o++] = px[y * w * 3 + x]; }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

const only = process.argv[2];
Object.keys(PLATES_INFO).forEach((id) => {
  if (only && id !== only) return;
  const img = readPNG(path.join(ROOT, 'assets', 'planches', id + '.png'));
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
    const o = (y * img.w + x) * 3;
    img.px[o] = c[0]; img.px[o+1] = c[1]; img.px[o+2] = c[2];
  };
  const mine = Object.entries(PLATE_POINTS).filter(([, a]) => a.planche === id);
  mine.forEach(([code, a], i) => {
    const cx = Math.round(a.x), cy = Math.round(a.y);
    // Croix + cercle : la croix donne le pixel exact, le cercle le rend visible.
    for (let k = -7; k <= 7; k++) { set(cx + k, cy, [220,30,30]); set(cx, cy + k, [220,30,30]); }
    for (let ang = 0; ang < 360; ang += 4) {
      const r = 9;
      set(Math.round(cx + Math.cos(ang*Math.PI/180)*r), Math.round(cy + Math.sin(ang*Math.PI/180)*r), [220,30,30]);
    }
    // Numéro, en haut à droite du repère
    const label = String(i + 1);
    let ox = cx + 12, oy = cy - 14;
    for (const ch of label) {
      const g = FONT[ch]; if (!g) continue;
      for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) {
        if (g[gy][gx] !== '1') continue;
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) set(ox + gx*2 + sx, oy + gy*2 + sy, [10,60,200]);
      }
      ox += 8;
    }
  });
  writePNG(path.join(OUT, id + '.png'), img.w, img.h, img.px);
  console.log(id.padEnd(15), mine.map(([c], i) => (i + 1) + '=' + c).join('  '));
});
console.log('\\nimages écrites dans', OUT);
