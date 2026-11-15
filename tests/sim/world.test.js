// Décor destructible : la collision disparaît vraiment, l'acier tient, les tonneaux s'enchaînent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';
import { TILE } from '../../src/sim/world.js';

test('un tir détruit une planche : la collision est retirée et le passage s’ouvre', () => {
  const game = settle(play(flat({
    draw: (put, ground) => {
      for (const row of [ground - 2, ground - 1, ground]) put(row, 8, 'P');
    },
  })));
  const ground = game.world.h - 2;
  assert.ok(game.world.solid(8, ground), 'le mur est plein au départ');
  run(game, 60, { fire: true });
  assert.ok(!game.world.solid(8, ground), 'la planche touchée a disparu');
  assert.equal(game.world.at(8, ground), null);
  assert.ok(game.stats.tiles >= 1);
  run(game, 120, { right: true });
  assert.ok(game.hero.x > 9 * TILE, `le héros est passé (x=${game.hero.x.toFixed(0)})`);
});

test('l’acier est indestructible : ni tir ni explosion ne l’entament', () => {
  const game = settle(play(flat({
    draw: (put, ground) => {
      for (const row of [ground - 2, ground - 1, ground]) put(row, 8, 'A');
      put(ground, 6, 'X'); // un tonneau collé au mur
    },
  }), { invincible: true }));
  const ground = game.world.h - 2;
  const events = run(game, 240, { fire: true, right: true });
  assert.ok(events.some((e) => e.type === 'explosion'), 'le tonneau a explosé');
  for (const row of [ground - 2, ground - 1, ground]) assert.ok(game.world.solid(8, row), 'mur d’acier intact');
  assert.ok(game.world.solid(7, ground + 1), 'sol d’acier intact sous l’explosion');
  assert.ok(game.hero.x < 8 * TILE, 'le héros ne traverse pas');
});

test('réaction en chaîne : tonneau → tonneau → mur', () => {
  const game = settle(play(flat({
    draw: (put, ground) => {
      put(ground, 10, 'X');
      put(ground, 12, 'X');
      put(ground, 14, 'T');
      put(ground - 1, 14, 'T');
    },
  })));
  const ground = game.world.h - 2;
  const events = [];
  let firstBoom = -1;
  let secondBoom = -1;
  for (let i = 0; i < 120; i++) {
    game.step({ fire: true });
    for (const e of game.events.splice(0)) {
      events.push(e);
      if (e.type !== 'explosion') continue;
      if (firstBoom < 0) firstBoom = i;
      else if (secondBoom < 0) secondBoom = i;
    }
  }
  assert.equal(events.filter((e) => e.type === 'explosion').length, 2, 'deux explosions');
  assert.ok(secondBoom > firstBoom, 'la seconde explosion suit la première avec un délai');
  assert.equal(game.world.at(10, ground), null, 'premier tonneau parti');
  assert.equal(game.world.at(12, ground), null, 'second tonneau parti');
  assert.ok(!game.world.solid(14, ground) && !game.world.solid(14, ground - 1), 'le mur derrière est tombé');
  assert.ok(game.world.solid(12, ground + 1), 'le sol d’acier tient');
  assert.equal(game.hero.hp, game.hero.def.pv, 'le héros, à distance, n’a rien');
  assert.ok(events.some((e) => e.type === 'debris'), 'des éclats sont signalés au client');
});

test('une explosion de tonneau blesse le héros trop proche', () => {
  const game = settle(play(flat({ draw: (put, ground) => put(ground, 4, 'X') })));
  run(game, 60, { fire: true });
  assert.equal(game.hero.hp, game.hero.def.pv - 1);
});

test('bords du monde : pleins à gauche et à droite, ciel ouvert, vide sous la carte', () => {
  const { world } = play(flat({ width: 20, height: 10 }));
  assert.ok(world.solid(-1, 5) && world.solid(20, 5));
  assert.ok(!world.solid(5, -1) && !world.solid(5, 10));
});
