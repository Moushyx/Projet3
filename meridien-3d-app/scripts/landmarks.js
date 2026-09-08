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

  // ---- Entrejambe : on regarde derrière le plan médian, là où rien ne comble
  // l'espace entre les cuisses, et on descend jusqu'à ce que le milieu se vide.
  {
    L.crotch = 0.84;
    for (let y = 1.00; y > 0.60; y -= 0.004) {
      const mid = V.filter((v) => Math.abs(v[1] - y) < 0.005 && Math.abs(v[0]) < 0.018 && v[2] < -0.01);
      if (mid.length === 0) { L.crotch = y; break; }
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

  // ---- Pubis : sur la ligne médiane antérieure, à la hauteur de l'entrejambe ----
  L.pubis = midlineAt(L.crotch + 0.015, true) || [0, L.crotch, 0.06];

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
    // La main est nettement plus large que l'avant-bras : le poignet est le
    // creux qui précède cet élargissement.
    let widest = arm.length - 1, wr = -Infinity;
    for (let i = Math.floor(arm.length * 0.6); i < arm.length; i++) {
      if (arm[i].r > wr) { wr = arm[i].r; widest = i; }
    }
    const wristIdx = localRadiusMin(arm, Math.max(1, Math.floor(arm.length * 0.45)), widest);
    L.wrist = arm[wristIdx].p.slice();
    L.wristIdx = wristIdx;
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

module.exports = { loadVertices, detectLandmarks, traceAlongX, traceAlongY };
