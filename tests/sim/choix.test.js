// Le choix du héros de départ, et la pile des camarades libérés.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, play, run } from './helpers.js';
import { Game, START_LIVES } from '../../src/sim/game.js';

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
  assert.deepEqual(game.stack, ['beta', 'beta', 'beta'], 'trois vies du héros choisi');
  const lives = game.lives;
  const events = run(game, 240, { right: true, fire: true });
  const card = events.find((e) => e.type === 'heroCard');
  assert.ok(card, 'le camarade est libéré');
  assert.notEqual(game.hero.def.id, 'beta', 'on ne libère pas le héros qu’on joue déjà');
  assert.deepEqual(game.stack, ['beta', 'beta', 'beta', game.hero.def.id], 'le camarade libéré se pose sur la pile');
  assert.equal(game.lives, lives + 1);
  assert.ok(Number.isFinite(card.x) && Number.isFinite(card.y), 'le carton sait où afficher le +1');
  assert.ok(Object.hasOwn(fixtureBundle().heros, card.hero));
});

test('les vies sont des personnages : libéré, on le joue ; tombé, on repart avec celui d’en dessous', () => {
  const lvl = flat({ heros: 'alpha', camarades: ['beta'], draw: (put, ground) => put(ground, 6, 'K') });
  const game = play(lvl);
  assert.deepEqual(game.stack, ['alpha', 'alpha', 'alpha']);
  run(game, 240, { right: true, fire: true });
  assert.deepEqual(game.stack, ['alpha', 'alpha', 'alpha', 'beta']);
  assert.equal(game.hero.def.id, 'beta');
  assert.equal(game.lives, 4);

  game.killHero();
  assert.deepEqual(game.stack, ['alpha', 'alpha', 'alpha'], 'il quitte la pile');
  const events = run(game, 120);
  assert.equal(game.hero.def.id, 'alpha', 'on repart avec le personnage suivant');
  assert.equal(events.find((e) => e.type === 'respawn').hero, 'alpha');

  for (let i = 0; i < 3; i++) {
    game.killHero();
    run(game, 120);
  }
  assert.equal(game.lives, 0);
  assert.equal(game.status, 'lost');
});

test('une vraie partie démarre avec un seul personnage : le perdre, c’est perdre le niveau', () => {
  const game = new Game(fixtureBundle(), 'essai', { level: flat() });
  assert.equal(game.lives, START_LIVES);
  assert.equal(START_LIVES, 1);
  game.killHero();
  assert.equal(game.status, 'lost');
});

test('le boss est tiré au hasard à chaque partie, sauf si le niveau en impose un', () => {
  const base = fixtureBundle();
  const [first] = Object.values(base.boss);
  const second = { ...first, id: 'autre', nom: 'Un autre' };
  const bundle = { ...base, boss: { [first.id]: first, autre: second } };
  const arena = flat({ draw: (put, ground) => put(ground, 30, 'Y') });
  const met = new Set();
  for (let seed = 1; seed <= 40; seed++) met.add(play(arena, { bundle, seed }).boss.def.id);
  assert.deepEqual([...met].sort(), [first.id, 'autre'].sort(), 'd’une partie à l’autre, ce n’est pas le même');
  for (let seed = 1; seed <= 10; seed++) assert.equal(play({ ...arena, boss: 'autre' }, { bundle, seed }).boss.def.id, 'autre');
  assert.equal(play(flat(), { bundle }).boss, null, 'pas de repère « Y » : pas de boss');
});

