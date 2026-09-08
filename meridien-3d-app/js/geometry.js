// Organes internes simplifiés, positionnés à partir des données de data.js.
// (Le corps lui-même est un maillage anatomique construit dans mesh.js.)

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

if (typeof module !== 'undefined') module.exports = { buildOrganGeometry };
