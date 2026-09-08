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
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  const loadingEl = document.getElementById('loading');
  const hintEl = document.getElementById('hint');

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
        <span class="meta"><span class="k">Points</span><span class="v">${meridian.points.length}</span></span>
      </div>
      <p>${meridian.description}</p>
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
    infoBody.innerHTML = `
      <div class="meta-row">
        <span class="meta"><span class="k">Canal</span><span class="v">${meridian.name}</span></span>
        <span class="meta"><span class="k">Organe</span><span class="v">${meridian.organ}</span></span>
        <span class="meta"><span class="k">Côté</span><span class="v">${sideLabel}</span></span>
      </div>
      <div class="section-label">Indications principales</div>
      <p>${point.info}</p>
      <div class="section-label">Autres points du canal ${meridian.id}</div>
      <div class="point-list">
        ${meridian.points.filter((p) => p.id !== point.id).map((p) => `<button class="point-chip" data-point="${p.id}"><span class="code">${p.id}</span>${p.name}</button>`).join('')}
      </div>
      <p class="disclaimer">${DISCLAIMER}</p>
    `;
    infoBody.querySelectorAll('.point-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = meridian.points.find((pt) => pt.id === btn.dataset.point);
        showPointInfo(meridian, p, side);
        focusOnPosition(POINTS_3D[p.id] || p.pos);
      });
    });
    requestAnimationFrame(() => updateSceneShift(true));
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
    highlightChip(null);
    setAccent(null);
    hideInfoPanel();
  });

  function focusOnPosition(pos) {
    engine.camera.target = [0, pos[1], 0];
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
    const matches = allPointsFlat.filter(({ point }) =>
      point.id.toLowerCase().includes(q) || point.name.toLowerCase().includes(q) || point.trad.toLowerCase().includes(q)
    ).slice(0, 12);
    if (matches.length === 0) { searchResults.classList.remove('open'); return; }
    searchResults.classList.add('open');
    matches.forEach(({ meridian, point }) => {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `<span class="dot" style="background:${meridian.color}"></span><span class="code">${point.id}</span> ${point.name} <small>${meridian.name}</small>`;
      item.addEventListener('click', () => {
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
    const neutral = !selectedMeridianId;
    const m = MERIDIANS.find((mm) => mm.id === id);
    return {
      color: hexToUnit(m.color),
      alpha: selected ? 1 : neutral ? 0.55 : 0.07,
      glow: selected ? 0.25 : 0,
    };
  }

  const pointDraws = [];
  function collectPoints(t) {
    pointDraws.length = 0;
    acupoints.forEach((ap) => {
      const active = isMeridianActive(ap.meridian.id);
      const isSelected = selectedAcupoint
        && selectedAcupoint.point.id === ap.point.id
        && selectedAcupoint.side === ap.side;
      const pulse = active ? 0.5 + Math.sin(t * 2.2 + ap.pos[1] * 5) * 0.15 : 0;
      pointDraws.push({
        pos: ap.pos,
        color: ap.color,
        radius: isSelected ? 0.016 : active ? 0.0105 : 0.006,
        alpha: active ? 1 : 0.28,
        glow: isSelected ? 0.8 : active ? pulse * 0.5 : 0,
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
