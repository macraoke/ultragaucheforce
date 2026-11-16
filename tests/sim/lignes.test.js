// Une ligne qui tient arrête aussi l'autre camp : ses unités au sol (charge, ruée, marche, recul) et ses tirs droits,
// comme elle arrête le héros et ses tracts. Les grenades passent par-dessus. Une ligne qui a cédé n'arrête plus personne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);

/** La ligne d'essai (trente manifestants) en colonne 5, une unité d'en face derrière elle, en colonne `col`. */
const behind = (id, { col = 8, ...extra } = {}) => flat({
  width: 40, legende: { l: enemy('ligne'), u: enemy(id) },
  draw: (put, ground) => {
    put(ground, 5, 'l');
    put(ground, col, 'u');
  },
  ...extra,
});

const parts = (game) => ({ line: game.enemies.find((e) => e.def.id === 'ligne'), foe: game.enemies.find((e) => e.def.id !== 'ligne') });

test('ligne qui tient : la charge d’en face s’y arrête, le héros qui attend devant n’est pas touché ; ses tracts restent parés', () => {
  const game = settle(play(behind('chargeur')));
  const { hero } = game;
  const { line, foe } = parts(game);
  const phases = [];
  const events = [];
  for (let i = 0; i < 600; i++) {
    events.push(...run(game, 1, { right: true, fire: true }));
    const phase = foe.rush?.phase ?? null;
    if (phase && phases.at(-1) !== phase) phases.push(phase);
    assert.ok(foe.x >= line.x + line.w - 0.001, `la charge ne traverse pas la ligne (pas ${i})`);
  }
  assert.deepEqual(phases.slice(0, 4), ['sommation', 'ruee', 'pause', 'sommation'], 'sommations, ruée, puis la ruée s’arrête à la ligne');
  assert.ok(Math.abs(foe.x - (line.x + line.w)) < 1, 'elle est venue jusqu’au contact de la ligne');
  assert.equal(of(events, 'hurt').length, 0, 'le héros n’est pas touché');
  assert.equal(hero.hp, hero.def.pv);

  // Comme avant : le héros bute sur la ligne, ses tracts s'y écrasent, et l'unité derrière n'en reçoit aucun.
  assert.ok(hero.x + hero.w <= line.x + 0.001, 'le héros reste devant la ligne');
  assert.ok(of(events, 'blocked').length >= 2, 'il bute dessus');
  assert.ok(of(events, 'parry').some((e) => e.line), 'ses tracts sont parés par la ligne');
  assert.equal(line.hp, line.def.pv, 'elle n’est pas entamée');
  assert.equal(foe.hp, foe.def.pv, 'derrière elle, rien ne l’atteint');
  assert.equal(line.state === 'done', false, 'elle tient toujours');
});

test('ligne qui tient : rien ne passe au sol, ni en fonçant, ni à moto, ni en reculant sous un coup', () => {
  for (const id of ['fonceur', 'moto', 'chargeur']) {
    const game = settle(play(behind(id)));
    const { line, foe } = parts(game);
    let x = Infinity;
    const events = run(game, 300, (i, g) => {
      x = Math.min(x, foe.x);
      return {};
    });
    assert.ok(x >= line.x + line.w - 0.001, `${id} : ne traverse pas (au plus près, ${(x - line.x - line.w).toFixed(1)} px derrière)`);
    assert.equal(of(events, 'hurt').length, 0, `${id} : le héros n’est pas touché`);

    // Le recul d'une unité sonnée la pousse vers la ligne : elle s'y arrête aussi.
    Object.assign(foe, { state: 'stunned', stun: 1, kick: -400, x: line.x + line.w + 2 });
    run(game, 30);
    assert.ok(foe.x >= line.x + line.w - 0.001, `${id} : le recul ne la fait pas passer`);
  }
});

test('ligne qui tient : une grenade lancée de derrière passe par-dessus et touche encore', () => {
  const game = settle(play(behind('garde')));
  const { line } = parts(game);
  let over = false;
  const events = run(game, 150, () => {
    over ||= game.projectiles.some((p) => p.team === 'ordre' && p.gravity > 0 && p.x + p.w < line.x);
    return {};
  });
  assert.ok(over, 'la grenade franchit la ligne');
  const hurt = of(events, 'hurt');
  assert.ok(hurt.length >= 1 && hurt.every((e) => e.kind === 'explosion' || e.kind === 'gaz'), 'le héros est touché par la grenade ou son gaz');
});

test('ligne qui tient : les tirs droits d’en face s’y écrasent, comme nos tracts ; le jet du canon à eau s’y arrête', () => {
  const shot = settle(play(behind('viseur')));
  const { line } = parts(shot);
  const events = run(shot, 300);
  assert.ok(of(events, 'sfx').filter((e) => e.id === 'tir').length >= 3, 'il tire');
  assert.equal(of(events, 'hurt').length, 0, 'aucun tir ne passe');
  assert.ok(of(events, 'parry').filter((e) => e.line).length >= 3, 'chaque tir est paré par la ligne');
  assert.equal(line.hp, line.def.pv);

  const jet = settle(play(behind('canon', { col: 9 })));
  const { line: wall, foe: canon } = parts(jet);
  const x0 = jet.hero.x;
  let longest = 0;
  run(jet, 300, () => {
    longest = Math.max(longest, canon.jet?.length ?? 0);
    return {};
  });
  assert.ok(longest > 0, 'il arrose');
  assert.ok(canon.x - longest >= wall.x + wall.w - 4, `le jet s’arrête à la ligne (${longest} px)`);
  assert.equal(jet.hero.x, x0, 'le héros n’est pas repoussé');
});

test('ligne cédée : elle n’arrête plus personne, la charge passe', () => {
  const game = settle(play(behind('chargeur', { manif: 30 })));
  const { hero } = game;
  const { line, foe } = parts(game);
  assert.equal(line.state, 'done', 'assez nombreux, à portée : elle a cédé');
  let x = Infinity;
  const events = run(game, 200, () => {
    x = Math.min(x, foe.x);
    return {};
  });
  assert.ok(x + foe.w < line.x, 'la charge passe là où était la ligne');
  assert.ok(of(events, 'hurt').some((e) => e.kind === 'charge'), 'et touche le héros');
  assert.ok(hero.hp < hero.def.pv);
});
