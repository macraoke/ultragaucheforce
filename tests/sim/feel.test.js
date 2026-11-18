// Sensations de jeu : les cibles chiffrées du plan, vérifiées sans navigateur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';
import { DT } from '../../src/sim/game.js';
import { TILE } from '../../src/sim/world.js';

const standing = (opts) => settle(play(flat({ width: 80, height: 16, ...opts })));

/** Saute en tenant le bouton `hold` pas ; renvoie hauteur (tuiles), durée de montée et de chute (s). */
function jump(game, hold) {
  const y0 = game.hero.y;
  let top = y0;
  let apexStep = 0;
  let steps = 0;
  for (let i = 0; i < 120; i++) {
    game.step({ jump: i < hold });
    steps++;
    if (game.hero.y < top - 1e-9) {
      top = game.hero.y;
      apexStep = steps;
    }
    if (i > 2 && game.hero.onGround) break;
  }
  return { height: (y0 - top) / TILE, rise: apexStep * DT, fall: (steps - apexStep) * DT };
}

test('course : 7,5 à 10 tuiles par seconde, atteintes en moins de 0,15 s, arrêt net', () => {
  const game = standing();
  run(game, 8, { right: true }); // 8 pas = 0,133 s
  const speed = game.hero.vx / TILE;
  assert.ok(speed >= 7.5 && speed <= 10, `vitesse ${speed.toFixed(2)} tuiles/s`);
  assert.equal(game.hero.vx, game.hero.def.vitesse, 'pleine vitesse de la fiche');
  run(game, 8, {});
  assert.equal(game.hero.vx, 0, 'arrêt en moins de 0,15 s');
});

test('saut : sommet à la hauteur de la fiche (±0,3 tuile) en 0,30 à 0,40 s, chute plus rapide que la montée', () => {
  const game = standing();
  const { height, rise, fall } = jump(game, 120);
  assert.ok(Math.abs(height - game.hero.def.saut) <= 0.3, `hauteur ${height.toFixed(2)} tuiles pour ${game.hero.def.saut}`);
  assert.ok(rise >= 0.3 && rise <= 0.4, `montée en ${rise.toFixed(3)} s`);
  assert.ok(fall < rise, `chute ${fall.toFixed(3)} s contre montée ${rise.toFixed(3)} s`);
});

test('saut variable : relâcher tôt donne un petit bond', () => {
  const full = jump(standing(), 120).height;
  const tap = jump(standing(), 2).height;
  assert.ok(tap < full - 1, `petit bond ${tap.toFixed(2)} contre ${full.toFixed(2)} tuiles`);
  assert.ok(tap > 0.3, 'un appui bref décolle quand même');
});

/** Plateforme surélevée à gauche : le héros part du haut et peut en tomber. */
const ledge = () => standing({
  draw: (put, ground) => {
    put(ground, 2, '.');
    put(ground - 5, 0, 'A'.repeat(10));
    put(ground - 6, 2, 'D');
  },
});

/** Marche jusqu'à quitter le bord ; renvoie la partie au premier pas en l'air. */
function walkOff() {
  const game = ledge();
  for (let i = 0; i < 200 && game.hero.onGround; i++) game.step({ right: true });
  assert.ok(!game.hero.onGround, 'le héros a quitté le bord');
  return game;
}

test('temps du coyote : on peut encore sauter 0,1 s après avoir quitté un bord, pas plus tard', () => {
  const soon = walkOff();
  run(soon, 3, {});
  soon.step({ jump: true });
  assert.ok(soon.hero.vy < 0, 'saut accepté 4 pas après le bord');

  const late = walkOff();
  run(late, 9, {});
  late.step({ jump: true });
  assert.ok(late.hero.vy > 0, 'saut refusé 10 pas après le bord');
});

test('tampon de saut : un saut demandé 0,12 s avant d’atterrir part à l’atterrissage', () => {
  const probe = walkOff();
  let fallSteps = 0;
  while (!probe.hero.onGround && fallSteps < 200) {
    probe.step({});
    fallSteps++;
  }
  const landing = (pressBefore) => {
    const game = walkOff();
    for (let i = 0; i < fallSteps + 6; i++) game.step({ jump: i === fallSteps - pressBefore });
    return game.hero;
  };
  assert.ok(!landing(4).onGround, 'appui 4 pas avant le sol : le héros rebondit');
  assert.ok(landing(14).onGround, 'appui 14 pas avant le sol : oublié, le héros reste posé');
});

test('chute : jamais plus de 15 pixels par pas', () => {
  const game = play(flat({
    width: 20, height: 60,
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(1, 2, 'D');
    },
  }));
  let fastest = 0;
  let before = game.hero.y;
  for (let i = 0; i < 300 && !game.hero.onGround; i++) {
    game.step({});
    fastest = Math.max(fastest, game.hero.y - before);
    before = game.hero.y;
  }
  assert.ok(game.hero.onGround, 'le héros finit par atterrir');
  assert.ok(fastest > 6 && fastest < 15, `chute la plus rapide : ${fastest.toFixed(2)} px par pas`);
});

test('grimpe : accroché à un mur on glisse lentement, et des sauts répétés font passer un mur de 8 tuiles', () => {
  const wall = (put, ground) => {
    for (let row = ground - 7; row <= ground; row++) put(row, 10, 'A');
  };
  const game = standing({ draw: wall });
  const top = (15 - 1 - 7) * TILE; // rangée du haut du mur, en pixels
  let passed = false;
  let rebounds = 0; // `climbed` : vrai au pas d'un rebond contre le mur (la consigne du tuto « grimper » l'attend)
  for (let i = 0; i < 600 && !passed; i++) {
    game.step({ right: true, jump: i % 9 < 6 });
    if (game.hero.climbed) rebounds++;
    passed = game.hero.x > 11 * TILE;
  }
  assert.ok(passed, `mur franchi (héros en x=${game.hero.x.toFixed(0)}, y=${game.hero.y.toFixed(0)}, sommet=${top})`);
  assert.ok(rebounds >= 3, `des rebonds contre le mur : ${rebounds}`);
  const jumper = standing({});
  let flat = 0;
  for (let i = 0; i < 120; i++) {
    jumper.step({ right: true, jump: i % 30 < 20 });
    if (jumper.hero.climbed) flat++;
  }
  assert.equal(flat, 0, 'un saut du sol n’est pas un rebond');

  const slider = standing({ draw: wall });
  run(slider, 80, (i) => ({ right: true, jump: i % 9 < 6 })); // rejoint le mur et monte un peu
  assert.ok(!slider.hero.onGround, 'le héros est en l’air contre le mur');
  const before = slider.hero.y;
  run(slider, 20, { right: true }); // puis se laisse glisser
  const perStep = (slider.hero.y - before) / 20;
  assert.equal(slider.hero.onWall, 1, 'accroché au mur de droite');
  assert.ok(perStep > 0 && perStep < 1.2, `glissade de ${perStep.toFixed(2)} px par pas`);
});

test('un sol détruit fait tomber le héros au pas suivant', () => {
  const game = standing({
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground - 3, 0, 'PPPP');
      put(ground - 4, 2, 'D');
    },
  });
  const tx = Math.floor((game.hero.x + game.hero.w / 2) / TILE);
  const ty = Math.floor((game.hero.y + game.hero.h + 1) / TILE);
  for (let x = 0; x < 4; x++) game.world.damage(x, ty, 9);
  assert.ok(game.world.solid(tx, ty), 'les dégâts attendent la fin du pas');
  run(game, 3);
  assert.ok(!game.world.solid(tx, ty), 'planche détruite');
  assert.ok(!game.hero.onGround && game.hero.vy > 0, 'le héros tombe');
});
