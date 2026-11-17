// `npm run build` : fabrique dans `dist/` la version à mettre en ligne.
//
// Le jeu se joue sans build (`npm start`). Le build ajoute seulement ce qu'il faut pour
// l'héberger et l'installer : le contenu assemblé en un fichier, les icônes, le service
// worker qui rend le tout disponible hors-ligne, et la liste de ce que la page doit
// demander tout de suite.

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, readContentFiles, ROOT } from './content.mjs';
import { formatError } from '../src/content/rules.js';
import { makeIcons } from './png.mjs';

const STATIC = ['index.html', 'galerie.html', 'mentions-legales.html', 'style.css', 'manifest.webmanifest', 'apercu.jpg'];
const ONLINE_ONLY = ['apercu.jpg']; // l'image d'un lien partagé : en ligne pour les aperçus, inutile dans le jeu
const MEASURE_MARK = '<!-- mesure d’audience : ajoutée par le build -->';

/**
 * Le chargeur de la mesure d'audience (`tools/mesure-template.js`), prêt à entrer dans la page ; `''` sans clé.
 * La clé de projet PostHog (`phc_…`) est publique : elle ne sert qu'à écrire des événements.
 */
export function measureSnippet({ token = '', host = '' } = {}) {
  token = token.trim();
  if (!token) return '';
  if (!/^phc_[\w-]+$/.test(token)) throw new Error('POSTHOG_PROJECT_TOKEN : une clé de projet PostHog commence par « phc_ ».');
  host = (host.trim() || 'https://eu.i.posthog.com').replace(/\/+$/, '');
  if (!/^https:\/\/[\w.-]+$/.test(host)) throw new Error('POSTHOG_HOST : une adresse en https, sans chemin (https://eu.i.posthog.com).');
  const code = readFileSync(join(ROOT, 'tools/mesure-template.js'), 'utf8')
    .replace(/^\s*\/\/.*\n/gm, '') // les commentaires restent dans le modèle
    .replace("'__TOKEN__'", () => JSON.stringify(token))
    .replace("'__HOST__'", () => JSON.stringify(host));
  return `<script>\n${code}</script>`;
}

/** Tous les fichiers `.js` d'un dossier, en chemins relatifs à la racine du dépôt. */
function scripts(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return scripts(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

/** Un `import … from '…'` ou `export … from '…'` en début de ligne ; pas un `import()`, chargé plus tard. */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?:[\w$*{},\s]+?\s+from\s+)?['"]([^'"]+)['"]/gm;

/**
 * Les modules chargés au démarrage : le script de la page et tout ce qu'il importe, de proche en proche.
 * Annoncés dans la page, ils partent tous d'un coup au lieu d'attendre chacun le précédent.
 */
export function startupModules(files, entry) {
  const found = [];
  const visit = (path) => {
    if (found.includes(path) || !files.has(path)) return;
    found.push(path);
    for (const [, spec] of files.get(path).toString().matchAll(STATIC_IMPORT)) visit(posix.join(posix.dirname(path), spec));
  };
  visit(entry);
  return found;
}

/**
 * @param {string} outDir  dossier de sortie (vidé puis rempli)
 * @returns {{outDir: string, version: string, files: string[], bytes: number}}
 */
export function build(outDir = join(ROOT, 'dist'), env = process.env) {
  const { bundle, errors } = loadContent();
  if (errors.length) {
    const error = new Error(`Le contenu a ${errors.length} problème(s) : le build est annulé.\n${errors.map(formatError).join('\n')}`);
    error.errors = errors;
    throw error;
  }

  /** @type {Map<string, Buffer>} chemin relatif → contenu */
  const files = new Map();
  for (const path of [...STATIC, ...scripts('src')]) files.set(path, readFileSync(join(ROOT, path)));
  // Sons et voix : tout ce qui, dans `content/`, n'est ni une fiche ni de la documentation.
  for (const { path, text } of readContentFiles()) if (text === null) files.set(path, readFileSync(join(ROOT, path)));
  files.set('content.json', Buffer.from(JSON.stringify(bundle)));
  for (const [path, png] of Object.entries(makeIcons(bundle))) files.set(path, png);
  // Avant l'empreinte : brancher la mesure (ou changer de clé) change la version, et le service worker sert la nouvelle page.
  const measure = measureSnippet({ token: env.POSTHOG_PROJECT_TOKEN, host: env.POSTHOG_HOST });
  const source = files.get('index.html').toString();
  if (!source.includes(MEASURE_MARK)) throw new Error(`index.html : repère « ${MEASURE_MARK} » introuvable.`);
  files.set('index.html', Buffer.from(source.replace(MEASURE_MARK, () => measure))); // une fonction : le code contient des « $' »

  // La version est l'empreinte de tout ce qui est servi : un fichier change, le cache change.
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) hash.update(path).update(files.get(path));
  const version = hash.digest('hex').slice(0, 12);

  // La balise que `sw-register.js` cherche : sans elle (en développement), pas de service worker.
  let page = files.get('index.html').toString();
  if (!page.includes('</head>')) throw new Error('index.html : balise </head> introuvable.');
  page = page.replace('</head>', `  <meta name="ugf-build" content="${version}">\n</head>`);
  // Les modules du menu, annoncés dès la lecture de la page, avant la feuille de style qui ferait attendre
  // le script. Seulement sans service worker (première visite) : sous lui, ils sont déjà en cache, et les
  // annoncer ralentirait le menu.
  const modules = JSON.stringify(startupModules(files, page.match(/<script type="module" src="([^"]+)"/)?.[1]));
  const announce = `<script>if (!navigator.serviceWorker?.controller) for (const href of ${modules}) document.head.append(Object.assign(document.createElement('link'), { rel: 'modulepreload', href }));</script>`;
  files.set('index.html', Buffer.from(page.replace('<link rel="stylesheet"', `${announce}\n  <link rel="stylesheet"`)));

  const precache = [...files.keys()].filter((path) => !ONLINE_ONLY.includes(path)).sort();
  const worker = readFileSync(join(ROOT, 'tools/sw-template.js'), 'utf8')
    .replace("'__VERSION__'", JSON.stringify(version))
    .replace("['__FILES__']", JSON.stringify(precache, null, 2));
  files.set('sw.js', Buffer.from(worker));

  rmSync(outDir, { recursive: true, force: true });
  let bytes = 0;
  for (const [path, data] of files) {
    const target = join(outDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    bytes += data.length;
  }
  return { outDir, version, files: [...files.keys()].sort(), bytes };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { outDir, version, files, bytes } = build(process.argv[2]);
    const size = (filter) => files.filter(filter).reduce((n, path) => n + readFileSync(join(outDir, path)).length, 0);
    const ko = (n) => `${(n / 1024).toFixed(0)} Ko`;
    console.log(`✅ Build ${version} : ${files.length} fichiers, ${ko(bytes)} dans ${outDir}`);
    console.log(`   code ${ko(size((p) => p.startsWith('src/')))} · contenu ${ko(size((p) => p === 'content.json'))} · sons et voix ${ko(size((p) => p.startsWith('content/')))} · icônes ${ko(size((p) => p.startsWith('icons/')))}`);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}
