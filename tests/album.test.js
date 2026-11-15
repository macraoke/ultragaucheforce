// L'album côté joueur : les cartes gagnées dans un niveau, le badge « Nouveau », la pile de vies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { allCards, cardKey, cardsByKeys, isFresh, markSeen } from '../src/client/collection.js';
import { livesHeads } from '../src/client/lives.js';

const { bundle } = loadContent();
const cards = allCards(bundle);
const card = (kind, id) => cards.find((c) => c.kind === kind && (c.item.id ?? c.item.texte) === id);

test('cartes gagnées : les clés de sauvegarde retrouvent leurs cartes, dans l’ordre de l’album', () => {
  const sign = bundle.pancartes.find((p) => p.credit && p.texte.includes(':')) || bundle.pancartes.find((p) => p.credit);
  const keys = [`pancartes:${sign.texte}`, 'ennemis:crs', 'heros:zuc-man', 'heros:inconnu', 'fiches:smic'];
  const found = cardsByKeys(bundle, keys);
  assert.deepEqual(found.map(cardKey), ['heros:zuc-man', 'ennemis:crs', `pancartes:${sign.texte}`, 'fiches:smic']);
  assert.deepEqual(cardsByKeys(bundle, []), []);
  assert.equal(new Set(cards.map(cardKey)).size, cards.length, 'une clé par carte');
});

test('badge « Nouveau » : une carte trouvée depuis la dernière visite de son rayon, pas après', () => {
  const save = { decouvertes: ['heros:zuc-man', 'ennemis:crs'], vues: {} };
  assert.ok(isFresh(save, card('heros', 'zuc-man')), 'jamais visité : tout ce qui est trouvé est nouveau');
  assert.ok(!isFresh(save, card('heros', 'melenchotron')), 'pas trouvée : pas nouvelle');
  markSeen(save, 'camarades');
  assert.ok(!isFresh(save, card('heros', 'zuc-man')));
  assert.ok(isFresh(save, card('ennemis', 'crs')), 'les autres rayons gardent leurs badges');
  save.decouvertes.push('heros:melenchotron');
  assert.ok(isFresh(save, card('heros', 'melenchotron')));
  assert.ok(!isFresh({ decouvertes: ['heros:zuc-man'] }, card('heros', 'melenchotron')), 'une vieille sauvegarde sans « vues »');
});

test('pile de vies : les camarades libérés d’abord, puis le héros de départ ; au-delà de six, un nombre', () => {
  const game = { lives: 3, freed: [], starter: 'tyrannogauchiste' };
  assert.deepEqual(livesHeads(game), { heads: ['tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste'], more: 0 });
  Object.assign(game, { lives: 5, freed: ['zuc-man', 'melenchotron'] });
  assert.deepEqual(livesHeads(game).heads, ['melenchotron', 'zuc-man', 'tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste']);
  Object.assign(game, { lives: 1 });
  assert.deepEqual(livesHeads(game), { heads: ['melenchotron'], more: 0 }, 'une vie perdue : la pile rétrécit par le bas');
  Object.assign(game, { lives: 9 });
  assert.deepEqual([livesHeads(game).heads.length, livesHeads(game).more], [6, 3]);
  assert.deepEqual(livesHeads({ lives: 0, freed: [], starter: 'x' }), { heads: [], more: 0 });
});
