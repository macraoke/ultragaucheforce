// La Collection : toutes les fiches du contenu deviennent des cartes, rangées et numérotées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { SHELVES, allCards, cardId, cardName, citationOfWord, isLongSign, whereToFind } from '../src/client/collection.js';

const { bundle } = loadContent();
const cards = allCards(bundle);

test('collection : une carte par fiche, numérotée, avec un nom et une clé unique', () => {
  assert.deepEqual(cards.map((c) => c.number), cards.map((_, i) => i + 1));
  const keys = cards.map((c) => `${c.kind}:${cardId(c.item)}`);
  assert.equal(new Set(keys).size, keys.length, 'aucune carte en double');
  for (const c of cards) assert.ok(cardName(c.item), `${c.kind}:${cardId(c.item)} a un nom`);
  for (const kind of ['heros', 'recrues', 'ennemis', 'boss', 'niveaux', 'citations', 'fiches', 'drapeaux']) {
    assert.equal(cards.filter((c) => c.kind === kind).length, Object.keys(bundle[kind]).length, kind);
  }
});

test('collection : chaque rayon a ses cartes ; faits et propositions se partagent les fiches', () => {
  for (const shelf of SHELVES) assert.ok(cards.some((c) => c.shelf === shelf.id), `rayon « ${shelf.titre} »`);
  const of = (id) => cards.filter((c) => c.shelf === id);
  assert.ok(of('propositions').every((c) => c.item.theme === 'programme'));
  assert.ok(of('faits').every((c) => c.item.theme !== 'programme'));
  assert.equal(of('faits').length + of('propositions').length, Object.keys(bundle.fiches).length);
});

test('collection : seules les pancartes et les bandeaux qui ont une source deviennent des cartes', () => {
  const lines = { ...bundle, pancartes: [...bundle.pancartes, { texte: 'SANS SOURCE', credit: '' }] };
  const signs = allCards(lines).filter((c) => c.kind === 'pancartes');
  assert.equal(signs.length, bundle.pancartes.filter((p) => p.credit).length);
  assert.ok(signs.every((c) => c.item.credit.includes('https://')));
});

test('collection : chaque carte se gagne quelque part en jouant', () => {
  const lost = cards.filter((c) => whereToFind(bundle, c.kind, c.item).length === 0).map((c) => `${c.kind}:${cardId(c.item)}`);
  assert.deepEqual(lost, [], 'cartes sans aucun chemin : attache-les à un personnage, un niveau, une scène');
  const hint = (kind, id) => whereToFind(bundle, kind, kind === 'pancartes' ? bundle.pancartes.find((p) => p.texte === id) : bundle[kind][id]);
  assert.deepEqual(hint('pancartes', 'MACRON, RENDS-NOUS LE POGNON !'), ['La retraitée'], 'un slogan arrive avec sa recrue');
  assert.deepEqual(hint('pancartes', 'TAXEZ LES RICHES'), ['dans le cortège']);
  assert.deepEqual(hint('pancartes', 'ILS SONT 42 MILLIARDAIRES, NOUS SOMMES 60 MILLIONS DANS LA GALÈRE'), ['à un piquet de grève']);
  assert.deepEqual(hint('citations', 'melenchon-bruit-et-fureur'), ['Le Mélenchotron'], 'les mots du héros viennent de sa citation');
  assert.deepEqual(hint('fiches', 'procuration'), ['à la fin de la campagne']);
  assert.deepEqual(hint('fiches', 'patrimoine-moitie'), ['en taxant une fortune']);
  assert.ok(hint('ennemis', 'gendarme-mobile').length >= 1, 'les renforts de l’hélicoptère comptent');
});

test('collection : un mot crié en jeu retrouve sa citation, par son mot-clé ou par ses propres mots', () => {
  assert.equal(citationOfWord(bundle, 'ÉCOTERRORISME !').id, 'darmanin-ecoterrorisme');
  assert.equal(citationOfWord(bundle, 'LA FUREUR !').id, 'melenchon-bruit-et-fureur');
  assert.equal(citationOfWord(bundle, 'MOT INCONNU !'), undefined);
  for (const speaker of [...Object.values(bundle.heros), ...Object.values(bundle.ennemis)]) {
    for (const word of speaker.arme?.mots || []) assert.ok(citationOfWord(bundle, word), `${speaker.id} : « ${word} » ne vient d'aucune citation`);
  }
  assert.ok(bundle.pancartes.some(isLongSign) && bundle.pancartes.some((p) => !isLongSign(p)));
});
