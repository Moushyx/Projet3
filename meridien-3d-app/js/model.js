// Lecture du modèle anatomique compacté par scripts/prepare-model.js.
//
// Format : en-tête « MB3D », puis une suite de blocs. Chaque bloc porte ses
// positions sur 16 bits (réparties dans la boîte englobante), ses normales sur
// 8 bits, son occlusion ambiante sur 8 bits et ses index sur 16 bits.

function parseBodyModel(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'MB3D') throw new Error('modèle illisible (signature ' + magic + ')');
  const version = view.getUint16(4, true);
  const chunkCount = view.getUint16(6, true);

  const min = [view.getFloat32(8, true), view.getFloat32(12, true), view.getFloat32(16, true)];
  const max = [view.getFloat32(20, true), view.getFloat32(24, true), view.getFloat32(28, true)];

  let off = 32;
  const chunks = [];
  for (let c = 0; c < chunkCount; c++) {
    const vertexCount = view.getUint32(off, true);
    const indexCount = view.getUint32(off + 4, true);
    off += 8;
    const positions = new Uint16Array(arrayBuffer, off, vertexCount * 3); off += vertexCount * 6;
    const normals = new Int8Array(arrayBuffer, off, vertexCount * 3); off += vertexCount * 3;
    const ao = version >= 2 ? new Uint8Array(arrayBuffer, off, vertexCount) : null;
    if (version >= 2) off += vertexCount;
    const indices = new Uint16Array(arrayBuffer, off, indexCount); off += indexCount * 2;
    off += (4 - (off % 4)) % 4;
    chunks.push({ vertexCount, indexCount, positions, normals, ao, indices });
  }

  return {
    min, max,
    span: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
    chunks,
    triangleCount: chunks.reduce((s, c) => s + c.indexCount / 3, 0),
  };
}

// Décode la version embarquée dans la page unique (base64 -> ArrayBuffer).
function decodeBase64Model(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// Charge le modèle : depuis la donnée embarquée si elle existe, sinon par le
// réseau (version multi-fichiers servie par GitHub Pages).
function loadBodyModel(url) {
  if (typeof EMBEDDED_BODY_MODEL === 'string' && EMBEDDED_BODY_MODEL.length) {
    return Promise.resolve(parseBodyModel(decodeBase64Model(EMBEDDED_BODY_MODEL)));
  }
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error('modèle introuvable (' + r.status + ')');
    return r.arrayBuffer();
  }).then(parseBodyModel);
}

if (typeof module !== 'undefined') module.exports = { parseBodyModel, loadBodyModel };
