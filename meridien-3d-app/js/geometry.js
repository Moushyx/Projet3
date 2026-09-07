// Description géométrique d'un corps humain stylisé (chaînes de sphères)
// et des organes internes simplifiés, à partir des données de data.js.

function chain(from, to, radiusFrom, radiusTo, steps) {
  const spheres = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spheres.push({
      pos: V3.lerp(from, to, t),
      radius: radiusFrom + (radiusTo - radiusFrom) * t,
    });
  }
  return spheres;
}

function buildBodyGeometry() {
  const skin = { color: '#e8c9a8', alpha: 0.9 };
  const parts = [];

  // Tête
  parts.push({ pos: [0, 1.685, 0], radius: 0.115 });
  parts.push({ pos: [0, 1.735, 0], radius: 0.10 });
  parts.push({ pos: [0, 1.63, 0], radius: 0.10 });

  // Cou
  parts.push(...chain([0, 1.47, 0], [0, 1.565, 0], 0.05, 0.045, 5));

  // Torse (épaules -> taille -> bassin)
  parts.push(...chain([0, 1.30, 0.01], [0, 1.47, 0], 0.145, 0.20, 10));
  parts.push(...chain([0, 1.05, 0.01], [0, 1.30, 0.01], 0.125, 0.145, 10));
  parts.push(...chain([0, 0.84, 0], [0, 1.05, 0.01], 0.15, 0.125, 8));

  // Bras
  [1, -1].forEach((side) => {
    const shoulder = [0.19 * side, 1.44, 0];
    const elbow = [0.235 * side, 1.13, 0.02];
    const wrist = [0.245 * side, 0.885, 0.02];
    const hand = [0.25 * side, 0.70, 0.02];
    const fingers = [0.252 * side, 0.66, 0.02];
    parts.push(...chain(shoulder, elbow, 0.05, 0.038, 7));
    parts.push(...chain(elbow, wrist, 0.036, 0.028, 6));
    parts.push(...chain(wrist, hand, 0.03, 0.024, 3));
    parts.push(...chain(hand, fingers, 0.022, 0.014, 2));
  });

  // Jambes
  [1, -1].forEach((side) => {
    const hip = [0.10 * side, 0.84, 0];
    const knee = [0.095 * side, 0.46, 0.02];
    const ankle = [0.075 * side, 0.09, 0.01];
    const foot = [0.075 * side, 0.02, 0.09];
    parts.push(...chain(hip, knee, 0.08, 0.055, 8));
    parts.push(...chain(knee, ankle, 0.052, 0.036, 7));
    parts.push(...chain(ankle, foot, 0.034, 0.03, 2));
  });

  return parts.map((p) => ({ ...p, color: skin.color, alpha: skin.alpha }));
}

function buildOrganGeometry(ORGAN_SHAPES) {
  const parts = [];
  Object.entries(ORGAN_SHAPES).forEach(([key, def]) => {
    def.parts.forEach((part) => {
      const avgScale = part.type === 'torus'
        ? part.scale[0]
        : (part.scale[0] + part.scale[1] + part.scale[2]) / 3;
      if (part.type === 'torus') {
        // approxime le tore par un anneau de petites sphères
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          parts.push({
            pos: [
              part.pos[0] + Math.cos(a) * part.scale[0],
              part.pos[1],
              part.pos[2] + Math.sin(a) * part.scale[0],
            ],
            radius: part.scale[2],
            color: def.color,
            alpha: 0.5,
            organKey: key,
            wire: !!part.wire,
          });
        }
      } else {
        parts.push({
          pos: part.pos,
          radius: avgScale,
          color: def.color,
          alpha: part.wire ? 0.22 : 0.55,
          organKey: key,
          wire: !!part.wire,
        });
      }
    });
  });
  return parts;
}

if (typeof module !== 'undefined') module.exports = { buildBodyGeometry, buildOrganGeometry };
