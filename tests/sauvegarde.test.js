// La sauvegarde d'un joueur survit aux mises à jour : chaque version du format garde ici une vraie
// sauvegarde, écrite par le vrai jeu, et doit remonter jusqu'à la version d'aujourd'hui sans rien perdre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { upgrade, VERSION, isFound, isReadOnly, storeSave, loadSave, discover, eraseProgress } from '../src/client/save.js';
import { loadContent } from '../tools/content.mjs';
import { allCards, cardKey, rarityCounts } from '../src/client/collection.js';

const DIR = new URL('./fixtures/sauvegardes/', import.meta.url);
const old = Object.fromEntries(readdirSync(DIR).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, DIR), 'utf8'))]));

test('chaque version du format a sa vraie sauvegarde', () => {
  for (let v = 1; v <= VERSION; v++) assert.ok(old[`v${v}`], `tests/fixtures/sauvegardes/v${v}.json`);
});

test('une sauvegarde ancienne remonte à la version d’aujourd’hui sans rien perdre', () => {
  const keys = new Set(allCards(loadContent().bundle).map(cardKey));
  for (const [name, stored] of Object.entries(old)) {
    const save = upgrade(structuredClone(stored));
    assert.equal(save.version, VERSION, name);
    for (const id of Object.keys(stored.termines)) assert.ok(save.termines[id], `${name} : niveau terminé « ${id} »`);
    for (const [id, crowd] of Object.entries(stored.records)) assert.ok(save.records[id] >= crowd, `${name} : record de « ${id} »`);
    assert.ok(save.decouvertes.length >= stored.decouvertes.length, `${name} : découvertes`);
    const lost = save.decouvertes.filter((k) => !keys.has(k));
    assert.deepEqual(lost, [], `${name} : ces déblocages ne mènent plus à aucune carte. Texte corrigé ? Ajoute « | était: l’ancien texte » au bout de la ligne`);
    // `musiqueChoisie` (version 2) : qui avait mis la musique l'a choisie ; les autres auront la question une fois.
    assert.deepEqual(save.options, { son: true, musique: false, sobre: false, musiqueChoisie: stored.options?.musique === true, ...stored.options }, name);
  }
});

test('raretés écrites à la main : une vraie sauvegarde v1 ou v2 garde toutes ses pancartes et ses bandeaux', () => {
  const { bundle } = loadContent();
  for (const [name, stored] of Object.entries(old)) {
    const save = upgrade(structuredClone(stored));
    for (const [kind, shelf] of [['pancartes', 'pancartes'], ['manchettes', 'tele']]) {
      const mine = stored.decouvertes.filter((k) => k.startsWith(`${kind}:`));
      assert.ok(mine.length > 0, `${name} : la sauvegarde d’essai a des ${kind}`);
      for (const k of mine) {
        const item = bundle[kind].find((p) => `${kind}:${p.id}` === k);
        assert.ok(item, `${name} : « ${k} » ne mène plus à aucune ligne`);
        assert.ok(isFound(save, kind, item.id), `${name} : « ${k} » n’est plus débloquée`);
      }
      // Les compteurs par rareté de la Collection retrouvent chacune, sous sa nouvelle rareté.
      const counts = rarityCounts(bundle, save, shelf);
      assert.equal(counts.reduce((n, r) => n + r.found, 0), mine.length, `${name} : ${kind} comptées par rareté`);
    }
  }
});

test('ce que le jeu ne connaît pas reste dans la sauvegarde', () => {
  const stored = { ...structuredClone(old.v1), plusTard: { a: 1 }, decouvertes: [...old.v1.decouvertes, 'heros:parti-du-jeu'] };
  const save = upgrade(stored);
  assert.deepEqual(save.plusTard, { a: 1 }, 'un champ inconnu');
  assert.ok(isFound(save, 'heros', 'parti-du-jeu'), 'une fiche retirée : si elle revient, elle est encore débloquée');
  assert.equal(upgrade({ ...old.v1, version: VERSION + 3 }).version, VERSION + 3, 'une sauvegarde plus récente que le jeu garde son numéro');
});

/** Un stockage de navigateur pour les tests ; `write` peut le remplir depuis « un autre onglet ». */
function storage(initial = null) {
  const data = new Map(initial === null ? [] : [['ugf:sauvegarde', typeof initial === 'string' ? initial : JSON.stringify(initial)]]);
  globalThis.localStorage = { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)) };
  return { read: () => JSON.parse(data.get('ugf:sauvegarde') ?? 'null'), raw: (k) => data.get(k), write: (v) => data.set('ugf:sauvegarde', JSON.stringify(v)) };
}

test('une sauvegarde plus récente que le jeu se lit, mais ne se réécrit pas', () => {
  const newer = { ...structuredClone(old.v1), version: VERSION + 1, debloques: { zucman: true } };
  const disk = storage(newer);
  const save = loadSave();
  assert.ok(isReadOnly(save));
  assert.equal(discover(save, 'ennemis', 'jamais-vu'), true, 'la partie continue en mémoire');
  assert.equal(storeSave(save), false);
  assert.deepEqual(disk.read(), newer, 'le stockage est intact');
});

test('un onglet resté sur l’ancien jeu n’écrase pas ce qu’un onglet plus récent vient d’écrire', () => {
  const disk = storage(old.v1);
  const save = loadSave(); // l'ancien onglet a lu la version 1
  const newer = { ...structuredClone(old.v1), version: VERSION + 1, debloques: { zucman: true } };
  disk.write(newer); // entre-temps, le jeu mis à jour a écrit sa version
  discover(save, 'heros', 'tout-neuf');
  assert.deepEqual(disk.read(), newer);
  assert.ok(isReadOnly(save), 'il passe en lecture seule');
});

test('deux onglets : ce que l’autre a débloqué n’est pas perdu', () => {
  const disk = storage(old.v1);
  const here = loadSave();
  const there = loadSave();
  discover(there, 'heros', 'debloque-ailleurs');
  there.records.bismillah = 9999;
  there.termines.ailleurs = true;
  storeSave(there);
  discover(here, 'ennemis', 'debloque-ici');
  const stored = disk.read();
  for (const key of ['heros:debloque-ailleurs', 'ennemis:debloque-ici', ...old.v1.decouvertes]) assert.ok(stored.decouvertes.includes(key), key);
  assert.equal(stored.records.bismillah, 9999, 'le meilleur record');
  assert.equal(stored.termines.ailleurs, true);
  assert.equal(new Set(stored.decouvertes).size, stored.decouvertes.length, 'sans doublon');
});

test('effacer sa progression efface vraiment, options gardées', () => {
  const disk = storage({ ...structuredClone(old.v1), options: { son: false } });
  const save = loadSave();
  assert.equal(eraseProgress(save), true);
  assert.deepEqual(disk.read().decouvertes, []);
  assert.deepEqual(disk.read().records, {});
  assert.equal(disk.read().options.son, false);
});

test('un champ abîmé ne bloque pas le jeu, et sa valeur d’origine est gardée de côté', () => {
  for (const version of [0, -1, 1.5, '2', null]) assert.equal(upgrade({ ...old.v1, version }).version, VERSION, `version ${version}`);
  const save = upgrade({ ...structuredClone(old.v1), decouvertes: { a: 1 }, termines: null, records: 'x', options: [] });
  assert.deepEqual(save.decouvertes, []);
  assert.deepEqual(save.termines, {});
  assert.deepEqual(save.records, {});
  assert.equal(save.options.son, true);
  assert.deepEqual(save.ecartes, { decouvertes: { a: 1 }, termines: null, records: 'x', options: [] });
  assert.equal(isFound(save, 'heros', 'zucman'), false, 'on peut jouer');
});

test('un numéro de version abîmé dans le stockage ne bloque pas l’enregistrement', () => {
  for (const version of [1.5, '3', 0, null]) {
    const disk = storage({ ...structuredClone(old.v1), version });
    const save = loadSave();
    assert.equal(isReadOnly(save), false, `version ${version}`);
    assert.equal(discover(save, 'heros', 'apres-coup'), true);
    assert.equal(disk.read().version, VERSION, `version ${version} : réécrite proprement`);
    assert.ok(disk.read().decouvertes.includes('heros:apres-coup'));
    assert.equal(isReadOnly(save), false);
  }
});

test('une sauvegarde illisible est mise de côté, pas écrasée', () => {
  const disk = storage('{"decouvertes": ["heros:zucman"');
  const save = loadSave();
  assert.deepEqual(save.decouvertes, []);
  assert.equal(disk.raw('ugf:sauvegarde:illisible'), '{"decouvertes": ["heros:zucman"');
  assert.equal(storeSave(save), true, 'on repart de zéro');
});

test('pas de sauvegarde, ou une sauvegarde illisible : on repart de zéro, sans planter', () => {
  for (const nothing of [null, undefined, 'x', 3]) {
    const save = upgrade(nothing);
    assert.equal(save.version, VERSION);
    assert.deepEqual(save.decouvertes, []);
    assert.equal(save.options.son, true);
  }
});
