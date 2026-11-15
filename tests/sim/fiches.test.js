// Les clés de fiche de l'itération 2 : recrues, manif et nasse d'un niveau, unités de maintien de l'ordre,
// boss assis, fiche de collection. Chaque erreur d'écriture a son message.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readContentFiles } from '../../tools/content.mjs';
import { buildContent, checkLevel, formatError, MARKERS } from '../../src/content/rules.js';
import { FIXTURES, fixtureBundle } from './helpers.js';

const files = readContentFiles(FIXTURES);
const textOf = (path) => files.find((f) => f.path === path).text;

/** Les erreurs d'un fichier d'essai une fois modifié (ou ajouté). */
function errorsOf(path, text) {
  const { errors } = buildContent([...files.filter((f) => f.path !== path), { path, text }]);
  return errors.filter((e) => e.file === path).map(formatError);
}
const edit = (path, change) => errorsOf(path, change(textOf(path)));
const expect = (errors, pattern) => assert.ok(errors.some((e) => pattern.test(e)), `attendu ${pattern}, reçu :\n${errors.join('\n') || '(aucune erreur)'}`);

test('recrue : un nom, « apport » ou « multiplie » (pas les deux), des slogans, un dessin', () => {
  const { recrues } = fixtureBundle();
  assert.deepEqual(
    { apport: recrues.voisine.apport, multiplie: recrues.voisine.multiplie, slogan: recrues.voisine.slogan },
    { apport: 20, multiplie: 0, slogan: ['SLOGAN UN', 'SLOGAN DEUX'] },
  );
  assert.deepEqual([recrues.voisine.largeur, recrues.voisine.hauteur], [10, 16], 'sa boîte a la taille de son dessin');
  assert.deepEqual(Object.keys(recrues.voisine.sprites), ['image', 'image2']);
  assert.equal(recrues.assemblee.multiplie, 2);

  const path = 'content/recrues/voisine.txt';
  expect(edit(path, (t) => t.replace('apport: 20', 'apport: 20\nmultiplie: 2')), /« apport: … ».*OU.*« multiplie: … »/);
  expect(edit(path, (t) => t.replace('apport: 20\n', '')), /« apport: … ».*OU.*« multiplie: … »/);
  expect(edit(path, (t) => t.replace('apport: 20', 'apport: 900')), /« apport » doit être entre 1 et 500/);
  expect(edit('content/recrues/assemblee.txt', (t) => t.replace('multiplie: 2', 'multiplie: 9')), /« multiplie » doit être entre 1\.5 et 5/);
  expect(edit(path, (t) => t.replace(/--- image\n[\s\S]*/, '')), /Il manque le dessin « --- image »/);
  expect(edit(path, (t) => t.replace('fiche: garde-a-vue', 'fiche: inconnue')), /« inconnue » n'existe pas dans content\/fiches\//);
});

test('niveau : une recrue se place comme un ennemi, « manif » fixe la foule de départ', () => {
  const { niveaux } = fixtureBundle();
  assert.deepEqual(niveaux.manif.legende.v, { type: 'recrue', id: 'voisine' });
  assert.deepEqual(niveaux.manif.legende.l, { type: 'ennemi', id: 'ligne' });
  assert.equal(niveaux.manif.manif, 10);
  assert.equal(niveaux.plaine.manif, 10, 'dix par défaut avec un cortège');
  assert.equal(niveaux.arene.manif, 0, 'zéro sans cortège');

  const path = 'content/niveaux/manif.txt';
  assert.deepEqual(edit(path, (t) => t.replace('manif: 10', 'manif: 250')), []);
  expect(edit(path, (t) => t.replace('manif: 10', 'manif: 9000')), /« manif » doit être entre 0 et 5000/);
  expect(edit(path, (t) => t.replace('v: voisine', 'v: licorne')), /aucun ennemi ni décor ne s'appelle « licorne » \(aucune recrue non plus\)/);
});

test('niveau : le repère « N » demande une nasse décrite dans l’en-tête', () => {
  assert.ok(MARKERS.N, '« N » est un repère réservé, comme D, S, K, Q et Y');
  assert.deepEqual(fixtureBundle().niveaux.manif.nasse, { ennemi: 'garde', nombre: 2, vitesse: 20, rythme: 0 });
  const path = 'content/niveaux/manif.txt';
  expect(edit(path, (t) => t.replace('nasse.ennemi: garde\n', '')), /La carte contient une nasse « N » : ajoute « nasse\.ennemi: … »/);
  expect(edit(path, (t) => t.replace('nasse.ennemi: garde', 'nasse.ennemi: licorne')), /« nasse\.ennemi: licorne » : cet ennemi n'existe pas/);
  expect(edit(path, (t) => t.replace('nasse.nombre: 2', 'nasse.nombre: 12')), /« nasse\.nombre » doit être entre 1 et 6/);
  expect(edit('content/tuiles/terre.txt', (t) => t.replace('symbole: T', 'symbole: N')), /lettre majuscule libre/);

  // L'Atelier valide le même niveau avec les mêmes règles.
  const { errors } = checkLevel(textOf(path).replace('nasse.ennemi: garde\n', ''), fixtureBundle());
  expect(errors.map((e) => e.message), /nasse « N »/);
  assert.deepEqual(checkLevel(textOf(path), fixtureBundle()).errors, []);
});

test('ennemi : débordement, sommations, charge, tir visé, jet, faisceau et renforts se règlent dans la fiche', () => {
  const { ennemis } = fixtureBundle();
  assert.equal(ennemis.ligne.debordement, 30);
  assert.equal(ennemis.garde.debordement, 0, 'désactivé par défaut');
  assert.deepEqual(ennemis.chargeur.charge, { distance: 120, vitesse: 200, pause: 2, disperse: 10 });
  assert.deepEqual([ennemis.tireur.arme.vise, ennemis.tireur.arme.visee], [1, 0.8]);
  assert.deepEqual(ennemis.canon.arme, { type: 'jet', duree: 2, pause: 1, portee: 160, poussee: 220, son: '' });
  assert.deepEqual(ennemis.helico.renfort, { nombre: 2, max: 1, ennemi: 'fonceur' });
  assert.deepEqual(ennemis.garde.charge, { distance: 160, vitesse: 220, pause: 2.5, disperse: 5 }, 'valeurs par défaut pour qui ne les règle pas');

  expect(edit('content/ennemis/ligne.txt', (t) => t.replace('debordement: 30', 'debordement: 6000')), /« debordement » doit être entre 0 et 5000/);
  expect(edit('content/ennemis/chargeur.txt', (t) => t.replace('charge.distance: 120', 'charge.elan: 3')), /Réglage inconnu « charge\.elan »/);
  expect(edit('content/ennemis/tireur.txt', (t) => t.replace('arme.visee: 0.8', 'arme.visee: 5')), /« arme\.visee » doit être entre 0 et 2/);
  expect(edit('content/ennemis/canon.txt', (t) => t.replace('arme.duree: 2', 'arme.degats: 2')), /Réglage inconnu « arme\.degats »/);
  expect(edit('content/ennemis/helico.txt', (t) => t.replace('renfort.ennemi: fonceur', 'renfort.ennemi: licorne')), /« licorne » n'existe pas dans content\/ennemis\//);
  expect(edit('content/ennemis/moto.txt', (t) => t.replace('deplacement: moto', 'deplacement: trottinette')), /Choix possibles : marche, vol, fixe, moto, vehicule/);
  expect(edit('content/ennemis/moto.txt', (t) => t.replace('reaction: rien', 'reaction: klaxonne')), /Choix possibles : tire, fonce, cadre, rien, charge, projecteur/);
  expect(edit('content/ennemis/ligne.txt', (t) => t.replace('fiche: garde-a-vue', 'citation: inventee')), /« inventee » n'existe pas dans content\/citations\//);
});

test('héros et boss : fiche de collection, boss assis, et pas de canon à eau pour un héros', () => {
  const path = 'content/heros/alpha.txt';
  assert.deepEqual(edit(path, (t) => t.replace('cri: ALPHA !', 'cri: ALPHA !\norigine: Né dans un test.\nfiche: garde-a-vue')), []);
  expect(edit(path, (t) => t.replace('cri: ALPHA !', 'fiche: inconnue')), /« inconnue » n'existe pas dans content\/fiches\//);
  expect(edit(path, (t) => t.replace('arme.type: tir', 'arme.type: jet')), /« arme\.type: jet » n'existe pas\. Choix possibles : tir\./);

  const { boss } = fixtureBundle();
  assert.deepEqual([boss.assis.assis, boss.assis.leve], [true, 0.7]);
  assert.deepEqual([boss.gros.assis, boss.gros.leve], [false, 0.7], 'debout par défaut');
  expect(edit('content/boss/assis.txt', (t) => t.replace('leve: 0.7', 'leve: 3')), /« leve » doit être entre 0 et 1/);
  expect(edit('content/boss/assis.txt', (t) => t.replace('assis: oui', 'assis: peut-être')), /« assis » se répond par oui ou par non/);
});
