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
    radius: 2.6,
    theta: 0.25, // azimut (rad)
    phi: 1.42,   // élévation depuis l'axe Y (rad), ~PI/2 = niveau des yeux
    fov: 40 * Math.PI / 180,
    minRadius: 0.55,
    maxRadius: 5.0,
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
    const f = (height / 2) / Math.tan(camera.fov / 2);
    const scale = f / dist;
    return {
      x: width / 2 + camX * scale,
      y: height / 2 - camY * scale,
      dist,
      scale,
    };
  }

  // ---- Contrôles orbitaux (souris + tactile, y compris pincement) ----
  let dragging = false;
  let lastX = 0, lastY = 0;
  let pinchStartDist = 0;
  let pinchStartRadius = 0;
  const activePointers = new Map();

  function pointerDistance() {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (e) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (activePointers.size === 1) {
      dragging = true;
      lastX = e.clientX; lastY = e.clientY;
    } else if (activePointers.size === 2) {
      dragging = false;
      pinchStartDist = pointerDistance();
      pinchStartRadius = camera.radius;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size >= 2) {
      const d = pointerDistance();
      if (pinchStartDist > 10 && d > 10) {
        camera.radius = clampRadius(pinchStartRadius * (pinchStartDist / d));
      }
      return;
    }
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      camera.theta -= dx * 0.008;
      camera.phi = clampPhi(camera.phi - dy * 0.008);
    }
  });

  function endPointer(e) {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) { pinchStartDist = 0; }
    if (activePointers.size === 0) { dragging = false; }
    else if (activePointers.size === 1) {
      const pt = Array.from(activePointers.values())[0];
      dragging = true; lastX = pt.x; lastY = pt.y;
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', (e) => { if (activePointers.has(e.pointerId)) endPointer(e); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    camera.radius = clampRadius(camera.radius * (1 + e.deltaY * 0.001));
  }, { passive: false });

  return {
    ctx, camera,
    get width() { return width; },
    get height() { return height; },
    getCameraPosition, getBasis, project,
    isDragBusy: () => dragging || activePointers.size > 1,
  };
}

if (typeof module !== 'undefined') module.exports = { createEngine };
