// Anti-blocage : un robot simplet, invincible et à graine fixe, doit finir chaque niveau.
// S'il cale, le test imprime la carte avec sa position (@) pour voir où ça coince.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle } from './helpers.js';
import { loadContent } from '../../tools/content.mjs';
import { Game } from '../../src/sim/game.js';
import { runBot, dumpMap } from '../../src/sim/bot.js';

const BUDGET = 60 * 420; // sept minutes de jeu, largement plus qu'un niveau de 3 minutes

function traverse(bundle, id) {
  const game = new Game(bundle, id, { seed: 7, invincible: true });
  const steps = runBot(game, BUDGET);
  const { hero } = game;
  assert.equal(
    game.status, 'won',
    `le robot n'a pas fini « ${id} » en ${steps} pas (héros en x=${hero.x.toFixed(0)}, y=${hero.y.toFixed(0)}, chutes : ${game.stats.deaths})\n${dumpMap(game)}`,
  );
  return { game, steps };
}

for (const id of Object.keys(fixtureBundle().niveaux)) {
  test(`le robot termine le niveau d'essai « ${id} »`, () => {
    const { game } = traverse(fixtureBundle(), id);
    if (id === 'plaine') {
      assert.equal(game.stats.rescues, 1, 'il libère le camarade au passage');
      assert.ok(game.stats.tiles >= 3, 'il creuse le décor');
    }
    if (id === 'arene') assert.equal(game.boss.state, 'gone', 'il vient à bout du boss');
  });
}

// La vraie campagne : chaque niveau de content/campagne.txt doit être terminable.
const real = loadContent();
if (real.errors.length) {
  test('campagne réelle', { skip: `contenu à corriger d'abord (${real.errors.length} erreur(s), voir « npm run verifier »)` }, () => {});
} else if (!real.bundle.campagne.length) {
  test('campagne réelle', { skip: 'aucun niveau dans content/campagne.txt pour l’instant' }, () => {});
} else {
  for (const id of real.bundle.campagne) {
    test(`le robot termine le niveau « ${id} » de la campagne`, () => {
      traverse(real.bundle, id);
    });
  }
}
