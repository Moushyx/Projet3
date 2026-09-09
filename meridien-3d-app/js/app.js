(function () {
  'use strict';

  const canvas = document.getElementById('viewer-canvas');
  const infoPanel = document.getElementById('info-panel');
  const infoTitle = document.getElementById('info-title');
  const infoSub = document.getElementById('info-sub');
  const infoBody = document.getElementById('info-body');
  const infoClose = document.getElementById('info-close');
  const legendList = document.getElementById('legend-list');
  const btnFront = document.getElementById('btn-front');
  const btnBack = document.getElementById('btn-back');
  const btnReset = document.getElementById('btn-reset');
  const btnAll = document.getElementById('btn-all');
  const btnProtocoles = document.getElementById('btn-protocoles');
  const btnHorloge = document.getElementById('btn-horloge');
  const btnQuiz = document.getElementById('btn-quiz');
  const btnFavoris = document.getElementById('btn-favoris');
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const loadingEl = document.getElementById('loading');
  const hintEl = document.getElementById('hint');

  // Favoris : gardés dans le navigateur, ils survivent à la fermeture de la page.
  const CLE_FAVORIS = 'meridiens3d.favoris';
  let favoris = [];
  try { favoris = JSON.parse(localStorage.getItem(CLE_FAVORIS) || '[]'); } catch (e) { favoris = []; }
  function estFavori(id) { return favoris.indexOf(id) >= 0; }
  function basculerFavori(id) {
    const i = favoris.indexOf(id);
    if (i >= 0) favoris.splice(i, 1); else favoris.push(id);
    try { localStorage.setItem(CLE_FAVORIS, JSON.stringify(favoris)); } catch (e) { /* navigation privée */ }
  }

  // Les 361 points de la nomenclature standard : la sélection commentée de
  // data.js, complétée par le catalogue.
  if (typeof CATALOGUE !== 'undefined') fusionnerCatalogue(MERIDIANS, CATALOGUE);

  const DISCLAIMER = "Positions indicatives et simplifiées, à but pédagogique. Ne remplace pas un avis médical ni la formation d'un praticien.";

  function setAccent(color) {
    document.documentElement.style.setProperty('--accent', color || '#d9c3a5');
  }

  // La fiche de détail recouvre le bas de l'écran (ou la droite sur grand écran).
  // On recadre la scène sur la surface qui reste visible.
  let occludedTarget = { bottom: 0, right: 0 };
  function updateSceneShift(panelOpen) {
    if (!panelOpen) { occludedTarget = { bottom: 0, right: 0 }; return; }
    const isSidePanel = window.innerWidth >= 760;
    if (isSidePanel) {
      occludedTarget = { bottom: 0, right: Math.min(infoPanel.offsetWidth, engine.width * 0.5) };
    } else {
      occludedTarget = { bottom: Math.min(infoPanel.offsetHeight, engine.height * 0.62), right: 0 };
    }
  }
  // Source d'une planche : embarquée dans la page unique, sinon servie à côté.
  function plateSrc(id) {
    if (typeof EMBEDDED_PLATES === 'object' && EMBEDDED_PLATES[id]) return EMBEDDED_PLATES[id];
    return 'assets/planches/' + id + '.png';
  }

  // ---------------------------------------------------------------
  // Vue 2D de la zone
  // ---------------------------------------------------------------
  // Une planche fixe, la région entière, sans agrandissement.
  //
  // L'agrandissement a été retiré : il promettait une précision que les
  // positions n'ont pas partout, et un point posé à un centimètre près se
  // voit d'autant mieux qu'on s'approche. La planche sert donc à situer —
  // « c'est sur la face interne, au-dessus de la cheville » — et c'est le
  // texte, sous elle, qui donne la mesure exacte.
  function buildZoneView(pointId, side, opts) {
    const info = PLATE_POINTS[pointId];
    if (!info || !PLATES_INFO[info.planche]) return '';
    const plate = PLATES_INFO[info.planche];
    const canal = (id) => { const f = chercherPoint(id); return f ? f.meridian.id : ''; };
    const monCanal = canal(pointId);
    const pxm = plate.pxParMetre || 2000;
    const proche = 0.06 * pxm;
    const voisins = Object.entries(PLATE_POINTS)
      .filter(([id, a]) => {
        if (a.planche !== info.planche) return false;
        if (id === pointId) return true;
        if (canal(id) === monCanal) return true;
        return Math.hypot(a.x - info.x, a.y - info.y) < proche;
      })
      .map(([id, a]) => ({ id, x: a.x, y: a.y }));
    const data = {
      planche: info.planche,
      src: plateSrc(info.planche),
      w: plate.w, h: plate.h, pxm: pxm,
      cx: info.x, cy: info.y,
      cotes: info.cotes || [],
      miroir: side === 'L',
      points: voisins,
      actif: pointId,
      canal: monCanal,
      couleur: (chercherPoint(pointId) || { meridian: {} }).meridian.color || '#b4453c',
      muet: !!(opts && opts.muet),
    };
    return `
      <div class="zone" data-zone='${JSON.stringify(data).replace(/'/g, '&#39;')}'>
        <div class="zone-head">
          <span class="zone-nom">${plate.nom}${side === 'L' ? ' · gauche' : ''}</span>
        </div>
        <div class="zone-view">
          <img class="zone-img" alt="${plate.nom}" src="${data.src}" draggable="false" />
          <svg class="zone-svg" aria-hidden="true"></svg>
        </div>
        <div class="zone-pied">Situation sur la région. La mesure exacte est donnée sous la planche.</div>
      </div>`;
  }

  function layoutZone(root) {
    const el = root.querySelector('.zone');
    if (!el) return;
    const d = JSON.parse(el.dataset.zone);
    const view = el.querySelector('.zone-view');
    const img = el.querySelector('.zone-img');
    const svg = el.querySelector('.zone-svg');
    const vw = view.clientWidth, vh = view.clientHeight;
    if (!vw || !vh) return;

    const k = Math.min(vw / d.w, vh / d.h) * 0.97;
    const tx = (vw - d.w * k) / 2, ty = (vh - d.h * k) / 2;
    const X = (x) => tx + (d.miroir ? d.w - x : x) * k;
    const Y = (y) => ty + y * k;

    img.style.width = d.w + 'px';
    img.style.height = d.h + 'px';
    img.style.transformOrigin = '0 0';
    img.style.transform = d.miroir
      ? `translate(${tx + d.w * k}px, ${ty}px) scale(${-k}, ${k})`
      : `translate(${tx}px, ${ty}px) scale(${k})`;

    const parts = [];
    const etiquettes = [];
    const boites = [];
    function poser(txt, cands, cls) {
      const larg = String(txt).length * 6.4 + 4;
      for (let i = 0; i < cands.length; i++) {
        const [cx, cy, anc] = cands[i];
        const x0 = anc === 'end' ? cx - larg : anc === 'middle' ? cx - larg / 2 : cx;
        const r = { x0, y0: cy - 10, x1: x0 + larg, y1: cy + 3 };
        const gene = boites.some((b) => !(r.x1 < b.x0 || r.x0 > b.x1 || r.y1 < b.y0 || r.y0 > b.y1));
        if (!gene) { boites.push(r); return `<text class="${cls}" x="${cx}" y="${cy}" text-anchor="${anc}">${txt}</text>`; }
      }
      return '';
    }

    // Le trajet du canal traité, et lui seul. Les treize autres, tracés en gris
    // par-dessus, formaient un écheveau qui n'apprenait rien.
    const trajets = (typeof PLATE_PATHS !== 'undefined' && PLATE_PATHS[d.planche]) || {};
    Object.entries(trajets).forEach(([mid, pieces]) => {
      const actif = mid === d.canal;
      if (!actif) return;
      pieces.forEach((pl) => {
        let dd = '';
        for (let i = 0; i < pl.length; i += 2) {
          dd += (i === 0 ? 'M' : 'L') + X(pl[i]).toFixed(1) + ' ' + Y(pl[i + 1]).toFixed(1);
        }
        parts.push(`<path class="canal${actif ? ' actif' : ''}" d="${dd}"${actif ? ` style="stroke:${d.couleur}"` : ''}/>`);
      });
    });

    const AX = X(d.cx), AY = Y(d.cy);
    const etiquetteActive = d.muet ? '' : poser(d.actif, [[AX + 11, AY + 5, 'start']], 'pt-actif-txt');

    d.points.forEach((pt) => {
      if (pt.id === d.actif) return;
      const x = X(pt.x), y = Y(pt.y);
      parts.push(`<circle class="pt-hit" data-pt="${pt.id}" cx="${x}" cy="${y}" r="12"/>`);
      parts.push(`<circle class="pt" cx="${x}" cy="${y}" r="3.6"/>`);
      etiquettes.push(poser(pt.id, [[x + 7, y + 4, 'start'], [x - 7, y + 4, 'end'],
        [x, y - 8, 'middle'], [x, y + 14, 'middle']], 'pt-txt'));
    });

    parts.push(`<circle class="pt-actif-halo" cx="${AX}" cy="${AY}" r="12"/>`);
    parts.push(`<circle class="pt-actif" cx="${AX}" cy="${AY}" r="6"/>`);
    etiquettes.push(etiquetteActive);

    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.setAttribute('width', vw);
    svg.setAttribute('height', vh);
    svg.innerHTML = parts.concat(etiquettes).join('');
  }

  function wireZone(root) {
    const el = root.querySelector('.zone');
    if (!el) return;
    const view = el.querySelector('.zone-view');
    const img = el.querySelector('.zone-img');

    // Toucher un voisin ouvre sa fiche : c'est la seule interaction qui reste.
    let depart = null;
    view.addEventListener('pointerdown', (e) => { depart = { x: e.clientX, y: e.clientY }; });
    view.addEventListener('pointerup', (e) => {
      if (!depart) return;
      const bouge = Math.hypot(e.clientX - depart.x, e.clientY - depart.y);
      depart = null;
      if (bouge > 8) return;
      const cible = document.elementFromPoint(e.clientX, e.clientY);
      const id = cible && cible.getAttribute && cible.getAttribute('data-pt');
      if (id) ouvrirPoint(id);
    });

    if (img.complete) layoutZone(root);
    else img.addEventListener('load', () => layoutZone(root));
    requestAnimationFrame(() => layoutZone(root));
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => layoutZone(root));
      ro.observe(view);
    } else {
      window.addEventListener('resize', () => layoutZone(root));
    }
  }

  // Retrouve un point par son code, quel que soit son canal.
  function chercherPoint(id) {
    for (const m of MERIDIANS) {
      const p = m.points.find((pt) => pt.id === id);
      if (p) return { meridian: m, point: p };
    }
    return null;
  }
  function ouvrirPoint(id, side, garderFocus) {
    const f = chercherPoint(id);
    if (!f) return;
    const cote = side || (f.meridian.bilateral ? (selectedAcupoint ? selectedAcupoint.side : 'R') : 'C');
    if (!garderFocus) focusPoints = null;
    showPointInfo(f.meridian, f.point, cote);
    focusOnPosition(POINTS_3D[id] || f.point.pos);
  }

  function dismissHint() {
    if (hintEl) hintEl.classList.add('hidden');
  }

  const engine = createEngine(canvas);
  let renderer = null;

  // ---- Points d'acupression et trajets, calés sur le modèle ----
  // Les données ne contiennent que le côté droit ; le côté gauche en est le
  // reflet, comme le veut la symétrie des méridiens bilatéraux.
  const acupoints = [];
  function mirrorX(p) { return [-p[0], p[1], p[2]]; }

  MERIDIANS.forEach((meridian) => {
    const sides = meridian.bilateral ? ['R', 'L'] : ['C'];
    sides.forEach((side) => {
      meridian.points.forEach((point) => {
        const base = POINTS_3D[point.id] || point.pos;
        acupoints.push({
          pos: side === 'L' ? mirrorX(base) : base.slice(),
          meridian, point, side,
          color: hexToUnit(meridian.color),
          screen: null,
        });
      });
    });
  });

  function hexToUnit(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Un tracé de méridien est un vrai tube : une ligne d'un pixel serait
  // invisible sur un écran dense, et un trait plat ne se ferait pas masquer
  // par le corps quand il passe de l'autre côté.
  function buildTube(polyline, radius, sides) {
    const pos = [], nrm = [], idx = [];
    const rings = [];
    for (let i = 0; i < polyline.length; i++) {
      const a = polyline[Math.max(0, i - 1)], b = polyline[Math.min(polyline.length - 1, i + 1)];
      let t = V3.normalize(V3.sub(b, a));
      if (V3.length(t) < 1e-6) t = [0, 1, 0];
      let u = V3.cross([0, 1, 0], t);
      if (V3.length(u) < 1e-6) u = V3.cross([1, 0, 0], t);
      u = V3.normalize(u);
      const v = V3.normalize(V3.cross(t, u));
      const ring = [];
      for (let s2 = 0; s2 < sides; s2++) {
        const ang = (s2 / sides) * Math.PI * 2;
        const c = Math.cos(ang), si = Math.sin(ang);
        const n = [u[0]*c + v[0]*si, u[1]*c + v[1]*si, u[2]*c + v[2]*si];
        ring.push(pos.length / 3);
        pos.push(polyline[i][0] + n[0]*radius, polyline[i][1] + n[1]*radius, polyline[i][2] + n[2]*radius);
        nrm.push(n[0], n[1], n[2]);
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) {
      for (let s2 = 0; s2 < sides; s2++) {
        const s3 = (s2 + 1) % sides;
        const a = rings[i][s2], b = rings[i][s3], c = rings[i+1][s3], d = rings[i+1][s2];
        idx.push(a, b, c, a, c, d);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
  }

  function buildMeridianBatches() {
    const batches = [];
    MERIDIANS.forEach((m) => {
      const pieces = MERIDIAN_PATHS[m.id] || [];
      const sides = m.bilateral ? [false, true] : [false];
      pieces.forEach((path) => {
        if (!path || path.length < 2) return;
        sides.forEach((flip) => {
          const poly = flip ? path.map(mirrorX) : path;
          const tube = buildTube(poly, 0.0035, 5);
          tube.meridianId = m.id;
          batches.push(tube);
        });
      });
    });
    return batches;
  }

  // ---- État de sélection ----
  let selectedMeridianId = null;
  let selectedAcupoint = null;

  // Un protocole, une liste de favoris ou une question de révision met en avant
  // un ensemble de points qui n'appartiennent pas au même canal. Tant qu'il est
  // posé, c'est lui qui décide de ce qui brille.
  let focusPoints = null;
  function isMeridianActive(id) { return !selectedMeridianId || selectedMeridianId === id; }
  function isOrganActive(key) {
    if (!selectedMeridianId) return null; // null = état neutre
    const m = MERIDIANS.find((mm) => mm.id === selectedMeridianId);
    return m && m.organKey === key;
  }

  // ---- UI : légende des méridiens ----
  function buildLegend() {
    legendList.innerHTML = '';
    MERIDIANS.forEach((m) => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.style.setProperty('--chip-color', m.color);
      chip.innerHTML = `<span class="dot" style="background:${m.color}"></span><span class="code">${m.id}</span>${m.name}`;
      chip.addEventListener('click', () => toggleMeridian(m.id));
      legendList.appendChild(chip);
    });
  }
  buildLegend();

  function highlightChip(id) {
    Array.from(legendList.children).forEach((chip, i) => {
      chip.classList.toggle('active', MERIDIANS[i].id === id);
    });
  }

  function toggleMeridian(id) {
    dismissHint();
    focusPoints = null;
    if (selectedMeridianId === id) {
      selectedMeridianId = null;
      highlightChip(null);
      setAccent(null);
      hideInfoPanel();
    } else {
      selectedMeridianId = id;
      selectedAcupoint = null;
      highlightChip(id);
      showMeridianInfo(MERIDIANS.find((m) => m.id === id));
    }
  }

  function showMeridianInfo(meridian) {
    setAccent(meridian.color);
    infoPanel.classList.add('open');
    infoTitle.innerHTML = `<span class="code">${meridian.id}</span>${meridian.name}`;
    infoSub.textContent = `${meridian.namePinyin} · ${meridian.yinYang}`;
    infoBody.innerHTML = `
      <div class="meta-row">
        <span class="meta"><span class="k">Élément</span><span class="v">${meridian.element}</span></span>
        <span class="meta"><span class="k">Organe</span><span class="v">${meridian.organ}</span></span>
        ${meridian.heure ? `<span class="meta"><span class="k">Heure</span><span class="v">${meridian.heure}</span></span>` : ''}
        <span class="meta"><span class="k">Points</span><span class="v">${meridian.points.length}</span></span>
      </div>
      <p>${meridian.description}</p>
      ${relationsElement(meridian)}
      <div class="section-label">Points du canal</div>
      <div class="point-list">
        ${meridian.points.map((p) => `<button class="point-chip" data-point="${p.id}"><span class="code">${p.id}</span>${p.name}</button>`).join('')}
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>
    `;
    infoBody.querySelectorAll('.point-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = meridian.points.find((pt) => pt.id === btn.dataset.point);
        showPointInfo(meridian, p, 'R');
        focusOnPosition(POINTS_3D[p.id] || p.pos);
      });
    });
    requestAnimationFrame(() => updateSceneShift(true));
  }

  function showPointInfo(meridian, point, side) {
    dismissHint();
    setAccent(meridian.color);
    selectedAcupoint = { meridian, point, side };
    infoPanel.classList.add('open');
    infoTitle.innerHTML = `<span class="code">${point.id}</span>${point.name}`;
    infoSub.textContent = `« ${point.trad} »`;
    const sideLabel = side === 'L' ? 'Côté gauche' : side === 'R' ? 'Côté droit' : 'Ligne médiane';
    const rep = (typeof REPERAGE !== 'undefined' && REPERAGE[point.id]) || {};
    // Faute de localisation rédigée, on montre celle que la règle de placement
    // permet de formuler : le repère osseux et le nombre de cun.
    const locAuto = !rep.loc && typeof POINT_LOC !== 'undefined' ? POINT_LOC[point.id] : null;
    infoBody.innerHTML = `
      <div class="meta-row">
        <span class="meta"><span class="k">Canal</span><span class="v">${meridian.name}</span></span>
        <span class="meta"><span class="k">Organe</span><span class="v">${meridian.organ}</span></span>
        <span class="meta"><span class="k">Côté</span><span class="v">${sideLabel}</span></span>
        <button class="meta fav${estFavori(point.id) ? ' on' : ''}" data-fav="${point.id}">
          <span class="k">${estFavori(point.id) ? '★' : '☆'}</span><span class="v">Favori</span></button>
      </div>
      ${buildZoneView(point.id, side)}
      ${rep.loc || locAuto ? `<div class="section-label">Localisation</div><p>${rep.loc || locAuto}</p>` : ''}
      ${rep.trouver ? `<div class="section-label">Comment le trouver</div><p>${rep.trouver}</p>` : ''}
      ${rep.prudence ? `<p class="prudence"><b>Prudence.</b> ${rep.prudence}</p>` : ''}
      <div class="section-label">Indications principales</div>
      <p>${point.info}</p>
      <div class="section-label">Autres points du canal ${meridian.id}</div>
      <div class="point-list">
        ${meridian.points.filter((p) => p.id !== point.id).map((p) => `<button class="point-chip" data-point="${p.id}"><span class="code">${p.id}</span>${p.name}</button>`).join('')}
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>
    `;
    const btnFav = infoBody.querySelector('[data-fav]');
    if (btnFav) btnFav.addEventListener('click', () => {
      basculerFavori(point.id);
      btnFav.classList.toggle('on', estFavori(point.id));
      btnFav.querySelector('.k').textContent = estFavori(point.id) ? '★' : '☆';
    });
    infoBody.querySelectorAll('.point-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = meridian.points.find((pt) => pt.id === btn.dataset.point);
        showPointInfo(meridian, p, side);
        focusOnPosition(POINTS_3D[p.id] || p.pos);
      });
    });
    wireZone(infoBody);
    requestAnimationFrame(() => updateSceneShift(true));
  }

  // ---------------------------------------------------------------
  // Les cinq éléments
  // ---------------------------------------------------------------
  // Chaque élément en engendre un et en contrôle un autre. C'est la grammaire
  // de la médecine chinoise : elle dit pourquoi on traite le Rein pour un
  // problème de Foie, ou la Rate pour un excès d'Humidité.
  const ENGENDRE = { Bois: 'Feu', Feu: 'Terre', Terre: 'Métal', 'Métal': 'Eau', Eau: 'Bois' };
  const CONTROLE = { Bois: 'Terre', Terre: 'Eau', Eau: 'Feu', Feu: 'Métal', 'Métal': 'Bois' };
  const COULEUR_ELEMENT = { Bois: '#2ecc71', Feu: '#e74c3c', Terre: '#f4a836', 'Métal': '#c9d1d9', Eau: '#4a6fd9' };

  function relationsElement(meridian) {
    const e = meridian.element;
    if (!ENGENDRE[e]) return '';
    const canaux = (el) => MERIDIANS.filter((m) => m.element === el).map((m) => m.name).join(', ');
    return `
      <div class="section-label">Cycle des cinq éléments</div>
      <div class="elem-row">
        <span class="elem" style="--c:${COULEUR_ELEMENT[e]}">${e}</span>
        <span class="elem-fleche">engendre</span>
        <span class="elem" style="--c:${COULEUR_ELEMENT[ENGENDRE[e]]}">${ENGENDRE[e]}</span>
      </div>
      <div class="elem-row">
        <span class="elem" style="--c:${COULEUR_ELEMENT[e]}">${e}</span>
        <span class="elem-fleche">contrôle</span>
        <span class="elem" style="--c:${COULEUR_ELEMENT[CONTROLE[e]]}">${CONTROLE[e]}</span>
      </div>
      <p class="hint">${e} : ${canaux(e)}. Nourri par ${Object.keys(ENGENDRE).find((k) => ENGENDRE[k] === e)}.</p>`;
  }

  // ---------------------------------------------------------------
  // Protocoles
  // ---------------------------------------------------------------
  function ouvrirPanneau(titre, sousTitre, html) {
    dismissHint();
    selectedAcupoint = null;
    infoPanel.classList.add('open');
    infoTitle.innerHTML = titre;
    infoSub.textContent = sousTitre;
    infoBody.innerHTML = html;
    requestAnimationFrame(() => updateSceneShift(true));
  }

  function montrerProtocoles() {
    focusPoints = null;
    selectedMeridianId = null;
    highlightChip(null);
    setAccent(null);
    ouvrirPanneau('Protocoles', 'Associations de points par motif', `
      <p class="hint">Choisissez un motif : les points s'allument sur le corps.</p>
      <div class="liste-proto">
        ${PROTOCOLES.map((pr) => `<button class="proto-chip" data-proto="${pr.id}">
            <b>${pr.nom}</b><small>${pr.points.join(' · ')}</small></button>`).join('')}
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>`);
    infoBody.querySelectorAll('[data-proto]').forEach((b) => {
      b.addEventListener('click', () => montrerProtocole(PROTOCOLES.find((x) => x.id === b.dataset.proto)));
    });
  }

  function montrerProtocole(pr) {
    if (!pr) return;
    focusPoints = new Set(pr.points);
    selectedMeridianId = null;
    highlightChip(null);
    setAccent('#e0a458');
    ouvrirPanneau(pr.nom, pr.points.length + ' points', `
      <p>${pr.conseil}</p>
      ${pr.prudence ? `<p class="prudence"><b>Prudence.</b> ${pr.prudence}</p>` : ''}
      <div class="section-label">Les points, dans l'ordre</div>
      <div class="point-list">
        ${pr.points.map((id) => {
          const f = chercherPoint(id);
          return `<button class="point-chip" data-point="${id}"><span class="code">${id}</span>${f ? f.point.name : ''}</button>`;
        }).join('')}
      </div>
      <div class="section-label">Comment presser</div>
      <p>Pression perpendiculaire à la peau, ferme mais supportable, jusqu'à sentir une lourdeur sourde — le « de qi ». Un à deux minutes par point, des deux côtés, en respirant lentement.</p>
      <p><button class="btn-large" data-retour="1">← Tous les protocoles</button></p>
      <p class="disclaimer">${DISCLAIMER}</p>`);
    infoBody.querySelectorAll('.point-chip').forEach((b) => {
      b.addEventListener('click', () => ouvrirPoint(b.dataset.point, undefined, true));
    });
    const r = infoBody.querySelector('[data-retour]');
    if (r) r.addEventListener('click', montrerProtocoles);
  }

  // ---------------------------------------------------------------
  // Horloge des organes
  // ---------------------------------------------------------------
  // Le Qi parcourt les douze canaux en vingt-quatre heures, deux heures chacun.
  // Un symptôme qui revient toujours à la même heure désigne son canal.
  function montrerHorloge() {
    focusPoints = null;
    const ordre = ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'TE', 'GB', 'LR'];
    const h = new Date().getHours();
    const creneau = Math.floor(((h + 1) % 24) / 2);           // 3 h–5 h = créneau 0
    const courant = ordre[(creneau + 11) % 12];
    ouvrirPanneau('Horloge des organes', 'Le Qi fait le tour en 24 heures', `
      <p class="hint">Il est ${String(h).padStart(2, '0')} h : le canal actif est en surbrillance.</p>
      <div class="horloge">
        ${ordre.map((id) => {
          const m = MERIDIANS.find((x) => x.id === id);
          return `<button class="heure-chip${id === courant ? ' actif' : ''}" data-mer="${id}">
            <span class="heure-h">${m.heure}</span>
            <span class="heure-n"><i style="background:${m.color}"></i>${m.name}</span></button>`;
        }).join('')}
      </div>
      <p class="hint">Se réveiller toujours à la même heure, une douleur qui revient au même moment : l'horloge indique le canal à interroger. L'organe est à son maximum sur son créneau, et à son minimum douze heures plus tard.</p>`);
    infoBody.querySelectorAll('[data-mer]').forEach((b) => {
      b.addEventListener('click', () => toggleMeridian(b.dataset.mer));
    });
  }

  // ---------------------------------------------------------------
  // Révision
  // ---------------------------------------------------------------
  let quizScore = { bon: 0, total: 0 };
  function montrerQuiz() {
    const avecPlanche = allPointsFlat.filter(({ point }) => PLATE_POINTS[point.id]);
    const cible = avecPlanche[Math.floor(Math.random() * avecPlanche.length)];
    // Trois leurres pris de préférence sur la même planche : reconnaître un
    // point parmi ses voisins est autrement plus instructif que de le
    // distinguer d'un point situé à l'autre bout du corps.
    const meme = avecPlanche.filter(({ point }) =>
      point.id !== cible.point.id && PLATE_POINTS[point.id].planche === PLATE_POINTS[cible.point.id].planche);
    const autres = avecPlanche.filter(({ point }) => point.id !== cible.point.id);
    const pioche = (meme.length >= 3 ? meme : autres).slice();
    const leurres = [];
    while (leurres.length < 3 && pioche.length) {
      leurres.push(pioche.splice(Math.floor(Math.random() * pioche.length), 1)[0]);
    }
    const choix = leurres.concat([cible]).sort(() => Math.random() - 0.5);

    focusPoints = new Set([cible.point.id]);
    selectedMeridianId = null;
    highlightChip(null);
    setAccent('#7ec8e3');
    ouvrirPanneau('Réviser', `Score : ${quizScore.bon} / ${quizScore.total}`, `
      <p class="hint">Quel est ce point ?</p>
      ${buildZoneView(cible.point.id, 'R', { muet: true })}
      <div class="point-list quiz-choix">
        ${choix.map((c) => `<button class="point-chip" data-rep="${c.point.id}"><span class="code">${c.point.id}</span>${c.point.name}</button>`).join('')}
      </div>
      <div class="quiz-verdict"></div>`);
    wireZone(infoBody);
    focusOnPosition(POINTS_3D[cible.point.id] || cible.point.pos);
    const verdict = infoBody.querySelector('.quiz-verdict');
    infoBody.querySelectorAll('[data-rep]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.closest('.quiz-choix').classList.contains('repondu')) return;
        b.closest('.quiz-choix').classList.add('repondu');
        const juste = b.dataset.rep === cible.point.id;
        quizScore.total++;
        if (juste) quizScore.bon++;
        infoBody.querySelectorAll('[data-rep]').forEach((x) => {
          if (x.dataset.rep === cible.point.id) x.classList.add('juste');
          else if (x === b) x.classList.add('faux');
        });
        const rep = (typeof REPERAGE !== 'undefined' && REPERAGE[cible.point.id]) || {};
        const lq = rep.loc || (typeof POINT_LOC !== 'undefined' ? POINT_LOC[cible.point.id] : '');
        verdict.innerHTML = `
          <p><b>${cible.point.id} ${cible.point.name}</b> — ${cible.meridian.name}.</p>
          ${lq ? `<p>${lq}</p>` : ''}
          <p><button class="btn-large" data-suivant="1">Question suivante →</button></p>`;
        verdict.querySelector('[data-suivant]').addEventListener('click', montrerQuiz);
        infoSub.textContent = `Score : ${quizScore.bon} / ${quizScore.total}`;
      });
    });
  }

  // ---------------------------------------------------------------
  // Favoris
  // ---------------------------------------------------------------
  function montrerFavoris() {
    focusPoints = favoris.length ? new Set(favoris) : null;
    selectedMeridianId = null;
    highlightChip(null);
    setAccent('#e6c07b');
    ouvrirPanneau('Favoris', favoris.length + ' point' + (favoris.length > 1 ? 's' : ''), favoris.length ? `
      <div class="point-list">
        ${favoris.map((id) => {
          const f = chercherPoint(id);
          return f ? `<button class="point-chip" data-point="${id}"><span class="code">${id}</span>${f.point.name}</button>` : '';
        }).join('')}
      </div>
      <p class="hint">L'étoile de chaque fiche ajoute ou retire un point de cette liste. Elle reste enregistrée sur cet appareil.</p>` : `
      <p>Aucun favori pour l'instant.</p>
      <p class="hint">Ouvrez la fiche d'un point et touchez l'étoile pour le retrouver ici.</p>`);
    infoBody.querySelectorAll('.point-chip').forEach((b) => {
      b.addEventListener('click', () => ouvrirPoint(b.dataset.point, undefined, true));
    });
  }

  function hideInfoPanel() {
    infoPanel.classList.remove('open');
    selectedAcupoint = null;
    updateSceneShift(false);
  }

  infoClose.addEventListener('click', () => {
    hideInfoPanel();
    selectedMeridianId = null;
    highlightChip(null);
    setAccent(null);
  });

  btnAll.addEventListener('click', () => {
    selectedMeridianId = null;
    focusPoints = null;
    highlightChip(null);
    setAccent(null);
    hideInfoPanel();
  });
  btnProtocoles.addEventListener('click', montrerProtocoles);
  btnHorloge.addEventListener('click', montrerHorloge);
  btnQuiz.addEventListener('click', montrerQuiz);
  btnFavoris.addEventListener('click', montrerFavoris);

  // On amène la caméra en face du point : sans cela, choisir un point du dos ne
  // change rien à l'écran et l'on ne voit pas où il tombe.
  function focusOnPosition(pos, rayon) {
    engine.camera.target = [0, pos[1], 0];
    const r = Math.hypot(pos[0], pos[2]);
    if (r > 0.03) engine.camera.theta = Math.atan2(pos[0], pos[2]);
    engine.camera.radius = rayon || 1.9;
  }

  function setView(theta) {
    engine.camera.theta = theta;
    engine.camera.phi = 1.42;
  }
  btnFront.addEventListener('click', () => setView(0));
  btnBack.addEventListener('click', () => setView(Math.PI));
  btnReset.addEventListener('click', () => {
    engine.camera.target = [0, 1.05, 0];
    engine.camera.radius = 2.6;
    engine.camera.theta = 0.25;
    engine.camera.phi = 1.42;
    selectedMeridianId = null;
    highlightChip(null);
    setAccent(null);
    hideInfoPanel();
  });

  // ---- Recherche ----
  const allPointsFlat = [];
  MERIDIANS.forEach((m) => m.points.forEach((p) => allPointsFlat.push({ meridian: m, point: p })));

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    searchResults.innerHTML = '';
    if (!q) { searchResults.classList.remove('open'); return; }
    // On cherche aussi dans les indications et la localisation : « migraine »,
    // « nausée », « poignet » doivent trouver les points, pas seulement leur code.
    const sansAccent = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const qn = sansAccent(q);
    const score = ({ meridian, point }) => {
      const rep = (typeof REPERAGE !== 'undefined' && REPERAGE[point.id]) || {};
    // Faute de localisation rédigée, on montre celle que la règle de placement
    // permet de formuler : le repère osseux et le nombre de cun.
    const locAuto = !rep.loc && typeof POINT_LOC !== 'undefined' ? POINT_LOC[point.id] : null;
      if (sansAccent(point.id).startsWith(qn)) return 0;
      if (sansAccent(point.name).includes(qn) || sansAccent(point.trad).includes(qn)) return 1;
      if (sansAccent(meridian.name).includes(qn)) return 2;
      if (sansAccent(point.info || '').includes(qn)) return 3;
      if (sansAccent((rep.loc || '') + ' ' + (rep.trouver || '')).includes(qn)) return 4;
      return 99;
    };
    const matches = allPointsFlat.map((e) => ({ e, s: score(e) }))
      .filter((x) => x.s < 99)
      .sort((a, b) => a.s - b.s)
      .slice(0, 14)
      .map((x) => x.e);
    if (matches.length === 0) { searchResults.classList.remove('open'); return; }
    searchResults.classList.add('open');
    matches.forEach(({ meridian, point }) => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `<span class="dot" style="background:${meridian.color}"></span><span class="code">${point.id}</span> ${point.name} <small>${meridian.name}</small>`;
      item.addEventListener('click', () => {
        focusPoints = null;
        selectedMeridianId = meridian.id;
        highlightChip(meridian.id);
        showPointInfo(meridian, point, 'R');
        focusOnPosition(POINTS_3D[point.id] || point.pos);
        searchResults.classList.remove('open');
        searchInput.value = '';
        searchInput.blur();
      });
      searchResults.appendChild(item);
    });
  });

  // ---- Tap / clic : sélection d'un point d'acupression ----
  let pointerDownInfo = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointerDownInfo = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!pointerDownInfo) return;
    const dx = e.clientX - pointerDownInfo.x;
    const dy = e.clientY - pointerDownInfo.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    const dt = Date.now() - pointerDownInfo.t;
    pointerDownInfo = null;
    if (moved > 8 || dt > 500) return; // c'était un glissé, pas un tap
    if (engine.isMultiTouch()) return; // fin d'un pincement, pas un appui

    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const hitRadius = 20;
    let best = null;
    let bestDist = Infinity;
    acupoints.forEach((ap) => {
      if (!ap.screen) return;
      const ddx = ap.screen.x - px;
      const ddy = ap.screen.y - py;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 <= hitRadius * hitRadius && ap.screen.dist < bestDist) {
        bestDist = ap.screen.dist;
        best = ap;
      }
    });
    if (best) {
      selectedMeridianId = best.meridian.id;
      highlightChip(best.meridian.id);
      showPointInfo(best.meridian, best.point, best.side);
    } else {
      dismissHint();
    }
  });

  // ---- Boucle de rendu ----
  const organParts = buildOrganGeometry(ORGAN_SHAPES);

  function meridianStyle(id) {
    const selected = selectedMeridianId === id;
    const neutral = !selectedMeridianId && !focusPoints;
    const m = MERIDIANS.find((mm) => mm.id === id);
    return {
      color: hexToUnit(m.color),
      alpha: selected ? 1 : neutral ? 0.55 : focusPoints ? 0.05 : 0.07,
      glow: selected ? 0.25 : 0,
    };
  }

  const pointDraws = [];
  function collectPoints(t) {
    pointDraws.length = 0;
    acupoints.forEach((ap) => {
      const active = focusPoints ? focusPoints.has(ap.point.id) : isMeridianActive(ap.meridian.id);
      const isSelected = selectedAcupoint
        && selectedAcupoint.point.id === ap.point.id
        && selectedAcupoint.side === ap.side;
      const pulse = active ? 0.5 + Math.sin(t * 2.2 + ap.pos[1] * 5) * 0.15 : 0;
      // Le visage, la main et le pied portent des points distants d'un
      // centimètre : à la taille de ceux du tronc, les pastilles se recouvrent
      // et l'on ne distingue plus lequel on vise.
      const serre = ap.pos[1] > 1.50 || ap.pos[1] < 0.16 || Math.abs(ap.pos[0]) > 0.40;
      const ech = serre ? 0.6 : 1;
      const enAvant = focusPoints && focusPoints.has(ap.point.id);
      // Sans canal choisi, les trois cent soixante et un points sont visibles :
      // à la taille qu'ils ont dans un canal isolé, ils couvriraient le corps.
      const neutre = !selectedMeridianId && !focusPoints;
      const rBase = isSelected || enAvant ? 0.014 : neutre ? 0.0065 : active ? 0.0085 : 0.005;
      pointDraws.push({
        pos: ap.pos,
        color: ap.color,
        radius: rBase * ech,
        alpha: neutre ? 0.8 : active ? 1 : 0.18,
        glow: isSelected ? 0.8 : enAvant ? 0.55 + pulse * 0.3 : (active && !neutre) ? pulse * 0.5 : 0,
      });
    });
    return pointDraws;
  }

  function collectOrgans() {
    const out = [];
    organParts.forEach((part) => {
      if (isOrganActive(part.organKey) !== true) return;
      out.push({
        pos: part.pos,
        color: hexToUnit(part.color),
        radius: part.radius,
        alpha: 0.42,
        glow: 0.3,
      });
    });
    return out;
  }

  function render() {
    engine.camera.occludedBottom += (occludedTarget.bottom - engine.camera.occludedBottom) * 0.16;
    engine.camera.occludedRight += (occludedTarget.right - engine.camera.occludedRight) * 0.16;
    engine.updateMatrices();

    if (renderer) {
      const t = performance.now() * 0.002;
      // Direction caméra -> sujet, pour la lampe frontale du rendu.
      const eye = engine.getCameraPosition();
      const toCamera = V3.normalize(V3.sub(eye, engine.camera.target));
      renderer.beginFrame(engine.viewProj, engine.width, engine.height, engine.dpr, toCamera);
      renderer.drawOverlay(engine.viewProj, meridianStyle, collectPoints(t));
      // Les organes sont à l'intérieur du corps : sans mise à l'écart du test
      // de profondeur, ils resteraient invisibles derrière la peau.
      renderer.drawThrough(engine.viewProj, collectOrgans());
    }

    // Positions à l'écran, tenues à jour pour le pointage tactile.
    acupoints.forEach((ap) => { ap.screen = engine.project(ap.pos); });

    requestAnimationFrame(render);
  }

  window.addEventListener('resize', () => updateSceneShift(infoPanel.classList.contains('open')));

  loadBodyModel('assets/body.bin').then((model) => {
    renderer = createRenderer(canvas, model);
    renderer.setMeridianTubes(buildMeridianBatches());
    if (loadingEl) loadingEl.remove();
  }).catch((err) => {
    if (loadingEl) loadingEl.textContent = 'Modèle 3D non chargé : ' + err.message;
    console.error(err);
  });

  requestAnimationFrame(render);
})();
