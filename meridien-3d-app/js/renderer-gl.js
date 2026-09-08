// Rendu WebGL.
//
// Le tampon de profondeur du GPU règle d'un coup ce que le tri du peintre ne
// savait pas faire : les surfaces qui se traversent, et l'occlusion des points
// situés de l'autre côté du corps. Tout est dessiné en vraie 3D — la peau, les
// tracés de méridiens (des tubes) et les points (des sphères).

const BODY_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute float aAO;
uniform mat4 uViewProj;
uniform vec3 uQuantScale;
uniform vec3 uQuantOffset;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAO;
void main() {
  vec3 p = aPos * uQuantScale + uQuantOffset;
  vWorld = p;
  vNormal = aNormal;
  vAO = aAO;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

// Même modèle d'éclairage que la version précédente : une lumière principale
// chaude, une lumière d'appoint froide, et un débordement au terminateur qui
// adoucit le passage à l'ombre comme sur une peau.
const BODY_FS = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vAO;
uniform vec3 uKeyDir;
uniform vec3 uFillDir;
uniform vec3 uViewDir;
uniform vec3 uSkinBase;
uniform vec3 uSkinWarm;
uniform vec3 uSkinShadow;
void main() {
  vec3 n = normalize(vNormal);
  float wrap = 0.35;
  float key = max(0.0, (dot(n, uKeyDir) + wrap) / (1.0 + wrap));
  float fill = max(0.0, (dot(n, uFillDir) + wrap) / (1.0 + wrap));
  float upward = (n.y + 1.0) * 0.5;
  float ao = vAO;
  float head = max(0.0, dot(n, uViewDir));
  float lambert = (0.32 * ao + 0.52 * key + 0.26 * head) * (0.88 + 0.12 * upward);

  float hands = clamp((abs(vWorld.x) - 0.30) / 0.14, 0.0, 1.0);
  float face = clamp((vWorld.y - 1.55) / 0.14, 0.0, 1.0);
  float feet = clamp((0.16 - vWorld.y) / 0.16, 0.0, 1.0);
  float warm = clamp(hands + face * 0.8 + feet * 0.7, 0.0, 1.0);
  vec3 base = mix(uSkinBase, uSkinWarm, warm);

  vec3 col = base * lambert * ao + uSkinShadow * (1.0 - min(1.0, lambert)) * 0.5;
  col += vec3(1.0, 0.965, 0.910) * key * 0.10 * ao;
  col += vec3(0.588, 0.706, 0.882) * fill * 0.105 * ao;
  gl_FragColor = vec4(col, 1.0);
}`;

// Tubes des méridiens et sphères des points : une géométrie unitaire que l'on
// place et met à l'échelle par uniformes.
const OVERLAY_VS = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uViewProj;
uniform vec3 uCenter;
uniform float uScale;
varying vec3 vNormal;
void main() {
  gl_Position = uViewProj * vec4(uCenter + aPos * uScale, 1.0);
  vNormal = aNormal;
}`;

const OVERLAY_FS = `
precision mediump float;
varying vec3 vNormal;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uGlow;
uniform vec3 uViewDir;
uniform float uSoftEdge;
void main() {
  vec3 n = normalize(vNormal);
  float lit = 0.62 + 0.38 * max(0.0, dot(n, normalize(vec3(-0.44, 0.70, 0.62))));
  vec3 col = uColor * lit + uColor * uGlow;
  // Bord fondu : sans lui, un organe dessiné en transparence apparaît comme un
  // disque franc posé sur la peau au lieu d'une lueur interne.
  float facing = max(0.0, dot(n, uViewDir));
  float a = uAlpha * mix(1.0, smoothstep(0.0, 0.75, facing), uSoftEdge);
  gl_FragColor = vec4(col, a);
}`;

function createRenderer(canvas, model) {
  const gl = canvas.getContext('webgl', {
    antialias: true,
    alpha: false,
    depth: true,
    powerPreference: 'high-performance',
  }) || canvas.getContext('experimental-webgl');
  if (!gl) throw new Error('WebGL indisponible');

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader : ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }
  function program(vs, fs, attribs, uniforms) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('programme : ' + gl.getProgramInfoLog(p));
    }
    const o = { program: p, a: {}, u: {} };
    attribs.forEach((n) => { o.a[n] = gl.getAttribLocation(p, n); });
    uniforms.forEach((n) => { o.u[n] = gl.getUniformLocation(p, n); });
    return o;
  }

  const bodyProg = program(BODY_VS, BODY_FS,
    ['aPos', 'aNormal', 'aAO'],
    ['uViewProj', 'uQuantScale', 'uQuantOffset', 'uKeyDir', 'uFillDir', 'uViewDir', 'uSkinBase', 'uSkinWarm', 'uSkinShadow']);
  const overlayProg = program(OVERLAY_VS, OVERLAY_FS,
    ['aPos', 'aNormal'],
    ['uViewProj', 'uCenter', 'uScale', 'uColor', 'uAlpha', 'uGlow', 'uViewDir', 'uSoftEdge']);

  // ---- Envoi du corps sur la carte graphique (une seule fois) ----
  const bodyChunks = model.chunks.map((c) => {
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, c.positions, gl.STATIC_DRAW);
    const nrm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
    gl.bufferData(gl.ARRAY_BUFFER, c.normals, gl.STATIC_DRAW);
    let ao = null;
    if (c.ao) {
      ao = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ao);
      gl.bufferData(gl.ARRAY_BUFFER, c.ao, gl.STATIC_DRAW);
    }
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, c.indices, gl.STATIC_DRAW);
    return { pos, nrm, ao, idx, count: c.indexCount };
  });

  // Les positions arrivent en entiers 16 bits. WebGL les ramène lui-même entre
  // 0 et 1 (attribut « normalisé ») : il ne reste qu'à les étaler dans la boîte
  // englobante, sans nouvelle division.
  const quantScale = [model.span[0], model.span[1], model.span[2]];

  // ---- Géométries unitaires réutilisées ----
  function makeSphere(rings, segments) {
    const pos = [], nrm = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI;
      for (let s = 0; s <= segments; s++) {
        const th = (s / segments) * Math.PI * 2;
        const x = Math.sin(phi) * Math.cos(th);
        const y = Math.cos(phi);
        const z = Math.sin(phi) * Math.sin(th);
        pos.push(x, y, z); nrm.push(x, y, z);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = r * (segments + 1) + s, b = a + segments + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
  }

  function uploadGeometry(g) {
    const pos = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.bufferData(gl.ARRAY_BUFFER, g.pos, gl.STATIC_DRAW);
    const nrm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
    gl.bufferData(gl.ARRAY_BUFFER, g.nrm, gl.STATIC_DRAW);
    const idx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
    return { pos, nrm, idx, count: g.idx.length };
  }

  const sphere = uploadGeometry(makeSphere(8, 12));

  // Les tubes des méridiens sont construits une fois pour toutes en coordonnées
  // du monde : ils épousent la peau, donc ils ne peuvent pas être instanciés.
  let meridianBatches = [];
  function setMeridianTubes(batches) {
    meridianBatches.forEach((b) => {
      gl.deleteBuffer(b.pos); gl.deleteBuffer(b.nrm); gl.deleteBuffer(b.idx);
    });
    meridianBatches = batches.map((b) => {
      const up = uploadGeometry(b);
      up.meridianId = b.meridianId;
      return up;
    });
  }

  function bindGeometry(prog, geo) {
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.pos);
    gl.enableVertexAttribArray(prog.a.aPos);
    gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.nrm);
    gl.enableVertexAttribArray(prog.a.aNormal);
    gl.vertexAttribPointer(prog.a.aNormal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.idx);
  }

  let lastViewDir = [0, 0, 1];
  function beginFrame(viewProj, width, height, dpr, viewDir) {
    lastViewDir = normalize3(viewDir || [0, 0, 1]);
    gl.viewport(0, 0, Math.round(width * dpr), Math.round(height * dpr));
    gl.clearColor(0.043, 0.070, 0.125, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE); // le maillage d'origine est déclaré double face
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(bodyProg.program);
    gl.uniformMatrix4fv(bodyProg.u.uViewProj, false, viewProj);
    gl.uniform3fv(bodyProg.u.uQuantScale, quantScale);
    gl.uniform3fv(bodyProg.u.uQuantOffset, model.min);
    gl.uniform3fv(bodyProg.u.uKeyDir, normalize3([-0.44, 0.70, 0.62]));
    gl.uniform3fv(bodyProg.u.uFillDir, normalize3([0.78, 0.12, -0.42]));
    gl.uniform3fv(bodyProg.u.uViewDir, normalize3(viewDir || [0, 0, 1]));
    gl.uniform3fv(bodyProg.u.uSkinBase, [0.886, 0.698, 0.573]);
    gl.uniform3fv(bodyProg.u.uSkinWarm, [0.910, 0.651, 0.541]);
    gl.uniform3fv(bodyProg.u.uSkinShadow, [0.290, 0.204, 0.227]);

    bodyChunks.forEach((c) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, c.pos);
      gl.enableVertexAttribArray(bodyProg.a.aPos);
      gl.vertexAttribPointer(bodyProg.a.aPos, 3, gl.UNSIGNED_SHORT, true, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.nrm);
      gl.enableVertexAttribArray(bodyProg.a.aNormal);
      gl.vertexAttribPointer(bodyProg.a.aNormal, 3, gl.BYTE, true, 0, 0);
      if (c.ao && bodyProg.a.aAO >= 0) {
        gl.bindBuffer(gl.ARRAY_BUFFER, c.ao);
        gl.enableVertexAttribArray(bodyProg.a.aAO);
        gl.vertexAttribPointer(bodyProg.a.aAO, 1, gl.UNSIGNED_BYTE, true, 0, 0);
      } else if (bodyProg.a.aAO >= 0) {
        gl.disableVertexAttribArray(bodyProg.a.aAO);
        gl.vertexAttrib1f(bodyProg.a.aAO, 1);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, c.idx);
      gl.drawElements(gl.TRIANGLES, c.count, gl.UNSIGNED_SHORT, 0);
    });
  }

  function normalize3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  // ---- Tracés et points, dessinés par-dessus la peau ----
  function drawOverlay(viewProj, meridianStyle, points) {
    gl.useProgram(overlayProg.program);
    gl.uniformMatrix4fv(overlayProg.u.uViewProj, false, viewProj);
    gl.uniform3fv(overlayProg.u.uViewDir, lastViewDir);
    gl.uniform1f(overlayProg.u.uSoftEdge, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    meridianBatches.forEach((b) => {
      const st = meridianStyle(b.meridianId);
      if (st.alpha <= 0.01) return;
      bindGeometry(overlayProg, b);
      gl.uniform3f(overlayProg.u.uCenter, 0, 0, 0);
      gl.uniform1f(overlayProg.u.uScale, 1);
      gl.uniform3fv(overlayProg.u.uColor, st.color);
      gl.uniform1f(overlayProg.u.uAlpha, st.alpha);
      gl.uniform1f(overlayProg.u.uGlow, st.glow || 0);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
    });

    bindGeometry(overlayProg, sphere);
    points.forEach((pt) => {
      if (pt.alpha <= 0.01) return;
      gl.uniform3fv(overlayProg.u.uCenter, pt.pos);
      gl.uniform1f(overlayProg.u.uScale, pt.radius);
      gl.uniform3fv(overlayProg.u.uColor, pt.color);
      gl.uniform1f(overlayProg.u.uAlpha, pt.alpha);
      gl.uniform1f(overlayProg.u.uGlow, pt.glow || 0);
      gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
    });

    gl.disable(gl.BLEND);
  }

  // Les organes vivent sous la peau : on les dessine sans test de profondeur,
  // ce qui donne une lecture en transparence plutôt qu'une masse cachée.
  function drawThrough(viewProj, items) {
    if (!items.length) return;
    gl.useProgram(overlayProg.program);
    gl.uniformMatrix4fv(overlayProg.u.uViewProj, false, viewProj);
    gl.uniform3fv(overlayProg.u.uViewDir, lastViewDir);
    gl.uniform1f(overlayProg.u.uSoftEdge, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    bindGeometry(overlayProg, sphere);
    items.forEach((it) => {
      gl.uniform3fv(overlayProg.u.uCenter, it.pos);
      gl.uniform1f(overlayProg.u.uScale, it.radius);
      gl.uniform3fv(overlayProg.u.uColor, it.color);
      gl.uniform1f(overlayProg.u.uAlpha, it.alpha);
      gl.uniform1f(overlayProg.u.uGlow, it.glow || 0);
      gl.drawElements(gl.TRIANGLES, sphere.count, gl.UNSIGNED_SHORT, 0);
    });
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  return { gl, beginFrame, drawOverlay, drawThrough, setMeridianTubes };
}

if (typeof module !== 'undefined') module.exports = { createRenderer };
