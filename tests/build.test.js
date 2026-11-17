// Le build : il produit tout ce qu'il faut pour héberger et installer le jeu, et rien d'incohérent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../tools/build.mjs';
import { encodePng, spriteToPng } from '../tools/png.mjs';

const PNG_SIGNATURE = '89504e470d0a1a0a';
const pngSize = (data) => ({ width: data.readUInt32BE(16), height: data.readUInt32BE(20) });

test('le build produit un site complet, installable et jouable hors-ligne', (t) => {
  const out = mkdtempSync(join(tmpdir(), 'ugf-build-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  const { version, files, bytes } = build(out);
  const read = (path) => readFileSync(join(out, path));

  for (const path of ['index.html', 'galerie.html', 'style.css', 'manifest.webmanifest', 'content.json', 'sw.js',
    'src/client/main.js', 'src/sim/game.js', 'src/content/rules.js']) {
    assert.ok(existsSync(join(out, path)), `${path} est dans le build`);
  }
  assert.ok(!files.some((p) => p.endsWith('.txt') || p.endsWith('.md')), 'ni fiches ni documentation : le contenu est dans content.json');
  assert.ok(bytes < 3_000_000, `le jeu reste léger (${bytes} octets)`);

  // La balise qui autorise l'enregistrement du service worker.
  const page = read('index.html').toString();
  assert.match(page, new RegExp(`<meta name="ugf-build" content="${version}">`));
  // Les modules du menu sont annoncés dès la page lue (sans service worker), d'après ses imports.
  const preloaded = JSON.parse(page.match(/for \(const href of (\[[^\]]*\])\)/)[1]);
  for (const path of ['src/client/main.js', 'src/client/ui.js', 'src/client/collection.js', 'src/sim/game.js']) assert.ok(preloaded.includes(path), `${path} est annoncé`);
  assert.ok(preloaded.every((path) => files.includes(path)), 'chaque module annoncé est dans le build');

  // Le contenu assemblé, sans la liste d'erreurs du serveur de développement.
  const bundle = JSON.parse(read('content.json'));
  assert.ok(Object.keys(bundle.heros).length >= 3);
  assert.equal(bundle.erreurs, undefined);

  // Les icônes : de vrais PNG, aux tailles annoncées dans le manifeste.
  const sizes = { 'icons/icone-192.png': 192, 'icons/icone-512.png': 512, 'icons/icone-maskable-512.png': 512, 'icons/apple-touch-icon.png': 180 };
  for (const [path, size] of Object.entries(sizes)) {
    const data = read(path);
    assert.equal(data.subarray(0, 8).toString('hex'), PNG_SIGNATURE, `${path} : signature PNG`);
    assert.deepEqual(pngSize(data), { width: size, height: size }, `${path} : ${size} px`);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) assert.ok(existsSync(join(out, icon.src)), `icône du manifeste : ${icon.src}`);

  // Le service worker : versionné, et il précharge tout le jeu en chemins relatifs.
  const worker = read('sw.js').toString();
  assert.ok(worker.includes(`const VERSION = "${version}"`));
  assert.ok(!worker.includes('__VERSION__') && !worker.includes('__FILES__'), 'le modèle est entièrement rempli');
  const precache = JSON.parse(worker.match(/const FILES = (\[[\s\S]*?\]);/)[1]);
  for (const path of ['index.html', 'content.json', 'style.css', 'src/client/main.js', 'icons/icone-192.png']) {
    assert.ok(precache.includes(path), `${path} est préchargé`);
  }
  assert.ok(!precache.includes('sw.js'), 'le service worker ne se précharge pas lui-même');
  assert.ok(precache.every((p) => !p.startsWith('/') && !p.includes('://')), 'chemins relatifs : compatible avec un sous-dossier');
  assert.deepEqual(precache, files.filter((p) => p !== 'sw.js' && p !== 'apercu.jpg'), 'tout ce qui est servi est préchargé, sauf l’image des aperçus de lien');
  // Une mise à jour n'est jamais imposée : skipWaiting n'existe que sur demande du menu.
  assert.equal(worker.match(/skipWaiting\(\)/g).length, 1);
  assert.match(worker, /event\.data === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
});

test('deux builds du même dépôt ont la même version', (t) => {
  const a = mkdtempSync(join(tmpdir(), 'ugf-build-'));
  const b = mkdtempSync(join(tmpdir(), 'ugf-build-'));
  t.after(() => [a, b].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  assert.equal(build(a).version, build(b).version);
});

test('encodeur PNG : un dessin de 2 × 2 agrandi et centré sur un fond uni', () => {
  const png = spriteToPng(['k.', '.k'], { k: '#000000' }, { size: 8, background: '#ffffff', fill: 1 });
  assert.equal(png.subarray(0, 8).toString('hex'), PNG_SIGNATURE);
  assert.deepEqual(pngSize(png), { width: 8, height: 8 });
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.subarray(-8, -4).toString('ascii'), 'IEND');
  assert.ok(encodePng(1, 1, Buffer.from([255, 0, 0, 255])).length > 50);
});
