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

  // ---- Géométrie statique du corps et des organes ----
  const bodyMesh = buildHumanMesh();
  const organParts = buildOrganGeometry(ORGAN_SHAPES);

  // Tampons de projection réutilisés d'une image à l'autre (évite de créer
  // des milliers d'objets par seconde).
  const vertexCount = bodyMesh.positions.length / 3;
  const projX = new Float32Array(vertexCount);
  const projY = new Float32Array(vertexCount);
  const projDist = new Float32Array(vertexCount);
  const partDepth = new Float32Array(bodyMesh.parts.length);

  // ---- Méridiens : segments de ligne + points d'acupression ----
  const meridianSegments = []; // { a, b, color, meridianId }
  const acupoints = []; // { pos, meridian, point, side, color, screen:{x,y,dist} }

  function mirrorX(pos) { return [-pos[0], pos[1], pos[2]]; }

  MERIDIANS.forEach((meridian) => {
    const sides = meridian.bilateral ? ['R', 'L'] : ['C'];
    sides.forEach((side) => {
      const positions = meridian.points.map((p) => (side === 'L' ? mirrorX(p.pos) : p.pos));
      for (let i = 0; i < positions.length - 1; i++) {
        meridianSegments.push({ a: positions[i], b: positions[i + 1], color: meridian.color, meridianId: meridian.id });
      }
      meridian.points.forEach((point, idx) => {
        acupoints.push({
          pos: positions[idx],
          meridian, point, side,
          color: meridian.color,
          screen: null,
        });
      });
    });
  });

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
        focusOnPosition(p.pos);
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
        focusOnPosition(p.pos);
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
        focusOnPosition(point.pos);
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
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const colorCache = new Map();
  function rgba(hex, alpha) {
    let rgb = colorCache.get(hex);
    if (!rgb) { rgb = hexToRgb(hex); colorCache.set(hex, rgb); }
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
  }

  function render() {
    const ctx = engine.ctx;
    engine.camera.occludedBottom += (occludedTarget.bottom - engine.camera.occludedBottom) * 0.16;
    engine.camera.occludedRight += (occludedTarget.right - engine.camera.occludedRight) * 0.16;
    const basis = engine.getBasis();
    const w = engine.width, h = engine.height;
    ctx.clearRect(0, 0, w, h);

    // Fond dégradé
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#101c30');
    grad.addColorStop(1, '#070c17');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const drawList = [];

    // Sol (cercle au niveau des pieds)
    const groundPts = [];
    const groundN = 40;
    for (let i = 0; i < groundN; i++) {
      const a = (i / groundN) * Math.PI * 2;
      const p = engine.project([Math.cos(a) * 0.9, 0, Math.sin(a) * 0.9], basis);
      if (p) groundPts.push(p);
    }
    if (groundPts.length === groundN) {
      const avgDist = groundPts.reduce((s, p) => s + p.dist, 0) / groundN;
      drawList.push({
        dist: avgDist + 3,
        draw: () => {
          ctx.beginPath();
          groundPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.closePath();
          ctx.fillStyle = 'rgba(30,50,80,0.35)';
          ctx.fill();
        },
      });
    }

    // Corps : maillage anatomique. On projette d'abord tous les sommets,
    // puis on écarte les facettes tournées vers l'arrière (invisibles).
    const pos = bodyMesh.positions;
    for (let i = 0; i < vertexCount; i++) {
      const pr = engine.project([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], basis);
      if (pr) { projX[i] = pr.x; projY[i] = pr.y; projDist[i] = pr.dist; }
      else { projDist[i] = -1; }
    }
    const camPos = basis.camPos;
    const smoothShading = !engine.isDragBusy();
    for (let i = 0; i < bodyMesh.parts.length; i++) {
      const ctr = bodyMesh.parts[i].centroid;
      const pr = engine.project(ctr, basis);
      partDepth[i] = pr ? pr.dist : 1e6;
    }
    for (let f = 0; f < bodyMesh.faces.length; f++) {
      const face = bodyMesh.faces[f];
      const c = face.center, n = face.n;
      // Facette cachée : sa normale s'éloigne de la caméra
      if (n[0] * (c[0] - camPos[0]) + n[1] * (c[1] - camPos[1]) + n[2] * (c[2] - camPos[2]) >= 0) continue;
      const da = projDist[face.a], db = projDist[face.b], dc = projDist[face.c], dd = projDist[face.d];
      if (da < 0 || db < 0 || dc < 0 || dd < 0) continue;
      const ax = projX[face.a], ay = projY[face.a];
      const bx = projX[face.b], by = projY[face.b];
      const cx = projX[face.c], cy = projY[face.c];
      const dx = projX[face.d], dy = projY[face.d];
      drawList.push({
        key: partDepth[face.part],
        dist: (da + db + dc + dd) * 0.25,
        draw: () => {
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.lineTo(cx, cy);
          ctx.lineTo(dx, dy);
          ctx.closePath();
          let paint;
          if (smoothShading) {
            // Dégradé entre les deux bords de la facette : la lumière devient
            // continue d'une facette à l'autre, le facettage disparaît.
            const g = face.axial
              ? ctx.createLinearGradient((ax + bx) / 2, (ay + by) / 2, (dx + cx) / 2, (dy + cy) / 2)
              : ctx.createLinearGradient((ax + dx) / 2, (ay + dy) / 2, (bx + cx) / 2, (by + cy) / 2);
            g.addColorStop(0, face.colorA);
            g.addColorStop(1, face.colorB);
            paint = g;
          } else {
            paint = face.colorFlat;
          }
          ctx.fillStyle = paint;
          ctx.fill();
          // Le contour de même teinte comble les fissures d'anticrénelage
          // entre facettes voisines.
          ctx.strokeStyle = face.colorFlat;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        },
      });
    }

    // Organes : le corps est opaque, l'organe du canal sélectionné est donc
    // dessiné par-dessus, en transparence, comme une vue en transparence.
    organParts.forEach((part) => {
      if (isOrganActive(part.organKey) !== true) return;
      const p = engine.project(part.pos, basis);
      if (!p) return;
      const r = Math.max(0.5, part.radius * p.scale);
      drawList.push({
        dist: -2, // toujours au-dessus du corps
        draw: () => {
          ctx.save();
          ctx.shadowColor = part.color;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fillStyle = rgba(part.color, 0.42);
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = rgba(part.color, 0.85);
          ctx.stroke();
          ctx.restore();
        },
      });
    });

    // Segments de méridiens
    meridianSegments.forEach((seg) => {
      const isSelectedOne = selectedMeridianId === seg.meridianId;
      const neutral = !selectedMeridianId;
      const opacity = isSelectedOne ? 0.95 : neutral ? 0.4 : 0.06;
      const width = isSelectedOne ? 2.6 : neutral ? 1.3 : 1;
      const pa = engine.project(seg.a, basis);
      const pb = engine.project(seg.b, basis);
      if (!pa || !pb) return;
      const dist = (pa.dist + pb.dist) / 2 - 0.012;
      drawList.push({
        dist,
        draw: () => {
          ctx.beginPath();
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.strokeStyle = rgba(seg.color, opacity);
          ctx.lineWidth = width;
          ctx.stroke();
        },
      });
    });

    // Points d'acupression
    const t = performance.now() * 0.002;
    acupoints.forEach((ap) => {
      const p = engine.project(ap.pos, basis);
      ap.screen = p;
      if (!p) return;
      const active = isMeridianActive(ap.meridian.id);
      const isSelected = selectedAcupoint && selectedAcupoint.point.id === ap.point.id && selectedAcupoint.side === ap.side;
      const baseR = Math.max(active ? 4.5 : 1.8, 0.012 * p.scale * (active ? 1 : 0.5));
      const pulse = active ? (0.5 + Math.sin(t * 2.2 + ap.pos[1] * 5) * 0.15) : 0;
      const opacity = active ? Math.min(1, 0.5 + pulse) : 0.22;
      drawList.push({
        dist: p.dist - 0.022,
        draw: () => {
          if (active) {
            ctx.save();
            ctx.shadowColor = ap.color;
            ctx.shadowBlur = isSelected ? 16 : 8;
          }
          ctx.beginPath();
          ctx.arc(p.x, p.y, isSelected ? baseR * 1.6 : baseR, 0, Math.PI * 2);
          ctx.fillStyle = rgba(ap.color, opacity);
          ctx.fill();
          if (isSelected) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
          if (active) ctx.restore();
        },
      });
    });

    // Tri du peintre : d'abord la clé de groupe (partie du corps pour le
    // maillage, profondeur propre pour le reste), puis la profondeur exacte.
    for (let i = 0; i < drawList.length; i++) {
      if (drawList[i].key === undefined) drawList[i].key = drawList[i].dist;
    }
    drawList.sort((a, b) => (b.key - a.key) || (b.dist - a.dist));
    drawList.forEach((item) => item.draw());

    requestAnimationFrame(render);
  }

  window.addEventListener('resize', () => updateSceneShift(infoPanel.classList.contains('open')));

  if (loadingEl) loadingEl.remove();
  requestAnimationFrame(render);
})();
