// La barre de vie d'une ligne, à la place de celle du boss : elle paraît quand le héros arrive devant la ligne,
// suit sa vie, et reste un instant vide quand la ligne cède.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './sim/helpers.js';
import { lineAhead, lineBar } from '../src/client/ui.js';
import { wearLine } from '../src/sim/enemy.js';

const enemy = (id) => ({ type: 'ennemi', id });
const street = (col) => settle(play(flat({ width: 70, legende: { l: enemy('ligne') }, draw: (put, ground) => put(ground, col, 'l') })));

test('barre de ligne : elle paraît quand le héros arrive devant la ligne, et suit sa vie', () => {
  const far = street(40);
  assert.equal(lineAhead(far), null, 'une ligne loin devant : pas de barre');
  assert.equal(lineBar(far, {}), null);

  const near = street(12);
  const line = near.enemies[0];
  assert.equal(lineAhead(near), line);
  assert.deepEqual(lineBar(near, {}), { nom: 'Ligne', part: 1 });
  near.hurtEnemy(line, line.def.ligne.vie / 4, 'luttes');
  assert.deepEqual(lineBar(near, {}), { nom: 'Ligne', part: 0.75 }, 'les tracts la vident');
});

test('barre de ligne : quand la ligne cède, elle reste un instant, vide, puis s’en va', () => {
  const game = street(12);
  const line = game.enemies[0];
  const memo = {};
  assert.equal(lineBar(game, memo).part, 1);
  wearLine(game, line, line.def.ligne.vie);
  assert.equal(line.state, 'done');
  assert.deepEqual(lineBar(game, memo), { nom: 'Ligne', part: 0 }, 'elle montre zéro');
  run(game, 30);
  assert.deepEqual(lineBar(game, memo), { nom: 'Ligne', part: 0 }, 'encore un instant');
  run(game, 30);
  assert.equal(lineBar(game, memo), null, 'puis elle s’en va');

  // Une autre partie (niveau relancé, niveau suivant) : la barre vide de la précédente ne la suit pas.
  const before = street(12);
  const memo2 = {};
  lineBar(before, memo2);
  wearLine(before, before.enemies[0], 999);
  assert.equal(lineBar(before, memo2).part, 0);
  assert.equal(lineBar(street(40), memo2), null, 'rien dans la partie suivante');
});
