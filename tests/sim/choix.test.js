// Le choix du héros de départ, et la pile des camarades libérés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, play, run } from './helpers.js';

test('héros de départ : celui que le joueur choisit, sinon celui du niveau', () => {
  const lvl = flat({ heros: 'alpha' });
  assert.equal(play(lvl).hero.def.id, 'alpha');
  assert.equal(play(lvl, { hero: 'beta' }).hero.def.id, 'beta');
  assert.equal(play(lvl, { hero: 'inconnu' }).hero.def.id, 'alpha', 'un héros qui n’existe pas : celui du niveau');
  assert.equal(play(lvl, { hero: 'test-hero' }).hero.def.id, 'alpha', 'un héros d’essai ne se choisit pas');
  assert.equal(play(lvl, { hero: 'constructor' }).hero.def.id, 'alpha', 'pas de clé héritée');
  assert.equal(play(flat({ heros: 'beta' }), { hero: '' }).hero.def.id, 'beta');
});

test('héros choisi : le sauvetage donne quand même un autre héros, et la pile grandit', () => {
  const lvl = flat({ heros: 'alpha', camarades: ['beta'], draw: (put, ground) => put(ground, 6, 'K') });
  const game = play(lvl, { hero: 'beta' });
  assert.deepEqual(game.freed, []);
  const lives = game.lives;
  const events = run(game, 240, { right: true, fire: true });
  const card = events.find((e) => e.type === 'heroCard');
  assert.ok(card, 'le camarade est libéré');
  assert.notEqual(game.hero.def.id, 'beta', 'on ne libère pas le héros qu’on joue déjà');
  assert.deepEqual(game.freed, [game.hero.def.id]);
  assert.equal(game.lives, lives + 1);
  assert.ok(Number.isFinite(card.x) && Number.isFinite(card.y), 'le carton sait où afficher le +1');
  assert.ok(Object.hasOwn(fixtureBundle().heros, card.hero));
});
