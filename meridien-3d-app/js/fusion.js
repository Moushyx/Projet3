// Fusion du catalogue complet dans les canaux.
//
// data.js porte une sélection de 95 points, commentés un par un ; catalogue.js
// porte les 266 autres. On les réunit ici, dans l'ordre des numéros, pour que
// le reste de l'application n'ait qu'une seule liste à connaître.
function fusionnerCatalogue(MERIDIANS, CATALOGUE, POINT_RULES) {
  const numero = (id) => parseInt(id.replace(/^[A-Z]+/, ''), 10) || 0;
  MERIDIANS.forEach((m) => {
    const sup = CATALOGUE[m.id] || [];
    sup.forEach((p) => {
      if (POINT_RULES && p.r) POINT_RULES[p.id] = p.r;
    });
    m.points = m.points
      .concat(sup.map((p) => ({ id: p.id, name: p.name, trad: p.trad, info: p.info })))
      .sort((a, b) => numero(a.id) - numero(b.id));
  });
  return MERIDIANS;
}

if (typeof module !== 'undefined') module.exports = { fusionnerCatalogue };
