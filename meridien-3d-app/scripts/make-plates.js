// Planches anatomiques 2D.
//
// Chaque planche est une vue orthographique du modèle, calculée ici par un
// rasteriseur logiciel avec tampon de profondeur. Les contours sont obtenus en
// détectant les ruptures de profondeur : on obtient un croquis anatomique juste
// par construction, puisqu'il vient de la même géométrie que la vue 3D.
//
// Chaque point d'acupression est ensuite rattaché à la planche qui le montre le
// mieux, et ses coordonnées y sont calculées avec la même projection.
//
// Usage : node scripts/make-plates.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
global.V3 = require(path.join(ROOT, 'js', 'vec3.js')).V3;
const { parseBodyModel } = require(path.join(ROOT, 'js', 'model.js'));
const { POINTS_3D } = require(path.join(ROOT, 'js', 'points-3d.js'));
const { MERIDIANS } = require(path.join(ROOT, 'js', 'data.js'));

const raw = fs.readFileSync(path.join(ROOT, 'assets', 'body.bin'));
const model = parseBodyModel(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

// ---------- Géométrie en coordonnées du monde ----------
const tris = [];
model.chunks.forEach((c) => {
  const P = new Float32Array(c.vertexCount * 3);
  const N = new Float32Array(c.vertexCount * 3);
  for (let i = 0; i < c.vertexCount; i++) {
    for (let k = 0; k < 3; k++) {
      P[i*3+k] = model.min[k] + (c.positions[i*3+k] / 65535) * model.span[k];
      N[i*3+k] = c.normals[i*3+k] / 127;
    }
  }
  for (let i = 0; i < c.indexCount; i += 3) {
    tris.push([c.indices[i], c.indices[i+1], c.indices[i+2], P, N]);
  }
});
console.log('triangles :', tris.length.toLocaleString('fr-FR'));

// ---------- Définition des planches ----------
// `dir` : direction de regard (du spectateur vers le sujet), `up` : verticale
// de l'image. Le cadrage n'est pas fixé ici : il est ajusté plus bas sur les
// points que la planche doit montrer, ce qui évite les mains coupées et les
// grandes zones vides.
const PLATES = [
  { id: 'tete-face',    nom: 'Tête, de face',        dir: [0, 0, -1], up: [0, 1, 0], w: 420 },
  { id: 'tete-profil',  nom: 'Tête, de profil',      dir: [-1, 0, 0], up: [0, 1, 0], w: 420 },
  { id: 'tete-dos',     nom: 'Nuque et occiput',     dir: [0, 0, 1],  up: [0, 1, 0], w: 420 },
  { id: 'tronc-face',   nom: 'Tronc, de face',       dir: [0, 0, -1], up: [0, 1, 0], w: 460 },
  { id: 'tronc-dos',    nom: 'Dos',                  dir: [0, 0, 1],  up: [0, 1, 0], w: 460 },
  { id: 'bras-face',    nom: 'Bras, face antérieure', dir: [0, 0, -1], up: [0, 1, 0], w: 460 },
  { id: 'bras-dos',     nom: 'Bras, face postérieure', dir: [0, 0, 1], up: [0, 1, 0], w: 460 },
  { id: 'main-dos',     nom: 'Main, dos',            dir: [-1, 0, 0], up: [0, 1, 0], w: 420 },
  { id: 'main-paume',   nom: 'Main, paume',          dir: [1, 0, 0],  up: [0, 1, 0], w: 420 },
  { id: 'jambe-face',   nom: 'Jambe, face antérieure', dir: [0, 0, -1], up: [0, 1, 0], w: 400 },
  { id: 'jambe-dos',    nom: 'Jambe, face postérieure', dir: [0, 0, 1], up: [0, 1, 0], w: 400 },
  { id: 'jambe-interne', nom: 'Jambe, face interne',  dir: [1, 0, 0], up: [0, 1, 0], w: 400 },
  { id: 'jambe-externe', nom: 'Jambe, face externe',  dir: [-1, 0, 0], up: [0, 1, 0], w: 400 },
  { id: 'pied-dos',     nom: 'Pied, dessus',         dir: [0, -1, 0], up: [0, 0, 1], w: 420 },
  { id: 'pied-plante',  nom: 'Pied, plante',         dir: [0, 1, 0],  up: [0, 0, 1], w: 420 },
];

function plateBasis(plate) {
  const f = V3.normalize(plate.dir);              // regard
  let r = V3.normalize(V3.cross(plate.up, f));    // droite de l'image
  if (V3.length(r) < 1e-6) r = [1, 0, 0];
  const u = V3.normalize(V3.cross(f, r));         // haut de l'image
  return { f, r, u };
}

// Cadre : étendue du cadrage projetée dans le repère de la planche.
function plateFrame(plate) {
  const b = plate.box;
  const basis = plateBasis(plate);
  let rmin = Infinity, rmax = -Infinity, umin = Infinity, umax = -Infinity;
  for (let i = 0; i < 8; i++) {
    const c = [b[(i & 1) ? 3 : 0], b[(i & 2) ? 4 : 1], b[(i & 4) ? 5 : 2]];
    const rr = V3.dot(c, basis.r), uu = V3.dot(c, basis.u);
    rmin = Math.min(rmin, rr); rmax = Math.max(rmax, rr);
    umin = Math.min(umin, uu); umax = Math.max(umax, uu);
  }
  const w = plate.w;
  const scale = w / (rmax - rmin);
  const h = Math.round((umax - umin) * scale);
  return { ...basis, rmin, umax, scale, w, h };
}

// Projette un point du monde vers les pixels de la planche.
function project(frame, p) {
  return {
    x: (V3.dot(p, frame.r) - frame.rmin) * frame.scale,
    y: (frame.umax - V3.dot(p, frame.u)) * frame.scale,
    depth: V3.dot(p, frame.f),
  };
}

// ---------- Rasteriseur ----------
function renderPlate(plate) {
  const frame = plateFrame(plate);
  const { w, h } = frame;
  const depth = new Float32Array(w * h).fill(Infinity);
  const shade = new Float32Array(w * h);
  const facing = new Float32Array(w * h);
  const inside = new Uint8Array(w * h);
  const b = plate.box;

  const light = V3.normalize(V3.add(V3.scale(frame.f, -0.6), V3.add(V3.scale(frame.u, 0.55), V3.scale(frame.r, -0.4))));

  tris.forEach((t) => {
    const [ia, ib, ic, P, N] = t;
    const pts = [], nrm = [];
    let skip = false;
    for (const idx of [ia, ib, ic]) {
      const p = [P[idx*3], P[idx*3+1], P[idx*3+2]];
      // On ne garde que ce qui est dans le cadrage : sur une planche de main,
      // le reste du corps n'a rien à faire.
      if (p[0] < b[0] - 0.02 || p[0] > b[3] + 0.02 || p[1] < b[1] - 0.02
        || p[1] > b[4] + 0.02 || p[2] < b[2] - 0.02 || p[2] > b[5] + 0.02) { skip = true; break; }
      pts.push(project(frame, p));
      nrm.push([N[idx*3], N[idx*3+1], N[idx*3+2]]);
    }
    if (skip) return;

    const n = V3.normalize([
      (nrm[0][0] + nrm[1][0] + nrm[2][0]) / 3,
      (nrm[0][1] + nrm[1][1] + nrm[2][1]) / 3,
      (nrm[0][2] + nrm[1][2] + nrm[2][2]) / 3,
    ]);
    if (V3.dot(n, frame.f) > 0) return; // face détournée du spectateur
    const lit = 0.45 + 0.55 * Math.max(0, V3.dot(n, light));

    const minX = Math.max(0, Math.floor(Math.min(pts[0].x, pts[1].x, pts[2].x)));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(pts[0].x, pts[1].x, pts[2].x)));
    const minY = Math.max(0, Math.floor(Math.min(pts[0].y, pts[1].y, pts[2].y)));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(pts[0].y, pts[1].y, pts[2].y)));
    if (maxX < minX || maxY < minY) return;

    const x0 = pts[0].x, y0 = pts[0].y, x1 = pts[1].x, y1 = pts[1].y, x2 = pts[2].x, y2 = pts[2].y;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) return;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
        const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const d = w0 * pts[0].depth + w1 * pts[1].depth + w2 * pts[2].depth;
        const o = y * w + x;
        if (d < depth[o]) { depth[o] = d; shade[o] = lit; facing[o] = -V3.dot(n, frame.f); inside[o] = 1; }
      }
    }
  });

  return { frame, depth, shade, facing, inside, w, h };
}

// ---------- Mise en image : gris posterisé + contours ----------
function toPNG(r) {
  const { w, h, depth, shade, facing, inside } = r;
  const px = new Uint8Array(w * h * 3).fill(250);
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? Infinity : depth[y * w + x];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      if (!inside[o]) continue;
      // Posterisation : moins de niveaux, un dessin plus lisible et un fichier
      // bien plus léger.
      const level = Math.round(shade[o] * 7) / 7;
      let v = Math.round(248 - (1 - level) * 165);

      // Ligne de forme : là où la surface se dérobe au regard, elle s'assombrit.
      // C'est ce que fait le hachurage d'un croquis anatomique.
      if (facing[o] < 0.34) v = Math.round(v * (0.55 + facing[o]));

      // Contour : rupture de profondeur avec le voisinage.
      const d = depth[o];
      const grad = Math.max(
        Math.abs(at(x - 1, y) - d), Math.abs(at(x + 1, y) - d),
        Math.abs(at(x, y - 1) - d), Math.abs(at(x, y + 1) - d)
      );
      if (!isFinite(grad) || grad > 0.006) v = 45;

      const q = o * 3;
      px[q] = v; px[q+1] = Math.round(v * 0.985); px[q+2] = Math.round(v * 0.96);
    }
  }

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
  const rawBuf = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    rawBuf[o++] = 0;
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 3;
      rawBuf[o++] = px[q]; rawBuf[o++] = px[q+1]; rawBuf[o++] = px[q+2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rawBuf, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Rattachement des points aux planches ----------
// Chaque point rejoint la planche qui le montre de face : celle dont la
// direction de regard s'oppose le mieux à la normale de la peau en ce point.
const { loadVertices, detectLandmarks } = require('./landmarks.js');
const { V } = loadVertices(ROOT);
const L = detectLandmarks(V);

function normalAt(p) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    const d = (v[0]-p[0])**2 + (v[1]-p[1])**2 + (v[2]-p[2])**2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best ? [best[3], best[4], best[5]] : [0, 0, 1];
}

function regionOf(p) {
  if (p[1] > 1.44) return 'tete';
  if (Math.abs(p[0]) > 0.30 && p[1] > 0.75) return p[1] < 0.99 && Math.abs(p[0]) > 0.40 ? 'main' : 'bras';
  if (p[1] < 0.20) return 'pied';
  if (p[1] < 0.94 && Math.abs(p[0]) > 0.03) return 'jambe';
  return 'tronc';
}

const PLATE_BY_REGION = {
  tete: ['tete-face', 'tete-profil', 'tete-dos'],
  tronc: ['tronc-face', 'tronc-dos'],
  bras: ['bras-face', 'bras-dos'],
  main: ['main-dos', 'main-paume'],
  jambe: ['jambe-face', 'jambe-dos', 'jambe-interne', 'jambe-externe'],
  pied: ['pied-dos', 'pied-plante'],
};

// Rattachement d'abord : chaque point rejoint la planche dont le regard
// s'oppose le mieux à la normale de la peau en ce point.
const assign = {};
Object.entries(POINTS_3D).forEach(([id, pos]) => {
  const n = normalAt(pos);
  let best = null;
  PLATE_BY_REGION[regionOf(pos)].forEach((pid) => {
    const pl = PLATES.find((x) => x.id === pid);
    const score = -V3.dot(n, V3.normalize(pl.dir));
    if (!best || score > best.score) best = { pid, score };
  });
  assign[id] = best.pid;
});

// Cadrage ajusté sur les points de chaque planche. Une marge généreuse dans le
// plan de l'image laisse voir le relief alentour ; le long du regard, on garde
// tout, sinon la silhouette serait tronquée en profondeur.
const MARGE = 0.07;
PLATES.forEach((pl) => {
  const mine = Object.entries(assign).filter(([, pid]) => pid === pl.id).map(([id]) => POINTS_3D[id]);
  let bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  mine.forEach((p) => {
    for (let k = 0; k < 3; k++) {
      bb[k] = Math.min(bb[k], p[k]);
      bb[k+3] = Math.max(bb[k+3], p[k]);
    }
  });
  if (!mine.length) bb = [-0.1, 0.8, -0.1, 0.1, 1.0, 0.1];
  const dir = V3.normalize(pl.dir);
  for (let k = 0; k < 3; k++) {
    // Marge large dans l'axe du regard, serrée dans le plan de l'image.
    const m = MARGE + Math.abs(dir[k]) * 0.30;
    bb[k] -= m; bb[k+3] += m;
  }
  // Le corps est symétrique : une planche de membre ne doit pas déborder sur
  // l'autre côté, qui viendrait s'interposer devant le sujet.
  if (mine.length && mine.every((p) => p[0] > 0.02)) bb[0] = Math.max(bb[0], 0.005);
  pl.box = bb;
  pl.compte = mine.length;
});

const frames = {};
PLATES.forEach((pl) => { frames[pl.id] = plateFrame(pl); });

const assignment = {};
Object.entries(assign).forEach(([id, pid]) => {
  const pr = project(frames[pid], POINTS_3D[id]);
  assignment[id] = { planche: pid, x: Math.round(pr.x * 10) / 10, y: Math.round(pr.y * 10) / 10 };
});

// ---------- Écriture ----------
const outDir = path.join(ROOT, 'assets', 'planches');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const manifest = {};
let total = 0;
PLATES.forEach((pl) => {
  const t0 = Date.now();
  const r = renderPlate(pl);
  const png = toPNG(r);
  fs.writeFileSync(path.join(outDir, pl.id + '.png'), png);
  total += png.length;
  manifest[pl.id] = { nom: pl.nom, w: r.w, h: r.h, pxParMetre: Math.round(r.frame.scale) };
  console.log(pl.id.padEnd(15), (r.w + 'x' + r.h).padEnd(10), String(pl.compte).padStart(2) + ' points', (png.length / 1024).toFixed(0) + ' Ko', (Date.now() - t0) + ' ms');
});
console.log('total des planches :', (total / 1048576).toFixed(2), 'Mo');

const points = {};
Object.entries(assignment).forEach(([id, a]) => { points[id] = a; });
fs.writeFileSync(path.join(ROOT, 'js', 'plates.js'),
`// Planches anatomiques 2D et position des points sur chacune.
// Produit par scripts/make-plates.js — ne pas modifier à la main.

const PLATES_INFO = ${JSON.stringify(manifest)};

const PLATE_POINTS = ${JSON.stringify(points)};

if (typeof module !== 'undefined') module.exports = { PLATES_INFO, PLATE_POINTS };
`);
console.log('écrit js/plates.js');
