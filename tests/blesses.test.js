// Les blessés annoncés en fin de niveau, répartis comme les CRS blessés en octobre 2026 : jamais plus que la source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { CRS_OCTOBRE_2026, floor2, injuries, injuryParts } from '../src/client/blesses.js';

const { bundle } = loadContent();
const plain = (text) => text.replace(/\s/g, ' ');
const KEYS = ['legers', 'arrets', 'jambes', 'bras', 'acouphenes', 'tiers'];

test('blessés : chaque nombre de la répartition est dans le texte de sa fiche', () => {
  const fact = bundle.fiches[CRS_OCTOBRE_2026.fiche];
  assert.ok(fact, 'la fiche existe');
  assert.match(fact.source.url, /^https:\/\/www\.mediapart\.fr\//);
  for (const key of ['blesses', ...KEYS]) {
    const n = CRS_OCTOBRE_2026[key].toLocaleString('fr-FR');
    assert.ok(plain(fact.texte).includes(plain(n)), `${key} : ${n} dans « ${fact.texte} »`);
  }
  assert.ok(bundle.ennemis.crs.fiche.includes(fact.id), 'la carte des CRS la donne aussi');
});

test('blessés : deux chiffres, arrondis vers le bas', () => {
  assert.equal(floor2(37.86), 37);
  assert.equal(floor2(2.839), 2.8);
  assert.equal(floor2(0.389), 0.38);
  assert.equal(floor2(0.3), 0.3, 'pas 0,29 : l’erreur de calcul en virgule flottante ne retire rien');
  assert.equal(floor2(4.087), 4);
  assert.equal(floor2(0.00973), 0.0097);
  assert.equal(floor2(0), 0);
});

test('blessés : aucune part ne dit plus que la source, aucune ne tombe à zéro', () => {
  for (let n = 1; n <= 300; n++) {
    const parts = injuries(n);
    for (const key of KEYS) {
      const exact = (n * CRS_OCTOBRE_2026[key]) / CRS_OCTOBRE_2026.blesses;
      assert.ok(parts[key] <= exact + 1e-9, `${n} blessés, ${key} : ${parts[key]} > ${exact}`);
      assert.ok(parts[key] > exact * 0.9 - 1e-9, `${n} blessés, ${key} : ${parts[key]} trop loin de ${exact}`);
      assert.ok(parts[key] > 0, `${n} blessés, ${key} : jamais zéro`);
    }
    assert.ok(parts.legers < n, 'les légers ne dépassent jamais le total');
  }
  assert.equal(injuries(0), null);
  assert.deepEqual(injuryParts(0), []);
});

test('blessés : la ligne de l’écran de fin, pour peu ou beaucoup de blessés', () => {
  assert.deepEqual(injuryParts(1).map(plain), [
    '0,94 léger', '0,1 arrêt de travail', '0,59 blessure aux jambes ou aux pieds et 0,36 aux bras ou aux mains',
    '0,094 acouphène', '0,0097 blessé par un tiers, sans ambiguïté',
  ]);
  assert.deepEqual(injuryParts(3).map(plain), [
    '2,8 légers', '0,3 arrêt de travail', '1,7 blessure aux jambes ou aux pieds et 1 aux bras ou aux mains',
    '0,28 acouphène', '0,029 blessé par un tiers, sans ambiguïté',
  ]);
  assert.deepEqual(injuryParts(40).map(plain), [
    '37 légers', '4 arrêts de travail', '23 blessures aux jambes ou aux pieds et 14 aux bras ou aux mains',
    '3,7 acouphènes', '0,38 blessé par un tiers, sans ambiguïté',
  ]);
});
