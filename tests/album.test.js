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

test('pile de vies : le personnage qu’on joue d’abord ; au-delà de six, un nombre', () => {
  const stack = ['tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste'];
  assert.deepEqual(livesHeads({ stack }), { heads: stack, more: 0 });
  assert.deepEqual(livesHeads({ stack: [...stack, 'zuc-man', 'melenchotron'] }).heads,
    ['melenchotron', 'zuc-man', 'tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste']);
  const many = livesHeads({ stack: Array(9).fill('zuc-man') });
  assert.deepEqual([many.heads.length, many.more], [6, 3]);
  assert.deepEqual(livesHeads({ stack: [] }), { heads: [], more: 0 });
});
