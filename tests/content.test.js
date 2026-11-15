// Les règles du contenu : le vrai `content/` est valide, et chaque erreur classique d'un
// contributeur produit un message en français, avec le fichier et la ligne.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { readContentFiles, loadContent } from '../tools/content.mjs';
import { buildContent, checkLevel, formatError } from '../src/content/rules.js';
import { Fiche, parseLines } from '../src/content/parse.js';

const real = readContentFiles();
const textOf = (path) => real.find((f) => f.path === path).text;

/** Le vrai contenu, plus (ou avec, à la place) un fichier donné. */
const withFile = (path, text) => [...real.filter((f) => f.path !== path), { path, text }];

/** Les erreurs que produit un fichier ajouté au vrai contenu. */
const errorsOf = (path, text) => buildContent(withFile(path, text)).errors.filter((e) => e.file === path);

/** Numéro (à partir de 1) de la première ligne qui contient `needle`. */
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1;

const expectError = (errors, { line, col, message }) => {
  const found = errors.find((e) => message.test(e.message));
  assert.ok(found, `message attendu ${message}, reçu :\n${errors.map(formatError).join('\n') || '(aucune erreur)'}`);
  if (line !== undefined) assert.equal(found.line, line, `ligne de « ${found.message} »`);
  if (col !== undefined) assert.equal(found.col, col, `colonne de « ${found.message} »`);
  return found;
};

const level = (map, header = '') => `titre: Niveau d'essai\n${header}--- carte\n${map.join('\n')}\n`;
const GROUND = 'TTTTTTTTTTTT';
const SKY = '............';

test('le vrai contenu du dépôt est valide', () => {
  const { bundle, errors } = loadContent();
  assert.deepEqual(errors.map(formatError), []);
  assert.ok(bundle.campagne.length >= 1, 'au moins un niveau dans la campagne');
  for (const id of bundle.campagne) assert.ok(bundle.niveaux[id], `niveau de campagne « ${id} »`);
});

test('tout ce qui est réel est sourcé : citations et fiches ont une adresse et une date de vérification', () => {
  const { bundle } = loadContent();
  for (const item of [...Object.values(bundle.citations), ...Object.values(bundle.fiches)]) {
    assert.match(item.source.url, /^https:\/\//, `${item.id} : source.url`);
    assert.ok(item.source.titre, `${item.id} : source.titre`);
    assert.match(item.verifie, /^\d{4}-\d{2}-\d{2}$/, `${item.id} : verifie`);
  }
});

test('clé inconnue : le message nomme la clé et la ligne', () => {
  const text = `vitese: 3\n${textOf('content/heros/tyrannogauchiste.txt')}`;
  expectError(errorsOf('content/heros/casse.txt', text), { line: 1, message: /Clé inconnue « vitese »/ });
});

test('nombre hors bornes : le message donne les bornes', () => {
  const text = textOf('content/heros/tyrannogauchiste.txt').replace(/^pv: .*$/m, 'pv: 99');
  expectError(errorsOf('content/heros/casse.txt', text), {
    line: lineOf(text, 'pv: 99'), message: /« pv » doit être entre 1 et 5 \(reçu : 99\)/,
  });
});

test('réglage d’arme inconnu ou hors bornes', () => {
  const text = textOf('content/heros/tyrannogauchiste.txt').replace(/^arme\.cadence: .*$/m, 'arme.cadence: 500\narme.laser: 1');
  const errors = errorsOf('content/heros/casse.txt', text);
  expectError(errors, { line: lineOf(text, 'arme.cadence: 500'), message: /« arme\.cadence » doit être entre/ });
  expectError(errors, { line: lineOf(text, 'arme.laser'), message: /Réglage inconnu « arme\.laser »/ });
});

test('couleur inconnue dans un dessin : ligne et colonne du pixel fautif', () => {
  const text = 'nom: Décor d’essai\n--- image\nkkkk\nkk?k\nkkkk\n';
  expectError(errorsOf('content/decors/essai.txt', text), { line: 4, col: 3, message: /Couleur inconnue « \? »/ });
});

test('symbole de tuile déjà pris', () => {
  const text = textOf('content/tuiles/terre.txt').replace(/^nom: .*$/m, 'nom: Copie');
  expectError(errorsOf('content/tuiles/zzz-copie.txt', text), {
    line: lineOf(text, 'symbole:'), message: /Le symbole « T » est déjà pris par la tuile « terre »/,
  });
});

test('niveau sans sortie', () => {
  const text = level([SKY, SKY, SKY, SKY, SKY, SKY, '..D.........', GROUND]);
  expectError(errorsOf('content/niveaux/essai.txt', text), { line: 3, message: /Il faut au moins une sortie « S »/ });
});

test('sortie inatteignable derrière un mur indestructible', () => {
  const wall = (row) => `${row.slice(0, 6)}A${row.slice(7)}`;
  const text = level([SKY, SKY, SKY, SKY, SKY, SKY, '..D......S..', GROUND].map(wall));
  expectError(errorsOf('content/niveaux/essai.txt', text), { line: 3, message: /La sortie « S » est inatteignable/ });
});

test('lettre d’ennemi non déclarée : ligne et colonne dans la carte', () => {
  const text = level([SKY, SKY, SKY, SKY, SKY, SKY, '..D...z..S..', GROUND]);
  expectError(errorsOf('content/niveaux/essai.txt', text), { line: 9, col: 7, message: /Lettre « z » inconnue/ });
});

test('légende qui désigne un ennemi inexistant', () => {
  const text = level([SKY, SKY, SKY, SKY, SKY, SKY, '..D...z..S..', GROUND], 'z: licorne\n');
  expectError(errorsOf('content/niveaux/essai.txt', text), { line: 2, message: /aucun ennemi ni décor ne s'appelle « licorne »/ });
});

test('citation sans adresse de source', () => {
  const text = textOf('content/citations/macron-traverse-la-rue.txt').replace(/^source\.url: .*\n/m, '');
  expectError(errorsOf('content/citations/essai.txt', text), { line: 1, message: /Il manque « source\.url: … »/ });
});

test('date mal écrite', () => {
  const text = textOf('content/citations/macron-traverse-la-rue.txt').replace(/^date: .*$/m, 'date: 15/09/2018');
  expectError(errorsOf('content/citations/essai.txt', text), {
    line: lineOf(text, 'date: 15/09/2018'), message: /« date » doit être une date AAAA, AAAA-MM ou AAAA-MM-JJ/,
  });
});

test('nom de fichier : minuscules, chiffres et tirets seulement', () => {
  expectError(errorsOf('content/heros/Mon Héros.txt', textOf('content/heros/zuc-man.txt')), { message: /Nom de fichier/ });
});

test('référence croisée : une fiche ne peut citer que ce qui existe', () => {
  const text = textOf('content/heros/zuc-man.txt').replace(/^citation: .*$/m, 'citation: citation-inventee');
  expectError(errorsOf('content/heros/essai.txt', text), { message: /« citation-inventee » n'existe pas dans content\/citations\// });
});

test('l’Atelier donne les mêmes erreurs que la CI', () => {
  const text = level([SKY, SKY, SKY, SKY, SKY, SKY, '..D...z.....', GROUND], 'fond: lune\n');
  const ci = errorsOf('content/niveaux/essai.txt', text).map(({ line, col, message }) => ({ line, col, message }));
  const atelier = checkLevel(text, loadContent().bundle).errors;
  assert.ok(ci.length >= 3, 'fond inconnu, lettre inconnue, sortie manquante');
  assert.deepEqual(atelier, ci);
});

test('les exemples des guides sont valides : on peut les copier tels quels', () => {
  // Dans docs/*.md, un exemple complet est précédé de « <!-- fichier: content/… --> ».
  const examples = [];
  for (const name of readdirSync(new URL('../docs/', import.meta.url))) {
    if (!name.endsWith('.md')) continue;
    const guide = readFileSync(new URL(`../docs/${name}`, import.meta.url), 'utf8');
    for (const [, path, text] of guide.matchAll(/<!-- fichier: (\S+) -->\n```text\n([\s\S]*?)```/g)) examples.push({ path, text, guide: name });
  }
  assert.ok(examples.length >= 8, `au moins huit exemples complets dans les guides (trouvés : ${examples.length})`);
  const files = examples.reduce((list, e) => [...list.filter((f) => f.path !== e.path), { path: e.path, text: e.text }], real);
  const { bundle, errors } = buildContent(files);
  const mine = errors.filter((e) => examples.some((x) => x.path === e.file));
  assert.deepEqual(mine.map(formatError), []);
  assert.ok(bundle.heros.casseroliere && bundle.niveaux['la-place-du-marche'], 'les exemples sont bien chargés');
});

test('formatError : fichier, ligne et colonne en tête du message', () => {
  assert.equal(formatError({ file: 'content/x.txt', line: 4, col: 3, message: 'Oups.' }), 'content/x.txt:4:3 — Oups.');
  assert.equal(formatError({ line: 4, message: 'Oups.' }), 'ligne 4 — Oups.');
});

test('fiche texte : commentaires, clés répétées, sections, fins de ligne Windows', () => {
  const f = new Fiche('﻿# commentaire\r\nnom: Essai\r\nreplique: UN\r\nreplique: DEUX\r\nsource.url: https://exemple.fr/a:b\r\n--- image\r\nkk\r\n.k\r\n\r\n');
  assert.equal(f.get('nom'), 'Essai');
  assert.deepEqual(f.all('replique'), ['UN', 'DEUX']);
  assert.equal(f.get('source.url'), 'https://exemple.fr/a:b', 'seul le premier « : » sépare la clé de la valeur');
  assert.deepEqual(f.sections.image.rows, ['kk', '.k'], 'les lignes vides de fin sont retirées');
  assert.equal(f.sections.image.line, 7);
  assert.deepEqual(f.errors, []);
  assert.match(new Fiche('ligne sans deux-points').errors[0].message, /clé: valeur/);
});

test('fichiers « une ligne = une contribution » : commentaires et lignes vides ignorés', () => {
  assert.deepEqual(parseLines('# titre\n\nUN\n  DEUX  \n').map((l) => l.text), ['UN', 'DEUX']);
});

// ---------------------------------------------------------------- itération 2 : cartes, légende, textes réels

test('légende : un signe peut remplacer une lettre, vers un ennemi, une recrue ou un décor', () => {
  const header = '+: ballon\n!: ag\nc: crs\n';
  const sky = Array(6).fill(SKY);
  const { bundle, errors } = buildContent(withFile('content/niveaux/essai.txt', level([...sky, 'D.+.!.c....S', GROUND], header)));
  assert.deepEqual(errors.map(formatError), []);
  assert.deepEqual(bundle.niveaux.essai.legende, {
    '+': { type: 'decor', id: 'ballon' }, '!': { type: 'recrue', id: 'ag' }, c: { type: 'ennemi', id: 'crs' },
  });
  expectError(errorsOf('content/niveaux/essai.txt', level([...sky, 'D.+........S', GROUND])), { line: 9, col: 3, message: /Lettre « \+ » inconnue/ });
});

test('carte de collection : « fiche » se répète, et chaque référence doit exister', () => {
  const { bundle } = loadContent();
  assert.deepEqual(bundle.ennemis.crs.fiche, ['sommations-mots-exacts', 'code-562']);
  const text = textOf('content/ennemis/crs.txt').replace('fiche: code-562', 'fiche: fiche-fantome');
  expectError(errorsOf('content/ennemis/crs.txt', text), { message: /« fiche-fantome » n'existe pas dans content\/fiches\// });
  const opening = level([SKY, 'D..........S', GROUND], 'citation: citation-fantome\n');
  expectError(errorsOf('content/niveaux/essai.txt', opening), { message: /« citation-fantome » n'existe pas dans content\/citations\// });
});

test('pancartes et bandeaux : le crédit suit le texte, après « | »', () => {
  const files = withFile('content/manchettes/essai.txt', '# commentaire\nUn bandeau | Chaîne, 1er janv. 2023 — https://exemple.org/page\nUn autre\n');
  const { bundle, errors } = buildContent(files);
  assert.deepEqual(errors.map(formatError), []);
  assert.deepEqual(bundle.manchettes.slice(-2), [
    { texte: 'Un bandeau', credit: 'Chaîne, 1er janv. 2023 — https://exemple.org/page' },
    { texte: 'Un autre', credit: '' },
  ]);
  assert.ok(bundle.pancartes.every((p) => typeof p.texte === 'string' && typeof p.credit === 'string'));
});

test('décor écrit : « ecrit » vaut pancarte ou tag', () => {
  const { bundle } = loadContent();
  assert.equal(bundle.decors.banderole.ecrit, 'pancarte');
  assert.equal(bundle.decors.tag.ecrit, 'tag');
  assert.equal(bundle.decors.statue.ecrit, '');
  const text = textOf('content/decors/banderole.txt').replace('ecrit: pancarte', 'ecrit: neon');
  expectError(errorsOf('content/decors/banderole.txt', text), { line: lineOf(text, 'ecrit: neon'), message: /« ecrit: neon » n'existe pas/ });
});
