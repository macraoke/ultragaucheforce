// L'album côté joueur : ce qui a été débloqué dans un niveau, le badge « Nouveau », la pile de vies.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { allCards, cardKey, cardsByKeys, isFresh, markSeen } from '../src/client/collection.js';
import { livesHeads } from '../src/client/lives.js';

const { bundle } = loadContent();
const cards = allCards(bundle);
const card = (kind, id) => cards.find((c) => c.kind === kind && c.item.id === id);

test('débloqué dans le niveau : les clés de sauvegarde retrouvent leurs cartes, dans l’ordre de l’album', () => {
  const sign = bundle.pancartes.find((p) => p.credit && p.texte.includes(':')) || bundle.pancartes.find((p) => p.credit);
  const keys = [`pancartes:${sign.texte}`, 'ennemis:robot-bouclier', 'heros:zucman', 'heros:inconnu', 'fiches:smic'];
  const found = cardsByKeys(bundle, keys);
  assert.deepEqual(found.map(cardKey), ['heros:zucman', `pancartes:${sign.texte}`, 'ennemis:robot-bouclier', 'fiches:smic']);
  assert.deepEqual(cardsByKeys(bundle, []), []);
  assert.equal(new Set(cards.map(cardKey)).size, cards.length, 'une clé par carte');
});

test('badge « Nouveau » : une carte trouvée depuis la dernière visite de son rayon, pas après', () => {
  const save = { decouvertes: ['heros:zucman', 'ennemis:robot-bouclier'], vues: {} };
  assert.ok(isFresh(save, card('heros', 'zucman')), 'jamais visité : tout ce qui est trouvé est nouveau');
  assert.ok(!isFresh(save, card('heros', 'melenchon')), 'pas trouvée : pas nouvelle');
  markSeen(save, 'camarades');
  assert.ok(!isFresh(save, card('heros', 'zucman')));
  assert.ok(isFresh(save, card('ennemis', 'robot-bouclier')), 'les autres rayons gardent leurs badges');
  save.decouvertes.push('heros:melenchon');
  assert.ok(isFresh(save, card('heros', 'melenchon')));
  assert.ok(!isFresh({ decouvertes: ['heros:zucman'] }, card('heros', 'melenchon')), 'une vieille sauvegarde sans « vues »');
});

test('pile de vies : le personnage qu’on joue d’abord ; au-delà de six, un nombre', () => {
  const stack = ['tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste'];
  assert.deepEqual(livesHeads({ stack }), { heads: stack, more: 0 });
  assert.deepEqual(livesHeads({ stack: [...stack, 'zucman', 'melenchon'] }).heads,
    ['melenchon', 'zucman', 'tyrannogauchiste', 'tyrannogauchiste', 'tyrannogauchiste']);
  const many = livesHeads({ stack: Array(9).fill('zucman') });
  assert.deepEqual([many.heads.length, many.more], [6, 3]);
  assert.deepEqual(livesHeads({ stack: [] }), { heads: [], more: 0 });
});
