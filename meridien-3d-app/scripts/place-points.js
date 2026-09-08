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
const { loadVertices, detectLandmarks, detectDigits, refineLimb } = require('./landmarks.js');

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
function surfaceAt(y, dirX, dirZ, tol, sansBras) {
  const t = tol || 0.012;
  let best = null, bestDot = -Infinity;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    if (Math.abs(v[1] - y) > t) continue;
    // En pose A le bras longe le tronc : chercher « le point le plus à droite »
    // à hauteur des côtes trouve le bras, pas la paroi thoracique.
    if (sansBras && L.isArm(v)) continue;
    const d = v[0] * dirX + v[2] * dirZ;
    if (d > bestDot) { bestDot = d; best = v; }
  }
  return best ? [best[0], best[1], best[2]] : null;
}

// Profondeur de la peau à une hauteur et un écart latéral donnés. Un point du
// thorax à 6 cun de la ligne médiane n'est pas à la profondeur du sternum : la
// cage se dérobe de trois centimètres sur cette distance.
function surfaceColumn(y, x, front, tol) {
  const t = tol || 0.014;
  let best = null;
  for (let i = 0; i < V.length; i++) {
    const v = V[i];
    if (Math.abs(v[1] - y) > t || Math.abs(v[0] - x) > t) continue;
    if (L.isArm(v)) continue;
    if (!best || (front ? v[2] > best[2] : v[2] < best[2])) best = v;
  }
  return best ? [best[0], best[1], best[2]] : null;
}

// ---------------------------------------------------------------
// Les cun, mesurées sur ce corps précis
// ---------------------------------------------------------------
// La cun n'est pas une longueur : c'est une part de segment. Chaque segment du
// corps se divise en son propre nombre de parts égales, et ces parts n'ont
// aucune raison d'être de même taille d'un segment à l'autre — sur un corps
// réel, la cun du bas-ventre fait près du double de celle du haut du thorax.
// Utiliser une cun unique, comme on le faisait, plaçait CV3 sept centimètres
// au-dessus de sa place.
//
//   creux sus-sternal → appendice xiphoïde  9 cun
//   appendice xiphoïde → nombril            8 cun
//   nombril → bord supérieur du pubis       5 cun
//   pubis → genou                          18 cun
//   genou → malléole                       16 cun
//   aisselle → pli du coude                 9 cun
//   pli du coude → pli du poignet          12 cun
const NOTCH_Y = L.sternalNotch[1];
const NAVEL_Y = L.navel[1];
const PUBIS_Y = L.pubis[1];
// L'appendice xiphoïde ne se lit pas sur la peau : la pointe du sternum ne
// fait pas de relief. On le pose là où l'anatomie le donne, à 45 % de la
// descente du creux sus-sternal vers le nombril.
const XIPHOID_Y = NOTCH_Y + (NAVEL_Y - NOTCH_Y) * 0.45;

// Cun verticale du tronc, pour les niveaux vertébraux du dos : de C7 à L4 il y
// a seize espaces, et la mesure tombe sur le repère clinique — L4 à hauteur
// des crêtes iliaques.
const CUN = (NOTCH_Y - NAVEL_Y) / 17;

// Cun horizontale du tronc : l'écart entre les deux mamelons vaut 8 cun. Le
// modèle ne permet pas de mesurer cet écart — le bras longe le thorax et
// masque sa largeur — mais tous les repères verticaux de ce corps suivent la
// norme anthropométrique à 1,5 % près, on lui emprunte donc celui-ci.
const LAT_CUN = 0.01405 * L.height;

console.log('cun : tronc vertical', (CUN*1000).toFixed(1),
  'mm | thorax', ((NOTCH_Y-XIPHOID_Y)/9*1000).toFixed(1),
  'mm | épigastre', ((XIPHOID_Y-NAVEL_Y)/8*1000).toFixed(1),
  'mm | bas-ventre', ((NAVEL_Y-PUBIS_Y)/5*1000).toFixed(1),
  'mm | latérale', (LAT_CUN*1000).toFixed(1), 'mm');

// Hauteur d'un point du tronc, segment par segment.
function torsoY(from, cun) {
  if (from === 'nombril') {
    return cun >= 0
      ? NAVEL_Y + (PUBIS_Y - NAVEL_Y) * (cun / 5)          // sous le nombril
      : NAVEL_Y + (XIPHOID_Y - NAVEL_Y) * (-cun / 8);      // au-dessus
  }
  return cun <= 9
    ? NOTCH_Y + (XIPHOID_Y - NOTCH_Y) * (cun / 9)
    : XIPHOID_Y + (NAVEL_Y - XIPHOID_Y) * ((cun - 9) / 8);
}

// ---------------------------------------------------------------
// Membre supérieur : axe et repère de rotation
// ---------------------------------------------------------------
const armAxis = L.armAxis.map((a) => a.p);
const armStart = armAxis[0];
const armEnd = armAxis[armAxis.length - 1];

// Axe du bras redressé, et rayon mesuré perpendiculairement. C'est ce rayon
// qui dit à quelle distance de l'axe se trouve la peau ; mal mesuré, tous les
// points du bras flottent au-dessus du vide et le plaquage les fait glisser.
const BRAS_PTS = V.filter((v) => L.isArm(v));
const BRAS = L.armLimb || refineLimb(BRAS_PTS, armAxis, 44);

// Poignet : le resserrement qui précède l'élargissement de la main. Sur le
// profil perpendiculaire il se lit sans ambiguïté, ce que la mesure par
// tranches obliques ne permettait pas — elle le plaçait dix centimètres trop
// haut, et avec lui tous les points de l'avant-bras.
const WRIST_T = L.wristT;
const armCunToT = (cun) => Math.max(0, Math.min(1, (cun / 21) * WRIST_T));
console.log('bras : axe', (BRAS.total*100).toFixed(1), 'cm | poignet à t =', WRIST_T.toFixed(3),
  'soit', (BRAS.total*WRIST_T*100).toFixed(1), 'cm de l\'aisselle | 1 cun bras =',
  (BRAS.total*WRIST_T/21*1000).toFixed(1), 'mm');

// Distance de la peau à l'axe, dans une direction précise.
//
// Poser un point « à un rayon et quart de l'axe » suppose le membre rond. Il ne
// l'est pas : un poignet est deux fois plus large qu'épais, un mollet fuit en
// arrière. On va donc lire la peau là où le point doit tomber — dans le plan
// perpendiculaire à l'axe, sur le secteur visé — au lieu de la deviner.
function skinRadius(pts, pos, tangent, dir) {
  for (const seuil of [0.96, 0.90, 0.75, 0.5]) {
    let somme = 0, n = 0;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i];
      const dx = v[0]-pos[0], dy = v[1]-pos[1], dz = v[2]-pos[2];
      const le = dx*tangent[0] + dy*tangent[1] + dz*tangent[2];
      if (le > 0.015 || le < -0.015) continue;
      const px = dx - tangent[0]*le, py = dy - tangent[1]*le, pz = dz - tangent[2]*le;
      const r = Math.sqrt(px*px + py*py + pz*pz);
      if (r < 1e-4 || r > 0.16) continue;
      if ((px*dir[0] + py*dir[1] + pz*dir[2]) / r < seuil) continue;
      somme += r; n++;
    }
    if (n >= 8) return somme / n;
  }
  return null;
}

// Lecture d'un membre redressé à l'abscisse t (0 = départ, 1 = bout).
function limbAt(limb, t) {
  const n = limb.noeuds.length;
  const f = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f)), g = f - i;
  return {
    pos: V3.lerp(limb.noeuds[i], limb.noeuds[i+1], g),
    tangent: V3.normalize(V3.lerp(limb.tangentes[i], limb.tangentes[i+1], g)),
    r: limb.rayons[i] * (1 - g) + limb.rayons[i+1] * g,
  };
}

// Orientation de la main : c'est elle qui dit où est la paume. Le nuage de
// points de la main est aplati ; sa direction de moindre épaisseur est la
// normale de la paume.
//
// On en profite pour repérer les cinq doigts un par un. Les points de la main
// se donnent tous par rapport à eux — « angle de l'ongle de l'index », « entre
// les 4e et 5e métacarpiens » — et les placer sur l'axe du bras, comme si la
// main était la suite du cylindre de l'avant-bras, les mettait tous à côté.
const MAIN = (() => {
  const dirMain = V3.normalize(V3.sub(L.fingertip, L.wrist));
  const pts = V.filter((v) => {
    const d = V3.sub([v[0], v[1], v[2]], L.wrist);
    const s = V3.dot(d, dirMain);
    if (s < -0.005 || s > 0.30) return false;
    return V3.length(V3.sub(d, V3.scale(dirMain, s))) < 0.10;
  });

  // Plan de la main : les deux directions de plus grande extension. Leur
  // produit vectoriel donne l'épaisseur, c'est-à-dire la normale de la paume.
  const c = [0, 0, 0];
  pts.forEach((v) => { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; });
  c[0] /= pts.length; c[1] /= pts.length; c[2] /= pts.length;
  const dirs = [];
  let residual = pts.map((v) => [v[0]-c[0], v[1]-c[1], v[2]-c[2]]);
  for (let k = 0; k < 2; k++) {
    let d = [0.31, 0.52, 0.79];
    for (let it = 0; it < 40; it++) {
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
  let paume = V3.normalize(V3.cross(dirs[0], dirs[1]));
  // Dans cette pose la paume regarde la cuisse, donc vers l'intérieur.
  if (paume[0] > 0) paume = V3.scale(paume, -1);

  // Axe long de la main, redressé dans le plan de la paume.
  const brut = V3.normalize(V3.sub(dirs[0], V3.scale(paume, V3.dot(dirs[0], paume))));
  const long = V3.dot(brut, dirMain) > 0 ? brut : V3.scale(brut, -1);
  let travers = V3.normalize(V3.cross(paume, long));

  const opts = { bins: 48, doigts: 5, retrait: 0.09, relief: 0.004 };
  let doigts = detectDigits(pts, L.wrist, long, travers, opts);
  // Le pouce est le plus court des deux doigts de bord : s'il se retrouve en
  // fin de liste, c'est que le balayage va de l'auriculaire vers lui.
  if (doigts.length === 5 && doigts[4].distance < doigts[0].distance) {
    travers = V3.scale(travers, -1);
    doigts = detectDigits(pts, L.wrist, long, travers, opts);
  }
  return {
    pts, long, paume, dors: V3.scale(paume, -1),
    // `travers` va du pouce vers l'auriculaire : le côté radial est donc son opposé.
    radial: V3.scale(travers, -1), ulnaire: travers,
    poignet: L.wrist.slice(),
    doigts,
    longueur: doigts.length ? doigts[2].distance : 0.19,
    commissures: doigts.commissures || [],
    baseDoigts: doigts.length ? [
      (doigts[1].base[0] + doigts[3].base[0]) / 2,
      (doigts[1].base[1] + doigts[3].base[1]) / 2,
      (doigts[1].base[2] + doigts[3].base[2]) / 2,
    ] : L.fingertip.slice(),
  };
})();
const palmNormal = MAIN.paume;
console.log('main : normale de la paume', palmNormal.map((v) => v.toFixed(2)).join(', '),
  '| doigts', MAIN.doigts.length, '| commissures', MAIN.commissures.length);
MAIN.doigts.forEach((d, i) => console.log('   ', ['pouce','index','majeur','annulaire','auriculaire'][i].padEnd(12),
  'bout', d.bout.map((v) => v.toFixed(3)).join(','), '| largeur', (d.largeur*100).toFixed(1), 'cm'));

// ---------------------------------------------------------------
// Pied : orteils repérés de la même façon
// ---------------------------------------------------------------
const PIED = (() => {
  const pts = V.filter((v) => v[0] > 0.02 && v[0] < 0.34 && v[1] < 0.10);
  // Axe du pied dans le plan du sol : le pied du modèle est légèrement ouvert
  // vers l'extérieur, l'axe talon→orteil ne suffit pas à l'orienter.
  const c = [0, 0];
  pts.forEach((v) => { c[0] += v[0]; c[1] += v[2]; });
  c[0] /= pts.length; c[1] /= pts.length;
  let sxx = 0, sxz = 0, szz = 0;
  pts.forEach((v) => { const a = v[0]-c[0], b = v[2]-c[1]; sxx += a*a; sxz += a*b; szz += b*b; });
  const th = 0.5 * Math.atan2(2*sxz, sxx - szz);
  let axe = [Math.cos(th), 0, Math.sin(th)];
  if (axe[2] < 0) axe = [-axe[0], 0, -axe[2]];       // vers les orteils
  let travers = V3.normalize(V3.cross([0, 1, 0], axe));
  if (travers[0] < 0) travers = V3.scale(travers, -1); // vers l'extérieur du pied

  let longueur = 0;
  pts.forEach((v) => {
    const s = V3.dot(V3.sub([v[0], v[1], v[2]], L.heel), axe);
    if (s > longueur) longueur = s;
  });
  const avant = pts.filter((v) => V3.dot(V3.sub([v[0], v[1], v[2]], L.heel), axe) > longueur * 0.62
    && v[1] < L.soleY + 0.055);
  let orteils = detectDigits(avant, L.heel, axe, travers, { bins: 60, doigts: 5, retrait: 0.035, relief: 0.003 });
  // Le gros orteil est le plus long : s'il est en fin de liste, le balayage va
  // du petit orteil vers lui.
  if (orteils.length === 5 && orteils[4].distance > orteils[0].distance) {
    travers = V3.scale(travers, -1);
    orteils = detectDigits(avant, L.heel, axe, travers, { bins: 60, doigts: 5, retrait: 0.035, relief: 0.003 });
  }
  const base = orteils.length
    ? orteils.reduce((s, o) => s + V3.dot(V3.sub(o.base, L.heel), axe), 0) / orteils.length
    : longueur * 0.78;
  return {
    axe, travers, lateral: travers, medial: V3.scale(travers, -1), dors: [0, 1, 0],
    talon: L.heel.slice(), longueur, baseOrteils: base, soleY: L.soleY,
    orteils, commissures: orteils.commissures || [],
  };
})();
console.log('pied : longueur', (PIED.longueur*100).toFixed(1), 'cm | orteils', PIED.orteils.length,
  '| commissures', PIED.commissures.length);
PIED.orteils.forEach((d, i) => console.log('    orteil', i+1,
  d.bout.map((v) => v.toFixed(3)).join(','), '| largeur', (d.largeur*100).toFixed(1), 'cm'));

function armFrame(t) {
  const { pos, tangent, r } = limbAt(BRAS, t);
  const palmDir = V3.normalize(V3.sub(palmNormal, V3.scale(tangent, V3.dot(palmNormal, tangent))));
  const thumbDir = V3.normalize(V3.cross(palmDir, tangent));
  return { pos, tangent, a: palmDir, b: thumbDir, r, pts: BRAS_PTS };
}

// ---------------------------------------------------------------
// Membre inférieur
// ---------------------------------------------------------------
const legAxis = L.legAxis.map((a) => a.p);
const JAMBE_PTS = V.filter((v) => v[0] > 0.02 && v[1] < L.crotch + 0.04 && !L.isArm(v));
const JAMBE = refineLimb(JAMBE_PTS, legAxis, 44);

// Genou et malléole viennent des repères mesurés sur le maillage : le genou à
// l'endroit où le membre est le moins épais d'avant en arrière, la malléole à
// sa hauteur anthropométrique. Le profil des rayons ne les donnait pas — il
// décroît sans marquer l'articulation.
const KNEE_Y = L.kneeY;
const ANKLE_Y = L.malleolusY;
console.log('jambe : pubis y =', PUBIS_Y.toFixed(3), '| genou', KNEE_Y.toFixed(3),
  '| malléole', ANKLE_Y.toFixed(3), '| 1 cun cuisse =', ((PUBIS_Y - KNEE_Y) / 18 * 1000).toFixed(1),
  'mm | 1 cun jambe =', ((KNEE_Y - ANKLE_Y) / 16 * 1000).toFixed(1), 'mm');

// Le membre inférieur se divise en deux segments proportionnels : 18 cun du
// pubis au genou, 16 du genou à la malléole. Chaque segment a donc sa propre
// cun, comme le veut la mesure clinique.
function legCunToT(cun) {
  const y = cun <= 18
    ? PUBIS_Y + (KNEE_Y - PUBIS_Y) * (cun / 18)
    : KNEE_Y + (ANKLE_Y - KNEE_Y) * ((cun - 18) / 16);
  // Retour à l'abscisse du membre : on cherche le nœud à cette hauteur.
  const N = JAMBE.noeuds;
  for (let i = 0; i < N.length - 1; i++) {
    if (y <= N[i][1] && y >= N[i+1][1]) {
      const f = (N[i][1] - y) / Math.max(1e-9, N[i][1] - N[i+1][1]);
      return (i + f) / (N.length - 1);
    }
  }
  return y > N[0][1] ? 0 : 1;
}

function legFrame(t) {
  const { pos, tangent, r } = limbAt(JAMBE, t);
  const front = V3.normalize(V3.sub([0, 0, 1], V3.scale(tangent, V3.dot([0, 0, 1], tangent))));
  const lateral = V3.normalize(V3.cross(front, tangent));
  return { pos, tangent, a: front, b: V3.dot(lateral, [1, 0, 0]) > 0 ? lateral : V3.scale(lateral, -1), r, pts: JAMBE_PTS };
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
  // GV1 n'est pas une vertèbre : le point se situe sous la pointe du coccyx,
  // à hauteur du périnée. Le compte des espaces vertébraux ne l'atteint pas.
  if (name === 'S5') return L.crotch + 0.03;
  return L.sternalNotch[1] - 0.01 - (VERT_INDEX[name] || 0) * VERT_STEP;
}

// ---------------------------------------------------------------
// Tête
// ---------------------------------------------------------------
const CHIN_Y = L.chinY;
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
// Points de la main et du pied
// ---------------------------------------------------------------
// Ces deux régions ne se décrivent pas en cun mais par rapport aux doigts :
// un angle d'ongle, une commissure, le creux entre deux métacarpiens. Les
// règles nomment donc le doigt et le côté, et le placement va chercher le
// repère mesuré sur le maillage.

const COTE_MAIN = { radial: 1, ulnaire: -1, centre: 0 };
const COTE_PIED = { medial: -1, lateral: 1, centre: 0 };

// Coordonnée transverse d'un doigt, comptée depuis l'axe de la main.
function traversDoigt(M, i) {
  return V3.dot(V3.sub(M.doigts[i - 1].bout, M.poignet), M.ulnaire);
}

// Repère plan d'un membre plat : on avance de `avance` fois sa longueur depuis
// la racine, on se décale en travers à l'aplomb des doigts nommés, et on laisse
// le plaquage remonter à la peau du côté demandé. Les points du dos de la main
// et du dessus du pied — LI4, TE3, LR3 — se donnent ainsi : « entre le 1er et
// le 2e métacarpien, à mi-longueur ». Les repérer depuis la commissure ne
// marchait pas : le fond du sillon entre deux doigts écartés ne se lit pas sur
// un profil d'avancée, et TE3 se posait sur l'auriculaire.
function pointPlan(rule, cadre) {
  const { racine, long, travers, dors, paume, longueur, doigts } = cadre;
  const noms = rule.entre || [1];
  let t = 0;
  noms.forEach((i) => { t += V3.dot(V3.sub(doigts[i - 1].bout, racine), travers); });
  t = t / noms.length + (rule.decal || 0);
  const p = V3.add(racine, V3.add(V3.scale(long, rule.avance * longueur), V3.scale(travers, t)));
  const face = rule.face === 'palmaire' ? paume
    : rule.face === 'bord' ? travers
    : rule.face === 'bordOppose' ? V3.scale(travers, -1)
    : dors;
  return { guess: V3.add(p, V3.scale(face, 0.005)), facing: face, rayon: 0.05 };
}

function pointMain(rule) {
  const M = MAIN;
  if (!M.doigts.length) return { guess: L.fingertip.slice(), facing: [0, -1, 0], rayon: 0.05 };

  if (rule.doigt) {
    const d = M.doigts[rule.doigt - 1];
    const p = V3.lerp(d.base, d.bout, rule.t === undefined ? 0.9 : rule.t);
    if (rule.face === 'bout') {
      return { guess: V3.add(d.bout, V3.scale(M.long, 0.004)), facing: M.long, rayon: 0.02 };
    }
    const cote = COTE_MAIN[rule.cote] || 0;
    const versFace = rule.face === 'palmaire' ? M.paume : M.dors;
    const dir = V3.normalize(V3.add(V3.scale(M.radial, cote), V3.scale(versFace, cote ? 0.5 : 1)));
    return { guess: V3.add(p, V3.scale(dir, d.largeur * 0.40)), facing: dir, rayon: 0.02 };
  }

  return pointPlan(rule, {
    racine: M.poignet, long: M.long, travers: M.ulnaire,
    dors: M.dors, paume: M.paume, longueur: M.longueur, doigts: M.doigts,
  });
}

function pointPied(rule) {
  const P = PIED;
  if (!P.orteils.length) return { guess: L.toeTip.slice(), facing: [0, 1, 0], rayon: 0.05 };

  if (rule.orteil) {
    const d = P.orteils[rule.orteil - 1];
    const p = V3.lerp(d.base, d.bout, rule.t === undefined ? 0.9 : rule.t);
    const cote = COTE_PIED[rule.cote] || 0;
    const dir = V3.normalize(V3.add(V3.scale(P.lateral, cote), V3.scale(P.dors, cote ? 0.5 : 1)));
    return { guess: V3.add(p, V3.scale(dir, d.largeur * 0.40)), facing: dir, rayon: 0.02 };
  }

  return pointPlan(rule, {
    racine: P.talon, long: P.axe, travers: P.lateral,
    dors: [0, 1, 0], paume: [0, -1, 0], longueur: P.longueur, doigts: P.orteils,
  });
}

// ---------------------------------------------------------------
// Placement
// ---------------------------------------------------------------
function place(id, rule) {
  const around = (frame, angleDeg, radius) => {
    const a = angleDeg * Math.PI / 180;
    const dir = V3.normalize(V3.add(V3.scale(frame.a, Math.cos(a)), V3.scale(frame.b, Math.sin(a))));
    const lu = frame.pts ? skinRadius(frame.pts, frame.pos, frame.tangent, dir) : null;
    const r = radius || lu || (frame.r ? frame.r * 1.15 : 0.06);
    // La peau étant lue au bon endroit, le plaquage n'a plus qu'à corriger le
    // millimètre : on lui interdit d'aller chercher plus loin, sans quoi le
    // point glisserait le long du membre.
    return { guess: V3.add(frame.pos, V3.scale(dir, r + 0.002)), facing: dir, rayon: lu ? 0.02 : 0.16 };
  };

  switch (rule.zone) {
    case 'torse': {
      const y = torsoY(rule.from, rule.cun);
      const lat = rule.lat * LAT_CUN;
      if (rule.face === 'side') {
        const sp = surfaceAt(y, 1, 0, 0.012, true) || [0.15, y, 0];
        return { guess: sp, facing: [1, 0, 0], rayon: 0.05 };
      }
      // On lit la peau à la hauteur ET à l'écart latéral voulus : le point se
      // pose alors sur le thorax, et non trois centimètres devant lui.
      const sp = surfaceColumn(y, lat, true) || surfaceAt(y, 0, 1, 0.012, true) || [lat, y, 0.12];
      return { guess: [lat, y, sp[2]], facing: V3.normalize([lat * 3, 0, 1]), rayon: 0.04 };
    }
    case 'dos': {
      const y = vertebraY(rule.vertebre);
      const x = rule.lat * LAT_CUN;
      const sp = surfaceColumn(y, x, false) || surfaceAt(y, 0, -1, 0.012, true) || [x, y, -0.12];
      return { guess: [x, y, sp[2]], facing: V3.normalize([rule.lat * 2, 0, -1]), rayon: 0.04 };
    }
    case 'nuque': {
      const y = L.neckBase + 0.09;
      const sp = surfaceAt(y, 0, -1, 0.012, true) || [0, y, -0.08];
      return { guess: [rule.lat * LAT_CUN, y, sp[2]], facing: V3.normalize([rule.lat, -0.3, -1]) };
    }
    case 'bras': {
      const f = armFrame(armCunToT(rule.cun));
      return around(f, rule.angle);
    }
    case 'main': return pointMain(rule);
    case 'epaule': {
      if (rule.versLeCou !== undefined) {
        // GB21 : à mi-distance entre C7 et l'acromion, sur le trapèze.
        return {
          guess: [L.acromion[0] * rule.versLeCou, L.acromion[1] + 0.02, -0.03],
          facing: [0.2, 1, -0.2], rayon: 0.06,
        };
      }
      // LI15 et TE14 sont les deux creux du moignon de l'épaule, en avant et en
      // arrière du deltoïde. On lit directement la peau à cette hauteur dans la
      // direction voulue : une distance devinée depuis l'acromion laissait le
      // point à huit centimètres du corps.
      const a = rule.angle * Math.PI / 180;
      const dir = V3.normalize([Math.abs(Math.sin(a)) + 0.4, 0, Math.cos(a)]);
      const y = L.acromion[1] - 0.045;
      const sp = surfaceAt(y, dir[0], dir[2], 0.012) || [L.acromion[0], y, 0];
      return { guess: sp, facing: dir, rayon: 0.05 };
    }
    case 'hanche': {
      // GB30 : au tiers de la distance entre le grand trochanter et le sacrum.
      const tro = L.trochanter || [0.16, PUBIS_Y + 0.05, 0];
      const sac = [0, PUBIS_Y + 0.10, -0.10];
      return { guess: V3.lerp(tro, sac, rule.ratio), facing: [0.5, 0, -1] };
    }
    case 'jambe': {
      const f = legFrame(legCunToT(rule.cun));
      const r = around(f, rule.angle);
      // Sous la malléole, l'axe du membre bascule dans le pied : prolonger la
      // graduation y envoie les points vers les orteils. Les quelques points
      // situés sous la pointe de la malléole se posent donc à sa hauteur, puis
      // descendent à la verticale.
      if (rule.bas) {
        const d = rule.bas * (KNEE_Y - ANKLE_Y) / 16;
        r.guess = [r.guess[0], r.guess[1] - d, r.guess[2]];
        r.rayon = 0.05;
      }
      return r;
    }
    case 'pied': return pointPied(rule);
    case 'tete': {
      const y = CHIN_Y + rule.h * HEAD_H;
      const x = rule.lat * headHalfWidth;
      if (rule.face === 'top') return { guess: [0, L.height - 0.005, 0], facing: [0, 1, 0] };
      if (rule.face === 'side') {
        const dz = rule.avance || 0;
        const sp = surfaceAt(y, 1, dz) || [0.09, y, 0];
        return { guess: sp, facing: V3.normalize([1, 0, dz]) };
      }
      // Comme pour le tronc : on lit la peau à la hauteur ET à l'écart latéral
      // voulus. Chercher « le point le plus en avant dans telle direction »
      // laissait glisser les points du pourtour du visage vers le nez.
      const sp = surfaceColumn(y, x, true, 0.008) || surfaceAt(y, 0, 1) || [x, y, 0.09];
      // On garde l'écart latéral demandé : le sommet trouvé peut être décalé
      // d'un centimètre vers la ligne médiane, le nez étant plus en avant que
      // la joue, et tous les points du visage glissaient vers l'intérieur.
      return { guess: [x, y, sp[2]], facing: V3.normalize([rule.lat * 1.2, 0, 1]), rayon: 0.03 };
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
    const snap = snapToSkin(r.guess, r.rayon || 0.16, r.facing);
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
        const snap = snapToSkin(r.guess, r.rayon || 0.16, r.facing);
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
      // Rayon court : en pose A la main touche presque la cuisse, et un
      // plaquage large faisait sauter le tracé de l'avant-bras sur le bassin,
      // où il dessinait une écharpe bleue en travers du corps.
      const snap = snapToSkin(V3.lerp(a, b, t), 0.05, facing);
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
