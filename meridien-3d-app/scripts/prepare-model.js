// Prépare le modèle anatomique pour l'application.
//
// Le .glb d'origine pèse 12,8 Mo : sa géométrie y est stockée en flottants
// 32 bits et ses index en 32 bits, ce qui est inutilement précis pour un corps
// de 1,78 m affiché sur un téléphone. On le convertit ici en un format compact :
// positions sur 16 bits réparties dans la boîte englobante, normales sur 8 bits,
// index sur 16 bits (chaque bloc tient sous 65 536 sommets). Le fichier tombe
// à environ 5,5 Mo sans perte visible.
//
// Au passage on met le modèle aux coordonnées de l'application : Y vertical,
// pieds au sol (y = 0), corps centré en x = 0, taille ramenée à 1,78 m.
//
// Usage : node scripts/prepare-model.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'male_body_base_mesh_highpoly.glb');
const OUT_BIN = path.join(ROOT, 'assets', 'body.bin');
const TARGET_HEIGHT = 1.78; // mètres

// ---------- Lecture du .glb ----------
const buf = fs.readFileSync(SRC);
if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('fichier .glb attendu');
let off = 12, gltf = null, bin = null;
while (off < buf.length) {
  const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
  const data = buf.subarray(off + 8, off + 8 + len);
  if (type === 0x4E4F534A) gltf = JSON.parse(data.toString('utf8'));
  if (type === 0x004E4942) bin = data;
  off += 8 + len;
  off += (4 - (off % 4)) % 4;
}

// ---------- Matrices ----------
const IDENT = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0];
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const m = [
    1-2*(y*y+z*z), 2*(x*y+z*w),   2*(x*z-y*w),   0,
    2*(x*y-z*w),   1-2*(x*x+z*z), 2*(y*z+x*w),   0,
    2*(x*z+y*w),   2*(y*z-x*w),   1-2*(x*x+y*y), 0,
    0, 0, 0, 1,
  ];
  for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) m[c * 4 + r] *= s[c];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2];
  return m;
}
const applyPoint = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2] + m[14],
];
// Une normale se transforme par la matrice sans translation ; les échelles
// du modèle étant uniformes, la transposée de l'inverse est superflue.
const applyDir = (m, p) => [
  m[0]*p[0] + m[4]*p[1] + m[8]*p[2],
  m[1]*p[0] + m[5]*p[1] + m[9]*p[2],
  m[2]*p[0] + m[6]*p[1] + m[10]*p[2],
];

// ---------- Accès aux données ----------
function accessorData(index) {
  const a = gltf.accessors[index];
  const bv = gltf.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const readers = {
    5120: [1, (o) => bin.readInt8(o)],
    5121: [1, (o) => bin.readUInt8(o)],
    5122: [2, (o) => bin.readInt16LE(o)],
    5123: [2, (o) => bin.readUInt16LE(o)],
    5125: [4, (o) => bin.readUInt32LE(o)],
    5126: [4, (o) => bin.readFloatLE(o)],
  };
  const [size, read] = readers[a.componentType];
  const stride = bv.byteStride || size * comps;
  const out = new Float64Array(a.count * comps);
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < comps; c++) out[i * comps + c] = read(base + i * stride + c * size);
  }
  return out;
}

// ---------- Parcours de la scène ----------
const chunks = [];
function walk(nodeIndex, parent) {
  const n = gltf.nodes[nodeIndex];
  const m = mul(parent, nodeMatrix(n));
  if (n.mesh !== undefined) {
    gltf.meshes[n.mesh].primitives.forEach((pr) => {
      const pos = accessorData(pr.attributes.POSITION);
      const nrm = pr.attributes.NORMAL !== undefined ? accessorData(pr.attributes.NORMAL) : null;
      const idx = accessorData(pr.indices);
      const count = pos.length / 3;
      const P = new Float64Array(pos.length);
      const N = new Float64Array(pos.length);
      for (let i = 0; i < count; i++) {
        const p = applyPoint(m, [pos[i*3], pos[i*3+1], pos[i*3+2]]);
        P[i*3] = p[0]; P[i*3+1] = p[1]; P[i*3+2] = p[2];
        if (nrm) {
          const d = applyDir(m, [nrm[i*3], nrm[i*3+1], nrm[i*3+2]]);
          const len = Math.hypot(d[0], d[1], d[2]) || 1;
          N[i*3] = d[0]/len; N[i*3+1] = d[1]/len; N[i*3+2] = d[2]/len;
        }
      }
      chunks.push({ P, N, I: idx, vertexCount: count });
    });
  }
  (n.children || []).forEach((c) => walk(c, m));
}
(gltf.scenes[gltf.scene || 0].nodes).forEach((n) => walk(n, IDENT));

// ---------- Mise à l'échelle et recentrage ----------
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
chunks.forEach((c) => {
  for (let i = 0; i < c.vertexCount; i++)
    for (let k = 0; k < 3; k++) {
      const v = c.P[i*3+k];
      if (v < mn[k]) mn[k] = v;
      if (v > mx[k]) mx[k] = v;
    }
});
const scale = TARGET_HEIGHT / (mx[1] - mn[1]);
const shift = [
  -(mn[0] + mx[0]) / 2 * scale,   // centré latéralement
  -mn[1] * scale,                  // pieds au sol
  -(mn[2] + mx[2]) / 2 * scale,   // centré en profondeur
];
console.log('échelle appliquée :', scale.toFixed(5), '| hauteur d origine :', (mx[1]-mn[1]).toFixed(3));

let fmn = [Infinity, Infinity, Infinity], fmx = [-Infinity, -Infinity, -Infinity];
chunks.forEach((c) => {
  for (let i = 0; i < c.vertexCount; i++) {
    for (let k = 0; k < 3; k++) {
      const v = c.P[i*3+k] * scale + shift[k];
      c.P[i*3+k] = v;
      if (v < fmn[k]) fmn[k] = v;
      if (v > fmx[k]) fmx[k] = v;
    }
  }
});
console.log('boîte finale min :', fmn.map(v => v.toFixed(3)).join(', '));
console.log('             max :', fmx.map(v => v.toFixed(3)).join(', '));

// ---------- Occlusion ambiante cuite dans le modèle ----------
// On remplit une grille d'occupation avec la géométrie, on la floute, puis on
// lit la densité un peu au-dessus de chaque sommet, dans la direction de sa
// normale. Là où le corps se replie sur lui-même — aisselles, aine, entre les
// doigts, sous le menton — la densité est forte et la peau s'assombrit.
const GRID = 128;
const gmin = fmn.slice(), gspan = [fmx[0]-fmn[0], fmx[1]-fmn[1], fmx[2]-fmn[2]];
const cell = Math.max(gspan[0], gspan[1], gspan[2]) / GRID;
const dims = gspan.map((s2) => Math.max(1, Math.ceil(s2 / cell) + 2));
const gi = (x, y, z) => (z * dims[1] + y) * dims[0] + x;
let occ = new Float32Array(dims[0] * dims[1] * dims[2]);

chunks.forEach((c) => {
  for (let i = 0; i < c.vertexCount; i++) {
    const x = Math.floor((c.P[i*3] - gmin[0]) / cell) + 1;
    const y = Math.floor((c.P[i*3+1] - gmin[1]) / cell) + 1;
    const z = Math.floor((c.P[i*3+2] - gmin[2]) / cell) + 1;
    if (x >= 0 && x < dims[0] && y >= 0 && y < dims[1] && z >= 0 && z < dims[2]) occ[gi(x,y,z)] = 1;
  }
});

// Remplissage : un corps est plein, pas creux. On propage depuis les bords de
// la grille à travers le vide ; ce que la propagation n'atteint pas est de
// l'intérieur. Un simple balayage par ligne comblerait aussi l'espace entre les
// deux jambes, qui deviendrait un faux occluant assombrissant tout le bas du corps.
{
  const outside = new Uint8Array(occ.length);
  const stack = [];
  const push = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= dims[0] || y >= dims[1] || z >= dims[2]) return;
    const i = gi(x, y, z);
    if (outside[i] || occ[i] > 0) return;
    outside[i] = 1;
    stack.push(x, y, z);
  };
  for (let x = 0; x < dims[0]; x++) for (let y = 0; y < dims[1]; y++) { push(x, y, 0); push(x, y, dims[2]-1); }
  for (let x = 0; x < dims[0]; x++) for (let z = 0; z < dims[2]; z++) { push(x, 0, z); push(x, dims[1]-1, z); }
  for (let y = 0; y < dims[1]; y++) for (let z = 0; z < dims[2]; z++) { push(0, y, z); push(dims[0]-1, y, z); }
  while (stack.length) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    push(x-1, y, z); push(x+1, y, z);
    push(x, y-1, z); push(x, y+1, z);
    push(x, y, z-1); push(x, y, z+1);
  }
  let filled = 0;
  for (let i = 0; i < occ.length; i++) if (!outside[i] && occ[i] === 0) { occ[i] = 1; filled++; }
  console.log('cellules intérieures comblées :', filled.toLocaleString('fr-FR'));
}

// Flou (trois passes séparables) : donne un champ de densité continu.
function blur(src) {
  const dst = new Float32Array(src.length);
  const at = (x,y,z) => (x<0||y<0||z<0||x>=dims[0]||y>=dims[1]||z>=dims[2]) ? 0 : src[gi(x,y,z)];
  for (let z = 0; z < dims[2]; z++) for (let y = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++) {
    dst[gi(x,y,z)] = (at(x-1,y,z)+at(x+1,y,z)+at(x,y-1,z)+at(x,y+1,z)+at(x,y,z-1)+at(x,y,z+1)+at(x,y,z)*2) / 8;
  }
  return dst;
}
for (let k = 0; k < 4; k++) occ = blur(occ);

function density(p) {
  const fx = (p[0]-gmin[0])/cell + 1, fy = (p[1]-gmin[1])/cell + 1, fz = (p[2]-gmin[2])/cell + 1;
  const x = Math.max(0, Math.min(dims[0]-1, Math.round(fx)));
  const y = Math.max(0, Math.min(dims[1]-1, Math.round(fy)));
  const z = Math.max(0, Math.min(dims[2]-1, Math.round(fz)));
  return occ[gi(x,y,z)];
}

chunks.forEach((c) => {
  c.AO = new Uint8Array(c.vertexCount);
  for (let i = 0; i < c.vertexCount; i++) {
    // On s'éloigne de la peau le long de la normale : ce qu'on trouve là est
    // ce qui bouche le ciel au-dessus du point.
    let d = 0;
    for (const dist of [2.2, 4.0, 6.5]) {
      d += density([
        c.P[i*3] + c.N[i*3] * cell * dist,
        c.P[i*3+1] + c.N[i*3+1] * cell * dist,
        c.P[i*3+2] + c.N[i*3+2] * cell * dist,
      ]);
    }
    const ao = Math.max(0, Math.min(1, 1 - (d / 3) * 1.25));
    c.AO[i] = Math.round(0.35 * 255 + ao * 0.65 * 255); // jamais totalement noir
  }
});
console.log('occlusion ambiante cuite (grille', dims.join('x') + ')');

// ---------- Écriture du format compact ----------
// En-tête : 'MB3D', version, nombre de blocs, boîte englobante.
const header = Buffer.alloc(4 + 2 + 2 + 24);
header.write('MB3D', 0, 'ascii');
header.writeUInt16LE(2, 4); // version 2 : occlusion ambiante incluse
header.writeUInt16LE(chunks.length, 6);
for (let k = 0; k < 3; k++) {
  header.writeFloatLE(fmn[k], 8 + k * 4);
  header.writeFloatLE(fmx[k], 20 + k * 4);
}

const span = [fmx[0]-fmn[0], fmx[1]-fmn[1], fmx[2]-fmn[2]];
const pieces = [header];
let totalTri = 0;

chunks.forEach((c) => {
  const n = c.vertexCount, ic = c.I.length;
  totalTri += ic / 3;
  const head = Buffer.alloc(8);
  head.writeUInt32LE(n, 0);
  head.writeUInt32LE(ic, 4);

  const pos = Buffer.alloc(n * 6);
  const nrm = Buffer.alloc(n * 3);
  const ao = Buffer.from(c.AO);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      const t = (c.P[i*3+k] - fmn[k]) / span[k];
      pos.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(t * 65535))), (i*3+k) * 2);
      nrm.writeInt8(Math.max(-127, Math.min(127, Math.round(c.N[i*3+k] * 127))), i*3+k);
    }
  }
  const idx = Buffer.alloc(ic * 2);
  for (let i = 0; i < ic; i++) idx.writeUInt16LE(c.I[i], i * 2);

  pieces.push(head, pos, nrm, ao, idx);
  // Alignement sur 4 octets pour pouvoir lire en TypedArray côté navigateur.
  const used = 8 + n * 6 + n * 3 + n + ic * 2;
  const pad = (4 - (used % 4)) % 4;
  if (pad) pieces.push(Buffer.alloc(pad));
});

const out = Buffer.concat(pieces);
fs.writeFileSync(OUT_BIN, out);
console.log('blocs :', chunks.length, '| triangles :', totalTri.toLocaleString('fr-FR'));
console.log('écrit', path.relative(ROOT, OUT_BIN), ':', (out.length / 1048576).toFixed(2), 'Mo',
  '(source :', (buf.length / 1048576).toFixed(2), 'Mo)');
