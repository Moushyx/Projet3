// Assemble l'application en une seule page HTML autonome (CSS + JS en ligne).
// Sert à la publier comme lien unique, ouvrable directement dans Safari sur iPhone.
// Usage : node scripts/build-single-file.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const FONTS = 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@500;600&family=Instrument+Sans:wght@400;500;600&display=swap';

const css = read('css/style.css');

// Le modèle anatomique voyage avec la page, encodé en base64 : une page unique
// ne peut pas aller chercher un fichier à côté d'elle.
const modelB64 = fs.readFileSync(path.join(root, 'assets', 'body.bin')).toString('base64');

// Les planches anatomiques suivent le même chemin : une page unique ne peut
// pas aller chercher d'images à côté d'elle.
const planchesDir = path.join(root, 'assets', 'planches');
const planches = {};
fs.readdirSync(planchesDir).filter((f) => f.endsWith('.png')).forEach((f) => {
  planches[f.replace('.png', '')] =
    'data:image/png;base64,' + fs.readFileSync(path.join(planchesDir, f)).toString('base64');
});

const embedded = `/* ===== ressources embarquées ===== */
const EMBEDDED_BODY_MODEL = "${modelB64}";
const EMBEDDED_PLATES = ${JSON.stringify(planches)};`;

const scripts = [embedded].concat(
  ['js/vec3.js', 'js/data.js', 'js/reperage.js', 'js/protocoles.js', 'js/points-3d.js', 'js/plates.js', 'js/geometry.js',
   'js/model.js', 'js/renderer-gl.js', 'js/engine.js', 'js/app.js']
    .map((f) => `/* ===== ${f} ===== */\n${read(f)}`)
).join('\n\n');

// Corps de page repris de index.html, sans les balises propres au site
// (manifest, service worker, icônes) qui n'ont pas de sens en page unique.
const markup = read('index.html')
  .replace(/[\s\S]*<body>/, '')
  .replace(/<script[\s\S]*/, '')
  .trim();

const html = `<title>Méridiens 3D</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>

${markup}

<script>
${scripts}
</script>
`;

const outDir = path.join(root, 'dist');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'meridiens-3d.html');
fs.writeFileSync(out, html);
console.log('écrit', path.relative(root, out), Math.round(html.length / 1024) + ' Ko');
