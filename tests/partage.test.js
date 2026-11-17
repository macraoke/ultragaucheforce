// L'image à partager en fin de niveau : l'enregistrer, et copier le lien du jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyText, saveImage, saveMode } from '../src/client/share.js';

test('« Enregistrer l’image » télécharge un fichier sur ordinateur, passe par la feuille de partage au doigt', () => {
  // Valentin, 17 novembre 2026 : « le bouton enregistrer l'image semble ne pas fonctionner pour moi »
  assert.equal(saveMode({ coarse: false, files: false }), 'telechargement', 'Firefox sur ordinateur : pas de partage, un téléchargement');
  assert.equal(saveMode({ coarse: false, files: true }), 'telechargement', 'Chrome sur Mac sait partager : on télécharge quand même');
  assert.equal(saveMode({ coarse: true, files: true }), 'partage', 'téléphone : « Enregistrer l’image » est dans la feuille de partage');
  assert.equal(saveMode({ coarse: true, files: false }), 'telechargement', 'téléphone sans partage d’image : un téléchargement');
});

test('au doigt, une feuille de partage refusée laisse place au téléchargement ; annulée, rien de plus', async () => {
  const file = { name: 'ultragauche-force.png' };
  const run = async (share, where = { coarse: true, files: true }) => {
    const saved = [];
    const result = await saveImage(file, { ...where, share, save: (f) => saved.push(f) });
    return { result, saved: saved.length };
  };
  const fail = (name) => async () => { throw Object.assign(new Error(name), { name }); };
  assert.deepEqual(await run(async () => {}), { result: 'partage', saved: 0 });
  assert.deepEqual(await run(fail('AbortError')), { result: 'annule', saved: 0 }, 'annulée par le joueur');
  assert.deepEqual(await run(fail('NotAllowedError')), { result: 'telechargement', saved: 1 }, 'refusée par le navigateur');
  assert.deepEqual(await run(fail('TypeError')), { result: 'telechargement', saved: 1 });
  let asked = false;
  assert.deepEqual(await run(async () => { asked = true; }, { coarse: false, files: true }), { result: 'telechargement', saved: 1 });
  assert.equal(asked, false, 'sur ordinateur, pas de feuille de partage');
});

/** Un document minimal : un champ, une sélection, `execCommand`. */
function fakeDocument(copies) {
  const appended = [];
  const doc = {
    appended,
    activeElement: { focus() { doc.refocused = true; } },
    body: { append: (el) => appended.push(el) },
    createElement: () => {
      const el = { value: '', style: {}, setAttribute() {}, select() { el.selected = true; }, remove() { el.removed = true; } };
      return el;
    },
    execCommand(command) {
      const field = appended.at(-1);
      if (command !== 'copy' || !field?.selected || !copies) return false;
      this.copied = field.value;
      return true;
    },
  };
  return doc;
}

test('« Copier le lien » : par le presse-papiers, sinon par un champ sélectionné', async () => {
  // Valentin, 17 novembre 2026 : « ajouter un autre bouton "copier le lien" aussi stp »
  const url = 'https://exemple.org/ultragauche-force/';
  let written = '';
  const doc = fakeDocument(true);
  assert.equal(await copyText(url, { clipboard: { writeText: async (t) => { written = t; } }, doc }), true);
  assert.equal(written, url);
  assert.equal(doc.appended.length, 0, 'le presse-papiers suffit : pas de champ');

  const refused = { writeText: async () => { throw new Error('refusé'); } };
  const old = fakeDocument(true);
  assert.equal(await copyText(url, { clipboard: refused, doc: old }), true, 'refusé : à l’ancienne');
  assert.equal(old.copied, url);
  assert.ok(old.appended[0].removed, 'le champ est retiré');
  assert.ok(old.refocused, 'le focus revient au bouton');

  assert.equal(await copyText(url, { clipboard: undefined, doc: fakeDocument(true) }), true, 'sans API du presse-papiers');
  assert.equal(await copyText(url, { clipboard: undefined, doc: fakeDocument(false) }), false, 'rien ne marche : on le dit');
});
