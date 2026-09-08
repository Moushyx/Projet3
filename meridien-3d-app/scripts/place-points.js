// Recale les points d'acupression sur le modèle anatomique.
//
// Deux problèmes à résoudre. D'abord le modèle est en pose A, bras écartés,
// alors que les coordonnées d'origine ont été saisies sur un corps bras le long
// du corps : les points des six méridiens de bras doivent suivre le membre dans
// sa nouvelle orientation. Ensuite, tous les points doivent affleurer la peau
// réelle et non flotter à quelques centimètres d'elle.
//
// Le trajet de chaque méridien est également échantillonné puis plaqué sur la
// peau, sinon la corde tendue entre deux points traverserait le corps dans les
// zones convexes et disparaîtrait derrière lui.
//
// Usage : node scripts/place-points.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.V3 = require(path.join(ROOT, 'js', 'vec3.js')).V3;
const { MERIDIANS } = require(path.join(ROOT, 'js', 'data.js'));
const { parseBodyModel } = require(path.join(ROOT, 'js', 'model.js'));

const raw = fs.readFileSync(path.join(ROOT, 'assets', 'body.bin'));
const model = parseBodyModel(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

// ---------- Sommets et normales en coordonnées du monde ----------
const V = [];
model.chunks.forEach((c) => {
  for (let i = 0; i < c.vertexCount; i++) {
    V.push([
      model.min[0] + (c.positions[i*3] / 65535) * model.span[0],
      model.min[1] + (c.positions[i*3+1] / 65535) * model.span[1],
      model.min[2] + (c.positions[i*3+2] / 65535) * model.span[2],
      c.normals[i*3] / 127, c.normals[i*3+1] / 127, c.normals[i*3+2] / 127,
    ]);
  }
});
console.log('sommets chargés :', V.length.toLocaleString('fr-FR'));

// ---------- Grille de recherche du plus proche voisin ----------
const CELL = 0.03;
const grid = new Map();
const key = (x, y, z) => x + ',' + y + ',' + z;
V.forEach((v, i) => {
  const k = key(Math.floor(v[0]/CELL), Math.floor(v[1]/CELL), Math.floor(v[2]/CELL));
  let b = grid.get(k);
  if (!b) { b = []; grid.set(k, b); }
  b.push(i);
});

// Plaque un point sur la peau : on cherche le sommet le plus proche, puis on
// ressort légèrement le long de sa normale pour que la bille reste visible.
//
// `facing` indique de quel côté du corps le point doit rester. Sans cette
// contrainte, un échantillon situé entre deux points du dos peut s'accrocher à
// la peau du ventre, qui se trouve parfois plus proche à vol d'oiseau : le
// méridien de la Vessie descendait ainsi sur le devant du corps.
const OUT = 0.004;
function snapToSkin(p, maxRadius, facing) {
  const R = maxRadius || 0.12;
  const rc = Math.ceil(R / CELL);
  const cx = Math.floor(p[0]/CELL), cy = Math.floor(p[1]/CELL), cz = Math.floor(p[2]/CELL);
  let best = -1, bestD = Infinity;
  let fallback = -1, fallbackD = Infinity;
  for (let dx = -rc; dx <= rc; dx++) for (let dy = -rc; dy <= rc; dy++) for (let dz = -rc; dz <= rc; dz++) {
    const b = grid.get(key(cx+dx, cy+dy, cz+dz));
    if (!b) continue;
    for (let n = 0; n < b.length; n++) {
      const v = V[b[n]];
      const d = (v[0]-p[0])**2 + (v[1]-p[1])**2 + (v[2]-p[2])**2;
      if (d < fallbackD) { fallbackD = d; fallback = b[n]; }
      if (facing && (v[3]*facing[0] + v[4]*facing[1] + v[5]*facing[2]) < 0.25) continue;
      if (d < bestD) { bestD = d; best = b[n]; }
    }
  }
  if (best < 0) { best = fallback; bestD = fallbackD; }
  if (best < 0) return { pos: p.slice(), normal: [0, 0, 1], dist: Infinity };
  const v = V[best];
  return {
    pos: [v[0] + v[3]*OUT, v[1] + v[4]*OUT, v[2] + v[5]*OUT],
    normal: [v[3], v[4], v[5]],
    dist: Math.sqrt(bestD),
  };
}

// ---------- Repérage du bras droit sur le modèle ----------
// On suit le membre tranche par tranche en s'éloignant du tronc : à chaque pas
// on ne garde que les sommets proches du centre précédent, ce qui empêche la
// hanche puis la jambe de contaminer la mesure. Une analyse en composantes
// principales échouait ici, la main comptant à elle seule trois fois plus de
// sommets que l'avant-bras.
function traceLimb(x0, yBand, step) {
  const seed = V.filter((v) => v[0] >= x0 && v[0] < x0 + 0.04 && v[1] > yBand[0] && v[1] < yBand[1]);
  if (!seed.length) throw new Error('bras introuvable');
  let cy = seed.reduce((s2, v) => s2 + v[1], 0) / seed.length;
  let cz = seed.reduce((s2, v) => s2 + v[2], 0) / seed.length;
  const axis = [[x0 + 0.02, cy, cz, 0.05]];
  for (let x = x0 + 0.04; x < 0.60; x += step) {
    const sl = V.filter((v) => v[0] >= x && v[0] < x + step
      && Math.abs(v[1] - cy) < 0.16 && Math.abs(v[2] - cz) < 0.16);
    if (sl.length < 40) break;
    cy = sl.reduce((s2, v) => s2 + v[1], 0) / sl.length;
    cz = sl.reduce((s2, v) => s2 + v[2], 0) / sl.length;
    const r = sl.reduce((s2, v) => s2 + Math.hypot(v[1] - cy, v[2] - cz), 0) / sl.length;
    axis.push([x + step / 2, cy, cz, r]);
  }
  return axis;
}
const newArm = traceLimb(0.21, [1.15, 1.45], 0.02);
console.log('bras droit suivi sur', newArm.length, 'tranches :');
newArm.filter((_, i) => i % 3 === 0).forEach((a) =>
  console.log('   x', a[0].toFixed(3), 'y', a[1].toFixed(3), 'z', a[2].toFixed(3), 'rayon', a[3].toFixed(3)));

// ---------- Bras d'origine (corps procédural, bras le long du corps) ----------
// Même axe que celui qui a servi à saisir les coordonnées des points.
const oldArm = [
  [0.186, 1.430, 0.000], [0.205, 1.320, 0.001], [0.219, 1.230, 0.003],
  [0.229, 1.150, 0.005], [0.233, 1.110, 0.007], [0.238, 1.040, 0.009],
  [0.242, 0.965, 0.011], [0.245, 0.900, 0.013], [0.246, 0.872, 0.015],
  [0.248, 0.830, 0.017], [0.250, 0.770, 0.019], [0.251, 0.676, 0.021],
];

// Longueurs cumulées, pour raisonner en position relative le long du membre.
function arcLengths(poly) {
  const L = [0];
  for (let i = 1; i < poly.length; i++) {
    L.push(L[i-1] + Math.hypot(poly[i][0]-poly[i-1][0], poly[i][1]-poly[i-1][1], poly[i][2]-poly[i-1][2]));
  }
  return L;
}
const oldL = arcLengths(oldArm), newL = arcLengths(newArm.map((a) => [a[0], a[1], a[2]]));

// Repère local en un point de l'axe : tangente, plus deux directions
// perpendiculaires construites de la même façon des deux côtés, pour que
// « devant » et « derrière » se correspondent d'un membre à l'autre.
function frameAt(poly, i) {
  const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)];
  const t = V3.normalize([b[0]-a[0], b[1]-a[1], b[2]-a[2]]);
  let u = V3.cross([0, 1, 0], t);
  if (V3.length(u) < 1e-6) u = [1, 0, 0];
  u = V3.normalize(u);
  return { t, u, v: V3.normalize(V3.cross(t, u)) };
}

// Position d'un point le long de l'ancien axe : segment le plus proche,
// abscisse curviligne relative, et écart latéral exprimé dans le repère local.
function projectOnPolyline(poly, L, p) {
  let best = { d: Infinity };
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i], b = poly[i+1];
    const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
    const len2 = ab[0]**2 + ab[1]**2 + ab[2]**2;
    let t = ((p[0]-a[0])*ab[0] + (p[1]-a[1])*ab[1] + (p[2]-a[2])*ab[2]) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0]+ab[0]*t, a[1]+ab[1]*t, a[2]+ab[2]*t];
    const d = Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]);
    if (d < best.d) best = { d, i, t, q, s: L[i] + (L[i+1]-L[i]) * t };
  }
  return best;
}

function pointAtArc(poly, L, s) {
  const total = L[L.length - 1];
  s = Math.max(0, Math.min(total, s));
  for (let i = 0; i < poly.length - 1; i++) {
    if (s <= L[i+1] || i === poly.length - 2) {
      const t = (L[i+1] - L[i]) > 1e-9 ? (s - L[i]) / (L[i+1] - L[i]) : 0;
      const a = poly[i], b = poly[i+1];
      return { pos: [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t], index: i, t };
    }
  }
  return { pos: poly[poly.length-1].slice(), index: poly.length - 2, t: 1 };
}

const newArmPoly = newArm.map((a) => [a[0], a[1], a[2]]);

const ARM_MERIDIANS = new Set(['LU', 'LI', 'HT', 'SI', 'PC', 'TE']);
function isArmPoint(meridianId, p) {
  return ARM_MERIDIANS.has(meridianId) && p[0] > 0.14 && p[1] > 0.60 && p[1] < 1.47;
}

// Un point du bras garde sa position relative le long du membre et le côté sur
// lequel il se trouve. Son écart à l'axe n'est conservé qu'en direction : la
// distance exacte est ensuite donnée par le plaquage sur la peau.
function remapArmPoint(p) {
  const proj = projectOnPolyline(oldArm, oldL, p);
  const ratio = proj.s / oldL[oldL.length - 1];
  const fOld = frameAt(oldArm, proj.i);
  const radial = [p[0]-proj.q[0], p[1]-proj.q[1], p[2]-proj.q[2]];
  const cu = V3.dot(radial, fOld.u), cv = V3.dot(radial, fOld.v);
  const norm = Math.hypot(cu, cv) || 1;

  const target = pointAtArc(newArmPoly, newL, ratio * newL[newL.length - 1]);
  const fNew = frameAt(newArmPoly, target.index);
  const localR = newArm[Math.min(newArm.length - 1, target.index)][3] * 1.25;
  return [
    target.pos[0] + (fNew.u[0]*cu + fNew.v[0]*cv) / norm * localR,
    target.pos[1] + (fNew.u[1]*cu + fNew.v[1]*cv) / norm * localR,
    target.pos[2] + (fNew.u[2]*cu + fNew.v[2]*cv) / norm * localR,
  ];
}

// ---------- Placement de tous les points ----------
const placed = {};
const normals = {};
const report = [];
MERIDIANS.forEach((m) => {
  m.points.forEach((pt) => {
    const arm = isArmPoint(m.id, pt.pos);
    const guess = arm ? remapArmPoint(pt.pos) : pt.pos.slice();
    const snapped = snapToSkin(guess, 0.15);
    placed[pt.id] = snapped.pos.map((v) => Math.round(v * 10000) / 10000);
    normals[pt.id] = snapped.normal;
    report.push({ id: pt.id, arm, dist: snapped.dist });
  });
});
report.sort((a, b) => b.dist - a.dist);
console.log('points recalés :', report.length, '| dont bras :', report.filter(r => r.arm).length);
console.log('écart max entre la position devinée et la peau :', (report[0].dist * 100).toFixed(1), 'cm (', report[0].id, ')');

// ---------- Trajets plaqués sur la peau ----------
const paths = {};
let dropped = 0;
MERIDIANS.forEach((m) => {
  const pts = m.points.map((p) => placed[p.id]);
  const nrm = m.points.map((p) => normals[p.id]);
  const pieces = [];
  let current = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const steps = Math.max(4, Math.round(V3.length(V3.sub(b, a)) / 0.02));
    const samples = [];
    let sumDist = 0;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const mid = V3.lerp(a, b, t);
      // Chaque échantillon est replaqué sur la peau ; l'orientation attendue
      // est interpolée entre les deux extrémités, ce qui maintient le trajet
      // du bon côté du membre ou du tronc.
      const facing = V3.normalize(V3.lerp(nrm[i], nrm[i + 1], t));
      const snap = snapToSkin(mid, 0.16, facing);
      sumDist += snap.dist;
      samples.push(snap.pos.map((v) => Math.round(v * 10000) / 10000));
    }
    // Deux points consécutifs très éloignés l'un de l'autre — SP10 à la cuisse
    // puis SP21 au flanc — sont reliés par une corde qui passe hors du corps.
    // Le trajet réel entre eux n'est pas dans nos données : mieux vaut une
    // interruption qu'un câble tendu dans le vide.
    if (sumDist / Math.max(1, steps - 1) > 0.06) {
      pieces.push(current);
      current = [b];
      dropped++;
      continue;
    }
    current = current.concat(samples, [b]);
  }
  pieces.push(current);
  paths[m.id] = pieces.filter((pc) => pc.length > 1);
});
console.log('trajets :', Object.values(paths).reduce((s2, p2) => s2 + p2.length, 0), 'tronçons |',
  dropped, 'liaisons écartées (passage hors du corps)');

const out = `// Positions des points d'acupression et trajets des méridiens, calés sur le
// modèle anatomique. Fichier produit par scripts/place-points.js — ne pas
// modifier à la main : relancer le script après toute retouche du modèle.
//
// Coordonnées du côté droit du sujet ; le côté gauche est obtenu par symétrie
// au rendu. Les points du Ren Mai et du Du Mai sont sur la ligne médiane.

const POINTS_3D = ${JSON.stringify(placed)};

const MERIDIAN_PATHS = ${JSON.stringify(paths)};

if (typeof module !== 'undefined') module.exports = { POINTS_3D, MERIDIAN_PATHS };
`;
fs.writeFileSync(path.join(ROOT, 'js', 'points-3d.js'), out);
console.log('écrit js/points-3d.js :', (out.length / 1024).toFixed(0), 'Ko');
