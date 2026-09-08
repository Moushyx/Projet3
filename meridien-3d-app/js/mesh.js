// Maillage anatomique du corps humain.
//
// Chaque partie du corps est engendrée par « lofting » : une suite de sections
// transversales (des super-ellipses, plus proches d'une coupe humaine qu'un
// cercle) est enfilée le long d'un axe, puis reliée par des quadrilatères.
// La surface obtenue est continue — plus de chaînes de sphères ni de coutures.
//
// L'éclairage est calculé une fois pour toutes à la construction : les lumières
// sont fixes dans le monde et seule la caméra tourne, donc la couleur de chaque
// facette ne change jamais. Le rendu par image se limite à projeter les sommets
// et à remplir les facettes, ce qui reste fluide sur téléphone.

const SKIN_BASE = [226, 178, 146];
const SKIN_SHADOW = [74, 52, 58];
const LIGHT_KEY = { dir: [-0.44, 0.70, 0.62], intensity: 0.62, tint: [255, 246, 232] };
const LIGHT_FILL = { dir: [0.78, 0.12, -0.42], intensity: 0.30, tint: [150, 180, 225] };
const AMBIENT = 0.34;
// Éclairage « enveloppant » : la lumière déborde du terminateur, comme sur une
// peau. Les écarts entre facettes voisines s'atténuent nettement.
const WRAP = 0.35;

function buildHumanMesh() {
  const positions = [];
  const faces = [];
  // Le tri du peintre ne sait pas départager deux surfaces qui se traversent.
  // On regroupe donc les facettes par partie du corps : les parties sont
  // ordonnées entre elles, et les facettes seulement à l'intérieur d'une partie.
  const parts = [];
  let currentPart = -1;

  function beginPart() {
    parts.push({ sum: [0, 0, 0], count: 0, centroid: [0, 0, 0] });
    currentPart = parts.length - 1;
  }

  function addVertex(p) {
    positions.push(p[0], p[1], p[2]);
    return positions.length / 3 - 1;
  }

  // Repère perpendiculaire à l'axe : U suit la largeur (X), V la profondeur (Z).
  function frameFor(tangent) {
    const t = V3.normalize(tangent);
    const ref = Math.abs(t[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
    let u = V3.normalize(V3.cross(ref, t));
    if (V3.length(u) < 1e-6) u = [1, 0, 0];
    if (u[0] < 0) u = V3.scale(u, -1); // U pointe toujours vers la droite
    const v = V3.normalize(V3.cross(t, u));
    return { u, v };
  }

  // Section transversale : super-ellipse d'exposant `exp`
  // (exp = 2 → ellipse ; exp > 2 → ovale aplati, comme un torse).
  function ringVertices(center, frame, rx, rz, exp, segments) {
    const idx = [];
    const p = 2 / exp;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const c = Math.cos(a), si = Math.sin(a);
      const dx = Math.sign(c) * Math.pow(Math.abs(c), p) * rx;
      const dz = Math.sign(si) * Math.pow(Math.abs(si), p) * rz;
      idx.push(addVertex([
        center[0] + frame.u[0] * dx + frame.v[0] * dz,
        center[1] + frame.u[1] * dx + frame.v[1] * dz,
        center[2] + frame.u[2] * dx + frame.v[2] * dz,
      ]));
    }
    return idx;
  }

  function vertexAt(i) {
    return [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  }

  function addQuad(a, b, c, d, forcedNormal) {
    const pa = vertexAt(a), pb = vertexAt(b), pc = vertexAt(c), pd = vertexAt(d);
    const normal = forcedNormal || V3.normalize(V3.cross(V3.sub(pb, pa), V3.sub(pd, pa)));
    const center = [
      (pa[0] + pb[0] + pc[0] + pd[0]) / 4,
      (pa[1] + pb[1] + pc[1] + pd[1]) / 4,
      (pa[2] + pb[2] + pc[2] + pd[2]) / 4,
    ];
    faces.push({ a, b, c, d, n: normal, center, color: shade(normal, center), part: currentPart });
    const acc = parts[currentPart];
    acc.sum[0] += center[0]; acc.sum[1] += center[1]; acc.sum[2] += center[2];
    acc.count++;
  }

  // Couleur figée d'une facette : lumière principale chaude, lumière
  // d'appoint froide, plus un assombrissement des surfaces tournées vers le sol.
  function shade(n, center) {
    const key = Math.max(0, (V3.dot(n, V3.normalize(LIGHT_KEY.dir)) + WRAP) / (1 + WRAP));
    const fill = Math.max(0, (V3.dot(n, V3.normalize(LIGHT_FILL.dir)) + WRAP) / (1 + WRAP));
    const upward = (n[1] + 1) / 2; // 0 = vers le sol, 1 = vers le ciel
    const occlusion = 0.84 + 0.16 * upward;
    const lambert = (AMBIENT + LIGHT_KEY.intensity * key) * occlusion;

    const out = [0, 0, 1].map((_, i) => {
      const base = SKIN_BASE[i] * lambert + SKIN_SHADOW[i] * (1 - Math.min(1, lambert)) * 0.5;
      const keyTint = (LIGHT_KEY.tint[i] / 255) * key * 26;
      const fillTint = (LIGHT_FILL.tint[i] / 255) * fill * LIGHT_FILL.intensity * 90;
      return Math.max(0, Math.min(255, Math.round(base + keyTint + fillTint)));
    });
    return `rgb(${out[0]},${out[1]},${out[2]})`;
  }

  // Enfile une suite de sections le long d'un axe.
  // spine : [{ p:[x,y,z], rx, rz, exp? }, ...]
  function addTube(spine, segments, options) {
    const opts = options || {};
    if (!opts.samePart) beginPart();
    const rings = [];
    for (let i = 0; i < spine.length; i++) {
      const prev = spine[Math.max(0, i - 1)].p;
      const next = spine[Math.min(spine.length - 1, i + 1)].p;
      const frame = frameFor(V3.sub(next, prev));
      rings.push(ringVertices(spine[i].p, frame, spine[i].rx, spine[i].rz, spine[i].exp || 2, segments));
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s = 0; s < segments; s++) {
        const s2 = (s + 1) % segments;
        addQuad(rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]);
      }
    }
    return rings;
  }

  // Ellipsoïde (tête, épaules, masses articulaires, nez, oreilles).
  function addEllipsoid(center, scale, segments, ringCount, squash) {
    const spine = [];
    for (let i = 0; i <= ringCount; i++) {
      const t = i / ringCount;
      const phi = t * Math.PI;
      const y = Math.cos(phi);
      const r = Math.sin(phi);
      spine.push({
        p: [center[0], center[1] + y * scale[1], center[2] + (squash ? squash(t) : 0)],
        rx: Math.max(0.0015, r * scale[0]),
        rz: Math.max(0.0015, r * scale[2]),
        exp: 2,
      });
    }
    addTube(spine, segments);
  }

  // Ferme une extrémité par un dôme : on prolonge l'axe de quelques sections
  // dont le rayon décroît en quart de cercle. Contrairement à un bouchon plat,
  // un dôme ne peut jamais apparaître comme une plaque au milieu de la peau.
  function domeEnds(spine, opts) {
    const o = opts || {};
    const steps = o.steps || 3;
    let out = spine.slice();
    const build = (ref, dir) => {
      const depth = Math.min(ref.rx, ref.rz) * (o.depth || 1);
      const rings = [];
      for (let k = steps; k >= 1; k--) {
        const t = (k / (steps + 1)) * (Math.PI / 2);
        rings.push({
          p: V3.add(ref.p, V3.scale(dir, depth * Math.sin(t))),
          rx: Math.max(0.002, ref.rx * Math.cos(t)),
          rz: Math.max(0.002, ref.rz * Math.cos(t)),
          exp: ref.exp || 2,
        });
      }
      return rings;
    };
    if (o.start !== false) {
      out = build(out[0], V3.normalize(V3.sub(out[0].p, out[1].p))).concat(out);
    }
    if (o.end !== false) {
      const n = out.length;
      out = out.concat(build(out[n - 1], V3.normalize(V3.sub(out[n - 1].p, out[n - 2].p))).reverse());
    }
    return out;
  }

  // Densifie une suite de sections (interpolation de Catmull-Rom) : la surface
  // gagne en douceur sans qu'il faille saisir chaque section à la main.
  function refine(spine, factor) {
    if (factor <= 1 || spine.length < 2) return spine;
    const val = (arr, i) => arr[Math.max(0, Math.min(arr.length - 1, i))];
    const cr = (p0, p1, p2, p3, t) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };
    const out = [];
    for (let i = 0; i < spine.length - 1; i++) {
      for (let k = 0; k < factor; k++) {
        const t = k / factor;
        const a = val(spine, i - 1), b = spine[i], c = spine[i + 1], d = val(spine, i + 2);
        out.push({
          p: [0, 1, 2].map((axis) => cr(a.p[axis], b.p[axis], c.p[axis], d.p[axis], t)),
          rx: Math.max(0.002, cr(a.rx, b.rx, c.rx, d.rx, t)),
          rz: Math.max(0.002, cr(a.rz, b.rz, c.rz, d.rz, t)),
          exp: b.exp || 2,
        });
      }
    }
    out.push(spine[spine.length - 1]);
    return out;
  }

  // Les parties s'interpénètrent volontairement : chaque extrémité plate est
  // enterrée dans la masse voisine, sinon elle apparaîtrait comme une plaque.

  // ---------------------------------------------------------------
  // Tête : crâne, pommettes, mâchoire qui s'affine, menton avancé.
  // La base descend dans le cou.
  // ---------------------------------------------------------------
  addTube(domeEnds(refine([
    { p: [0, 1.752, -0.005], rx: 0.055, rz: 0.062 },
    { p: [0, 1.738, -0.007], rx: 0.070, rz: 0.079 },
    { p: [0, 1.722, -0.009], rx: 0.083, rz: 0.093 },
    { p: [0, 1.694, -0.008], rx: 0.090, rz: 0.101, exp: 2.15 },
    { p: [0, 1.666, -0.004], rx: 0.091, rz: 0.102, exp: 2.15 },
    { p: [0, 1.638, 0.001], rx: 0.086, rz: 0.097, exp: 2.15 },
    { p: [0, 1.612, 0.005], rx: 0.076, rz: 0.089, exp: 2.2 },
    { p: [0, 1.588, 0.009], rx: 0.061, rz: 0.077, exp: 2.2 },
    { p: [0, 1.568, 0.010], rx: 0.046, rz: 0.062, exp: 2.1 },
    { p: [0, 1.552, 0.004], rx: 0.038, rz: 0.046 },
    { p: [0, 1.538, 0.000], rx: 0.033, rz: 0.038 },
  ], 2), { depth: 0.55 }), 22);

  // Nez et oreilles : la silhouette se lit tout de suite comme une tête.
  addEllipsoid([0, 1.646, 0.095], [0.013, 0.022, 0.019], 10, 6);
  addEllipsoid([0.088, 1.656, -0.006], [0.010, 0.027, 0.017], 10, 6);
  addEllipsoid([-0.088, 1.656, -0.006], [0.010, 0.027, 0.017], 10, 6);

  // ---------------------------------------------------------------
  // Cou : plonge dans le tronc en bas, dans la tête en haut.
  // ---------------------------------------------------------------
  addTube(domeEnds(refine([
    { p: [0, 1.400, -0.004], rx: 0.070, rz: 0.066 },
    { p: [0, 1.455, -0.002], rx: 0.058, rz: 0.057 },
    { p: [0, 1.500, 0.000], rx: 0.050, rz: 0.052 },
    { p: [0, 1.540, 0.003], rx: 0.045, rz: 0.048 },
    { p: [0, 1.580, 0.006], rx: 0.041, rz: 0.044 },
  ], 2)), 20);

  // ---------------------------------------------------------------
  // Torse : bassin, taille marquée, cage thoracique, puis pente des trapèzes
  // qui se termine à l'intérieur du cou.
  // Sections aplaties (exp > 2) : un torse est plus large que profond.
  // ---------------------------------------------------------------
  addTube(domeEnds(refine([
    { p: [0, 0.868, 0.004], rx: 0.078, rz: 0.070, exp: 2.2 },
    { p: [0, 0.900, 0.004], rx: 0.138, rz: 0.101, exp: 2.5 },
    { p: [0, 0.945, 0.003], rx: 0.141, rz: 0.100, exp: 2.5 },
    { p: [0, 1.000, 0.002], rx: 0.121, rz: 0.094, exp: 2.4 },
    { p: [0, 1.040, 0.002], rx: 0.107, rz: 0.088, exp: 2.4 },
    { p: [0, 1.090, 0.003], rx: 0.114, rz: 0.094, exp: 2.45 },
    { p: [0, 1.145, 0.004], rx: 0.129, rz: 0.101, exp: 2.5 },
    { p: [0, 1.205, 0.004], rx: 0.143, rz: 0.106, exp: 2.55 },
    { p: [0, 1.265, 0.003], rx: 0.152, rz: 0.108, exp: 2.6 },
    { p: [0, 1.325, 0.001], rx: 0.157, rz: 0.105, exp: 2.6 },
    { p: [0, 1.380, -0.001], rx: 0.157, rz: 0.099, exp: 2.6 },
    { p: [0, 1.425, -0.003], rx: 0.146, rz: 0.092, exp: 2.5 },
    { p: [0, 1.462, -0.004], rx: 0.110, rz: 0.080, exp: 2.3 },
    { p: [0, 1.492, -0.002], rx: 0.062, rz: 0.058 },
    { p: [0, 1.512, 0.000], rx: 0.034, rz: 0.034 },
  ], 2)), 28);

  // Épaules (deltoïdes) : referment la jonction bras / tronc.
  addEllipsoid([0.161, 1.378, -0.002], [0.062, 0.072, 0.062], 18, 11);
  addEllipsoid([-0.161, 1.378, -0.002], [0.062, 0.072, 0.062], 18, 11);

  // Bassin : enveloppe le bas du tronc et le haut des cuisses, sinon le fond
  // plat du torse resterait visible entre les jambes.
  addEllipsoid([0, 0.890, 0.002], [0.116, 0.090, 0.092], 20, 12);

  // Fessiers : donnent au profil son galbe humain.
  addEllipsoid([0.058, 0.848, -0.044], [0.072, 0.076, 0.058], 16, 10);
  addEllipsoid([-0.058, 0.848, -0.044], [0.072, 0.076, 0.058], 16, 10);

  // ---------------------------------------------------------------
  // Bras : la première section est enfouie dans le deltoïde. L'axe reprend
  // exactement celui des données de points d'acupression.
  // ---------------------------------------------------------------
  [1, -1].forEach((side) => {
    addTube(domeEnds(refine([
      { p: [0.158 * side, 1.412, -0.002], rx: 0.044, rz: 0.046 },
      { p: [0.186 * side, 1.400, -0.001], rx: 0.051, rz: 0.053 },
      { p: [0.205 * side, 1.320, 0.001], rx: 0.048, rz: 0.050 },
      { p: [0.219 * side, 1.230, 0.003], rx: 0.044, rz: 0.046 },
      { p: [0.229 * side, 1.150, 0.005], rx: 0.038, rz: 0.041 },
      { p: [0.233 * side, 1.110, 0.007], rx: 0.037, rz: 0.040 }, // coude
      { p: [0.238 * side, 1.040, 0.009], rx: 0.040, rz: 0.042 },
      { p: [0.242 * side, 0.965, 0.011], rx: 0.035, rz: 0.037 },
      { p: [0.245 * side, 0.900, 0.013], rx: 0.027, rz: 0.030 },
      { p: [0.246 * side, 0.872, 0.015], rx: 0.024, rz: 0.026 }, // poignet
      { p: [0.248 * side, 0.830, 0.017], rx: 0.029, rz: 0.019 },
      { p: [0.250 * side, 0.770, 0.019], rx: 0.031, rz: 0.017 }, // paume
      { p: [0.251 * side, 0.715, 0.020], rx: 0.026, rz: 0.013 },
      { p: [0.251 * side, 0.676, 0.021], rx: 0.014, rz: 0.008 }, // doigts
    ], 2)), 18);
  });

  // ---------------------------------------------------------------
  // Jambes : le haut de la cuisse est enfoui dans le bassin.
  // ---------------------------------------------------------------
  [1, -1].forEach((side) => {
    addTube(domeEnds(refine([
      { p: [0.092 * side, 0.945, -0.002], rx: 0.078, rz: 0.081 },
      { p: [0.097 * side, 0.860, 0.002], rx: 0.086, rz: 0.089 },
      { p: [0.098 * side, 0.770, 0.006], rx: 0.080, rz: 0.083 },
      { p: [0.097 * side, 0.670, 0.010], rx: 0.071, rz: 0.074 },
      { p: [0.096 * side, 0.570, 0.013], rx: 0.062, rz: 0.065 },
      { p: [0.095 * side, 0.500, 0.015], rx: 0.055, rz: 0.058 },
      { p: [0.094 * side, 0.460, 0.016], rx: 0.052, rz: 0.055 }, // genou
      { p: [0.092 * side, 0.410, 0.014], rx: 0.051, rz: 0.057 },
      { p: [0.089 * side, 0.345, 0.010], rx: 0.053, rz: 0.060 }, // mollet
      { p: [0.086 * side, 0.270, 0.006], rx: 0.045, rz: 0.051 },
      { p: [0.082 * side, 0.190, 0.004], rx: 0.035, rz: 0.040 },
      { p: [0.078 * side, 0.115, 0.002], rx: 0.028, rz: 0.031 },
      { p: [0.075 * side, 0.075, 0.002], rx: 0.025, rz: 0.028 }, // cheville
    ], 2)), 20);

    // Pied : talon en arrière, masse qui s'aplatit vers les orteils.
    addTube(domeEnds(refine([
      { p: [0.075 * side, 0.052, -0.032], rx: 0.027, rz: 0.028 },
      { p: [0.075 * side, 0.030, 0.000], rx: 0.033, rz: 0.042 },
      { p: [0.075 * side, 0.022, 0.048], rx: 0.035, rz: 0.038 },
      { p: [0.074 * side, 0.018, 0.088], rx: 0.031, rz: 0.024 },
      { p: [0.073 * side, 0.016, 0.110], rx: 0.022, rz: 0.012 },
    ], 2)), 14);
  });

  parts.forEach((prt) => {
    if (prt.count > 0) {
      prt.centroid = [prt.sum[0] / prt.count, prt.sum[1] / prt.count, prt.sum[2] / prt.count];
    }
  });

  return { positions: new Float32Array(positions), faces, parts };
}

if (typeof module !== 'undefined') module.exports = { buildHumanMesh };
