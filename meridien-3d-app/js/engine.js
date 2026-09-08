// Moteur de rendu 3D minimaliste en Canvas 2D : projection perspective manuelle,
// tri peintre (painter's algorithm) et contrôles orbitaux tactiles/souris.
// Aucune dépendance externe — conçu pour tourner offline sur iPhone (Safari/PWA).

function createEngine(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0, dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  const camera = {
    target: [0, 1.05, 0],
    radius: 3.0,
    theta: 0.25, // azimut (rad)
    phi: 1.42,   // élévation depuis l'axe Y (rad), ~PI/2 = niveau des yeux
    fov: 40 * Math.PI / 180,
    minRadius: 0.55,
    maxRadius: 5.5,
    // Surface masquée par la fiche de détail (en pixels). La scène est cadrée
    // dans la zone réellement visible, jamais sous le panneau.
    occludedBottom: 0,
    occludedRight: 0,
  };

  function clampPhi(p) { return Math.max(0.12, Math.min(Math.PI - 0.12, p)); }
  function clampRadius(r) { return Math.max(camera.minRadius, Math.min(camera.maxRadius, r)); }

  function getCameraPosition() {
    const { target, radius, theta, phi } = camera;
    return [
      target[0] + radius * Math.sin(phi) * Math.sin(theta),
      target[1] + radius * Math.cos(phi),
      target[2] + radius * Math.sin(phi) * Math.cos(theta),
    ];
  }

  function getBasis() {
    const camPos = getCameraPosition();
    let z = V3.normalize(V3.sub(camPos, camera.target));
    if (V3.length(z) < 1e-6) z = [0, 0, 1];
    let x = V3.normalize(V3.cross([0, 1, 0], z));
    if (!isFinite(x[0]) || V3.length(x) < 1e-6) x = [1, 0, 0];
    const y = V3.cross(z, x);
    return { camPos, x, y, z };
  }

  // Projette un point monde -> {x, y (pixels CSS), dist (profondeur caméra), scale (px/mètre)}
  function project(pos, basis) {
    const rel = V3.sub(pos, basis.camPos);
    const camX = V3.dot(rel, basis.x);
    const camY = V3.dot(rel, basis.y);
    const camZ = V3.dot(rel, basis.z);
    const dist = -camZ;
    if (dist <= 0.02) return null;
    // Cadrage sur la zone visible (ce que la fiche ne recouvre pas)
    const usableH = Math.max(160, height - camera.occludedBottom);
    const usableW = Math.max(160, width - camera.occludedRight);
    const f = (usableH / 2) / Math.tan(camera.fov / 2);
    const scale = f / dist;
    return {
      x: usableW / 2 + camX * scale,
      y: usableH / 2 - camY * scale,
      dist,
      scale,
    };
  }

  // ---- Contrôles : rotation à un doigt, pincement et déplacement à deux ----
  let dragging = false;
  let lastX = 0, lastY = 0;
  let pinchStartDist = 0;
  let pinchStartRadius = 0;
  let lastMidX = 0, lastMidY = 0;
  let multiTouchUntil = 0;
  const activePointers = new Map();

  function pointerList() { return Array.from(activePointers.values()); }

  function pointerDistance() {
    const pts = pointerList();
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function pointerMidpoint() {
    const pts = pointerList();
    if (pts.length < 2) return { x: 0, y: 0 };
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  // Combien de mètres represente un pixel à la distance du point visé :
  // sert à faire suivre le doigt exactement lors d'un déplacement.
  function worldPerPixel() {
    const usableH = Math.max(160, height - camera.occludedBottom);
    const f = (usableH / 2) / Math.tan(camera.fov / 2);
    return camera.radius / f;
  }

  function panBy(dx, dy) {
    const basis = getBasis();
    const k = worldPerPixel();
    const t = camera.target;
    const nx = t[0] - basis.x[0] * dx * k + basis.y[0] * dy * k;
    const ny = t[1] - basis.x[1] * dx * k + basis.y[1] * dy * k;
    const nz = t[2] - basis.x[2] * dx * k + basis.y[2] * dy * k;
    // On reste au voisinage du corps, sinon on se perd dans le vide.
    camera.target = [
      Math.max(-0.7, Math.min(0.7, nx)),
      Math.max(-0.1, Math.min(1.95, ny)),
      Math.max(-0.7, Math.min(0.7, nz)),
    ];
  }

  canvas.style.touchAction = 'none';

  // Safari sur iOS ignore `touch-action` pour son propre zoom à deux doigts :
  // sans ces gardes, le pincement agrandit la page au lieu de la scène, et la
  // rotation qui suit fait glisser la page entière.
  const swallow = (e) => e.preventDefault();
  ['touchstart', 'touchmove', 'touchend'].forEach((type) => {
    canvas.addEventListener(type, swallow, { passive: false });
  });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    canvas.addEventListener(type, swallow, { passive: false });
    document.addEventListener(type, swallow, { passive: false });
  });

  canvas.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // La capture peut échouer (pointeur déjà relâché, événement synthétique) :
    // ce n'est pas une raison pour abandonner le geste en cours.
    try { if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); } catch (err) { /* sans gravité */ }
    if (activePointers.size === 1) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
    } else if (activePointers.size === 2) {
      dragging = false;
      multiTouchUntil = Date.now() + 600;
      pinchStartDist = pointerDistance();
      pinchStartRadius = camera.radius;
      const mid = pointerMidpoint();
      lastMidX = mid.x; lastMidY = mid.y;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      multiTouchUntil = Date.now() + 600;
      const d = pointerDistance();
      if (pinchStartDist > 10 && d > 10) {
        camera.radius = clampRadius(pinchStartRadius * (pinchStartDist / d));
      }
      // Deux doigts qui glissent ensemble déplacent la vue : indispensable
      // une fois zoomé, sinon on ne peut plus atteindre le reste du corps.
      const mid = pointerMidpoint();
      panBy(mid.x - lastMidX, mid.y - lastMidY);
      lastMidX = mid.x; lastMidY = mid.y;
      return;
    }

    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      // Plus on est zoomé, plus la rotation est fine : à courte distance,
      // quelques degrés balaient déjà tout l'écran.
      const speed = 0.008 * Math.max(0.3, Math.min(1.15, camera.radius / 3));
      camera.theta -= dx * speed;
      camera.phi = clampPhi(camera.phi - dy * speed);
    }
  });

  function endPointer(e) {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchStartDist = 0;
    if (activePointers.size === 0) {
      dragging = false;
    } else if (activePointers.size === 1) {
      // Un doigt reste après un pincement : on reprend la rotation là où il est,
      // sans le saut que provoquerait une position périmée.
      const pt = pointerList()[0];
      dragging = true;
      lastX = pt.x; lastY = pt.y;
      multiTouchUntil = Date.now() + 400;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.radius = clampRadius(camera.radius * (1 + e.deltaY * 0.0015));
  }, { passive: false });

  return {
    ctx, camera,
    get width() { return width; },
    get height() { return height; },
    getCameraPosition, getBasis, project,
    isDragBusy: () => dragging || activePointers.size > 1,
    // Vrai juste après un geste à deux doigts : évite qu'un relâchement de
    // doigt soit pris pour un appui sur un point.
    isMultiTouch: () => activePointers.size > 1 || Date.now() < multiTouchUntil,
  };
}

if (typeof module !== 'undefined') module.exports = { createEngine };
