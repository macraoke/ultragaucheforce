// Anti-blocage : un robot simplet, invincible et à graine fixe, doit finir chaque niveau.
// S'il cale, le test imprime la carte avec sa position (@) pour voir où ça coince.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, level, play } from './helpers.js';
import { loadContent } from '../../tools/content.mjs';
import { Game } from '../../src/sim/game.js';
import { runBot, dumpMap, botActions, upReach } from '../../src/sim/bot.js';

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

// Les pièges vus sur la campagne : le robot a creusé jusque sous la sortie et ne remontait plus.
// « puits » (chaine-info) : au fond d'un puits d'une tuile de large, fermé par deux tuiles de plafond. Un tir en cloche
// retombe avant de l'atteindre : il faut grimper au puits et percer le plafond de là-haut.
// « galerie » (soir-du-49-3) : arrivé par une galerie basse sous un puits ouvert ; le premier saut cogne le plafond
// et l'ancien robot tenait ensuite le saut sans fin, sans jamais ressauter.
const PITS = {
  puits: [
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '....................S...........', // la sortie, posée sur le sol, juste au-dessus du puits
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT', // deux tuiles de plafond
    'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT', // le puits
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT',
    'TTTTTTTTTTTTTTTTTTTTTDTTTTTTTTTT', // le héros au fond
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ],
  galerie: [
    '................................',
    '................................',
    '................................',
    '................................',
    '................................',
    '....................S...........',
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT', // un puits ouvert sous la sortie
    'TTTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT',
    '..........D...........TTTTTTTTTT', // la galerie, une tuile de haut
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ],
};

for (const [name, rows] of Object.entries(PITS)) {
  for (const hero of ['beta', 'alpha']) {
    test(`sous la sortie (${name}), le robot remonte et sort (${hero})`, () => {
      const game = play(level(rows), { hero, lives: 1, invincible: true, seed: 7 });
      if (hero === 'beta') assert.ok(upReach(game.hero.def) < 2 * 16, 'Bêta tire en cloche : vers le haut, son tir porte à moins de deux tuiles');
      const memory = {};
      let held = 0;
      let longest = 0;
      let steps = 0;
      for (; steps < 3000 && game.status === 'playing'; steps++) {
        const act = botActions(game, memory);
        held = act.jump ? held + 1 : 0;
        longest = Math.max(longest, held);
        game.step(act);
        game.events.length = 0;
      }
      assert.equal(game.status, 'won', `le robot n'est pas sorti en ${steps} pas\n${dumpMap(game)}`);
      assert.ok(longest <= 22, `le saut est relâché puis repris, comme au clavier (tenu ${longest} pas d'affilée)`);
    });
  }
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
