// La sauvegarde d'un joueur survit aux mises à jour : chaque version du format garde ici une vraie
// sauvegarde, écrite par le vrai jeu, et doit remonter jusqu'à la version d'aujourd'hui sans rien perdre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { upgrade, VERSION, isFound } from '../src/client/save.js';
import { loadContent } from '../tools/content.mjs';
import { allCards, cardKey } from '../src/client/collection.js';

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
    assert.deepEqual(save.options, { son: true, musique: false, sobre: false, ...stored.options }, name);
  }
});

test('ce que le jeu ne connaît pas reste dans la sauvegarde', () => {
  const stored = { ...structuredClone(old.v1), plusTard: { a: 1 }, decouvertes: [...old.v1.decouvertes, 'heros:parti-du-jeu'] };
  const save = upgrade(stored);
  assert.deepEqual(save.plusTard, { a: 1 }, 'un champ inconnu');
  assert.ok(isFound(save, 'heros', 'parti-du-jeu'), 'une fiche retirée : si elle revient, elle est encore débloquée');
  assert.equal(upgrade({ ...old.v1, version: VERSION + 3 }).version, VERSION + 3, 'une sauvegarde plus récente que le jeu garde son numéro');
});

test('pas de sauvegarde, ou une sauvegarde illisible : on repart de zéro, sans planter', () => {
  for (const nothing of [null, undefined, 'x', 3]) {
    const save = upgrade(nothing);
    assert.equal(save.version, VERSION);
    assert.deepEqual(save.decouvertes, []);
    assert.equal(save.options.son, true);
  }
});
