// `npm run build` : fabrique dans `dist/` la version à mettre en ligne.
//
// Le jeu se joue sans build (`npm start`). Le build ajoute seulement ce qu'il faut pour
// l'héberger et l'installer : le contenu assemblé en un fichier, les icônes, et le service
// worker qui rend le tout disponible hors-ligne.

import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, readContentFiles, ROOT } from './content.mjs';
import { formatError } from '../src/content/rules.js';
import { makeIcons } from './png.mjs';

const STATIC = ['index.html', 'galerie.html', 'style.css', 'manifest.webmanifest'];

/** Tous les fichiers `.js` d'un dossier, en chemins relatifs à la racine du dépôt. */
function scripts(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return scripts(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

/**
 * @param {string} outDir  dossier de sortie (vidé puis rempli)
 * @returns {{outDir: string, version: string, files: string[], bytes: number}}
 */
export function build(outDir = join(ROOT, 'dist')) {
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

  // La version est l'empreinte de tout ce qui est servi : un fichier change, le cache change.
  const hash = createHash('sha256');
  for (const path of [...files.keys()].sort()) hash.update(path).update(files.get(path));
  const version = hash.digest('hex').slice(0, 12);

  // La balise que `sw-register.js` cherche : sans elle (en développement), pas de service worker.
  const page = files.get('index.html').toString();
  if (!page.includes('</head>')) throw new Error('index.html : balise </head> introuvable.');
  files.set('index.html', Buffer.from(page.replace('</head>', `  <meta name="ugf-build" content="${version}">\n</head>`)));

  const precache = [...files.keys()].sort();
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
