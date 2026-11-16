// Les blessés annoncés en fin de niveau, répartis comme les CRS blessés en octobre 2026 : des entiers, jamais plus que le total,
// et une ou deux blessures du fichier, mot pour mot, tirées au hasard de la partie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { CRS_OCTOBRE_2026, FROM_FILE, injuries, injuryParts, injuryReport } from '../src/client/blesses.js';
import { makeRng } from '../src/sim/rng.js';
import { Game } from '../src/sim/game.js';

const { bundle } = loadContent();
const plain = (text) => text.replace(/\s/g, ' ');
const KEYS = ['legers', 'arrets', 'jambes', 'bras', 'acouphenes', 'origine', 'tiers'];
const report = (n, seed) => injuryReport(n, makeRng(seed));
const ALL = [...FROM_FILE.alone, ...FROM_FILE.declared];

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

test('blessés : chaque blessure du fichier que l’écran peut citer est mot pour mot dans la fiche', () => {
  const fact = bundle.fiches[CRS_OCTOBRE_2026.fiche];
  const said = plain(`${fact.texte} ${fact.portee}`);
  assert.ok(FROM_FILE.alone.length && FROM_FILE.declared.length);
  for (const line of ALL) {
    assert.ok(said.includes(plain(line)), `« ${line} » n’est pas dans la fiche`);
    assert.match(line, /« [^«»]+ »/, `${line} : les mots du fichier, entre guillemets`);
  }
  assert.equal(new Set(ALL).size, ALL.length, 'aucune en double');
});

test('blessés : l’écran change d’une graine à l’autre, et ne change pas pour une même graine', () => {
  const seen = new Set();
  const cited = new Set();
  const counts = new Set();
  const shown = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const { parts, file } = report(40, seed);
    assert.deepEqual(report(40, seed), { parts, file }, `graine ${seed} : même graine, même écran`);
    assert.ok(file.length === 1 || file.length === 2, `graine ${seed} : une ou deux blessures du fichier`);
    assert.ok(FROM_FILE.alone.includes(file[0]), `graine ${seed} : la première, un agent qui s’est blessé seul`);
    assert.equal(new Set(file).size, file.length, `graine ${seed} : pas deux fois la même`);
    file.forEach((line) => cited.add(line));
    counts.add(file.length);
    parts.slice(1).forEach((part) => shown.add(part));
    seen.add(JSON.stringify({ parts, file }));
  }
  assert.deepEqual([...counts].sort(), [1, 2], 'tantôt une, tantôt deux');
  assert.deepEqual(ALL.filter((line) => !cited.has(line)), [], 'chacune finit par sortir');
  assert.equal(shown.size, injuryParts(40).length - 1, 'chaque part de la répartition finit par sortir');
  assert.ok(seen.size >= 100, `${seen.size} écrans différents sur 400 graines`);
});

test('blessés : l’écran tiré garde des entiers, les blessés légers en tête, jamais plus que le total', () => {
  for (let n = 1; n <= 3000; n++) {
    const all = injuryParts(n);
    const { parts, file } = report(n, n * 7919);
    assert.equal(parts[0], all[0], `${n} blessés : les blessés légers d’abord`);
    assert.match(parts[0], /blessés? légers?$/);
    assert.equal(parts.length, Math.min(3, all.length), `${n} blessés : les légers et deux autres parts`);
    assert.deepEqual(parts, all.filter((p) => parts.includes(p)), `${n} blessés : des parts de la répartition, dans son ordre`);
    for (const part of parts) {
      assert.doesNotMatch(part, /\d,\d|(^|\D)0 /, `${n} blessés : « ${part} »`);
      for (const x of plain(part).match(/\d+( \d{3})*/g)) assert.ok(Number(x.replace(/ /g, '')) <= n, `${n} blessés : ${x} dépasse le total dans « ${part} »`);
    }
    assert.ok(file.length >= 1);
  }
  assert.deepEqual(report(0, 1), { parts: [], file: [] }, 'sans blessé, rien');
});

test('blessés : la partie garde sa graine, l’écran de fin en tire ce qu’il montre', () => {
  const id = Object.keys(bundle.niveaux)[0];
  assert.equal(new Game(bundle, id, { seed: 4242 }).seed, 4242);
  assert.equal(new Game(bundle, id).seed, 1);
});
