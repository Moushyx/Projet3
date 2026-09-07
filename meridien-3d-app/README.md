# Corps & Méridiens 3D — MTC

Application web (PWA) présentant un corps humain 3D interactif : les 12 méridiens
principaux de médecine traditionnelle chinoise + Ren Mai (Vaisseau Conception) et
Du Mai (Vaisseau Gouverneur), leurs organes associés, et une sélection de points
d'acupression classiques, cliquables/tactiles.

Aucune dépendance externe (pas de framework, pas de CDN) : un moteur 3D maison en
Canvas 2D (projection perspective + tri peintre) affiche le corps, les tracés de
méridiens et les points. Fonctionne 100 % hors-ligne une fois chargé (Service
Worker), et peut être ajoutée à l'écran d'accueil de l'iPhone comme une vraie app.

⚠️ **Usage pédagogique uniquement.** Les positions des points sont approximatives
et illustratives — ce n'est pas un outil médical ou clinique.

## Ouvrir l'app sur iPhone

**Option A — via GitHub Pages (recommandé, aucune installation)**
1. Dans le dépôt GitHub : *Settings → Pages → Build and deployment → Source* :
   choisir **GitHub Actions** (une seule fois).
2. Le workflow `.github/workflows/deploy-meridien-app.yml` déploie automatiquement
   ce dossier à chaque push. L'URL du site apparaît dans l'onglet *Actions* du
   dépôt (ou dans Settings → Pages) une fois le déploiement terminé.
3. Ouvrez cette URL dans **Safari** sur l'iPhone.
4. Optionnel : bouton *Partager* → **Sur l'écran d'accueil** pour l'utiliser comme
   une application plein écran (icône dédiée, sans barre d'adresse).

**Option B — test rapide en local (même réseau Wi-Fi)**
```bash
cd meridien-3d-app
npx http-server -p 8080
```
Puis, sur l'iPhone connecté au même Wi-Fi, ouvrir `http://<IP-de-votre-ordinateur>:8080`
dans Safari.

## Fonctionnalités

- Rotation (glisser un doigt), zoom (pincer), vue de face / de dos, réinitialisation.
- Liste des 14 méridiens en bas d'écran : toucher une carte affiche sa description,
  son élément, son organe associé, et met en évidence son tracé + ses points.
- Toucher un point lumineux sur le corps affiche son nom (pinyin), sa traduction,
  et ses indications principales.
- Recherche d'un point par code (ex. `LI4`) ou par nom (ex. `Hegu`).
- Organes internes stylisés qui s'illuminent quand le méridien correspondant est
  sélectionné.

## Structure du projet

```
meridien-3d-app/
├── index.html          Structure de la page + PWA (manifest, icônes)
├── manifest.webmanifest
├── sw.js                Service worker (cache hors-ligne)
├── css/style.css
├── js/
│   ├── vec3.js          Petites fonctions vectorielles 3D
│   ├── data.js          Données : méridiens, points, organes
│   ├── geometry.js       Construction du corps stylisé (chaînes de sphères)
│   ├── engine.js         Moteur 3D (caméra, projection, contrôles tactiles)
│   └── app.js            Rendu, interactions, UI
├── icons/                Icônes PWA générées (scripts/gen-icons.js)
└── scripts/gen-icons.js
```
