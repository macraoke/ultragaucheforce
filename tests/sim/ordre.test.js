// Les forces de l'ordre : sommations et charge, tir visé, canon à eau, moto, véhicule, hélicoptère,
// et le boss assis sur sa fortune.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';
import { TILE } from '../../src/sim/world.js';
import { overlap } from '../../src/sim/physics.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);
const centre = (b) => b.x + b.w / 2;

// ---------------------------------------------------------------- charge

test('charge : les sommations, une par une, puis la ruée en ligne droite, puis une pause', () => {
  const game = play(flat({ legende: { c: enemy('chargeur') }, draw: (put, ground) => put(ground, 9, 'c') }));
  const { hero } = game;
  const foe = game.enemies[0];
  const said = [];
  let rushedAt = -1;
  let x0 = null;
  for (let i = 0; i < 200 && !hero.dead; i++) {
    run(game, 1);
    if (foe.bubble && said.at(-1) !== foe.bubble.text) said.push(foe.bubble.text);
    if (foe.rush?.phase === 'sommation') x0 = foe.x;
    if (foe.rush?.phase === 'ruee' && rushedAt < 0) rushedAt = i;
  }
  assert.deepEqual(said, ['PREMIÈRE SOMMATION', 'DERNIÈRE SOMMATION'], 'dans l’ordre de la fiche');
  assert.ok(rushedAt >= 110, `deux sommations d'une seconde avant de charger (ruée au pas ${rushedAt})`);
  assert.ok(x0 - foe.x > 60, 'la ruée couvre du terrain d’un coup');
  assert.equal(game.stats.deaths, 1, 'le contact pendant la ruée coûte un personnage');
  assert.equal(foe.state, 'stunned', 'après le choc, il recule, sonné');

  // Charges suivantes : plus de sommation, un court élan, et la même distance à chaque fois.
  const far = play(flat({ width: 80, legende: { c: enemy('chargeur') }, draw: (put, ground) => put(ground, 15, 'c') }), { invincible: true });
  const unit = far.enemies[0];
  const phases = [];
  const lines = [];
  let from = null;
  let covered = 0;
  for (let i = 0; i < 900; i++) {
    run(far, 1);
    const phase = unit.rush?.phase ?? null;
    if (phase && phases.at(-1) !== phase) phases.push(phase);
    if (unit.bubble && lines.at(-1) !== unit.bubble.text) lines.push(unit.bubble.text);
    if (phase === 'ruee' && from === null) from = unit.x;
    if (phase === 'pause' && from !== null && !covered) covered = Math.abs(unit.x - from);
  }
  assert.deepEqual(phases.slice(0, 5), ['sommation', 'ruee', 'pause', 'sommation', 'ruee']);
  assert.deepEqual(lines, ['PREMIÈRE SOMMATION', 'DERNIÈRE SOMMATION'], 'les sommations ne sont faites qu’une fois');
  assert.ok(Math.abs(covered - unit.def.charge.distance) < 8, `charge.distance respectée (${covered.toFixed(0)} px)`);
});

test('charge : en traversant le cortège, elle disperse une part de la manif, une fois par charge', () => {
  const game = settle(play(flat({
    cortege: true, manif: 100, legende: { c: enemy('chargeur') },
    draw: (put, ground) => {
      put(ground, 2, 'c');
      put(ground, 8, 'D');
    },
  }), { invincible: true }));
  run(game, 28, { right: true }); // le cortège s'étire derrière le héros, vers la ligne de charge
  const events = run(game, 200);
  assert.deepEqual(of(events, 'dispersed'), [{ type: 'dispersed', n: 10, crowd: 90 }], 'charge.disperse: 10 → dix pour cent');
  assert.equal(game.cortege.length, 11, 'le cortège visible suit le nombre');
});

// ---------------------------------------------------------------- tir visé

test('tir visé : une visée que l’on voit venir, puis un tir vers le héros, pas à l’horizontale', () => {
  const game = settle(play(flat({
    legende: { t: enemy('tireur') },
    draw: (put, ground) => {
      put(ground - 3, 14, 'A');
      put(ground - 4, 14, 't');
    },
  })));
  const { hero } = game;
  const foe = game.enemies[0];
  let aimed = 0;
  while (!game.projectiles.length && aimed < 200) {
    run(game, 1);
    if (foe.aim) {
      aimed++;
      assert.equal(game.projectiles.length, 0, 'rien ne part pendant la visée');
      assert.ok(Math.abs(foe.aim.x - centre(hero)) < 1 && Math.abs(foe.aim.y - (hero.y + hero.h / 2)) < 1, 'le point de visée est sur le héros');
    }
  }
  assert.ok(aimed >= 45 && aimed <= 50, `arme.visee: 0.8 s de visée (${aimed} pas)`);
  assert.equal(foe.aim, null);
  const [shot] = game.projectiles;
  assert.ok(shot.vx < 0 && shot.vy > 0, 'le tir descend vers le héros');
  assert.ok(Math.abs(Math.hypot(shot.vx, shot.vy) - foe.def.arme.vitesse) < 1, 'à la vitesse de la fiche');
  run(game, 60);
  assert.equal(game.stats.deaths, 1, 'immobile, le héros est touché');
});

test('tir visé : la visée se fige juste avant le tir, on peut l’esquiver', () => {
  const game = settle(play(flat({
    legende: { t: enemy('tireur') },
    draw: (put, ground) => {
      put(ground - 3, 14, 'A');
      put(ground - 4, 14, 't');
    },
  })));
  const { hero } = game;
  const foe = game.enemies[0];
  while (!foe.aim) run(game, 1);
  while (foe.aim && foe.aim.t > 0.2) run(game, 1);
  const locked = { ...foe.aim };
  run(game, 6, { right: true });
  assert.deepEqual({ x: foe.aim.x, y: foe.aim.y }, { x: locked.x, y: locked.y }, 'le point ne suit plus');
  run(game, 90, { right: true });
  assert.equal(game.stats.deaths, 0, 'le tir passe derrière');
});

// ---------------------------------------------------------------- canon à eau

test('canon à eau : le jet repousse le héros et le cortège sans blesser personne', () => {
  const game = settle(play(flat({
    cortege: true, legende: { k: enemy('canon') },
    draw: (put, ground) => put(ground, 12, 'k'),
  })));
  const { hero } = game;
  const foe = game.enemies[0];
  run(game, 150, { right: true }); // premier jet, puis l'accalmie : le héros s'approche
  assert.equal(foe.jet, null, 'arme.pause : le jet s’interrompt');
  const crowd = game.crowd;
  let jets = 0;
  let pushed = false;
  let from = null;
  let to = null;
  for (let i = 0; i < 200; i++) {
    run(game, 1, { right: true });
    if (!foe.jet) continue;
    jets++;
    from ??= hero.x;
    to = hero.x;
    assert.deepEqual({ dir: foe.jet.dir, length: foe.jet.length }, { dir: -1, length: 160 });
    pushed ||= game.cortege.some((m) => m.pushed > 0);
  }
  assert.ok(jets >= 115 && jets <= 125, `arme.duree: 2 s de jet (${jets} pas)`);
  assert.ok(to < from - 60, `le héros recule alors qu'il avance (${from.toFixed(0)} → ${to.toFixed(0)})`);
  assert.ok(pushed, 'le cortège est repoussé aussi');
  assert.ok(!hero.dead, 'aucun dégât');
  assert.equal(game.crowd, crowd, 'aucune dispersion');
  assert.equal(game.stats.deaths, 0);
});

// ---------------------------------------------------------------- moto

test('moto : elle traverse, dépasse le héros, fait demi-tour et revient', () => {
  const game = settle(play(flat({
    width: 80, legende: { m: enemy('moto') },
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground, 30, 'D');
      put(ground, 46, 'm');
    },
  })));
  const { hero } = game;
  const moto = game.enemies[0];
  const sides = [];
  let stunned = false;
  let farthest = 0;
  let hitAt = -1;
  for (let i = 0; i < 280; i++) {
    run(game, 1);
    const side = Math.sign(centre(moto) - centre(hero));
    if (side && sides.at(-1) !== side) sides.push(side);
    stunned ||= moto.state === 'stunned';
    farthest = Math.max(farthest, centre(hero) - centre(moto));
    if (hitAt < 0 && game.stats.deaths > 0) hitAt = i;
  }
  assert.deepEqual(sides, [1, -1, 1], 'arrivée par la droite, passée à gauche, revenue à droite');
  assert.ok(hitAt > 0, 'le passage bouscule le héros');
  assert.ok(!stunned, 'et elle ne s’arrête pas pour autant');
  assert.ok(farthest >= 200, 'elle s’éloigne bien au-delà du héros avant de revenir');
  assert.ok(Math.abs(moto.vx) > 150, 'toujours lancée');
});

// ---------------------------------------------------------------- véhicule

test('véhicule : ni recul ni étourdissement, et il pousse le héros au lieu de lui passer dessus', () => {
  const game = settle(play(flat({
    legende: { b: enemy('blinde') },
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground, 8, 'D');
      put(ground, 14, 'b');
    },
  }), { invincible: true }));
  const { hero } = game;
  const truck = game.enemies[0];
  run(game, 100);
  const before = truck.x;
  game.step({ special: true }); // l'onde : dégâts 2, recul 220, étourdit 2 s
  assert.equal(truck.hp, truck.def.pv - 2, 'il encaisse');
  const gassed = { x: centre(truck), y: truck.y + truck.h / 2, r: 30, t: 2 };
  game.clouds.push(gassed);
  for (let i = 0; i < 60; i++) {
    run(game, 1);
    assert.notEqual(truck.state, 'stunned', 'ni l’onde ni le gaz ne l’arrêtent');
    assert.ok(truck.x <= before, 'jamais repoussé');
  }
  assert.ok(truck.x < before - 20, 'il continue d’avancer à son pas');

  const x0 = hero.x;
  for (let i = 0; i < 200; i++) {
    run(game, 1);
    assert.ok(!overlap(hero, truck), 'jamais l’un dans l’autre');
  }
  assert.ok(hero.x < x0 - 30, 'le héros, immobile, est poussé');
  assert.ok(Math.abs(hero.x + hero.w - truck.x) < 0.001, 'collé au pare-chocs');
});

// ---------------------------------------------------------------- hélicoptère

test('hélicoptère : son faisceau fait monter la panique et dépose des renforts, en nombre borné', () => {
  const game = settle(play(flat({
    width: 70, legende: { h: enemy('helico') },
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground, 20, 'D');
      put(2, 26, 'h');
    },
  }), { invincible: true }));
  const { hero } = game;
  const heli = game.enemies[0];
  const altitude = heli.home.y;
  const events = run(game, 60 * 12);
  assert.ok(heli.beam && heli.beam.lit, 'le héros est dans le faisceau');
  assert.equal(heli.beam.y, (game.world.h - 1) * TILE, 'le faisceau s’arrête au sol');
  assert.equal(heli.beam.w, 64);
  assert.ok(Math.abs(centre(heli) - centre(hero)) < 4, 'il se place au-dessus du héros');
  assert.ok(Math.abs(heli.y - altitude) < 6, 'sans quitter son altitude');
  assert.ok(game.panic > 15 && game.panic < 34, `la panique monte tant qu'il éclaire (${game.panic.toFixed(1)})`);

  assert.deepEqual(of(events, 'drop').map((e) => e.n), [2], 'renfort.max: 1 → une seule dépose de renfort.nombre: 2');
  const dropped = game.enemies.slice(1);
  assert.deepEqual(dropped.map((e) => e.def.id), ['fonceur', 'fonceur']);
  assert.ok(dropped.every((e) => e.rope === null && e.y + e.h === (game.world.h - 1) * TILE), 'descendus à la corde jusqu’au sol');

  const fresh = settle(play(flat({ width: 70, legende: { h: enemy('helico') }, draw: (put) => put(2, 8, 'h') }), { invincible: true }));
  let roped = 0;
  for (let i = 0; i < 140; i++) {
    run(fresh, 1);
    roped = Math.max(roped, fresh.enemies.filter((e) => e.rope).length);
  }
  assert.equal(roped, 2, 'pendant la descente, la corde est exposée au client');

  const dark = settle(play(flat({ width: 70, legende: { h: enemy('helico') }, draw: (put) => put(2, 40, 'h') }), { invincible: true }));
  const quiet = run(dark, 300);
  assert.equal(dark.panic, 0, 'hors du faisceau, rien ne monte');
  assert.equal(of(quiet, 'drop').length, 0);
});

// ---------------------------------------------------------------- boss assis sur sa fortune

const mound = () => flat({
  width: 50, boss: 'assis',
  draw: (put, ground) => {
    for (let row = ground - 3; row <= ground; row++) put(row, 20, 'PPP');
    put(ground - 4, 21, 'Y');
  },
});

test('boss assis : il tient sur son tas, descend quand on le creuse, et ne se lève que blessé', () => {
  const game = settle(play(mound(), { invincible: true }));
  const { boss, world } = game;
  const floor = (world.h - 1) * TILE;
  const seat = { x: boss.x, feet: boss.y + boss.h };
  assert.equal(seat.feet, floor - 4 * TILE, 'posé au sommet du tas');
  assert.ok(boss.seated);

  let events = run(game, 60, { right: true });
  assert.ok(boss.active, 'réveillé à l’approche');
  let charged = false;
  let fired = false;
  for (let i = 0; i < 300; i++) {
    events.push(...run(game, 1));
    charged ||= boss.state === 'charge';
    fired ||= game.projectiles.some((p) => p.owner === boss);
  }
  assert.equal(boss.x, seat.x, 'assis, il ne bouge pas');
  assert.ok(!charged, 'il ne charge pas');
  assert.ok(fired, 'mais il tire de loin');
  assert.equal(of(events, 'boss').some((e) => e.state === 'stand'), false);

  // On détruit tout le tas : il tombe jusqu'au sol, toujours assis.
  for (let row = world.h - 5; row <= world.h - 2; row++) {
    for (let col = 20; col <= 22; col++) world.damage(col, row, 9);
  }
  run(game, 60);
  assert.equal(boss.y + boss.h, floor, 'le tas s’effondre sous lui : il touche le sol');
  assert.equal(boss.x, seat.x);
  assert.ok(boss.seated, 'tomber ne le fait pas se lever');

  game.hurtBoss(boss.hpMax * 0.2);
  assert.ok(boss.seated, 'au-dessus de « leve », il reste assis');
  game.hurtBoss(boss.hpMax * 0.15);
  events = game.events.splice(0);
  assert.equal(boss.seated, false);
  assert.deepEqual(of(events, 'boss').map((e) => e.state), ['stand']);
  assert.equal(boss.bubble?.text, 'CETTE FOIS, JE ME LÈVE');
  const x0 = boss.x;
  run(game, 200);
  assert.notEqual(boss.x, x0, 'debout, il marche sur le héros');
});

test('boss assis : il descend rangée par rangée quand on détruit ce qui le porte', () => {
  const game = settle(play(mound(), { invincible: true }));
  const { boss, world } = game;
  const floor = (world.h - 1) * TILE;
  for (let k = 1; k <= 4; k++) {
    for (let col = 20; col <= 22; col++) world.damage(col, world.h - 1 - 5 + k, 9); // la rangée sous ses pieds
    run(game, 30);
    assert.equal(boss.y + boss.h, floor - (4 - k) * TILE, `rangée ${k} détruite`);
  }
  assert.equal(game.status, 'playing');
});
