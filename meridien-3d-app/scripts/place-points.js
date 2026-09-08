// Place les points d'acupression sur le modèle à partir de leur localisation
// canonique (scripts/point-rules.js) et des repères mesurés sur le maillage
// (scripts/landmarks.js).
//
// La méthode reprend celle du praticien : on repère d'abord les points osseux,
// on divise les segments qui les relient en cun — l'unité proportionnelle —,
// puis on place chaque point à sa hauteur et sur son secteur du membre. La
// position obtenue est enfin plaquée sur la peau réelle, ce qui règle la
// distance à l'axe sans avoir à la deviner.
//
// Usage : node scripts/place-points.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.V3 = require(path.join(ROOT, 'js', 'vec3.js')).V3;
const { MERIDIANS } = require(path.join(ROOT, 'js', 'data.js'));
const { POINT_RULES, MERIDIAN_ROUTE } = require('./point-rules.js');
const { loadVertices, detectLandmarks } = require('./landmarks.js');

const { V } = loadVertices(ROOT);
const L = detectLandmarks(V);
console.log('sommets :', V.length.toLocaleString('fr-FR'));

// ---------------------------------------------------------------
// Grille de plus proche voisin, pour plaquer sur la peau
// ---------------------------------------------------------------
const CELL = 0.03;
const grid = new Map();
const gkey = (x, y, z) => x + ',' + y + ',' + z;
V.forEach((v, i) => {
  const k = gkey(Math.floor(v[0]/CELL), Math.floor(v[1]/CELL), Math.floor(v[2]/CELL));
  let b = grid.get(k);
  if (!b) { b = []; grid.set(k, b); }
  b.push(i);
});

const OUT = 0.004;
function snapToSkin(p, maxRadius, facing) {
  const R = maxRadius || 0.10;
  const rc = Math.ceil(R / CELL);
  const cx = Math.floor(p[0]/CELL), cy = Math.floor(p[1]/CELL), cz = Math.floor(p[2]/CELL);
  let best = -1, bestD = Infinity, fb = -1, fbD = Infinity;
  for (let dx = -rc; dx <= rc; dx++) for (let dy = -rc; dy <= rc; dy++) for (let dz = -rc; dz <= rc; dz++) {
    const b = grid.get(gkey(cx+dx, cy+dy, cz+dz));
    if (!b) continue;
    for (let n = 0; n < b.length; n++) {
      const v = V[b[n]];
      const d = (v[0]-p[0])**2 + (v[1]-p[1])**2 + (v[2]-p[2])**2;
      if (d < fbD) { fbD = d; fb = b[n]; }
      // `facing` garde le point du bon côté du corps : sans lui, un point du
      // dos peut s'accrocher à la peau du ventre, plus proche à vol d'oiseau.
      if (facing && (v[3]*facing[0] + v[4]*facing[1] + v[5]*facing[2]) < 0.2) continue;
      if (d < bestD) { bestD = d; best = b[n]; }
    }
  }
  if (best < 0) { best = fb; bestD = fbD; }
  if (best < 0) return { pos: p.slice(), normal: [0, 0, 1], dist: Infinity };
  const v = V[best];
  return {
    pos: [v[0] + v[3]*OUT, v[1] + v[4]*OUT, v[2] + v[5]*OUT],
    normal: [v[3], v[4], v[5]],
    dist: Math.sqrt(bestD),
  };
}

// Point de la peau vu depuis l'axe du corps, à une hauteur donnée et dans une
// direction donnée. Partir de la surface plutôt que d'un point lointain évite
// que le plaquage ne trouve rien dans son voisinage.
function surfaceAt(y, dirX, dirZ, tol) {
  const t = tol || 0.012;
  let best = null, bestDot = -Infinity;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    if (Math.abs(v[1] - y) > t) continue;
    const d = v[0] * dirX + v[2] * dirZ;
    if (d > bestDot) { bestDot = d; best = v; }
  }
  return best ? [best[0], best[1], best[2]] : null;
}

// ---------------------------------------------------------------
// Le cun, mesuré sur ce corps précis
// ---------------------------------------------------------------
// Du creux sus-sternal au nombril il y a 17 cun : c'est la mesure la plus sûre
// du modèle, les deux repères se lisant nettement sur la ligne médiane.
const CUN = (L.sternalNotch[1] - L.navel[1]) / 17;
console.log('1 cun =', (CUN * 1000).toFixed(1), 'mm');

// Repères dérivés par proportion, là où la forme ne les donne pas : les cuisses
// du modèle se touchent, aucune fente ne marque l'entrejambe, et le bras tendu
// n'a aucun pli au coude.
const PUBIS_Y = L.navel[1] - 5 * CUN;
const XIPHOID_Y = L.sternalNotch[1] - 9 * CUN;
console.log('pubis dérivé à y =', PUBIS_Y.toFixed(3), '| appendice xiphoïde à', XIPHOID_Y.toFixed(3));

// ---------------------------------------------------------------
// Membre supérieur : axe et repère de rotation
// ---------------------------------------------------------------
const armAxis = L.armAxis.map((a) => a.p);
const armStart = armAxis[0];
const armEnd = armAxis[armAxis.length - 1];

// Orientation de la main : c'est elle qui dit où est la paume. Le nuage de
// points de la main est aplati ; sa direction de moindre épaisseur est la
// normale de la paume.
const handPts = V.filter((v) => {
  const d = Math.hypot(v[0]-armEnd[0], v[1]-armEnd[1], v[2]-armEnd[2]);
  return d < 0.09 && v[0] > 0.40;
});
let palmNormal = [0, 0, 1];
{
  const c = [0, 0, 0];
  handPts.forEach((v) => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
  c[0] /= handPts.length; c[1] /= handPts.length; c[2] /= handPts.length;
  // Direction de variance minimale, par déflation : on prend l'axe principal,
  // puis le second, le troisième est la normale cherchée.
  const dirs = [];
  let residual = handPts.map((v) => [v[0]-c[0], v[1]-c[1], v[2]-c[2]]);
  for (let k = 0; k < 2; k++) {
    let d = [Math.random(), Math.random(), Math.random()];
    for (let it = 0; it < 30; it++) {
      const acc = [0, 0, 0];
      residual.forEach((r) => {
        const dot = r[0]*d[0] + r[1]*d[1] + r[2]*d[2];
        acc[0] += r[0]*dot; acc[1] += r[1]*dot; acc[2] += r[2]*dot;
      });
      d = V3.normalize(acc);
    }
    dirs.push(d);
    residual = residual.map((r) => {
      const dot = r[0]*d[0] + r[1]*d[1] + r[2]*d[2];
      return [r[0]-d[0]*dot, r[1]-d[1]*dot, r[2]-d[2]*dot];
    });
  }
  palmNormal = V3.normalize(V3.cross(dirs[0], dirs[1]));
  // On l'oriente vers l'intérieur du corps : dans cette pose, la paume regarde
  // la cuisse.
  if (palmNormal[0] > 0) palmNormal = V3.scale(palmNormal, -1);
}
console.log('normale de la paume :', palmNormal.map((v) => v.toFixed(2)).join(', '));

function arcLengths(poly) {
  const out = [0];
  for (let i = 1; i < poly.length; i++) out.push(out[i-1] + V3.length(V3.sub(poly[i], poly[i-1])));
  return out;
}
const armL = arcLengths(armAxis);
const armTotal = armL[armL.length - 1];

// L'aisselle est à 0 cun, le pli du poignet à 21. Le reste de la longueur
// tracée est la main.
const WRIST_T = 0.80; // part de l'axe tracé occupée par bras + avant-bras
const armCunToT = (cun) => Math.max(0, Math.min(1, (cun / 21) * WRIST_T));

function pointOnPoly(poly, Ls, t) {
  const s = t * Ls[Ls.length - 1];
  for (let i = 0; i < poly.length - 1; i++) {
    if (s <= Ls[i+1] || i === poly.length - 2) {
      const f = (Ls[i+1] - Ls[i]) > 1e-9 ? (s - Ls[i]) / (Ls[i+1] - Ls[i]) : 0;
      return { pos: V3.lerp(poly[i], poly[i+1], f), tangent: V3.normalize(V3.sub(poly[i+1], poly[i])) };
    }
  }
  return { pos: poly[poly.length-1], tangent: [1, 0, 0] };
}

// Repère tournant autour du membre : 0° du côté de la paume, 90° côté pouce.
function radiusAt(axis, t) {
  const i = Math.max(0, Math.min(axis.length - 1, Math.round(t * (axis.length - 1))));
  return axis[i].r;
}

function armFrame(t) {
  const { pos, tangent } = pointOnPoly(armAxis, armL, t);
  const palmDir = V3.normalize(V3.sub(palmNormal, V3.scale(tangent, V3.dot(palmNormal, tangent))));
  const thumbDir = V3.normalize(V3.cross(palmDir, tangent));
  return { pos, tangent, a: palmDir, b: thumbDir, r: radiusAt(L.armAxis, t) };
}

// ---------------------------------------------------------------
// Membre inférieur
// ---------------------------------------------------------------
const legAxis = L.legAxis.map((a) => a.p);
const legL = arcLengths(legAxis);
// Le pubis est à 0 cun, le genou à 18, la malléole à 34. L'axe tracé part du
// haut de la cuisse et descend jusqu'au sol.
const legTopY = legAxis[0][1], legBotY = legAxis[legAxis.length - 1][1];
function legCunToT(cun) {
  const y = PUBIS_Y - cun * CUN;
  return Math.max(0, Math.min(1, (legTopY - y) / (legTopY - legBotY)));
}
function legFrame(t) {
  const { pos, tangent } = pointOnPoly(legAxis, legL, t);
  const front = V3.normalize(V3.sub([0, 0, 1], V3.scale(tangent, V3.dot([0, 0, 1], tangent))));
  const lateral = V3.normalize(V3.cross(front, tangent));
  return { pos, tangent, a: front, b: V3.dot(lateral, [1, 0, 0]) > 0 ? lateral : V3.scale(lateral, -1), r: radiusAt(L.legAxis, t) };
}

// ---------------------------------------------------------------
// Niveaux vertébraux
// ---------------------------------------------------------------
// De C7 à L4 il y a seize espaces ; le rapport tombe très près d'un cun par
// vertèbre sur ce corps, ce qui recoupe la règle clinique.
const VERT_STEP = CUN;
const VERT_INDEX = {
  C7b: 0.5, T3: 3, T4: 4, T5: 5, T9: 9, T11: 11, L2: 14, L2b: 14.5, L4: 16, S5: 21,
};
function vertebraY(name) {
  return L.sternalNotch[1] - 0.01 - (VERT_INDEX[name] || 0) * VERT_STEP;
}

// ---------------------------------------------------------------
// Tête
// ---------------------------------------------------------------
const CHIN_Y = L.neckBase + 0.02;
const HEAD_H = L.height - CHIN_Y;
let headHalfWidth = 0.075;
{
  let w = 0;
  V.forEach((v) => {
    if (v[1] > CHIN_Y + HEAD_H * 0.4 && v[1] < CHIN_Y + HEAD_H * 0.75) w = Math.max(w, Math.abs(v[0]));
  });
  headHalfWidth = w;
}
console.log('tête : menton y =', CHIN_Y.toFixed(3), '| hauteur', HEAD_H.toFixed(3), '| demi-largeur', headHalfWidth.toFixed(3));

// ---------------------------------------------------------------
// Placement
// ---------------------------------------------------------------
function place(id, rule) {
  const around = (frame, angleDeg, radius) => {
    const a = angleDeg * Math.PI / 180;
    const dir = V3.add(V3.scale(frame.a, Math.cos(a)), V3.scale(frame.b, Math.sin(a)));
    const r = radius || (frame.r ? frame.r * 1.15 : 0.06);
    return { guess: V3.add(frame.pos, V3.scale(dir, r)), facing: V3.normalize(dir) };
  };

  switch (rule.zone) {
    case 'torse': {
      const y = rule.from === 'nombril' ? L.navel[1] - rule.cun * CUN : L.sternalNotch[1] - rule.cun * CUN;
      const lat = rule.lat * CUN;
      if (rule.face === 'side') {
        const sp = surfaceAt(y, 1, 0) || [0.15, y, 0];
        return { guess: sp, facing: [1, 0, 0] };
      }
      // On lit la profondeur de la peau à cette hauteur, puis on se décale
      // latéralement du nombre de cun prescrit.
      const sp = surfaceAt(y, 0, 1) || [0, y, 0.12];
      return { guess: [lat, y, sp[2]], facing: V3.normalize([lat * 3, 0, 1]) };
    }
    case 'dos': {
      const y = vertebraY(rule.vertebre);
      const sp = surfaceAt(y, 0, -1) || [0, y, -0.12];
      return { guess: [rule.lat * CUN, y, sp[2]], facing: V3.normalize([rule.lat * 2, 0, -1]) };
    }
    case 'nuque': {
      const y = L.neckBase + 0.09;
      const sp = surfaceAt(y, 0, -1) || [0, y, -0.08];
      return { guess: [rule.lat * CUN, y, sp[2]], facing: V3.normalize([rule.lat, -0.3, -1]) };
    }
    case 'bras': {
      const f = armFrame(armCunToT(rule.cun));
      return around(f, rule.angle);
    }
    case 'main': {
      const t = WRIST_T + (1 - WRIST_T) * rule.t;
      const f = armFrame(Math.min(1, t));
      return around(f, rule.angle);
    }
    case 'epaule': {
      const f = { pos: [L.acromion[0] * 0.92, L.acromion[1] - 0.03, 0], a: [0, 0, 1], b: [1, 0, 0] };
      if (rule.versLeCou !== undefined) {
        // GB21 : à mi-distance entre C7 et l'acromion, sur le trapèze.
        return {
          guess: [L.acromion[0] * rule.versLeCou, L.acromion[1] + 0.02, -0.03],
          facing: [0.2, 1, -0.2],
        };
      }
      return around(f, rule.angle, 0.09);
    }
    case 'hanche': {
      // GB30 : au tiers de la distance entre le grand trochanter et le sacrum.
      const tro = L.trochanter || [0.16, PUBIS_Y + 0.05, 0];
      const sac = [0, PUBIS_Y + 0.10, -0.10];
      return { guess: V3.lerp(tro, sac, rule.ratio), facing: [0.5, 0, -1] };
    }
    case 'jambe': {
      const f = legFrame(legCunToT(rule.cun));
      return around(f, rule.angle);
    }
    case 'pied': {
      const heel = L.heel, toe = L.toeTip;
      const base = V3.lerp(heel, toe, rule.t);
      if (rule.plante) return { guess: [base[0], base[1] - 0.05, base[2]], facing: [0, -1, 0] };
      const a = rule.angle * Math.PI / 180;
      // 0° = dessus du pied, 90° = dehors, 270° = dedans
      const dir = V3.normalize([Math.sin(a), Math.cos(a), 0]);
      return { guess: V3.add([base[0], base[1] + 0.02, base[2]], V3.scale(dir, 0.05)), facing: dir };
    }
    case 'tete': {
      const y = CHIN_Y + rule.h * HEAD_H;
      const x = rule.lat * headHalfWidth;
      if (rule.face === 'top') return { guess: [0, L.height - 0.005, 0], facing: [0, 1, 0] };
      if (rule.face === 'side') {
        const dz = rule.avance || 0;
        const sp = surfaceAt(y, 1, dz) || [0.09, y, 0];
        return { guess: sp, facing: V3.normalize([1, 0, dz]) };
      }
      const dir = V3.normalize([rule.lat * 0.8, 0, 1]);
      const sp = surfaceAt(y, dir[0], dir[2]) || [x, y, 0.09];
      return { guess: sp, facing: dir };
    }
    default:
      return null;
  }
}

const placed = {};
const normals = {};
const report = [];
MERIDIANS.forEach((m) => {
  m.points.forEach((pt) => {
    const rule = POINT_RULES[pt.id];
    if (!rule) { report.push({ id: pt.id, missing: true }); return; }
    const r = place(pt.id, rule);
    const snap = snapToSkin(r.guess, 0.16, r.facing);
    placed[pt.id] = snap.pos.map((v) => Math.round(v * 10000) / 10000);
    normals[pt.id] = snap.normal;
    report.push({ id: pt.id, zone: rule.zone, dist: snap.dist });
  });
});

const missing = report.filter((r) => r.missing);
if (missing.length) console.log('SANS RÈGLE :', missing.map((r) => r.id).join(', '));
console.log('points placés :', Object.keys(placed).length);

// ---------------------------------------------------------------
// Trajets plaqués sur la peau
// ---------------------------------------------------------------
const paths = {};
let cut = 0;
MERIDIANS.forEach((m) => {
  // Suite ordonnée des positions à relier : les points du canal, plus les
  // jalons qui rétablissent son trajet là où nos données sautent une région.
  const route = [];
  const via = MERIDIAN_ROUTE[m.id] || [];
  m.points.forEach((pt) => {
    if (!placed[pt.id]) return;
    route.push({ pos: placed[pt.id], n: normals[pt.id] });
    const jalons = via.find((v) => v.apres === pt.id);
    if (jalons) {
      jalons.via.forEach((rule) => {
        const r = place('via', rule);
        if (!r) return;
        const snap = snapToSkin(r.guess, 0.16, r.facing);
        route.push({ pos: snap.pos.map((v) => Math.round(v * 10000) / 10000), n: snap.normal });
      });
    }
  });

  const pieces = [];
  let current = [route[0].pos];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i].pos, b = route[i + 1].pos;
    const steps = Math.max(4, Math.round(V3.length(V3.sub(b, a)) / 0.02));
    const samples = [];
    let sum = 0;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const facing = V3.normalize(V3.lerp(route[i].n, route[i + 1].n, t));
      const snap = snapToSkin(V3.lerp(a, b, t), 0.16, facing);
      sum += snap.dist;
      samples.push(snap.pos.map((v) => Math.round(v * 10000) / 10000));
    }
    // Une corde qui s'écarte durablement de la peau relie deux régions entre
    // lesquelles le trajet réel n'est pas représenté : on interrompt plutôt
    // que de tendre un câble dans le vide.
    if (sum / Math.max(1, steps - 1) > 0.05) {
      pieces.push(current); current = [b]; cut++; continue;
    }
    current = current.concat(samples, [b]);
  }
  pieces.push(current);
  paths[m.id] = pieces.filter((pc) => pc.length > 1);
});
console.log('trajets :', Object.values(paths).reduce((s, p) => s + p.length, 0), 'tronçons |', cut, 'interruptions');

const out = `// Positions des points d'acupression et trajets des méridiens.
// Fichier produit par scripts/place-points.js à partir des localisations
// canoniques (point-rules.js) et des repères mesurés sur le modèle.
// Ne pas modifier à la main : relancer le script.
//
// Coordonnées du côté droit du sujet ; le côté gauche est obtenu par symétrie.

const POINTS_3D = ${JSON.stringify(placed)};

const MERIDIAN_PATHS = ${JSON.stringify(paths)};

if (typeof module !== 'undefined') module.exports = { POINTS_3D, MERIDIAN_PATHS };
`;
fs.writeFileSync(path.join(ROOT, 'js', 'points-3d.js'), out);
console.log('écrit js/points-3d.js :', (out.length / 1024).toFixed(0), 'Ko');

// Contrôle : distance entre la position construite et la peau. Un grand écart
// signale une règle mal traduite.
report.filter((r) => !r.missing).sort((a, b) => b.dist - a.dist);
const worst = report.filter((r) => !r.missing).sort((a, b) => b.dist - a.dist).slice(0, 8);
console.log('écarts les plus grands entre position construite et peau :');
worst.forEach((w) => console.log('   ', w.id.padEnd(6), w.zone.padEnd(8), (w.dist * 100).toFixed(1), 'cm'));
