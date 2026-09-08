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
const { POINTS_3D, POINT_COTES } = require(path.join(ROOT, 'js', 'points-3d.js'));
const { MERIDIANS } = require(path.join(ROOT, 'js', 'data.js'));
const { POINT_RULES } = require('./point-rules.js');

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
  { id: 'tete-face',    nom: 'Tête, de face',          dir: [0, 0, -1], up: [0, 1, 0], pxm: 4200 },
  { id: 'tete-profil',  nom: 'Tête, de profil',        dir: [-1, 0, 0], up: [0, 1, 0], pxm: 4200 },
  { id: 'tete-dos',     nom: 'Nuque et occiput',       dir: [0, 0, 1],  up: [0, 1, 0], pxm: 4200 },
  { id: 'tronc-face',   nom: 'Tronc, de face',         dir: [0, 0, -1], up: [0, 1, 0], pxm: 3000 },
  { id: 'tronc-dos',    nom: 'Dos',                    dir: [0, 0, 1],  up: [0, 1, 0], pxm: 3000 },
  { id: 'tronc-profil', nom: 'Tronc, de profil',       dir: [-1, 0, 0], up: [0, 1, 0], pxm: 3000 },
  { id: 'bras-face',    nom: 'Bras, face antérieure',  dir: [0, 0, -1], up: [0, 1, 0], pxm: 3200 },
  { id: 'bras-dos',     nom: 'Bras, face postérieure', dir: [0, 0, 1],  up: [0, 1, 0], pxm: 3200 },
  { id: 'main-dos',     nom: 'Main, dos',              dir: [-1, 0, 0], up: [0, 1, 0], pxm: 5200 },
  { id: 'main-paume',   nom: 'Main, paume',            dir: [1, 0, 0],  up: [0, 1, 0], pxm: 5200 },
  { id: 'jambe-face',   nom: 'Jambe, face antérieure', dir: [0, 0, -1], up: [0, 1, 0], pxm: 3000 },
  { id: 'jambe-dos',    nom: 'Jambe, face postérieure', dir: [0, 0, 1], up: [0, 1, 0], pxm: 3000 },
  { id: 'jambe-interne', nom: 'Jambe, face interne',   dir: [1, 0, 0],  up: [0, 1, 0], pxm: 3000 },
  { id: 'jambe-externe', nom: 'Jambe, face externe',   dir: [-1, 0, 0], up: [0, 1, 0], pxm: 3000 },
  { id: 'pied-dos',     nom: 'Pied, dessus',           dir: [0, -1, 0], up: [0, 0, 1], pxm: 5200 },
  { id: 'pied-plante',  nom: 'Pied, plante',           dir: [0, 1, 0],  up: [0, 0, 1], pxm: 5200 },
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
  // La résolution est donnée en pixels par mètre de corps, pas en pixels
  // d'image : c'est ce qui décide de la finesse du croquis quand on zoome sur
  // une zone de quatorze centimètres, quelle que soit la taille de la région.
  const w = Math.max(360, Math.min(1280, Math.round((rmax - rmin) * plate.pxm)));
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
  const nx = new Float32Array(w * h);
  const ny = new Float32Array(w * h);
  const nz = new Float32Array(w * h);
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
        if (d < depth[o]) {
          depth[o] = d; shade[o] = lit; facing[o] = -V3.dot(n, frame.f); inside[o] = 1;
          nx[o] = n[0]; ny[o] = n[1]; nz[o] = n[2];
        }
      }
    }
  });

  return { frame, depth, shade, facing, nx, ny, nz, inside, w, h };
}

// ---------- Mise en image : dessin au trait ----------
// Pas de modelé : un aplat très clair, et des traits noirs là où la surface
// se replie. Sur une planche destinée à situer un point au millimètre, les
// dégradés d'ombre ne font que brouiller la lecture.
function toPNG(r, plate) {
  const { w, h, depth, facing, nx, ny, nz, inside } = r;
  // Les traits de forme se lisent sur une distance du corps, pas sur un pixel :
  // à 4 200 pixels par mètre, deux pixels voisins du visage ne diffèrent que
  // d'un degré et le nez, la bouche et les paupières disparaissaient du croquis.
  // On compare donc les orientations à deux millimètres de distance.
  const pas = Math.max(1, Math.min(4, Math.round(r.frame.scale * 0.0008)));
  const px = new Uint8Array(w * h * 3).fill(255);

  const dAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? Infinity : depth[y * w + x];
  const inAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : inside[y * w + x];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x;
      if (!inside[o]) continue;

      // Fond du corps : un gris à peine posé, juste pour détacher la silhouette
      // du papier. Le bord qui se dérobe au regard est un peu plus dense.
      let v = facing[o] < 0.30 ? 232 : 246;

      // Contour : rupture de profondeur, ou bord de la silhouette.
      const d = depth[o];
      const silhouette = !inAt(x-1, y) || !inAt(x+1, y) || !inAt(x, y-1) || !inAt(x, y+1);
      const saut = Math.max(
        Math.abs(dAt(x-1, y) - d), Math.abs(dAt(x+1, y) - d),
        Math.abs(dAt(x, y-1) - d), Math.abs(dAt(x, y+1) - d)
      );
      let trait = silhouette || !isFinite(saut) || saut > 0.004;

      // Ligne de forme : cassure d'orientation entre pixels voisins. C'est ce
      // qui fait apparaître les reliefs musculaires, les tendons, les plis.
      // Près du bord, la surface fuit le regard : deux pixels voisins y sont
      // éloignés de plusieurs millimètres sur le corps et leurs orientations
      // divergent toujours. Y chercher un pli noircissait tout le pourtour des
      // doigts.
      if (!trait && facing[o] > 0.35) {
        let pire = 1;
        for (const [ox, oy] of [[-pas,0],[pas,0],[0,-pas],[0,pas]]) {
          const qx = x + ox, qy = y + oy;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx;
          if (!inside[q]) continue;
          const dot = nx[o]*nx[q] + ny[o]*ny[q] + nz[o]*nz[q];
          if (dot < pire) pire = dot;
        }
        if (pire < 0.88) trait = true; // une trentaine de degrés de cassure
      }
      if (trait) v = 30;

      const k = o * 3;
      px[k] = v; px[k+1] = v; px[k+2] = v;
    }
  }

  if (plate && plate.id.startsWith('tete')) traceVisage({ px, w, h }, plate, r.frame);

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

// La planche d'un point découle de sa localisation canonique, pas de ses
// coordonnées. Un classement géométrique envoyait SP6, à trois cun au-dessus de
// la malléole, sur la planche de la plante du pied, et HT1, au creux de
// l'aisselle, sur celle du dos.
const PLATE_BY_ZONE = {
  torse:  ['tronc-face', 'tronc-dos'],
  dos:    ['tronc-dos', 'tronc-face'],
  hanche: ['tronc-dos', 'tronc-face'],
  nuque:  ['tete-dos', 'tete-profil'],
  tete:   ['tete-face', 'tete-profil', 'tete-dos'],
  epaule: ['bras-face', 'bras-dos', 'tronc-dos', 'tronc-face'],
  bras:   ['bras-face', 'bras-dos'],
  main:   ['main-dos', 'main-paume'],
  jambe:  ['jambe-face', 'jambe-dos', 'jambe-interne', 'jambe-externe'],
  pied:   ['pied-dos', 'pied-plante'],
};

// Rattachement : parmi les planches qui montrent cette zone, celle dont le
// regard s'oppose le mieux à la normale de la peau au point.
const assign = {};
Object.entries(POINTS_3D).forEach(([id, pos]) => {
  const n = normalAt(pos);
  let best = null;
  const rule = POINT_RULES[id] || {};
  const zone = rule.zone || 'torse';
  // Main, pied et flanc : la règle dit déjà de quel côté on regarde. La normale
  // de la peau, elle, hésite sur une arête — le bord radial de la main tourne
  // vers l'avant, et LI4 partait sur la planche de la paume.
  const impose = zone === 'main' ? (rule.face === 'palmaire' ? 'main-paume' : 'main-dos')
    : zone === 'pied' ? (rule.face === 'palmaire' ? 'pied-plante' : 'pied-dos')
    : (zone === 'torse' && rule.face === 'side') ? 'tronc-profil' : null;
  if (impose) { assign[id] = impose; return; }
  (PLATE_BY_ZONE[zone] || PLATE_BY_ZONE.torse).forEach((pid) => {
    const pl = PLATES.find((x) => x.id === pid);
    const score = -V3.dot(n, V3.normalize(pl.dir));
    if (!best || score > best.score) best = { pid, score };
  });
  assign[id] = best.pid;
});

// Cadrage : une planche montre une région du corps, pas un gros plan.
//
// Un cadre ajusté sur les seuls points donnait un ruban de peau sans aucun
// repère : on y voyait le point, mais pas où il tombe. Chaque planche cadre
// donc maintenant une unité anatomique entière — la tête, le tronc, le membre,
// la main, le pied —, comme une planche d'atlas. Le doigt agrandit ensuite.
const REGION_DE_PLANCHE = {
  'tete-face': 'tete', 'tete-profil': 'tete', 'tete-dos': 'tete',
  'tronc-face': 'tronc', 'tronc-dos': 'tronc', 'tronc-profil': 'tronc',
  'bras-face': 'bras', 'bras-dos': 'bras',
  'main-dos': 'main', 'main-paume': 'main',
  'jambe-face': 'jambe', 'jambe-dos': 'jambe',
  'jambe-interne': 'jambe', 'jambe-externe': 'jambe',
  'pied-dos': 'pied', 'pied-plante': 'pied',
};

const dirMain = V3.normalize(V3.sub(L.fingertip, L.wrist));
const PREDICAT = {
  tete:  (v) => v[1] > L.chinY - 0.09 && Math.abs(v[0]) < 0.145,
  tronc: (v) => v[1] > L.pubis[1] - 0.05 && v[1] < L.neckBase + 0.07 && !L.isArm(v),
  bras:  (v) => L.isArm(v),
  main:  (v) => V3.dot(V3.sub([v[0], v[1], v[2]], L.wrist), dirMain) > -0.02 && L.isArm(v),
  jambe: (v) => v[1] < L.crotch + 0.05 && v[0] > 0.02 && !L.isArm(v),
  pied:  (v) => v[1] < 0.14 && v[0] > 0.02,
};

const BOITES = {};
Object.entries(PREDICAT).forEach(([nom, ok]) => {
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  V.forEach((v) => {
    if (!ok(v)) return;
    for (let k = 0; k < 3; k++) {
      if (v[k] < bb[k]) bb[k] = v[k];
      if (v[k] > bb[k+3]) bb[k+3] = v[k];
    }
  });
  BOITES[nom] = bb;
});

const UN_SEUL_COTE = { bras: 1, main: 1, jambe: 1, pied: 1 };

PLATES.forEach((pl) => {
  const region = REGION_DE_PLANCHE[pl.id];
  const src = BOITES[region] || [-0.1, 0.8, -0.1, 0.1, 1.0, 0.1];
  const bb = src.slice();
  const dir = V3.normalize(pl.dir);
  for (let k = 0; k < 3; k++) {
    // Marge large dans l'axe du regard, serrée dans le plan de l'image.
    const m = 0.025 + Math.abs(dir[k]) * 0.30;
    bb[k] -= m; bb[k+3] += m;
  }
  // Un membre ne déborde pas sur celui d'en face, qui viendrait s'interposer.
  if (UN_SEUL_COTE[region] || pl.id === 'tronc-profil') bb[0] = Math.max(bb[0], 0.004);
  pl.box = bb;
  pl.compte = Object.values(assign).filter((pid) => pid === pl.id).length;
});

const frames = {};
PLATES.forEach((pl) => { frames[pl.id] = plateFrame(pl); });

const assignment = {};
const r1 = (v) => Math.round(v * 10) / 10;
Object.entries(assign).forEach(([id, pid]) => {
  const pr = project(frames[pid], POINTS_3D[id]);
  const entry = { planche: pid, x: r1(pr.x), y: r1(pr.y) };
  const cs = (POINT_COTES[id] || []).map((c) => {
    const a = project(frames[pid], c.a);
    const o = { ax: r1(a.x), ay: r1(a.y), texte: c.texte };
    if (c.b) { const b = project(frames[pid], c.b); o.bx = r1(b.x); o.by = r1(b.y); }
    if (c.depart) o.depart = c.depart;
    return o;
  });
  if (cs.length) entry.cotes = cs;
  assignment[id] = entry;
});

// ---------- Repères du visage ----------
//
// Le maillage est un « base mesh » : son crâne est lisse, sans yeux, sans nez,
// sans bouche. Quinze points se situent pourtant par rapport à ces traits — le
// coin interne de l'œil, l'aile du nez, l'extrémité du sourcil. Sur une planche
// vierge, ils flottent sur un ovale et ne se lisent pas.
//
// On dessine donc le visage aux proportions canoniques, celles-là mêmes qui
// servent à poser les points : menton à 0, ligne des yeux à mi-hauteur du
// crâne, base du nez à 0,33, bouche à 0,19, sourcils à 0,57. Le trait est un
// croquis de repérage, pas un relevé du modèle, et il est tracé plus clair
// pour qu'on ne le confonde pas avec le contour, qui, lui, vient de la
// géométrie.
function traceVisage(img, plate, frame) {
  const CHIN = L.chinY, HH = L.height - L.chinY;
  let demi = 0.075;
  {
    let w = 0;
    V.forEach((v) => {
      if (v[1] > CHIN + HH * 0.4 && v[1] < CHIN + HH * 0.75) w = Math.max(w, Math.abs(v[0]));
    });
    demi = w;
  }
  // Profondeur du visage sur la ligne médiane, pour la vue de profil.
  const zFront = (y) => {
    let best = -Infinity;
    V.forEach((v) => { if (Math.abs(v[1] - y) < 0.006 && Math.abs(v[0]) < 0.02 && v[2] > best) best = v[2]; });
    return isFinite(best) ? best : 0.08;
  };

  const px = img.px, w = img.w, h = img.h;
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 3;
    px[o] = c; px[o+1] = c; px[o+2] = c;
  };
  const point3d = (lat, ht, dz) => {
    const y = CHIN + ht * HH;
    return [lat * demi, y, (dz === undefined ? zFront(y) : dz)];
  };
  const trait = (a, b, c) => {
    const pa = project(frame, a), pb = project(frame, b);
    const n = Math.max(2, Math.ceil(Math.hypot(pb.x - pa.x, pb.y - pa.y)));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(pa.x + (pb.x - pa.x) * i / n);
      const y = Math.round(pa.y + (pb.y - pa.y) * i / n);
      set(x, y, c); set(x + 1, y, c); set(x, y + 1, c); set(x + 1, y + 1, c);
    }
  };
  // Courbe passant par une suite de repères (lat, hauteur).
  const courbe = (pts, c) => {
    for (let i = 0; i < pts.length - 1; i++) {
      trait(point3d(pts[i][0], pts[i][1]), point3d(pts[i+1][0], pts[i+1][1]), c);
    }
  };
  const G = 88; // gris du croquis : assez soutenu pour se lire, assez clair
                // pour qu'on ne le prenne pas pour le contour du modèle.

  if (plate.id === 'tete-face') {
    [1, -1].forEach((cote) => {
      // Œil : deux arcs qui se rejoignent aux commissures.
      const x0 = 0.17 * cote, x1 = 0.45 * cote;
      courbe([[x0, 0.500], [0.24*cote, 0.522], [0.34*cote, 0.524], [x1, 0.500]], G);
      courbe([[x0, 0.500], [0.26*cote, 0.478], [0.36*cote, 0.480], [x1, 0.500]], G);
      // Iris
      courbe([[0.26*cote, 0.505], [0.31*cote, 0.518], [0.36*cote, 0.505],
              [0.31*cote, 0.492], [0.26*cote, 0.505]], G);
      // Sourcil
      courbe([[0.18*cote, 0.560], [0.28*cote, 0.582], [0.40*cote, 0.578], [0.48*cote, 0.556]], G);
      // Aile du nez et bord du nez
      courbe([[0.08*cote, 0.470], [0.10*cote, 0.390], [0.19*cote, 0.335],
              [0.13*cote, 0.318], [0.05*cote, 0.330]], G);
      // Sillon naso-génien
      courbe([[0.21*cote, 0.330], [0.26*cote, 0.265], [0.25*cote, 0.205]], G);
    });
    // Bouche
    courbe([[-0.21, 0.192], [-0.10, 0.212], [0, 0.200], [0.10, 0.212], [0.21, 0.192]], G);
    courbe([[-0.21, 0.192], [-0.10, 0.168], [0.10, 0.168], [0.21, 0.192]], G);
    // Sillon labio-mentonnier
    courbe([[-0.13, 0.115], [0, 0.105], [0.13, 0.115]], G);
    // Racine du nez
    courbe([[-0.05, 0.560], [-0.04, 0.500]], G);
    courbe([[0.05, 0.560], [0.04, 0.500]], G);
  }

  if (plate.id === 'tete-profil') {
    // De profil on ne peut pas creuser la silhouette, qui vient du maillage.
    // On pose seulement les traits internes, à leur hauteur exacte.
    const z = (ht) => zFront(CHIN + ht * HH);
    const P = (ht, recul) => [0.3 * demi, CHIN + ht * HH, z(ht) - recul];
    trait(P(0.500, 0.012), P(0.500, 0.052), G);          // fente palpébrale
    trait(P(0.560, 0.010), P(0.560, 0.055), G);          // sourcil
    trait(P(0.192, 0.008), P(0.192, 0.045), G);          // bouche
    trait(P(0.335, 0.006), P(0.335, 0.030), G);          // base du nez
  }
}

// ---------- Écriture ----------
const outDir = path.join(ROOT, 'assets', 'planches');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const manifest = {};
let total = 0;
PLATES.forEach((pl) => {
  const t0 = Date.now();
  const r = renderPlate(pl);
  const png = toPNG(r, pl);
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
