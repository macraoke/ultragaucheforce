// Les blessés annoncés en fin de niveau, répartis comme les CRS blessés en octobre 2026 : des entiers, jamais plus que le total.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { CRS_OCTOBRE_2026, injuries, injuryParts } from '../src/client/blesses.js';

const { bundle } = loadContent();
const plain = (text) => text.replace(/\s/g, ' ');
const KEYS = ['legers', 'arrets', 'jambes', 'bras', 'acouphenes', 'origine', 'tiers'];

test('blessés : chaque nombre de la répartition est dans le texte de sa fiche', () => {
  const fact = bundle.fiches[CRS_OCTOBRE_2026.fiche];
  assert.ok(fact, 'la fiche existe');
  assert.match(fact.source.url, /^https:\/\/www\.mediapart\.fr\//);
  for (const key of ['blesses', ...KEYS.filter((k) => k !== 'origine')]) {
    const n = CRS_OCTOBRE_2026[key].toLocaleString('fr-FR');
    assert.ok(plain(fact.texte).includes(plain(n)), `${key} : ${n} dans « ${fact.texte} »`);
  }
  assert.equal(CRS_OCTOBRE_2026.origine, 20);
  assert.match(fact.texte, /Une vingtaine d'agents seulement indiquent l'origine/, '« une vingtaine » : l’écran dit « environ »');
  assert.ok(bundle.ennemis.crs.fiche.includes(fact.id), 'la carte des CRS la donne aussi');
});

test('blessés : des entiers, arrondis au plus proche, qui ne dépassent jamais le total', () => {
  for (let n = 1; n <= 20000; n++) {
    const parts = injuries(n);
    for (const key of KEYS) {
      const exact = (n * CRS_OCTOBRE_2026[key]) / CRS_OCTOBRE_2026.blesses;
      assert.ok(Number.isInteger(parts[key]), `${n} blessés, ${key} : ${parts[key]} n’est pas un entier`);
      assert.ok(Math.abs(parts[key] - exact) <= 0.5, `${n} blessés, ${key} : ${parts[key]} trop loin de ${exact}`);
      assert.ok(parts[key] <= n, `${n} blessés, ${key} : ${parts[key]} dépasse le total`);
    }
    assert.ok(parts.jambes + parts.bras <= n, `${n} blessés : ${parts.jambes} + ${parts.bras} blessures aux membres dépassent le total`);
    assert.ok(parts.tiers <= parts.origine, 'le tiers se compte parmi les origines connues');
  }
  assert.equal(injuries(0), null);
  assert.deepEqual(injuryParts(0), []);
});

test('blessés : la ligne de l’écran de fin, sans décimale, pour peu de blessés', () => {
  const said = (n) => injuryParts(n).map(plain);
  assert.deepEqual(said(1), ['1 blessé léger', '1 blessure aux jambes ou aux pieds'], 'les parts à zéro ne s’écrivent pas');
  assert.deepEqual(said(3), ['3 blessés légers', '2 blessures aux jambes ou aux pieds et 1 aux bras ou aux mains']);
  assert.deepEqual(said(7), [
    '7 blessés légers', '1 arrêt de travail', '4 blessures aux jambes ou aux pieds et 3 aux bras ou aux mains', '1 avec un acouphène',
  ]);
  assert.deepEqual(said(12), [
    '11 blessés légers', '1 arrêt de travail', '7 blessures aux jambes ou aux pieds et 4 aux bras ou aux mains', '1 avec un acouphène',
  ]);
  assert.deepEqual(said(40), [
    '38 blessés légers', '4 arrêts de travail', '24 blessures aux jambes ou aux pieds et 15 aux bras ou aux mains', '4 avec un acouphène',
  ], 'aucun blessé par un tiers une fois arrondi : la part et ses origines ne s’écrivent pas');
  for (let n = 1; n <= 2000; n++) {
    for (const part of said(n)) assert.doesNotMatch(part, /\d,\d|(^|\D)0 /, `${n} blessés : « ${part} »`);
  }
});

test('blessés : 1 233 blessés redonnent les nombres de la source', () => {
  assert.deepEqual(injuryParts(1233).map(plain), [
    '1 167 blessés légers', '126 arrêts de travail', '737 blessures aux jambes ou aux pieds et 451 aux bras ou aux mains',
    '117 avec un acouphène', '12 blessés sans ambiguïté par un tiers, sur environ 20 dont l’origine est connue',
  ]);
  // En dessous de 2 blessés par un tiers, la mention ne s'écrit pas : « 1 sur environ 1 » ferait lire 100 %.
  assert.ok(!injuryParts(60).map(plain).some((p) => p.includes('par un tiers')));
  assert.deepEqual(injuryParts(205).map(plain).at(-1), '2 blessés sans ambiguïté par un tiers, sur environ 3 dont l’origine est connue');
});
