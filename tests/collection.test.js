// La Collection : toutes les fiches du contenu deviennent des cartes, rangées et numérotées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { SHELVES, allCards, cardId, cardName } from '../src/client/collection.js';

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
