// Repères anatomiques mesurés sur le modèle.
//
// La localisation des points d'acupression ne se donne pas en centimètres mais
// en « cun », une unité proportionnelle au corps : l'avant-bras vaut 12 cun
// chez tout le monde, du pli du coude au pli du poignet. Placer les points
// correctement suppose donc de retrouver d'abord ces repères osseux sur le
// maillage, puis de subdiviser les segments qui les relient.
//
// Module partagé par scripts/place-points.js.

const fs = require('fs');
const path = require('path');

function loadVertices(root) {
  const { parseBodyModel } = require(path.join(root, 'js', 'model.js'));
  const raw = fs.readFileSync(path.join(root, 'assets', 'body.bin'));
  const model = parseBodyModel(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
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
  return { V, model };
}

// Suit un membre en s'éloignant du tronc, tranche par tranche. À chaque pas on
// ne retient que les sommets voisins du centre précédent : sans ce garde-fou,
// la hanche puis la jambe viennent polluer la mesure du bras.
function traceAlongX(V, x0, yBand, step, xEnd) {
  const seed = V.filter((v) => v[0] >= x0 && v[0] < x0 + 0.04 && v[1] > yBand[0] && v[1] < yBand[1]);
  if (!seed.length) return [];
  let cy = seed.reduce((s, v) => s + v[1], 0) / seed.length;
  let cz = seed.reduce((s, v) => s + v[2], 0) / seed.length;
  const axis = [];
  for (let x = x0; x < xEnd; x += step) {
    const sl = V.filter((v) => v[0] >= x && v[0] < x + step
      && Math.abs(v[1] - cy) < 0.16 && Math.abs(v[2] - cz) < 0.16);
    if (sl.length < 40) break;
    cy = sl.reduce((s, v) => s + v[1], 0) / sl.length;
    cz = sl.reduce((s, v) => s + v[2], 0) / sl.length;
    const r = sl.reduce((s, v) => s + Math.hypot(v[1] - cy, v[2] - cz), 0) / sl.length;
    axis.push({ p: [x + step / 2, cy, cz], r });
  }
  return axis;
}

// Suit un membre vertical (jambe) en descendant.
function traceAlongY(V, xBand, y0, y1, step) {
  const axis = [];
  for (let y = y0; y > y1; y -= step) {
    const sl = V.filter((v) => v[1] <= y && v[1] > y - step && v[0] > xBand[0] && v[0] < xBand[1]);
    if (sl.length < 40) continue;
    const cx = sl.reduce((s, v) => s + v[0], 0) / sl.length;
    const cz = sl.reduce((s, v) => s + v[2], 0) / sl.length;
    const r = sl.reduce((s, v) => s + Math.hypot(v[0] - cx, v[2] - cz), 0) / sl.length;
    axis.push({ p: [cx, y - step / 2, cz], r });
  }
  return axis;
}

// Cherche un minimum local du rayon : c'est ainsi que se repèrent le poignet,
// le genou et la cheville, là où le membre se resserre entre deux masses.
function localRadiusMin(axis, fromIdx, toIdx) {
  let best = fromIdx, bestR = Infinity;
  for (let i = fromIdx; i <= Math.min(toIdx, axis.length - 1); i++) {
    if (axis[i].r < bestR) { bestR = axis[i].r; best = i; }
  }
  return best;
}

// Redresse un axe de membre et mesure son rayon là où il faut : perpendiculairement.
//
// Le tracé initial avance par tranches parallèles à un plan de coordonnées.
// C'est commode pour suivre le membre, mais la « largeur » ainsi mesurée est
// fausse dès que le membre est oblique : en pose A le bras descend à 50°, et
// une tranche verticale le coupe en une ellipse une fois et demie trop longue.
// Un point posé à ce rayon-là flotte à cinq centimètres de la peau.
//
// On rééchantillonne donc l'axe à pas d'arc constant, puis on mesure à chaque
// nœud la distance moyenne de la peau à l'axe, dans le plan perpendiculaire.
function refineLimb(pts, axisPts, N) {
  const n = N || 44;
  const arc = [0];
  for (let i = 1; i < axisPts.length; i++) arc.push(arc[i-1] + V3.length(V3.sub(axisPts[i], axisPts[i-1])));
  const total = arc[arc.length - 1];

  const noeuds = [];
  for (let k = 0; k < n; k++) {
    const s = total * k / (n - 1);
    let i = 0;
    while (i < arc.length - 2 && arc[i+1] < s) i++;
    const f = (s - arc[i]) / Math.max(1e-9, arc[i+1] - arc[i]);
    noeuds.push(V3.lerp(axisPts[i], axisPts[i+1], f));
  }
  const tangentes = noeuds.map((p, i) =>
    V3.normalize(V3.sub(noeuds[Math.min(n-1, i+1)], noeuds[Math.max(0, i-1)])));

  const somme = new Array(n).fill(0), compte = new Array(n).fill(0);
  pts.forEach((v) => {
    const p = [v[0], v[1], v[2]];
    let bi = -1, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const d = V3.length(V3.sub(p, noeuds[i]));
      if (d < bd) { bd = d; bi = i; }
    }
    const d = V3.sub(p, noeuds[bi]);
    const perp = V3.length(V3.sub(d, V3.scale(tangentes[bi], V3.dot(d, tangentes[bi]))));
    // Au-delà de douze centimètres ce n'est plus le membre mais le tronc voisin.
    if (perp > 0.12) return;
    somme[bi] += perp; compte[bi]++;
  });
  const brut = somme.map((s, i) => (compte[i] > 30 ? s / compte[i] : NaN));
  // Bouche les nœuds sans mesure, puis lisse : le profil sert à repérer des
  // resserrements, un creux dû au bruit conduirait le poignet ailleurs.
  for (let i = 0; i < n; i++) if (!isFinite(brut[i])) {
    let g = i, d = i;
    while (g > 0 && !isFinite(brut[g])) g--;
    while (d < n - 1 && !isFinite(brut[d])) d++;
    brut[i] = isFinite(brut[g]) ? brut[g] : brut[d];
  }
  const rayons = brut.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i-1); k <= Math.min(n-1, i+1); k++) { s += brut[k]; c++; }
    return s / c;
  });

  return { noeuds, tangentes, rayons, total, pas: total / (n - 1) };
}

function detectLandmarks(V) {
  const L = {};

  // 320 000 sommets : l'opérateur de décomposition ferait déborder la pile.
  let hmax = -Infinity;
  for (let i = 0; i < V.length; i++) if (V[i][1] > hmax) hmax = V[i][1];
  L.height = hmax;
  L.vertex = [0, L.height, 0];

  // ---- Le bras d'abord : en pose A il longe le tronc, et toute mesure de
  // largeur faite sans l'écarter mesure le bras au lieu de l'épaule ou de la
  // hanche. On le trace, puis on s'en sert comme masque.
  const arm = traceAlongX(V, 0.21, [1.15, 1.45], 0.015, 0.60);
  L.armAxis = arm;

  function distToArm(v) {
    let best = Infinity;
    for (let i = 0; i < arm.length; i++) {
      const a = arm[i].p;
      const d = Math.hypot(v[0]-a[0], v[1]-a[1], v[2]-a[2]);
      if (d < best) best = d;
    }
    return best;
  }
  const isArm = (v) => Math.abs(v[0]) > 0.18 && distToArm([Math.abs(v[0]), v[1], v[2]]) < 0.13;
  L.isArm = isArm;

  // ---- Entrejambe : au-dessus, l'espace entre les jambes est plein — c'est le
  // bassin, dont la peau ne passe jamais près du plan de symétrie entre le
  // ventre et les fesses. En dessous, les deux cuisses s'y rejoignent. On
  // descend donc jusqu'à voir apparaître de la peau au milieu.
  //
  // Chercher l'inverse — le premier vide — donnait le point où les cuisses
  // cessent de se toucher, soit douze centimètres trop bas, et faussait avec
  // lui le pubis, la cun du bas-ventre et tout le membre inférieur.
  {
    L.crotch = 0.84;
    for (let y = 1.05; y > 0.55; y -= 0.004) {
      const mid = V.filter((v) => Math.abs(v[1] - y) < 0.005
        && v[0] > 0.002 && v[0] < 0.05 && Math.abs(v[2]) < 0.05);
      if (mid.length > 3) { L.crotch = y; break; }
    }
  }

  // ---- Lignes médianes ----
  function midlineAt(y, front) {
    const sl = V.filter((v) => Math.abs(v[1] - y) < 0.008 && Math.abs(v[0]) < 0.025);
    if (!sl.length) return null;
    const pick = sl.reduce((a, b) => ((front ? b[2] > a[2] : b[2] < a[2]) ? b : a));
    return [0, pick[1], pick[2]]; // ramené sur l'axe de symétrie
  }
  L.frontAt = (y) => midlineAt(y, true);
  L.backAt = (y) => midlineAt(y, false);

  // ---- Nombril : creux de la ligne médiane du ventre ----
  {
    let best = null;
    for (let y = 0.98; y < 1.16; y += 0.004) {
      const a = midlineAt(y - 0.03, true), m = midlineAt(y, true), b = midlineAt(y + 0.03, true);
      if (!a || !m || !b) continue;
      const dip = (a[2] + b[2]) / 2 - m[2];
      if (!best || dip > best.dip) best = { dip, p: m };
    }
    L.navel = best ? best.p : [0, 1.07, 0.11];
    L.navelDip = best ? best.dip : 0;
  }

  // ---- Base du cou et creux sus-sternal (CV22) ----
  {
    let prev = null;
    L.neckBase = 1.46;
    for (let y = 1.60; y > 1.30; y -= 0.004) {
      const sl = V.filter((v) => Math.abs(v[1] - y) < 0.005 && !isArm(v));
      if (sl.length < 20) continue;
      let w = 0;
      for (let i = 0; i < sl.length; i++) w = Math.max(w, Math.abs(sl[i][0]));
      if (prev && w * 2 - prev > 0.05) { L.neckBase = y; break; }
      prev = w * 2;
    }
    L.sternalNotch = midlineAt(L.neckBase, true) || [0, 1.46, 0.06];
  }

  // ---- Pubis : le bord supérieur de la symphyse se lit à deux centimètres
  // au-dessus du périnée, sur la ligne médiane antérieure. C'est le repère
  // zéro du bas-ventre et de tout le membre inférieur.
  L.pubis = midlineAt(L.crotch + 0.02, true) || [0, L.crotch + 0.02, 0.06];

  // ---- Genou : le membre y est le moins épais d'avant en arrière, entre la
  // masse de la cuisse et celle du mollet. Le rayon moyen, lui, continue de
  // décroître et ne marque pas l'articulation.
  {
    let best = null;
    for (let y = 0.62 * (L.height / 1.78); y > 0.38 * (L.height / 1.78); y -= 0.006) {
      const sl = V.filter((v) => Math.abs(v[1] - y) < 0.006 && v[0] > 0.05 && v[0] < 0.28);
      if (sl.length < 20) continue;
      let zx = -Infinity, zn = Infinity;
      for (let i = 0; i < sl.length; i++) { if (sl[i][2] > zx) zx = sl[i][2]; if (sl[i][2] < zn) zn = sl[i][2]; }
      if (!best || zx - zn < best.e) best = { y, e: zx - zn };
    }
    L.kneeY = best ? best.y : 0.29 * L.height;
  }

  // ---- Malléole interne ----
  // Le maillage ne modèle pas la saillie osseuse : d'un bout à l'autre de la
  // cheville le bord interne ne varie que de deux millimètres, la mesure suit
  // le bruit plutôt que l'os. On retient donc la proportion anthropométrique,
  // que tous les autres repères de ce modèle vérifient à 1,5 % près.
  L.malleolusY = 0.045 * L.height;

  // ---- Menton : sur le profil médian, la chair recule brutalement de quatre
  // centimètres entre le menton et la gorge. C'est le repère zéro de la face :
  // toutes les hauteurs du visage se donnent en fraction menton→sommet.
  {
    let best = null;
    for (let y = 1.60 * (L.height / 1.78); y > 1.42 * (L.height / 1.78); y -= 0.005) {
      const a = midlineAt(y + 0.008, true), b = midlineAt(y - 0.008, true);
      if (!a || !b) continue;
      const chute = a[2] - b[2];
      if (!best || chute > best.chute) best = { y, chute };
    }
    L.chinY = best ? best.y : L.height - 0.255;
  }

  // ---- Acromion : le point le plus large de l'épaule, bras exclu ----
  {
    let best = null;
    for (let y = 1.32; y < 1.56; y += 0.004) {
      const sl = V.filter((v) => Math.abs(v[1] - y) < 0.005 && v[0] > 0.05 && !isArm(v));
      if (sl.length < 5) continue;
      let w = -Infinity;
      for (let i = 0; i < sl.length; i++) w = Math.max(w, sl[i][0]);
      if (!best || w > best.w) best = { y, w };
    }
    if (best) L.acromion = [best.w, best.y, 0];
  }

  // ---- Bras : poignet au resserrement avant la main, coude par proportion ----
  if (arm.length > 6) {
    L.axilla = arm[0].p.slice();
    L.fingertip = arm[arm.length - 1].p.slice();

    // Le poignet se lit sur le profil des rayons mesurés perpendiculairement :
    // un creux net, puis l'élargissement de la main. Sur les rayons issus des
    // tranches obliques du tracé, ce creux n'existait pas et le poignet
    // tombait dix centimètres trop haut — avec lui toute la graduation en cun
    // de l'avant-bras, et l'origine des mesures de la main.
    L.armLimb = refineLimb(V.filter(isArm), arm.map((a) => a.p), 44);
    {
      const r = L.armLimb.rayons, n = r.length;
      let large = n - 1, rw = -Infinity;
      for (let i = Math.floor(n * 0.70); i < n - 2; i++) if (r[i] > rw) { rw = r[i]; large = i; }
      let creux = large, rc = Infinity;
      for (let i = Math.floor(n * 0.50); i <= large; i++) if (r[i] < rc) { rc = r[i]; creux = i; }
      L.wristT = creux / (n - 1);
      L.wrist = L.armLimb.noeuds[creux].slice();
    }
    // Le pli du coude tombe à 9 cun de l'aisselle sur les 21 qui la séparent
    // du poignet : la proportion est plus fiable qu'une mesure de forme sur un
    // bras tendu, où aucun repli ne marque l'articulation.
    L.elbow = [
      L.axilla[0] + (L.wrist[0] - L.axilla[0]) * 9 / 21,
      L.axilla[1] + (L.wrist[1] - L.axilla[1]) * 9 / 21,
      L.axilla[2] + (L.wrist[2] - L.axilla[2]) * 9 / 21,
    ];
  }

  // ---- Jambe : genou et cheville aux resserrements ----
  const leg = traceAlongY(V, [0.02, 0.24], L.crotch + 0.02, 0.02, 0.012);
  L.legAxis = leg;
  if (leg.length > 8) {
    L.hipTop = leg[0].p.slice();
    const kneeIdx = localRadiusMin(leg, Math.floor(leg.length * 0.30), Math.floor(leg.length * 0.60));
    const ankleIdx = localRadiusMin(leg, Math.floor(leg.length * 0.80), leg.length - 1);
    L.knee = leg[kneeIdx].p.slice();
    L.kneeIdx = kneeIdx;
    L.ankle = leg[ankleIdx].p.slice();
    L.ankleIdx = ankleIdx;
  }

  // ---- Pied ----
  {
    const foot = V.filter((v) => v[1] < 0.10 && v[0] > 0.02 && v[0] < 0.22);
    if (foot.length) {
      L.heel = foot.reduce((a, b) => (b[2] < a[2] ? b : a)).slice(0, 3);
      L.toeTip = foot.reduce((a, b) => (b[2] > a[2] ? b : a)).slice(0, 3);
      let sole = Infinity;
      for (let i = 0; i < foot.length; i++) sole = Math.min(sole, foot[i][1]);
      L.soleY = sole;
    }
  }

  // ---- Grand trochanter : le plus large de la hanche, bras et main exclus ----
  {
    let best = null;
    for (let y = L.crotch - 0.02; y < L.crotch + 0.16; y += 0.004) {
      const sl = V.filter((v) => Math.abs(v[1] - y) < 0.005 && v[0] > 0.05 && v[0] < 0.30 && !isArm(v));
      if (sl.length < 5) continue;
      let w = -Infinity;
      for (let i = 0; i < sl.length; i++) w = Math.max(w, sl[i][0]);
      if (!best || w > best.w) best = { y, w };
    }
    if (best) L.trochanter = [best.w, best.y, 0];
  }

  return L;
}

// Repérage des doigts et des orteils.
//
// Une main n'est pas un cylindre : « l'angle de l'ongle de l'index » suppose de
// savoir où est l'index. On balaie le membre en travers et, pour chaque tranche,
// on note jusqu'où la chair s'avance. Le profil obtenu montre des bosses
// séparées par des creux — les doigts et les espaces entre eux. Un
// échantillonnage du plus lointain ne convenait pas : le pouce, plus court,
// passait sous le seuil et deux repères se posaient sur le même doigt.
//
//   pts        nuage du membre (main ou avant-pied)
//   racine     origine des mesures (poignet, talon)
//   axeLong    direction dans laquelle les doigts s'avancent
//   axeTravers direction du balayage, du premier doigt vers le dernier
//   opts       { bins, doigts, retrait, relief }
//
// `retrait` écarte du profil les tranches trop en arrière : au bord de la main
// ou du pied, la chair s'arrête bien avant les doigts et formerait une fausse
// bosse. `relief` est la profondeur minimale d'un sillon pour compter comme
// séparation entre deux doigts.
function detectDigits(pts, racine, axeLong, axeTravers, opts) {
  const o = opts || {};
  const n = o.bins || 48;
  const cible = o.doigts || 5;
  const retrait = o.retrait !== undefined ? o.retrait : 0.09;
  const relief = o.relief !== undefined ? o.relief : 0.003;

  let tmin = Infinity, tmax = -Infinity;
  pts.forEach((v) => {
    const t = V3.dot(v, axeTravers);
    if (t < tmin) tmin = t;
    if (t > tmax) tmax = t;
  });
  const pas = (tmax - tmin) / n;

  const prof = new Array(n).fill(-Infinity);
  const rep = new Array(n).fill(null);
  pts.forEach((v) => {
    const t = (V3.dot(v, axeTravers) - tmin) / (tmax - tmin);
    const i = Math.max(0, Math.min(n - 1, Math.floor(t * n)));
    const d = V3.dot(V3.sub(v, racine), axeLong);
    if (d > prof[i]) { prof[i] = d; rep[i] = v.slice(0, 3); }
  });

  // Zone utile : on part du plus avancé et on s'arrête là où la chair recule
  // de plus de `retrait`. Sur le pied, cela retire le bord interne, en retrait
  // de quatre centimètres sur le gros orteil.
  let pic = -Infinity;
  for (let i = 0; i < n; i++) if (prof[i] > pic) pic = prof[i];
  const utile = prof.map((p) => isFinite(p) && p > pic - retrait);
  let de = 0; while (de < n && !utile[de]) de++;
  let a = n - 1; while (a > de && !utile[a]) a--;
  if (a - de < cible) return [];

  // Sillons interdigitaux : minima locaux du profil, classés par profondeur.
  const creux = [];
  for (let i = de + 1; i < a; i++) {
    if (!isFinite(prof[i])) continue;
    if (prof[i] <= prof[i-1] && prof[i] <= prof[i+1]) {
      const g = prof[Math.max(de, i-2)], d = prof[Math.min(a, i+2)];
      creux.push({ i, releve: Math.max(g, d) - prof[i], p: rep[i] });
    }
  }
  const retenus = creux.filter((c) => c.releve >= relief)
    .sort((x, y) => y.releve - x.releve).slice(0, cible - 1)
    .sort((x, y) => x.i - y.i);

  // Sur un maillage de base, les orteils externes sont soudés : aucun sillon
  // ne les sépare. Les sillons trouvés étant toujours les plus internes, on
  // partage à parts égales ce qui reste au-delà du dernier.
  const coupes = retenus.map((c) => c.i);
  const manque = (cible - 1) - coupes.length;
  if (manque > 0) {
    const dernier = coupes.length ? coupes[coupes.length - 1] : de;
    for (let k = 1; k <= manque; k++) {
      coupes.push(Math.round(dernier + (a - dernier) * k / (manque + 1)));
    }
    coupes.sort((x, y) => x - y);
  }

  const bornes = [de].concat(coupes, [a]);
  const doigts = [];
  for (let k = 0; k < bornes.length - 1; k++) {
    const b0 = bornes[k], b1 = bornes[k + 1];
    let best = -Infinity, bi = -1;
    for (let i = b0; i <= b1; i++) if (isFinite(prof[i]) && prof[i] > best) { best = prof[i]; bi = i; }
    if (bi < 0 || !rep[bi]) continue;
    // La profondeur du sillon voisin donne le niveau de l'articulation.
    const voisin = Math.min(
      isFinite(prof[b0]) ? prof[b0] : Infinity,
      isFinite(prof[b1]) ? prof[b1] : Infinity
    );
    const longueur = isFinite(voisin) ? Math.max(0.015, best - voisin) : 0.03;
    doigts.push({
      bout: rep[bi],
      base: V3.sub(rep[bi], V3.scale(axeLong, longueur)),
      longueur,
      distance: best,
      largeur: (b1 - b0) * pas,
      bin: bi,
    });
  }
  doigts.commissures = retenus.map((c) => c.p).filter(Boolean);
  return doigts;
}

module.exports = { loadVertices, detectLandmarks, traceAlongX, traceAlongY, detectDigits, refineLimb };
